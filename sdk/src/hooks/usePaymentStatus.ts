// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 The3rdWebLabs (https://github.com/the3rdweblabs)
// Author: @CYBWithFlourish (https://github.com/CYBWithFlourish)

import { useEffect, useState } from "react";
import { joinApiPath } from "../config/api.js";

type PaymentUpdate = {
  status?: "PENDING" | "PROCESSING" | "BANK_CONFIRMED" | "SETTLED" | "ERROR";
  walrusBlobId?: string;
  txDigest?: string;
  error?: string;
};

/**
 * Hook to listen to backend payment status via Server‑Sent Events.
 * Usage: const update = usePaymentStatus(session.nonce);
 */
export function usePaymentStatus(backendUrl: string, nonce: string): PaymentUpdate {
  const [state, setState] = useState<PaymentUpdate>({ status: "PENDING" });

  useEffect(() => {
    const source = new EventSource(joinApiPath(backendUrl, "payments", "stream", nonce));
    source.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        setState((prev) => ({ ...prev, ...data }));
      } catch (_) { }
    };
    source.onerror = () => {
      if (source.readyState === EventSource.CLOSED) {
        setState((prev) => ({ ...prev, status: "ERROR", error: "Connection lost" }));
        source.close();
      }
    };
    return () => source.close();
  }, [backendUrl, nonce]);

  return state;
}