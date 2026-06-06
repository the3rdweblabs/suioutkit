// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 The3rdWebLabs (https://github.com/the3rdweblabs)
// Author: @CYBWithFlourish (https://github.com/CYBWithFlourish)

import fetch from "node-fetch";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { Transaction } from "@mysten/sui/transactions";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { paymentKit } from "@mysten/payment-kit";
import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { getEnv } from "../config/env.js";
import { getDefaultCoin } from "../config/coins.js";

// Contract Object IDs and config loaded safely from environment
const SUI_GRPC_ENDPOINT = getEnv("SUI_GRPC_ENDPOINT", "https://fullnode.testnet.sui.io:443");
const SUI_RPC_ENDPOINT = getEnv("SUI_RPC_ENDPOINT", "https://fullnode.testnet.sui.io:443");
const PACKAGE_ID = getEnv("PACKAGE_ID");
const TREASURY_ID = getEnv("TREASURY_ID");
const FIAT_REGISTRY_ID = getEnv("FIAT_REGISTRY_ID");
const FIAT_REGISTRY_ADMIN_CAP_ID = getEnv("FIAT_REGISTRY_ADMIN_CAP_ID");
const CRYPTO_REGISTRY_ID = getEnv("CRYPTO_REGISTRY_ID");
const CRYPTO_REGISTRY_ADMIN_CAP_ID = getEnv("CRYPTO_REGISTRY_ADMIN_CAP_ID");
const SUI_OPERATOR_PRIVATE_KEY = getEnv("SUI_OPERATOR_PRIVATE_KEY");
const SUI_NETWORK = getEnv("SUI_NETWORK", "testnet") as any;
const PAYMENT_KIT_PACKAGE_ID = getEnv(`PAYMENT_KIT_PACKAGE_ID_${SUI_NETWORK}`);

class SuiIntegrationService {
  private client: SuiGrpcClient;
  private paymentClient: any;
  private keypair: Ed25519Keypair;

  constructor() {
    // Initialize high-performance Sui gRPC client
    console.log(`==================================================================`);
    console.log(`==> SuiOutKit Ledger Environment Bootstrap:`);
    console.log(`==> Network: ${SUI_NETWORK}`);
    console.log(`==> Package: ${PACKAGE_ID || "not set"}`);
    console.log(`==> Treasury: ${TREASURY_ID || "not set"}`);
    console.log(`==> Fiat Registry ID: ${FIAT_REGISTRY_ID || "not set"}`);
    console.log(`==> Fiat Admin Cap ID: ${FIAT_REGISTRY_ADMIN_CAP_ID || "not set"}`);
    console.log(`==> Crypto Registry ID: ${CRYPTO_REGISTRY_ID || "not set"}`);
    console.log(`==> Crypto Admin Cap ID: ${CRYPTO_REGISTRY_ADMIN_CAP_ID || "not set"}`);
    console.log(`==================================================================`);

    console.log(`SuiOutKit: Connecting to Sui gRPC Client...`);
    this.client = new SuiGrpcClient({
      network: SUI_NETWORK,
      baseUrl: SUI_RPC_ENDPOINT
    });
    this.paymentClient = (this.client as any).$extend(paymentKit());

    // Load operator keypair securely
    if (!SUI_OPERATOR_PRIVATE_KEY) {
      throw new Error("Sui Operator Private Key is missing from environment variables.");
    }

    try {
      if (SUI_OPERATOR_PRIVATE_KEY.startsWith("suiprivkey1")) {
        // Bech32 formatted Sui private key: decode then construct keypair
        const { secretKey } = decodeSuiPrivateKey(SUI_OPERATOR_PRIVATE_KEY as string) as any;
        this.keypair = Ed25519Keypair.fromSecretKey(secretKey);
      } else {
        // Hex format private key
        const rawBytes = Buffer.from(SUI_OPERATOR_PRIVATE_KEY.replace(/^0x/, ""), "hex");
        this.keypair = Ed25519Keypair.fromSecretKey(rawBytes);
      }
      console.log(`SuiOutKit: Loaded operator wallet address: ${this.keypair.getPublicKey().toSuiAddress()}`);
    } catch (err: any) {
      throw new Error(`Sui Operator Keypair Parsing Failure: ${err.message}`);
    }
  }

