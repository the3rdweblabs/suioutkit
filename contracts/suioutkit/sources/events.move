// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 The3rdWebLabs (https://github.com/the3rdweblabs)
// Author: @CYBWithFlourish (https://github.com/CYBWithFlourish)
// suioutkit::events
// All Move events emitted by the SuiOutKit package.
// Events have `copy` and `drop` - required for Move event emission.
// They are ephemeral: indexed by Sui infrastructure, never stored on-chain.
module suioutkit::events {
    use sui::event;
    use std::string::String;

    /// Emitted by suioutkit::checkout on every successful payment settlement.
    /// Carries every field needed for off-chain indexers to reconstruct the
    /// full payment record without touching on-chain objects.
    public struct PaymentSettled has copy, drop {
        /// Merchant's Sui address — the entity that received the coin.
        merchant: address,
        /// Raw amount in base coin units (MIST for SUI, micro-USDC, etc.).
        amount: u64,
        /// Payment Kit nonce — unique per session, globally unique in registry.
        nonce: String,
        /// fiat_bank_transfer | sui_native | cross_chain
        method: String,
        /// Object ID of the SuiOutKitReceipt minted in this transaction.
        receipt_id: ID,
        /// Walrus blob ID — structured receipt retrievable off-chain.
        walrus_blob_id: String,
        /// Sui epoch at time of settlement.
        epoch: u64,
    }

    // Helper to emit the event directly from within the events module
    // (Move requires events to be emitted from their defining module)

    public(package) fun emit_payment_settled(
        merchant: address,
        amount: u64,
        nonce: String,
        method: String,
        receipt_id: ID,
        walrus_blob_id: String,
        epoch: u64,
    ) {
        event::emit(PaymentSettled {
            merchant,
            amount,
            nonce,
            method,
            receipt_id,
            walrus_blob_id,
            epoch,
        });
    }
}