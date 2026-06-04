// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 The3rdWebLabs (https://github.com/the3rdweblabs)
// Author: @CYBWithFlourish (https://github.com/CYBWithFlourish)

export type SomeType = any;

export interface CheckoutSessionOptions {
  amount: number;
  currency: "NGN" | "SUI" | string;
  merchantAddress: string;
  metadata?: Record<string, any>;
}

export interface CheckoutSession {
  token: string;
  nonce: string;
  amount: number;
  currency: string;
  merchantAddress: string;
  walrusBlobId?: string;
  packageId?: string;
  cryptoRegistryId?: string;
  cryptoRegistryName?: string;
  coinType?: string;
  estimatedRate?: number;
}

export type ChargeMethod = "bank_transfer" | "opay" | "crypto" | "sui_wallet" | "outpay" | "stripe";

export interface VirtualAccount {
  accountNumber: string;
  bankName: string;
  amount: number;
  expirySeconds: number;
}

export interface ChargeResponse {
  status: "success" | "pending" | "error";
  virtualAccount?: VirtualAccount;
  opayPrompt?: string;
  clientSecret?: string;
  stripePublicKey?: string;
  message?: string;
}

export interface CryptoIntentResponse {
  nonce: string;
  receiverAddress: string;
  amountBaseUnits: number;
  coinType: string;
  packageId?: string;
  registryName?: string;
  walrusBlobId?: string;
  rate?: number;
}

export interface CryptoConfirmResponse {
  status: "success" | "error";
  txDigest?: string;
  walrusBlobId?: string;
  error?: string;
}

export interface CheckoutStatusResponse {
  status: "PENDING" | "PROCESSING" | "SETTLED" | "EXPIRED";
  txDigest?: string;
  walrusBlobId?: string;
  error?: string;
}

export interface PaymentResult {
  nonce: string;
  txDigest: string;
  walrusBlobId: string;
}

export interface SuiOutKitModalOptions {
  onClose?: () => void;
  onPaymentComplete?: (result: PaymentResult) => void;
  redirectUrl?: string;
  autoCloseOnSuccess?: boolean;
}