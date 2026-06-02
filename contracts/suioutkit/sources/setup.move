// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 The3rdWebLabs (https://github.com/the3rdweblabs)
// Author: @CYBWithFlourish (https://github.com/CYBWithFlourish)
// suioutkit::setup
// One-time registry bootstrapper.
//
// Call create_suioutkit_registry() once after deploy via a PTB test or
// backend script. It creates the SuiOutKit PaymentRegistry and transfers
// the RegistryAdminCap to the caller.
//
// No backend required — fully testable via `sui client call`.
module suioutkit::setup {
    use payment_kit::payment_kit::{Self, Namespace};
    use std::ascii;

    // Registry names

    const FIAT_REGISTRY_NAME: vector<u8> = b"suioutkit-fiat-settlements";
    const CRYPTO_REGISTRY_NAME: vector<u8> = b"suioutkit-crypto-settlements";

    // Entry points

    /// Create the fiat settlement registry.
    /// Pass the correct Namespace shared object for your network:
    ///   mainnet: 0xccd3e4c7802921991cd9ce488c4ca0b51334ba75483702744242284ccf3ae7c2
    ///   testnet: 0xa5016862fdccba7cc576b56cc5a391eda6775200aaa03a6b3c97d512312878db
    ///
    /// RegistryAdminCap is transferred to ctx.sender() by Payment Kit.
    /// PaymentRegistry is shared automatically by Payment Kit.
    #[allow(lint(self_transfer))]
    public fun create_fiat_registry(
        namespace: &mut Namespace,
        ctx: &mut TxContext,
    ) {
        let (registry, admin_cap) = payment_kit::create_registry(
            namespace,
            ascii::string(FIAT_REGISTRY_NAME),
            ctx,
        );
        payment_kit::share(registry);
        sui::transfer::public_transfer(admin_cap, sui::tx_context::sender(ctx));
    }

    /// Create the crypto / outPay settlement registry.
    #[allow(lint(self_transfer))]
    public fun create_crypto_registry(
        namespace: &mut Namespace,
        ctx: &mut TxContext,
    ) {
        let (registry, admin_cap) = payment_kit::create_registry(
            namespace,
            ascii::string(CRYPTO_REGISTRY_NAME),
            ctx,
        );
        payment_kit::share(registry);
        sui::transfer::public_transfer(admin_cap, sui::tx_context::sender(ctx));
    }

    /// Convenience: create both registries in one transaction.
    #[allow(lint(self_transfer))]
    public fun create_all_registries(
        namespace: &mut Namespace,
        ctx: &mut TxContext,
    ) {
        let (fiat_registry, fiat_admin_cap) = payment_kit::create_registry(
            namespace,
            ascii::string(FIAT_REGISTRY_NAME),
            ctx,
        );
        payment_kit::share(fiat_registry);
        sui::transfer::public_transfer(fiat_admin_cap, sui::tx_context::sender(ctx));

        let (crypto_registry, crypto_admin_cap) = payment_kit::create_registry(
            namespace,
            ascii::string(CRYPTO_REGISTRY_NAME),
            ctx,
        );
        payment_kit::share(crypto_registry);
        sui::transfer::public_transfer(crypto_admin_cap, sui::tx_context::sender(ctx));
    }

    // Read helpers

    public fun fiat_registry_name(): vector<u8>   { FIAT_REGISTRY_NAME }
    public fun crypto_registry_name(): vector<u8> { CRYPTO_REGISTRY_NAME }
}