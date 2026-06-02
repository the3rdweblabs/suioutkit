// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 The3rdWebLabs (https://github.com/the3rdweblabs)
// Author: @CYBWithFlourish (https://github.com/CYBWithFlourish)

import fetch from "node-fetch";
import { getEnv, getLoadedEnvFiles } from "../config/env.js";
import logger from "../utils/logger.js";

const FLW_SECRET_KEY = getEnv("FLW_SECRET_KEY");
const FLW_API_BASE = getEnv("FLW_API_BASE", "https://api.flutterwave.com/v3");

export interface CreateChargeParams {
  txRef: string;
  amount: number;
  email: string;
  phoneNumber?: string;
}

type FlutterwaveErrorCode = "FLW_CONFIG_ERROR" | "FLW_AUTH_ERROR" | "FLW_PROVIDER_ERROR";

class FlutterwaveServiceError extends Error {
  public code: FlutterwaveErrorCode;
  public providerHttpStatus?: number;
  public providerStatus?: string;
  public providerMessage?: string;

  constructor(
    message: string,
    code: FlutterwaveErrorCode,
    details: {
      providerHttpStatus?: number;
      providerStatus?: string;
      providerMessage?: string;
    } = {}
  ) {
    super(message);
    this.name = "FlutterwaveServiceError";
    this.code = code;
    this.providerHttpStatus = details.providerHttpStatus;
    this.providerStatus = details.providerStatus;
    this.providerMessage = details.providerMessage;
  }
}

class FlutterwaveService {
  constructor() {
    logger.info(
      "FLUTTERWAVE",
      `Config loaded. apiBase=${FLW_API_BASE}, secretKeyMode=${this.getSecretKeyMode()}, secretKeyLength=${FLW_SECRET_KEY.length}, envFiles=${this.describeEnvFiles()}`
    );

    if (FLW_SECRET_KEY && !this.hasValidSecretKeyShape()) {
      logger.warn(
        "FLUTTERWAVE",
        "FLW_SECRET_KEY is present but does not start with FLWSECK. Recopy the server-side secret key from the Flutterwave dashboard."
      );
    }
  }

