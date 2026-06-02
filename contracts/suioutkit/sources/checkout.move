// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 The3rdWebLabs (https://github.com/the3rdweblabs)
// Author: @CYBWithFlourish (https://github.com/CYBWithFlourish)
// suioutkit::checkout
// Core settlement orchestrator.
//
// Two entry points:
//   settle_fiat<T>   - Backend PTB. Releases from Treasury, delegates to
//                      Payment Kit, mints SuiOutKitReceipt.
//   mint_suioutkit_receipt - Crypto/outPay PTB. Payment Kit ran first in
//                            the same PTB; this attaches Walrus blob ID.
module suioutkit::checkout {
    use sui::clock::Clock;
    use std::string::{Self, String};
    use std::ascii;
    use std::type_name;
    use payment_kit::payment_kit::{
        Self,
        PaymentRegistry,
        PaymentReceipt,
    };
    use suioutkit::treasury::{Self, Treasury};
    use suioutkit::events;
    use suioutkit::errors;

    // SuiOutKitReceipt

    /// Immutable on-chain record minted for every successful settlement.
    /// Has `key` and `store` so it is transferable and composable.
    public struct SuiOutKitReceipt has key, store {
        id: UID,
        /// Merchant's Sui address.
        merchant: address,
        /// Raw coin amount in base units.
        amount: u64,
        /// Fully-qualified coin type string (e.g. "0x2::sui::SUI").
        token_type: String,
        /// UUIDv4 nonce — unique per payment session.
        nonce: String,
        /// fiat_bank_transfer | sui_native | cross_chain
        method: String,
        /// Walrus blob ID for off-chain structured receipt.
        walrus_blob_id: String,
        /// Sui epoch at settlement time.
        timestamp: u64,
    }

    // Fiat entry point (called from backend PTB)

    /// Full fiat settlement in a single atomic function:
    ///   1. Validates inputs.
    ///   2. Releases Coin<T> from Treasury.
    ///   3. Delegates to Payment Kit (nonce check + coin transfer + base receipt).
    ///   4. Mints SuiOutKitReceipt and emits PaymentSettled event via helper.
    ///
    /// Returns SuiOutKitReceipt so the PTB can transfer it to the merchant.
    public fun settle_fiat<T>(
        treasury: &mut Treasury,
        registry: &mut PaymentRegistry,
        amount: u64,
        merchant: address,
        nonce: String,
        walrus_blob_id: String,
        clock: &Clock,
        ctx: &mut TxContext,
    ): SuiOutKitReceipt {

        // Guards
        assert!(merchant != @0x0,                       errors::zero_merchant_address());
        assert!(amount > 0,                             errors::zero_amount());
        assert!(!string::is_empty(&walrus_blob_id),     errors::invalid_blob_id());

        // Release from Treasury
        let coin = treasury::release<T>(treasury, amount, ctx);

        // Capture coin type string BEFORE consuming coin into Payment Kit
        // You know T at compile time via the type parameter T
        let token_type = type_name::with_defining_ids<T>();
        let token_type_str = string::from_ascii(
            type_name::into_string(token_type)
        );

        // Convert nonce to ascii::String before calling Payment Kit
        // (This consumes nonce string, but we copy it by referencing or reconstructing it,
        // or we can convert it since string has copy/drop in Move 2024. To be safe,
        // we can copy the nonce value using dereferencing or we can construct ascii_nonce first
        // and keep the nonce variable as a String since it has copy).
        let ascii_nonce = ascii::string(*string::as_bytes(&nonce));

        // Delegate settlement to Payment Kit
        // process_registry_payment:
        //   • Validates composite PaymentKey (nonce+amount+coinType+receiver).
        //   • Transfers coin to merchant atomically.
        //   • Mints base PaymentReceipt owned by merchant.
        let _payment_receipt = payment_kit::process_registry_payment<T>(
            registry,
            ascii_nonce,
            amount,
            coin,
            std::option::some(merchant),
            clock,
            ctx,
        );
        // PaymentReceipt has `drop` — it's discarded here safely

        let method = string::utf8(b"fiat_bank_transfer");

        // Mint SuiOutKitReceipt
        let receipt = SuiOutKitReceipt {
            id: object::new(ctx),
            merchant,
            amount,
            token_type: token_type_str,
            nonce,
            method,
            walrus_blob_id,
            timestamp: tx_context::epoch(ctx),
        };

        // Emit event via package-internal helper in events module
        events::emit_payment_settled(
            merchant,
            amount,
            receipt.nonce,
            receipt.method,
            object::id(&receipt),
            receipt.walrus_blob_id,
            receipt.timestamp,
        );

        receipt
    }

    // Crypto / outPay entry point

    /// Attaches a Walrus blob ID to a Payment Kit PaymentReceipt that was
    /// already settled in the same PTB (native Sui or outPay QR flow).
    /// Treasury is NOT involved in this path.
    ///
    /// Since PaymentReceipt fields are private, the PTB passes the variables
    /// explicitly after reading them from the event emitted by Payment Kit.
    ///
    /// Returns SuiOutKitReceipt so the PTB can transfer it to the merchant.
    public fun mint_suioutkit_receipt(
        _payment_receipt: PaymentReceipt, // Taken by value to consume and drop it safely
        merchant: address,
        amount: u64,
        nonce: String,
        token_type: String,
        method: String,
        walrus_blob_id: String,
        ctx: &mut TxContext,
    ): SuiOutKitReceipt {

        assert!(!string::is_empty(&walrus_blob_id), errors::invalid_blob_id());
        assert!(merchant != @0x0, errors::zero_merchant_address());
        assert!(amount > 0,       errors::zero_amount());

        let receipt = SuiOutKitReceipt {
            id: object::new(ctx),
            merchant,
            amount,
            token_type,
            nonce,
            method,
            walrus_blob_id,
            timestamp: tx_context::epoch(ctx),
        };

        events::emit_payment_settled(
            receipt.merchant,
            receipt.amount,
            receipt.nonce,
            receipt.method,
            object::id(&receipt),
            receipt.walrus_blob_id,
            receipt.timestamp,
        );

        receipt
    }

    // Read-only accessors

    public fun merchant(r: &SuiOutKitReceipt): address  { r.merchant }
    public fun amount(r: &SuiOutKitReceipt): u64         { r.amount }
    public fun nonce(r: &SuiOutKitReceipt): String       { r.nonce }
    public fun method(r: &SuiOutKitReceipt): String      { r.method }
    public fun walrus_blob_id(r: &SuiOutKitReceipt): String { r.walrus_blob_id }
    public fun timestamp(r: &SuiOutKitReceipt): u64      { r.timestamp }
    public fun token_type(r: &SuiOutKitReceipt): String  { r.token_type }
}