// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 The3rdWebLabs (https://github.com/the3rdweblabs)
// Author: @CYBWithFlourish (https://github.com/CYBWithFlourish)
// suioutkit::errors
// Centralised error constants for the SuiOutKit Move package.
// EDuplicatePayment is owned by @mysten/payment-kit and is NOT declared here.
module suioutkit::errors {

    // Merchant address is 0x0 — invalid destination.
    const EZeroMerchantAddress: u64 = 1;

    // Coin value passed to settle_fiat / mint_suioutkit_receipt is zero.
    const EZeroAmount: u64 = 2;

    // walrus_blob_id string is empty — every receipt must reference a Walrus blob.
    const EInvalidBlobId: u64 = 3;

    // Treasury balance of the requested coin type is lower than the payment amount.
    const EInsufficientTreasury: u64 = 4;

    // TreasuryAdminCap does not match the target Treasury object.
    const EAdminCapMismatch: u64 = 5;

    // Public accessor functions (keeps error codes opaque to callers)

    public fun zero_merchant_address(): u64 { EZeroMerchantAddress }
    public fun zero_amount(): u64            { EZeroAmount }
    public fun invalid_blob_id(): u64        { EInvalidBlobId }
    public fun insufficient_treasury(): u64  { EInsufficientTreasury }
    public fun admin_cap_mismatch(): u64     { EAdminCapMismatch }
}