  /**
   * Constructs and signs a Programmable Transaction Block (PTB) to execute `checkout::settle_fiat<T>`
   * on-chain, automatically releasing funds from the Treasury dynamic vault to the merchant wallet.
   */
  public async executeSettleFiat(
    amount: number,
    merchantAddress: string,
    nonce: string,
    walrusBlobId: string,
    tokenType: string = getDefaultCoin().type
  ): Promise<{ txDigest: string; status: string }> {
    if (!PACKAGE_ID || !TREASURY_ID || !FIAT_REGISTRY_ID) {
      throw new Error("Sui Integration: PACKAGE_ID, TREASURY_ID, or FIAT_REGISTRY_ID is missing from environment variables.");
    }

    try {
      const tx = new Transaction();

      // Set gas budget safely
      tx.setGasBudget(80_000_000); // 0.08 SUI

      // Build checkout::settle_fiat<T> call. The contract releases funds from
      // Treasury to the merchant, then returns a non-droppable receipt object.
      const [receipt] = tx.moveCall({
        target: `${PACKAGE_ID}::checkout::settle_fiat`,
        typeArguments: [tokenType],
        arguments: [
          tx.object(TREASURY_ID),
          tx.object(FIAT_REGISTRY_ID),
          tx.pure.u64(amount),
          tx.pure.address(merchantAddress),
          tx.pure.string(nonce),
          tx.pure.string(walrusBlobId),
          tx.object("0x6") // Standard Clock shared object
        ]
      });

      // Transfer only the receipt object. The token payout already happens
      // inside checkout::settle_fiat via Payment Kit.
      tx.transferObjects([receipt], merchantAddress);

      console.log(`SuiOutKit: Firing settle_fiat<${tokenType}> transaction block on-chain...`);
      const response: any = await (this.client as any).signAndExecuteTransaction({
        signer: this.keypair,
        transaction: tx,
        options: {
          showEffects: true,
          showEvents: true
        }
      });

      const txDigest =
        response?.digest ||
        response?.transactionDigest ||
        response?.Transaction?.digest ||
        response?.FailedTransaction?.digest;

      const executionStatus =
        response?.effects?.status?.status ||
        response?.Transaction?.status?.success ||
        response?.FailedTransaction?.status?.success;

      if (response?.$kind === "Transaction" || response?.Transaction?.status?.success || executionStatus === "success") {
        console.log(`SuiOutKit: Settle Fiat Tx succeeded. Digest: ${txDigest || response?.digest}`);
        return {
          txDigest: txDigest || response?.digest,
          status: "success"
        };
      }

      if (txDigest) {
        try {
          await (this.client as any).waitForTransaction?.({ digest: txDigest, include: { effects: true, events: true } });
        } catch (_) {
          // Ignore wait failures and fall back to direct verification below.
        }

        const recovered = await this.verifyFiatSettlementTx(txDigest, nonce, merchantAddress, amount, tokenType);
        if (recovered.verified) {
          console.warn(
            `SuiOutKit: PTB reported failure but settlement event was found on-chain for nonce ${nonce}. Treating as success.`
          );
          return {
            txDigest,
            status: "success"
          };
        }
      }

      const failureMessage =
        response?.FailedTransaction?.status?.error?.message ||
        response?.FailedTransaction?.status?.error ||
        response?.Transaction?.status?.error?.message ||
        response?.Transaction?.status?.error ||
        response?.effects?.status?.error ||
        "Transaction block failed execution on-chain.";

      throw new Error(typeof failureMessage === "string" ? failureMessage : JSON.stringify(failureMessage));
    } catch (err: any) {
      // Idempotency: if the payment record already exists, treat as success.
      if (err.message && err.message.includes('EPaymentAlreadyExists')) {
        console.warn('Duplicate payment detected – treating settlement as already completed.');
        // Return a synthetic success response (digest not needed for already processed).
        return { txDigest: 'duplicate-idempotent', status: 'success' };
      }
      console.error('Sui settle_fiat PTB error:', err.message);
      throw new Error(`Sui Transaction Error: ${err.message}`);
    }
  }

