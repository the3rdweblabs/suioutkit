// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 The3rdWebLabs (https://github.com/the3rdweblabs)
// Author: @CYBWithFlourish (https://github.com/CYBWithFlourish)
// suioutkit::treasury
// Operator-funded on-chain vault.  Holds accepted tokens used to settle fiat
// payments.  Only suioutkit::checkout can call release<T>() — all other
// callers are blocked by Move's visibility rules (public(package)).
//
// Token balances are stored as dynamic fields keyed on the phantom type T,
// which allows the Treasury to hold any number of coin types without a
// compile-time whitelist.
module suioutkit::treasury {
    use sui::coin::{Self, Coin};
    use sui::dynamic_field as df;
    use suioutkit::errors;

    // Structs

    /// Shared object — created once at deploy.  Holds dynamic-field balances.
    public struct Treasury has key {
        id: UID,
        /// ID of the companion TreasuryAdminCap.  Validated on admin calls.
        admin_cap_id: ID,
    }

    /// Owned by the operator.  Required for deposit() and withdraw() calls.
    public struct TreasuryAdminCap has key, store {
        id: UID,
        /// Must match the Treasury.id this cap was created for.
        treasury_id: ID,
    }

    // Internal key type for dynamic fields — one per coin type T.
    public struct BalanceKey<phantom T> has copy, drop, store {}

    // Init (called once at publish)

    /// Creates the Treasury shared object and a TreasuryAdminCap for the
    /// deployer.  Called automatically by the Sui framework at publish time.
    fun init(ctx: &mut TxContext) {
        let treasury_uid = object::new(ctx);
        let treasury_id  = object::uid_to_inner(&treasury_uid);

        let cap = TreasuryAdminCap {
            id: object::new(ctx),
            treasury_id,
        };

        let treasury = Treasury {
            id: treasury_uid,
            admin_cap_id: object::id(&cap),
        };

        transfer::share_object(treasury);
        transfer::transfer(cap, tx_context::sender(ctx));
    }

    #[test_only]
    public fun init_for_testing(ctx: &mut TxContext) {
        init(ctx);
    }

    // Admin operations

    /// Deposit accepted tokens into the Treasury vault.
    /// Only the holder of TreasuryAdminCap can call this.
    public fun deposit<T>(
        treasury: &mut Treasury,
        coin: Coin<T>,
        cap: &TreasuryAdminCap,
        _ctx: &mut TxContext,
    ) {
        assert!(cap.treasury_id == object::id(treasury), errors::admin_cap_mismatch());
        let amount = coin::value(&coin);
        assert!(amount > 0, errors::zero_amount());

        let key = BalanceKey<T> {};
        if (df::exists_(&treasury.id, key)) {
            let existing: &mut Coin<T> = df::borrow_mut(&mut treasury.id, key);
            coin::join(existing, coin);
        } else {
            df::add(&mut treasury.id, key, coin);
        }
    }

    /// Withdraw tokens from the Treasury back to the operator.
    /// Only the holder of TreasuryAdminCap can call this.
    public fun withdraw<T>(
        treasury: &mut Treasury,
        amount: u64,
        cap: &TreasuryAdminCap,
        ctx: &mut TxContext,
    ): Coin<T> {
        assert!(cap.treasury_id == object::id(treasury), errors::admin_cap_mismatch());
        assert!(amount > 0, errors::zero_amount());

        let key = BalanceKey<T> {};
        assert!(df::exists_(&treasury.id, key), errors::insufficient_treasury());

        let stored: &mut Coin<T> = df::borrow_mut(&mut treasury.id, key);
        assert!(coin::value(stored) >= amount, errors::insufficient_treasury());

        coin::split(stored, amount, ctx)
    }

    /// Return current balance of coin type T in the Treasury.
    /// Useful for pre-flight checks before constructing a PTB.
    public fun balance<T>(treasury: &Treasury): u64 {
        let key = BalanceKey<T> {};
        if (!df::exists_(&treasury.id, key)) { return 0 };
        coin::value(df::borrow<BalanceKey<T>, Coin<T>>(&treasury.id, key))
    }

    // Package-internal release (called only from suioutkit::checkout)

    /// Release exactly `amount` of Coin<T> from the Treasury.
    /// Visibility: public(package) — not callable by any external address.
    /// Aborts with EInsufficientTreasury if balance is insufficient.
    public(package) fun release<T>(
        treasury: &mut Treasury,
        amount: u64,
        ctx: &mut TxContext,
    ): Coin<T> {
        assert!(amount > 0, errors::zero_amount());

        let key = BalanceKey<T> {};
        assert!(df::exists_(&treasury.id, key), errors::insufficient_treasury());

        let stored: &mut Coin<T> = df::borrow_mut(&mut treasury.id, key);
        assert!(coin::value(stored) >= amount, errors::insufficient_treasury());

        coin::split(stored, amount, ctx)
    }
}