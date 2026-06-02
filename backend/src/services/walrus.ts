// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 The3rdWebLabs (https://github.com/the3rdweblabs)
// Author: @CYBWithFlourish (https://github.com/CYBWithFlourish)

import fetch from "node-fetch";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { walrus } from "@mysten/walrus";
import type { WalrusClient } from "@mysten/walrus";
import { getEnv } from "../config/env.js";

export interface WalrusInvoiceData {
  nonce: string;
  amountNaira: number;
  exchangeRate: number;
  amountSettled: number;
  settlementToken: string;
  merchantAddress: string;
  fiatMethod: string;
  timestamp: string;
}

const WALRUS_PUBLISHER_URL = getEnv("WALRUS_PUBLISHER_URL", "https://publisher.walrus-testnet.walrus.space");
const WALRUS_OPERATOR_PRIVATE_KEY = getEnv("WALRUS_OPERATOR_PRIVATE_KEY");
const WALRUS_UPLOAD_MODE = getEnv("WALRUS_UPLOAD_MODE", "publisher");
const WALRUS_EPOCHS = parsePositiveInteger(getEnv("WALRUS_EPOCHS", "5"), 5);
const WALRUS_DELETABLE = getEnv("WALRUS_DELETABLE", "false").toLowerCase() === "true";
const WALRUS_USE_UPLOAD_RELAY = getEnv("WALRUS_USE_UPLOAD_RELAY", "false").toLowerCase() === "true";
const WALRUS_UPLOAD_RELAY_URL = getEnv("WALRUS_UPLOAD_RELAY_URL", "https://upload-relay.testnet.walrus.space");
const WALRUS_UPLOAD_RELAY_MAX_TIP = parsePositiveInteger(getEnv("WALRUS_UPLOAD_RELAY_MAX_TIP", "1000"), 1000);
const SUI_RPC_ENDPOINT = getEnv("SUI_RPC_ENDPOINT", "https://fullnode.testnet.sui.io:443");
const SUI_NETWORK = getEnv("SUI_NETWORK", "testnet") as "mainnet" | "testnet";

