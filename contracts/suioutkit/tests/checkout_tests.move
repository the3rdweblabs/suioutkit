// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 The3rdWebLabs (https://github.com/the3rdweblabs)
// Author: @CYBWithFlourish (https://github.com/CYBWithFlourish)
// suioutkit::checkout_tests
// Unit and integration tests for the SuiOutKit Move package.
// Run with: sui move test
#[test_only]
module suioutkit::checkout_tests {
    use sui::test_scenario::{Self as ts, Scenario};
    use sui::coin::{Self};
    use sui::sui::SUI;
    use sui::clock;
    use std::string;

    use suioutkit::treasury::{Self, Treasury, TreasuryAdminCap};
    use suioutkit::checkout::{Self};

    // Test addresses
    const OPERATOR: address = @0xABCD;
    const MERCHANT: address = @0x1234;

    // Helper: initialise treasury and return scenario
    fun setup(): Scenario {
        let mut scenario = ts::begin(OPERATOR);
        treasury::init_for_testing(ts::ctx(&mut scenario));
        ts::next_tx(&mut scenario, OPERATOR);
        scenario
    }

    // Treasury deposit / withdraw

    #[test]
    fun test_treasury_deposit_and_balance() {
        let mut scenario = setup();
        ts::next_tx(&mut scenario, OPERATOR);
        {
            let mut treasury = ts::take_shared<Treasury>(&scenario);
            let cap          = ts::take_from_sender<TreasuryAdminCap>(&scenario);
            let coin         = coin::mint_for_testing<SUI>(1_000_000_000, ts::ctx(&mut scenario));

            treasury::deposit<SUI>(&mut treasury, coin, &cap, ts::ctx(&mut scenario));

            assert!(treasury::balance<SUI>(&treasury) == 1_000_000_000, 0);

            ts::return_shared(treasury);
            ts::return_to_sender(&scenario, cap);
        };
        ts::end(scenario);
    }

