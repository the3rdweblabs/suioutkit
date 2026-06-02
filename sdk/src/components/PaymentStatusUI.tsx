// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 The3rdWebLabs (https://github.com/the3rdweblabs)
// Author: @CYBWithFlourish (https://github.com/CYBWithFlourish)

import React from "react";
import { usePaymentStatus } from "../hooks/usePaymentStatus";
import { ProgressStepper } from "./ProgressStepper";

type Props = {
  backendUrl: string;
  nonce: string;
};

export default function PaymentStatusUI({ backendUrl, nonce }: Props) {
  const update = usePaymentStatus(backendUrl, nonce);

  const isProcessing = update.status === "PROCESSING";
  const isSettled = update.status === "SETTLED";
  const hasReceipt = !!update.walrusBlobId || isSettled;

  const steps = [
    { label: "Transfer sent", completed: isProcessing || hasReceipt },
    { label: "Webhook received", completed: isProcessing || hasReceipt },
    { label: "Receipt minted", completed: hasReceipt },
    { label: "Settled on-chain", completed: isSettled },
  ];

  // Determine badge status
  let badgeStatus: "PENDING" | "PROCESSING" | "BANK_CONFIRMED" | "SETTLED" | "ERROR" = "PENDING";
  if (update.error) {
    badgeStatus = "ERROR";
  } else if (update.status === "SETTLED") {
    badgeStatus = "SETTLED";
  } else if (update.status === "PROCESSING") {
    badgeStatus = "PROCESSING";
  } else if (update.walrusBlobId) {
    badgeStatus = "BANK_CONFIRMED";
  } else {
    badgeStatus = "PENDING";
  }

  const copy = update.error
    ? "Payment monitoring lost connection."
    : isSettled
      ? "Payment settled. Receipt has been generated and the on-chain transaction is complete."
      : isProcessing
        ? "Bank transfer received. Webhook confirmed the payment and settlement is in progress..."
        : hasReceipt
          ? "Receipt minted. Final settlement is being confirmed on-chain..."
          : "Waiting for the bank transfer to arrive. Once received, the progress steps will advance automatically.";

  return (
    <div className="payment-status-ui" style={{ marginTop: "12px" }}>
      <div className="payment-status-copy">{copy}</div>
      <ProgressStepper steps={steps} />
    </div>
  );
}