function parsePositiveInteger(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

class WalrusService {
  private keypair: Ed25519Keypair | null = null;
  private walrusClient: { walrus: WalrusClient } | null = null;
  private signerAddress: string | null = null;

  constructor() {
    if (WALRUS_OPERATOR_PRIVATE_KEY) {
      try {
        if (WALRUS_OPERATOR_PRIVATE_KEY.startsWith("suiprivkey1")) {
          const { secretKey } = decodeSuiPrivateKey(WALRUS_OPERATOR_PRIVATE_KEY as string) as any;
          this.keypair = Ed25519Keypair.fromSecretKey(secretKey);
        } else {
          const rawBytes = Buffer.from(WALRUS_OPERATOR_PRIVATE_KEY.replace(/^0x/, ""), "hex");
          this.keypair = Ed25519Keypair.fromSecretKey(rawBytes);
        }
        this.signerAddress = this.keypair.getPublicKey().toSuiAddress();
        console.log(`SuiOutKit Walrus: Loaded cryptographic receipt signer address: ${this.signerAddress}`);
      } catch (err: any) {
        console.error("SuiOutKit Walrus: Failed to parse receipt signer key:", err.message);
      }
    }

    console.log(
      `SuiOutKit Walrus: Upload mode=${WALRUS_UPLOAD_MODE}, epochs=${WALRUS_EPOCHS}, deletable=${WALRUS_DELETABLE}`
    );

    if (WALRUS_UPLOAD_MODE === "sdk" && this.keypair) {
      const uploadRelay = WALRUS_USE_UPLOAD_RELAY
        ? {
          host: WALRUS_UPLOAD_RELAY_URL,
          sendTip: { max: WALRUS_UPLOAD_RELAY_MAX_TIP }
        }
        : undefined;

      this.walrusClient = new SuiGrpcClient({
        network: SUI_NETWORK,
        baseUrl: SUI_RPC_ENDPOINT
      }).$extend(walrus({ uploadRelay }));
    }
  }

  /**
   * Uploads a structured JSON invoice/receipt to Walrus decentralized storage.
   * If WALRUS_OPERATOR_PRIVATE_KEY is present, cryptographically signs the invoice before storing.
   * Epoch retention defaults to 5 epochs.
   */
  public async prepareInvoice(invoiceData: WalrusInvoiceData): Promise<{ blobId: string; invoiceData: WalrusInvoiceData }> {
    if (WALRUS_UPLOAD_MODE !== "sdk") {
      throw new Error("Walrus prepare mode requires WALRUS_UPLOAD_MODE=sdk so the blob ID can be precomputed before upload.");
    }

    if (!this.keypair || !this.signerAddress || !this.walrusClient) {
      throw new Error(
        "Walrus SDK preparation requires a valid WALRUS_OPERATOR_PRIVATE_KEY and SDK upload client."
      );
    }

    const payloadString = await this.createPayloadString(invoiceData);
    const blob = new TextEncoder().encode(payloadString);
    const flow = this.walrusClient.walrus.writeBlobFlow({ blob });

    console.log(`SuiOutKit Walrus: SDK encoding receipt blob for owner ${this.signerAddress}...`);
    const encoded = await flow.encode();

    return {
      blobId: encoded.blobId,
      invoiceData,
    };
  }

  public async uploadInvoice(invoiceData: WalrusInvoiceData): Promise<string> {
    const payloadString = await this.createPayloadString(invoiceData);

    if (WALRUS_UPLOAD_MODE === "sdk") {
      return this.uploadWithSdk(payloadString);
    }

    if (WALRUS_UPLOAD_MODE !== "publisher") {
      throw new Error(`Walrus Storage Error: Unsupported WALRUS_UPLOAD_MODE "${WALRUS_UPLOAD_MODE}". Use "publisher" or "sdk".`);
    }

    try {
      console.log(`SuiOutKit Walrus: Archiving receipt to ${WALRUS_PUBLISHER_URL}/v1/blobs...`);

      const response = await fetch(`${WALRUS_PUBLISHER_URL}/v1/blobs?epochs=${WALRUS_EPOCHS}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: payloadString
      });

      if (response.ok) {
        const result: any = await response.json();
        const blobId = result.newlyCreated?.blobObject?.blobId || result.alreadyCertified?.blobId || result.blobId;
        if (blobId) {
          console.log(`SuiOutKit Walrus: Successfully stored receipt. Blob ID: ${blobId}`);
          return blobId;
        }
      }

      throw new Error(`Walrus returned HTTP status ${response.status}`);
    } catch (err: any) {
      console.error("Walrus upload failure:", err.message);
      throw new Error(`Walrus Storage Error: ${err.message}`);
    }
  }

  private async createPayloadString(invoiceData: WalrusInvoiceData): Promise<string> {
    let finalPayload: any = { ...invoiceData };

    // Cryptographically sign the receipt to make it tamper-proof and verifiable by anyone
    if (this.keypair) {
      try {
        const rawBytes = new TextEncoder().encode(JSON.stringify(invoiceData));
        const signResult = await this.keypair.signPersonalMessage(rawBytes);
        finalPayload.gatewaySignature = signResult.signature;
        finalPayload.signerAddress = this.keypair.getPublicKey().toSuiAddress();
        console.log("SuiOutKit Walrus: Generated cryptographic invoice signature.");
      } catch (err: any) {
        console.warn("SuiOutKit Walrus: Failed to sign invoice, uploading unsigned copy:", err.message);
      }
    }

    return JSON.stringify(finalPayload, null, 2);
  }

  private async uploadWithSdk(payloadString: string): Promise<string> {
    if (!this.keypair || !this.signerAddress || !this.walrusClient) {
      throw new Error(
        "Walrus SDK Storage Error: WALRUS_UPLOAD_MODE=sdk requires a valid WALRUS_OPERATOR_PRIVATE_KEY."
      );
    }

    try {
      const blob = new TextEncoder().encode(payloadString);
      const flow = this.walrusClient.walrus.writeBlobFlow({ blob });

      console.log(`SuiOutKit Walrus: SDK encoding receipt blob for owner ${this.signerAddress}...`);
      const encoded = await flow.encode();

      console.log(`SuiOutKit Walrus: SDK registering blob ${encoded.blobId}; signer pays SUI/WAL fees...`);
      const registered = await flow.executeRegister({
        signer: this.keypair,
        epochs: WALRUS_EPOCHS,
        deletable: WALRUS_DELETABLE,
        owner: this.signerAddress
      });

      console.log(
        `SuiOutKit Walrus: SDK uploading slivers for blob object ${registered.blobObjectId} after register tx ${registered.txDigest}...`
      );
      await flow.upload({
        digest: registered.txDigest,
        deletable: WALRUS_DELETABLE
      });

      console.log("SuiOutKit Walrus: SDK certifying blob...");
      const certified = await flow.executeCertify({ signer: this.keypair });

      console.log(
        `SuiOutKit Walrus: SDK stored receipt. Blob ID: ${certified.blobId}, Blob Object: ${certified.blobObjectId}`
      );

      return certified.blobId;
    } catch (err: any) {
      console.error("Walrus SDK upload failure:", err.message);
      throw new Error(`Walrus SDK Storage Error: ${err.message}`);
    }
  }
}

export const walrusService = new WalrusService();
export default walrusService;
