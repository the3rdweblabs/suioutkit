// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 The3rdWebLabs (https://github.com/the3rdweblabs)
// Author: @CYBWithFlourish (https://github.com/CYBWithFlourish)

import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { Transaction } from "@mysten/sui/transactions";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import fetch from "node-fetch";
import { getEnv } from "../config/env.js";
import { getDefaultCoin, getSupportedCoinList, getCoinConfig, getDecimals } from "../config/coins.js";

// Load configuration
const SUI_RPC_ENDPOINT = getEnv("SUI_RPC_ENDPOINT", "https://fullnode.testnet.sui.io:443");
const SUI_NETWORK = getEnv("SUI_NETWORK", "testnet") as any;
const PACKAGE_ID = getEnv("PACKAGE_ID");
const TREASURY_ID = getEnv("TREASURY_ID");
const SUI_OPERATOR_PRIVATE_KEY = getEnv("SUI_OPERATOR_PRIVATE_KEY");

const TREASURY_ADMIN_CAP_ID = getEnv("TREASURY_ADMIN_CAP_ID", "");

async function findCoin(client: SuiJsonRpcClient, address: string, coinType: string, amount: bigint): Promise<string> {
  const response = await fetch(SUI_RPC_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "suix_getCoins",
      params: [address, coinType, null, 50]
    })
  });
  const resData: any = await response.json();
  const coins = resData.result?.data || [];
  if (coins.length === 0) {
    throw new Error(`No ${coinType} coins found in operator wallet.`);
  }
  const coin = coins.find((c: any) => BigInt(c.balance) >= amount) || coins[0];
  console.log(`Using coin ${coin.coinObjectId} with balance ${coin.balance}`);
  return coin.coinObjectId;
}

