// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 The3rdWebLabs (https://github.com/the3rdweblabs)
// Author: @CYBWithFlourish (https://github.com/CYBWithFlourish)

export type SessionStatus = "PENDING" | "PROCESSING" | "SETTLED" | "EXPIRED";

export interface VirtualAccountDetails {
  accountNumber: string;
  bankName: string;
  amount: number;
  expirySeconds: number;
}

export interface CheckoutSession {
  token: string;
  nonce: string;
  amount: number;
  currency: string;
  merchantAddress: string;
  metadata: Record<string, any>;
  status: SessionStatus;
  createdAt: string;
  packageId: string;
  cryptoRegistryId: string;
  cryptoRegistryName?: string;
  coinType: string;
  estimatedRate?: number;
  validatedRate?: number;
  settlementAmount?: number;
  chargeMethod?: "bank_transfer" | "opay" | "stripe";
  chargeApproved?: boolean;
  cryptoAmountBaseUnits?: number;
  cryptoRate?: number;
  cryptoMethod?: "sui_wallet" | "outpay";
  cryptoConfirmedAt?: string;
  cryptoWalrusPreparedAt?: string;
  cryptoWalrusUploadedAt?: string;
  cryptoWalrusBlobId?: string;
  cryptoWalrusInvoice?: {
    nonce: string;
    amountNaira: number;
    exchangeRate: number;
    amountSettled: number;
    settlementToken: string;
    merchantAddress: string;
    fiatMethod: string;
    timestamp: string;
  };
  method?: "bank_transfer" | "opay" | "stripe";
  virtualAccount?: VirtualAccountDetails;
  phoneNumber?: string;
  clientSecret?: string;
  txDigest?: string;
  walrusBlobId?: string;
  error?: string;
}

export interface CreateChargeParams {
  txRef: string;
  amount: number;
  email: string;
  phoneNumber?: string;
}
