// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 The3rdWebLabs (https://github.com/the3rdweblabs)
// Author: @CYBWithFlourish (https://github.com/CYBWithFlourish)

export type SuiOutKitMode = "local" | "test" | "live";

export interface ModeConfig {
  backendUrl: string;
  suiNetwork: "mainnet" | "testnet";
}

export const MODE_MAP: Record<SuiOutKitMode, ModeConfig> = {
  local: { backendUrl: "http://localhost:5000", suiNetwork: "testnet" },
  test:  { backendUrl: "https://api.staging.suioutkit.xyz", suiNetwork: "testnet" },
  live:  { backendUrl: "https://api.suioutkit.xyz", suiNetwork: "mainnet" },
};
