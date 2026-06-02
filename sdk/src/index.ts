// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 The3rdWebLabs (https://github.com/the3rdweblabs)
// Author: @CYBWithFlourish (https://github.com/CYBWithFlourish)

import { CheckoutSession, CheckoutSessionOptions, CryptoConfirmResponse } from "./types/index.js";
import { SuiOutKitModal } from "./components/modal.js";
import { DEFAULT_API_ORIGIN, joinApiPath } from "./config/api.js";

export { DEFAULT_API_ORIGIN, API_V1_PREFIX } from "./config/api.js";

export class SuiOutKit {
  private backendUrl: string;
  private merchantAddress: string;

  constructor(config: { merchantAddress: string; backendUrl?: string }) {
    if (!config.merchantAddress) {
      throw new Error("SuiOutKit Error: merchantAddress is required.");
    }
    // Strip trailing slashes and provide default fallback
    this.backendUrl = (config.backendUrl || DEFAULT_API_ORIGIN).replace(/\/+$/, "");
    this.merchantAddress = config.merchantAddress;
  }

  /**
   * Initializes a brand-new isolated checkout session from the backend.
   */
  public async initCheckout(options: Omit<CheckoutSessionOptions, "merchantAddress">): Promise<CheckoutSession> {
    try {
      const response = await fetch(joinApiPath(this.backendUrl, "checkout", "session"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: options.amount,
          currency: options.currency,
          merchantAddress: this.merchantAddress,
          metadata: options.metadata || {}
        })
      });

      if (!response.ok) {
        throw new Error(`Server returned status ${response.status}`);
      }

      return await response.json();
    } catch (err) {
      console.error("SuiOutKit SDK Init Error:", err);
      throw new Error("SuiOutKit: Failed to initialize checkout session.");
    }
  }

  /**
   * Spawns the interactive RainbowKit-style checkout modal.
   */
  public openModal(session: CheckoutSession, onClose?: () => void): SuiOutKitModal {
    return new SuiOutKitModal(session, this.backendUrl, () => {
      if (onClose) onClose();
    });
  }

  /**
   * Confirms a crypto payment after wallet execution by submitting the tx digest.
   */
  public async confirmCryptoPayment(
    nonce: string,
    txDigest: string,
    method: "sui_wallet" | "outpay" = "sui_wallet"
  ): Promise<CryptoConfirmResponse> {
    const response = await fetch(joinApiPath(this.backendUrl, "checkout", "crypto", "confirm"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nonce, txDigest, method })
    });

    const result: CryptoConfirmResponse = await response.json();
    if (!response.ok) {
      return {
        status: "error",
        error: result.error || "Crypto confirmation failed."
      };
    }

    return result;
  }

  /**
   * Integrates dynamically with a targeted button on the merchant's landing page.
   * Brands the button and isolates a unique checkout session per click.
   */
  public wrapButton(
    selector: string,
    options: { amount: number; currency: "NGN" | "SUI" | string; metadata?: Record<string, any> }
  ): void {
    const btn = document.querySelector(selector) as HTMLButtonElement;
    if (!btn) {
      console.warn(`SuiOutKit: Element with selector "${selector}" was not found.`);
      return;
    }

    // Format display currency symbol
    const currencySymbol = options.currency === "NGN" ? "₦" : "";
    const formattedAmount = `${currencySymbol}${options.amount.toLocaleString()}`;
    const originalText = btn.textContent || "Pay Now";

    // Set premium branded text
    btn.textContent = `Pay ${formattedAmount}`;

    // Add pointer cursor and smooth styling transitions
    btn.style.cursor = "pointer";
    btn.style.transition = "opacity 0.2s ease";

    btn.addEventListener("click", async () => {
      const tempText = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Loading Checkout...";
      btn.style.opacity = "0.7";

      try {
        const session = await this.initCheckout(options);
        this.openModal(session, () => {
          // Restore button when modal is closed
          btn.disabled = false;
          btn.textContent = `Pay ${formattedAmount}`;
          btn.style.opacity = "1";
        });
      } catch (err) {
        alert("SuiOutKit Error: Unable to open secure payment session.");
        btn.disabled = false;
        btn.textContent = originalText;
        btn.style.opacity = "1";
      }
    });
  }
}

// Re-export small helpers
export { default as request } from "./utils/http.js";
export * from "./utils/format.js";
export { default as createPolling } from "./hooks/usePolling.js";