async function getTreasuryAdminCap(client: SuiJsonRpcClient, address: string): Promise<string> {
  if (TREASURY_ADMIN_CAP_ID) return TREASURY_ADMIN_CAP_ID;

  console.log(`Scanning wallet ${address} for TreasuryAdminCap...`);
  const response = await fetch(SUI_RPC_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "suix_getOwnedObjects",
      params: [address, { filter: { StructType: `${PACKAGE_ID}::treasury::TreasuryAdminCap` } }]
    })
  });
  const resData: any = await response.json();
  const data = resData.result?.data || [];
  if (data.length === 0) {
    throw new Error("Could not find a TreasuryAdminCap in your wallet. Are you the admin?");
  }
  const capId = data[0].data?.objectId;
  console.log(`Found TreasuryAdminCap: ${capId}`);
  return capId!;
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const amountStr = args[1];
  const rawTokenType = args[2];
  const cfg = rawTokenType ? getCoinConfig(rawTokenType) : undefined;
  const tokenType = cfg?.type || rawTokenType || getDefaultCoin().type;

  if (!["deposit", "withdraw", "balance"].includes(command)) {
    console.error("Usage: node dist/scripts/treasury.js <deposit|withdraw|balance> [amount] [coin_type]");
    process.exit(1);
  }

  if (!SUI_OPERATOR_PRIVATE_KEY || !PACKAGE_ID || !TREASURY_ID) {
    console.error("Missing required environment variables.");
    process.exit(1);
  }

  // Initialize client and keypair
  const client = new SuiJsonRpcClient({ url: SUI_RPC_ENDPOINT, network: SUI_NETWORK });
  let keypair: Ed25519Keypair;
  if (SUI_OPERATOR_PRIVATE_KEY.startsWith("suiprivkey1")) {
    const { secretKey } = decodeSuiPrivateKey(SUI_OPERATOR_PRIVATE_KEY) as any;
    keypair = Ed25519Keypair.fromSecretKey(secretKey);
  } else {
    const rawBytes = Buffer.from(SUI_OPERATOR_PRIVATE_KEY.replace(/^0x/, ""), "hex");
    keypair = Ed25519Keypair.fromSecretKey(rawBytes);
  }
  const adminAddress = keypair.getPublicKey().toSuiAddress();
  console.log(`Operator Address: ${adminAddress}`);

  if (command === "balance") {
    const coins = getSupportedCoinList();
    const SUISCAN_BASE = "https://suiscan.xyz/testnet/object";
    console.log(`🔎 Treasury inspection link: ${SUISCAN_BASE}/${TREASURY_ID}`);
    for (const coin of coins) {
      const inspectTx = new Transaction();
      inspectTx.moveCall({
        target: `${PACKAGE_ID}::treasury::balance`,
        typeArguments: [coin.type],
        arguments: [inspectTx.object(TREASURY_ID)]
      });
      inspectTx.setSender(adminAddress);
      const devInspect = await client.devInspectTransactionBlock({
        sender: adminAddress,
        transactionBlock: inspectTx
      });
      if (devInspect.error) {
        console.error(`Failed to inspect balance for ${coin.symbol}: ${devInspect.error}`);
        continue;
      }
      const results = devInspect.results?.[0]?.returnValues;
      if (results && results.length > 0 && results[0][0]) {
        const bytes = Uint8Array.from(results[0][0] as any);
        let balance: bigint = 0n;
        for (let i = 0; i < bytes.length; i++) {
          balance += BigInt(bytes[i]) << BigInt(8 * i);
        }
        console.log(`  ${coin.symbol}: ${Number(balance) / 10 ** coin.decimals} (raw: ${balance})`);
      } else {
        console.log(`  ${coin.symbol}: 0 (raw: 0)`);
      }
    }
    return;
  }

  if (!amountStr || isNaN(parseFloat(amountStr))) {
    console.error("Please provide a valid amount.");
    process.exit(1);
  }
  const decimals = getDecimals(tokenType);
  const amountBaseUnits = Math.floor(parseFloat(amountStr) * 10 ** decimals);
  const capId = await getTreasuryAdminCap(client, adminAddress);

  const tx = new Transaction();
  tx.setGasBudget(50_000_000);
  tx.setSender(adminAddress);

  if (command === "deposit") {
    console.log(`Depositing ${amountStr} ${tokenType} into Treasury...`);
    let coinToDeposit;
    const cfg = getCoinConfig(tokenType);
    if (!cfg) {
      console.error(`Unsupported coin type: ${tokenType}`);
      process.exit(1);
    }
    if (tokenType === "0x2::sui::SUI") {
      [coinToDeposit] = tx.splitCoins(tx.gas, [tx.pure.u64(amountBaseUnits)]);
    } else {
      const sourceCoinId = await findCoin(client, adminAddress, tokenType, BigInt(amountBaseUnits));
      [coinToDeposit] = tx.splitCoins(tx.object(sourceCoinId), [tx.pure.u64(amountBaseUnits)]);
    }
    tx.moveCall({
      target: `${PACKAGE_ID}::treasury::deposit`,
      typeArguments: [tokenType],
      arguments: [tx.object(TREASURY_ID), coinToDeposit, tx.object(capId)]
    });
  } else if (command === "withdraw") {
    console.log(`Withdrawing ${amountStr} ${tokenType} from Treasury...`);
    const [withdrawnCoin] = tx.moveCall({
      target: `${PACKAGE_ID}::treasury::withdraw`,
      typeArguments: [tokenType],
      arguments: [tx.object(TREASURY_ID), tx.pure.u64(amountBaseUnits), tx.object(capId)]
    });
    tx.transferObjects([withdrawnCoin], tx.pure.address(adminAddress));
  }

  console.log("Signing and executing transaction...");
  try {
    const dryRun = await client.dryRunTransactionBlock({ transactionBlock: await tx.build({ client }) });
    if (dryRun.effects?.status?.status === "failure") {
      console.error("❌ Dry run failed:", dryRun.effects?.status?.error);
      return;
    }
    const response = await client.signAndExecuteTransaction({
      signer: keypair,
      transaction: tx,
      options: { showEffects: true }
    });
    if (response.effects?.status?.status === "success") {
      console.log(`✅ Success! Tx Digest: ${response.digest}`);
    } else {
      console.error("❌ Transaction failed:", response.effects?.status?.error || response);
    }
  } catch (err: any) {
    console.error("❌ Execution error:", err.message);
  }
}

main().catch(console.error);
