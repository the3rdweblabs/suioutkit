// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 The3rdWebLabs (https://github.com/the3rdweblabs)
// Author: @CYBWithFlourish (https://github.com/CYBWithFlourish)

import React from "react";

type Step = { label: string; completed?: boolean };

type Props = { steps: Step[] };

export function ProgressStepper({ steps }: Props) {
  return (
    <div className="stepper">
      {steps.map((s, i) => (
        <div className="step" key={i} id={`step-${i}`}>
          <div className={`circle ${s.completed ? "filled" : ""}`}>{i + 1}</div>
          <div className="label">{s.label}</div>
          {i < steps.length - 1 && <div className="line" />}
        </div>
      ))}
    </div>
  );
}