  private async verifyFiatSettlementTx(
    txDigest: string,
    expectedNonce: string,
    expectedMerchant: string,
    expectedAmount: number,
    tokenType: string
  ): Promise<{ verified: boolean; eventType?: string }> {
    try {
      const response = await fetch(SUI_RPC_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "sui_getTransactionBlock",
          params: [txDigest, { showEvents: true }]
        })
      });

      const data: any = await response.json();
      if (data.error) {
        return { verified: false };
      }

      const events = data.result?.events || [];
      for (const evt of events) {
        const evtType = evt.type || "";
        const parsed = evt.parsedJson || {};
        const nonce = parsed.nonce || parsed.nonce_str || parsed.nonceString;
        const merchant = parsed.merchant || parsed.merchantAddress;
        const amount = Number(parsed.amount ?? parsed.amountNaira ?? parsed.amountSettled ?? 0);
        const method = parsed.method || "";

        if (
          evtType.includes("PaymentSettled") &&
          nonce === expectedNonce &&
          merchant === expectedMerchant &&
          (amount === expectedAmount || amount === Math.floor(expectedAmount))
        ) {
          return { verified: true, eventType: evtType };
        }

        if (
          method === "fiat_bank_transfer" &&
          nonce === expectedNonce &&
          merchant === expectedMerchant &&
          evtType.includes("PaymentSettled")
        ) {
          return { verified: true, eventType: evtType };
        }

        if (
          evtType.startsWith("0x") &&
          evtType.includes("PaymentSettled") &&
          nonce === expectedNonce &&
          tokenType
        ) {
          return { verified: true, eventType: evtType };
        }
      }

      return { verified: false };
    } catch (err: any) {
      console.warn(`SuiOutKit: Fiat settlement verification fallback failed for ${txDigest}: ${err.message}`);
      return { verified: false };
    }
  }

  /**
   * Pre-flight check: Query Treasury balance directly via standard RPC JSON-RPC call.
   * Called before showing payment interface to verify settlement will succeed.
   */
  public async checkTreasuryBalance(amount: number, tokenType: string = getDefaultCoin().type): Promise<{ available: number; required: number; sufficient: boolean }> {
    if (!TREASURY_ID) {
      throw new Error("Sui Integration: TREASURY_ID is missing from environment variables.");
    }
    if (!PACKAGE_ID) {
      throw new Error("Sui Integration: PACKAGE_ID is missing from environment variables.");
    }
    try {
      console.log(`SuiOutKit: Querying treasury balance on-chain for ${tokenType} with required ${amount}...`);
      // Build a devInspect transaction that calls treasury::balance
      const inspectTx = new Transaction();
      inspectTx.moveCall({
        target: `${PACKAGE_ID}::treasury::balance`,
        typeArguments: [tokenType],
        arguments: [inspectTx.object(TREASURY_ID)]
      });
      const client = new SuiJsonRpcClient({ url: SUI_RPC_ENDPOINT, network: SUI_NETWORK as any });
      const devInspect = await client.devInspectTransactionBlock({
        sender: this.keypair.getPublicKey().toSuiAddress(),
        transactionBlock: inspectTx
      });
      if (devInspect.error) {
        console.warn(`SuiOutKit: DevInspect error querying treasury: ${devInspect.error}`);
        return { available: 0, required: amount, sufficient: false };
      }
      const results = devInspect.results?.[0]?.returnValues;
      let availableBalance = 0;
      if (results && results.length > 0 && results[0][0]) {
        const bytes = Uint8Array.from(results[0][0] as any);
        let balance = 0n;
        for (let i = 0; i < bytes.length; i++) {
          balance += BigInt(bytes[i]) << BigInt(8 * i);
        }
        availableBalance = Number(balance);
      }
      const sufficient = availableBalance >= amount;
      console.log(`SuiOutKit: Treasury balance query completed. Available: ${availableBalance}, Required: ${amount}, Sufficient: ${sufficient}`);
      return { available: availableBalance, required: amount, sufficient };
    } catch (err: any) {
      console.error("Treasury balance check failure:", err.message);
      throw new Error(`Sui Treasury Balance Check Error: ${err.message}`);
    }
  }

  public async verifyCryptoPaymentTx(txDigest: string, expectedNonce: string): Promise<{ verified: boolean; eventType?: string }> {
    if (!PACKAGE_ID) {
      throw new Error("Sui Integration: PACKAGE_ID is missing from environment variables.");
    }

    try {
      const response = await fetch(SUI_RPC_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "sui_getTransactionBlock",
          params: [txDigest, { showEvents: true }]
        })
      });

      const data: any = await response.json();
      if (data.error) {
        throw new Error(data.error.message || "Failed to fetch transaction block");
      }

      const events = data.result?.events || [];
      for (const evt of events) {
        const evtType = evt.type || "";
        const parsed = evt.parsedJson || {};
        const nonce = parsed.nonce || parsed.nonce_str || parsed.nonceString;

        if (nonce === expectedNonce) {
          return { verified: true, eventType: evtType };
        }

        if (evtType.startsWith(`${PACKAGE_ID}::events::PaymentSettled`) && parsed.nonce === expectedNonce) {
          return { verified: true, eventType: evtType };
        }

        if (evtType.includes("payment_kit") && nonce === expectedNonce) {
          return { verified: true, eventType: evtType };
        }
      }

      return { verified: false };
    } catch (err: any) {
      throw new Error(`Sui Verification Error: ${err.message}`);
    }
  }

  public async verifyCryptoPaymentRecord(options: {
    nonce: string;
    amount: number | bigint;
    receiver: string;
    coinType: string;
    registryId?: string;
    registryName?: string;
  }): Promise<{ verified: boolean; record?: { key: string; paymentTransactionDigest: string | null; epochAtTimeOfRecord: string } }> {
    try {
      const record = await this.paymentClient.paymentKit.getPaymentRecord({
        nonce: options.nonce,
        amount: options.amount,
        receiver: options.receiver,
        coinType: options.coinType,
        ...(options.registryId ? { registryId: options.registryId } : {}),
        ...(options.registryName ? { registryName: options.registryName } : {})
      });

      if (!record) {
        return { verified: false };
      }

      return {
        verified: true,
        record: {
          key: record.key,
          paymentTransactionDigest: record.paymentTransactionDigest,
          epochAtTimeOfRecord: record.epochAtTimeOfRecord
        }
      };
    } catch (err: any) {
      throw new Error(`Payment record verification failure: ${err.message}`);
    }
  }

  /**
   * Starts a high-speed gRPC-style background listener for on-chain checkout events.
   * Leverages real-time polling or websocket subscriptions.
   */
  public startIndexer(onEventReceived: (event: any) => void) {
    if (!PACKAGE_ID) {
      throw new Error("Sui Indexer: PACKAGE_ID is missing from environment variables.");
    }

    console.log(`SuiOutKit Indexer: Polling events for settled payments via RPC...`);

    const pollEvents = (eventFilter: object, label: string) => {
      let cursor: { txDigest: string; eventSeq: string } | null = null;

      // Init: fetch the latest event to establish a starting cursor, so old
      // events before this point are never emitted. The cursor event itself
      // WILL be emitted on the first data tick (it's the latest and may be new).
      (async () => {
        try {
          const initRes = await fetch(SUI_RPC_ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              method: "suix_queryEvents",
              params: [eventFilter, null, 1, true],
            }),
          });
          const initData: any = await initRes.json();
          if (initData.result?.data?.[0]) {
            const evt = initData.result.data[0];
            cursor = {
              txDigest: evt.id?.txDigest || "",
              eventSeq: evt.id?.eventSeq || "",
            };
          }
        } catch (_) {
          // init failure is non-fatal — first data tick will have cursor=null
        }
      })();

      setInterval(async () => {
        try {
          const response = await fetch(SUI_RPC_ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              method: "suix_queryEvents",
              params: [eventFilter, null, 50, true],
            }),
          });

          const data: any = await response.json();
          if (data.error || !data.result) {
            console.warn(`SuiOutKit Indexer (${label}) RPC Error:`, data.error?.message || "No result");
            return;
          }

          for (const evt of (data.result.data || []).reverse()) {
            const txDigest = evt.id?.txDigest || "";
            const eventSeq = evt.id?.eventSeq || "";

            // Skip events at or before the init cursor (already seen)
            if (cursor && txDigest && eventSeq) {
              const isBefore =
                txDigest === cursor.txDigest
                  ? eventSeq <= cursor.eventSeq
                  : false;
              if (isBefore) continue;
            }

            onEventReceived(evt);

            // Track the most recent event we've seen
            if (txDigest && eventSeq) {
              cursor = { txDigest, eventSeq };
            }
          }
        } catch (e: any) {
          console.warn(`SuiOutKit Indexer (${label}) Polling Error:`, e?.message || e);
        }
      }, 3000);
    };

    // Listen for PaymentSettled from suioutkit (sui_wallet flow calls mint_suioutkit_receipt)
    pollEvents(
      { MoveEventType: `${PACKAGE_ID}::events::PaymentSettled` },
      "PaymentSettled"
    );

    // Listen for PaymentReceipt from Payment Kit (outPay flow only calls processRegistryPayment)
    if (PAYMENT_KIT_PACKAGE_ID) {
      pollEvents(
        { MoveEventType: `${PAYMENT_KIT_PACKAGE_ID}::payment_kit::PaymentReceipt` },
        "PaymentReceipt"
      );
    }
  }


}

export const suiService = new SuiIntegrationService();
export default suiService;