    #[test]
    fun test_treasury_withdraw() {
        let mut scenario = setup();
        ts::next_tx(&mut scenario, OPERATOR);
        {
            let mut treasury = ts::take_shared<Treasury>(&scenario);
            let cap          = ts::take_from_sender<TreasuryAdminCap>(&scenario);
            let coin         = coin::mint_for_testing<SUI>(1_000_000_000, ts::ctx(&mut scenario));
            treasury::deposit<SUI>(&mut treasury, coin, &cap, ts::ctx(&mut scenario));

            let withdrawn = treasury::withdraw<SUI>(&mut treasury, 500_000_000, &cap, ts::ctx(&mut scenario));
            assert!(coin::value(&withdrawn) == 500_000_000, 1);
            assert!(treasury::balance<SUI>(&treasury) == 500_000_000, 2);

            coin::burn_for_testing(withdrawn);
            ts::return_shared(treasury);
            ts::return_to_sender(&scenario, cap);
        };
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = suioutkit::errors::EInsufficientTreasury, location = suioutkit::treasury)]
    fun test_treasury_insufficient_aborts() {
        let mut scenario = setup();
        ts::next_tx(&mut scenario, OPERATOR);
        {
            let mut treasury = ts::take_shared<Treasury>(&scenario);
            let cap          = ts::take_from_sender<TreasuryAdminCap>(&scenario);
            // Only deposit 100, try to withdraw 1000
            let coin = coin::mint_for_testing<SUI>(100, ts::ctx(&mut scenario));
            treasury::deposit<SUI>(&mut treasury, coin, &cap, ts::ctx(&mut scenario));

            let coin_to_burn = treasury::withdraw<SUI>(&mut treasury, 1_000, &cap, ts::ctx(&mut scenario));
            coin::burn_for_testing(coin_to_burn);

            ts::return_shared(treasury);
            ts::return_to_sender(&scenario, cap);
        };
        ts::end(scenario);
    }

    // Setup Module Tests (Registries)

    #[test]
    fun test_setup_helpers() {
        assert!(suioutkit::setup::fiat_registry_name() == b"suioutkit-fiat-settlements", 0);
        assert!(suioutkit::setup::crypto_registry_name() == b"suioutkit-crypto-settlements", 1);
    }

    #[test]
    fun test_setup_registries_success() {
        let mut scenario = ts::begin(OPERATOR);

        // Initialize payment_kit mock namespace
        payment_kit::payment_kit::init_for_testing(ts::ctx(&mut scenario));

        ts::next_tx(&mut scenario, OPERATOR);
        {
            let mut namespace = ts::take_shared<payment_kit::payment_kit::Namespace>(&scenario);
            suioutkit::setup::create_all_registries(&mut namespace, ts::ctx(&mut scenario));
            ts::return_shared(namespace);
        };

        // Confirm both registries are shared and RegistryAdminCaps are owned
        ts::next_tx(&mut scenario, OPERATOR);
        {
            let cap1 = ts::take_from_sender<payment_kit::payment_kit::RegistryAdminCap>(&scenario);
            let cap2 = ts::take_from_sender<payment_kit::payment_kit::RegistryAdminCap>(&scenario);

            ts::return_to_sender(&scenario, cap1);
            ts::return_to_sender(&scenario, cap2);
        };
        ts::end(scenario);
    }

    // Settle Fiat Path (Checkout Flow)

    #[test]
    fun test_settle_fiat_success() {
        let mut scenario = setup();
        let clock_obj = clock::create_for_testing(ts::ctx(&mut scenario));

        // 1. Initialize payment kit namespace
        payment_kit::payment_kit::init_for_testing(ts::ctx(&mut scenario));

        // 2. Fund Treasury Vault
        ts::next_tx(&mut scenario, OPERATOR);
        {
            let mut treasury = ts::take_shared<Treasury>(&scenario);
            let cap          = ts::take_from_sender<TreasuryAdminCap>(&scenario);
            let coin         = coin::mint_for_testing<SUI>(1_000_000_000, ts::ctx(&mut scenario));

            treasury::deposit<SUI>(&mut treasury, coin, &cap, ts::ctx(&mut scenario));

            ts::return_shared(treasury);
            ts::return_to_sender(&scenario, cap);
        };

        // 3. Create Fiat Registry
        ts::next_tx(&mut scenario, OPERATOR);
        {
            let mut namespace = ts::take_shared<payment_kit::payment_kit::Namespace>(&scenario);
            suioutkit::setup::create_fiat_registry(&mut namespace, ts::ctx(&mut scenario));
            ts::return_shared(namespace);
        };

        // 4. Perform Settle Fiat Checkout
        ts::next_tx(&mut scenario, OPERATOR);
        {
            let mut treasury = ts::take_shared<Treasury>(&scenario);
            let mut registry = ts::take_shared<payment_kit::payment_kit::PaymentRegistry>(&scenario);

            let receipt = checkout::settle_fiat<SUI>(
                &mut treasury,
                &mut registry,
                400_000_000,
                MERCHANT,
                string::utf8(b"fiat-nonce-111"),
                string::utf8(b"walrus-blob-999"),
                &clock_obj,
                ts::ctx(&mut scenario)
            );

            // Assert values are mapped perfectly
            assert!(checkout::merchant(&receipt) == MERCHANT, 0);
            assert!(checkout::amount(&receipt) == 400_000_000, 1);
            assert!(checkout::nonce(&receipt) == string::utf8(b"fiat-nonce-111"), 2);
            assert!(checkout::method(&receipt) == string::utf8(b"fiat_bank_transfer"), 3);
            assert!(checkout::walrus_blob_id(&receipt) == string::utf8(b"walrus-blob-999"), 4);

            let expected_type = string::from_ascii(
                std::type_name::into_string(std::type_name::with_defining_ids<SUI>())
            );
            assert!(checkout::token_type(&receipt) == expected_type, 5);

            // Assert vault balance decreased correctly
            assert!(treasury::balance<SUI>(&treasury) == 600_000_000, 6);

            sui::transfer::public_transfer(receipt, OPERATOR);

            ts::return_shared(treasury);
            ts::return_shared(registry);
        };

        clock::destroy_for_testing(clock_obj);
        ts::end(scenario);
    }

    // Mint SuiOutKit Receipt Path (Crypto Checkout Flow)

    #[test]
    fun test_mint_suioutkit_receipt_success() {
        let mut scenario = ts::begin(OPERATOR);
        let clock_obj = clock::create_for_testing(ts::ctx(&mut scenario));

        payment_kit::payment_kit::init_for_testing(ts::ctx(&mut scenario));

        // Create Crypto Registry
        ts::next_tx(&mut scenario, OPERATOR);
        {
            let mut namespace = ts::take_shared<payment_kit::payment_kit::Namespace>(&scenario);
            suioutkit::setup::create_crypto_registry(&mut namespace, ts::ctx(&mut scenario));
            ts::return_shared(namespace);
        };

        // Mint SUI, call Payment Kit, then mint SuiOutKit receipt
        ts::next_tx(&mut scenario, OPERATOR);
        {
            let mut registry = ts::take_shared<payment_kit::payment_kit::PaymentRegistry>(&scenario);
            let coin = coin::mint_for_testing<SUI>(100_000_000, ts::ctx(&mut scenario));

            // Call Payment Kit directly (simulating direct payment execution in PTB)
            let base_receipt = payment_kit::payment_kit::process_registry_payment<SUI>(
                &mut registry,
                std::ascii::string(b"crypto-nonce-888"),
                100_000_000,
                coin,
                std::option::some(MERCHANT),
                &clock_obj,
                ts::ctx(&mut scenario)
            );

            // Construct enriched receipt with the explicit args (fields are private in SDK)
            let receipt = checkout::mint_suioutkit_receipt(
                base_receipt,
                MERCHANT,
                100_000_000,
                string::utf8(b"crypto-nonce-888"),
                string::utf8(b"0x2::sui::SUI"),
                string::utf8(b"sui_native"),
                string::utf8(b"walrus-blob-invoice-777"),
                ts::ctx(&mut scenario)
            );

            assert!(checkout::merchant(&receipt) == MERCHANT, 0);
            assert!(checkout::amount(&receipt) == 100_000_000, 1);
            assert!(checkout::nonce(&receipt) == string::utf8(b"crypto-nonce-888"), 2);
            assert!(checkout::method(&receipt) == string::utf8(b"sui_native"), 3);
            assert!(checkout::walrus_blob_id(&receipt) == string::utf8(b"walrus-blob-invoice-777"), 4);
            assert!(checkout::token_type(&receipt) == string::utf8(b"0x2::sui::SUI"), 5);

            sui::transfer::public_transfer(receipt, OPERATOR);
            ts::return_shared(registry);
        };

        clock::destroy_for_testing(clock_obj);
        ts::end(scenario);
    }
}