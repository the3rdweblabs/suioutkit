// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 The3rdWebLabs (https://github.com/the3rdweblabs)
// Author: @CYBWithFlourish (https://github.com/CYBWithFlourish)

import React from "react";
import { Loader2, CheckCircle, XCircle } from "lucide-react";
import "./style.css";

type Props = {
  status: "PENDING" | "PROCESSING" | "SUCCESS" | "ERROR" | "BANK_CONFIRMED" | "SETTLED";
};

export function StatusBadge({ status }: Props) {
  if (status === "SUCCESS" || status === "BANK_CONFIRMED" || status === "SETTLED") {
    return <CheckCircle className="icon success" />;
  }
  if (status === "ERROR") {
    return <XCircle className="icon error" />;
  }
  // pending spinner
  return <Loader2 className="icon spin" />;
}