  /**
   * Generates a dynamic Naira virtual account number for the session using preferred partner banks
   * (9PSB, Wema, Sterling, FCMB, GTB).
   */
  public async chargeBankTransfer(params: CreateChargeParams): Promise<{
    accountNumber: string;
    bankName: string;
    amount: number;
    expirySeconds: number;
  }> {
    this.assertValidConfig();

    try {
      const response = await fetch(`${FLW_API_BASE}/charges?type=bank_transfer`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${FLW_SECRET_KEY}`,
          Accept: "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          tx_ref: params.txRef,
          amount: params.amount.toString(),
          currency: "NGN",
          email: params.email,
          phone_number: params.phoneNumber || "08000000000",
          fullname: "SuiOutKit Checkout Payer",
          is_permanent: false
        })
      });

      const result = await this.readJsonResponse(response);

      if (result.status === "success" && result.meta?.authorization) {
        const auth = result.meta.authorization;

        // Securely parse account expiration date if present, fallback to 1 hour (3600 seconds)
        let expirySeconds = 3600;
        if (auth.account_expiration) {
          const expDate = new Date(auth.account_expiration);
          if (!isNaN(expDate.getTime())) {
            expirySeconds = Math.max(0, Math.floor((expDate.getTime() - Date.now()) / 1000));
          }
        } else if (auth.transfer_note) {
          // Fallback regex matching standard string duration
          const match = auth.transfer_note.match(/\d+/);
          if (match) expirySeconds = parseInt(match[0]);
        }

        return {
          accountNumber: auth.transfer_account || "9928374921",
          bankName: auth.transfer_bank || "9PSB",
          amount: parseFloat(auth.transfer_amount || params.amount.toString()),
          expirySeconds
        };
      }

      throw this.toProviderError("Bank transfer charge", response, result);
    } catch (err: any) {
      this.logError("chargeBankTransfer", err);
      throw err instanceof FlutterwaveServiceError
        ? err
        : new FlutterwaveServiceError(
          `Flutterwave Charge Error: ${err.message || "Unable to reach Flutterwave."}`,
          "FLW_PROVIDER_ERROR"
        );
    }
  }

  /**
   * Charges the user's OPay wallet by registering the direct mobile payment prompt.
   */
  public async chargeOPay(params: CreateChargeParams): Promise<string> {
    this.assertValidConfig();

    try {
      const response = await fetch(`${FLW_API_BASE}/charges?type=opay`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${FLW_SECRET_KEY}`,
          Accept: "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          tx_ref: params.txRef,
          amount: params.amount.toString(),
          currency: "NGN",
          email: params.email,
          phone_number: params.phoneNumber,
          name: "SuiOutKit OPay Payer"
        })
      });

      const result = await this.readJsonResponse(response);

      if (result.status === "success") {
        return result.meta?.authorization?.instruction || "Follow the prompt on your mobile wallet screen.";
      }

      throw this.toProviderError("OPay charge", response, result);
    } catch (err: any) {
      this.logError("chargeOPay", err);
      throw err instanceof FlutterwaveServiceError
        ? err
        : new FlutterwaveServiceError(
          `Flutterwave OPay Charge Error: ${err.message || "Unable to reach Flutterwave."}`,
          "FLW_PROVIDER_ERROR"
        );
    }
  }

  private assertValidConfig() {
    if (!FLW_SECRET_KEY) {
      throw new FlutterwaveServiceError(
        "Flutterwave Secret Key is not configured. Set FLW_SECRET_KEY in backend/.env or the server environment, then restart the backend.",
        "FLW_CONFIG_ERROR"
      );
    }

    if (!this.hasValidSecretKeyShape()) {
      throw new FlutterwaveServiceError(
        "Flutterwave Secret Key looks invalid. FLW_SECRET_KEY must start with FLWSECK; recopy the full server-side secret key from the Flutterwave dashboard and restart the backend.",
        "FLW_CONFIG_ERROR"
      );
    }
  }

  private hasValidSecretKeyShape(): boolean {
    return FLW_SECRET_KEY.startsWith("FLWSECK");
  }

  private getSecretKeyMode(): "missing" | "test" | "live" | "unknown" {
    if (!FLW_SECRET_KEY) return "missing";
    if (FLW_SECRET_KEY.startsWith("FLWSECK_TEST")) return "test";
    if (FLW_SECRET_KEY.startsWith("FLWSECK-") || FLW_SECRET_KEY.startsWith("FLWSECK_LIVE")) return "live";
    return "unknown";
  }

  private describeEnvFiles(): string {
    const envFiles = getLoadedEnvFiles();
    return envFiles.length > 0 ? envFiles.join(",") : "process-environment-only";
  }

  private async readJsonResponse(response: any): Promise<any> {
    const bodyText = await response.text();
    if (!bodyText) {
      return {};
    }

    try {
      return JSON.parse(bodyText);
    } catch {
      return { message: bodyText };
    }
  }

  private toProviderError(operation: string, response: any, result: any): FlutterwaveServiceError {
    const providerMessage = this.getProviderMessage(result, `${operation} failed.`);
    const providerStatus = typeof result?.status === "string" ? result.status : undefined;
    const authFailure = this.isAuthFailure(response.status, providerMessage);

    if (authFailure) {
      return new FlutterwaveServiceError(
        "Flutterwave authentication failed. The configured FLW_SECRET_KEY was rejected; recopy the full key from the matching Flutterwave Test/Live mode and restart the backend.",
        "FLW_AUTH_ERROR",
        {
          providerHttpStatus: response.status,
          providerStatus,
          providerMessage
        }
      );
    }

    return new FlutterwaveServiceError(
      `${operation} failed: ${providerMessage}`,
      "FLW_PROVIDER_ERROR",
      {
        providerHttpStatus: response.status,
        providerStatus,
        providerMessage
      }
    );
  }

  private getProviderMessage(result: any, fallback: string): string {
    const message = result?.message || result?.data?.message || result?.error || fallback;
    return String(message);
  }

  private isAuthFailure(httpStatus: number, providerMessage: string): boolean {
    return httpStatus === 401 || /invalid authorization key|unauthorized|invalid api key|invalid key/i.test(providerMessage);
  }

  private logError(operation: string, err: any) {
    if (err instanceof FlutterwaveServiceError) {
      logger.error(
        "FLUTTERWAVE",
        `${operation} failed. code=${err.code}, httpStatus=${err.providerHttpStatus ?? "n/a"}, providerStatus=${err.providerStatus ?? "n/a"}, providerMessage="${this.sanitizeLogValue(err.providerMessage || err.message)}"`
      );
      return;
    }

    logger.error("FLUTTERWAVE", `${operation} failed. message="${this.sanitizeLogValue(err.message || String(err))}"`);
  }

  private sanitizeLogValue(value: string): string {
    return value.replace(/[\r\n]+/g, " ").slice(0, 300);
  }
}

export const flutterwaveService = new FlutterwaveService();
export default flutterwaveService;
