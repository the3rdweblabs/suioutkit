// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 The3rdWebLabs (https://github.com/the3rdweblabs)
// Author: @CYBWithFlourish (https://github.com/CYBWithFlourish)

import React from "react";
import { createRoot } from "react-dom/client";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { Transaction } from "@mysten/sui/transactions";
import { createPaymentTransactionUri } from "@mysten/payment-kit";
import { paymentKit } from "@mysten/payment-kit";
import { createDAppKit } from "@mysten/dapp-kit-core";
import "@mysten/dapp-kit-core/web";
import { loadStripe, StripeElements, Stripe } from "@stripe/stripe-js";
import { CheckoutSession, ChargeResponse, CheckoutStatusResponse, CryptoIntentResponse } from "../types/index.js";
import PaymentStatusUI from "./PaymentStatusUI";
import { joinApiPath } from "../config/api.js";

const SUI_GRPC_URLS = {
  mainnet: "https://fullnode.mainnet.sui.io:443",
  testnet: "https://fullnode.testnet.sui.io:443"
};

type SupportedNetwork = keyof typeof SUI_GRPC_URLS;

function getExplorerNetworkPath() {
  const requestedNetwork = (window as any).SuiOutKitNetwork as string | undefined;
  return requestedNetwork === "mainnet" ? "mainnet" : "testnet";
}

export class SuiOutKitModal {
  private overlay: HTMLDivElement | null = null;
  private session: CheckoutSession;
  private backendUrl: string;
  private pollInterval: any = null;
  private walletConnectionUnsubscribe: (() => void) | null = null;
  private onCloseCallback: () => void;
  private cryptoIntent: CryptoIntentResponse | null = null;
  private dAppKit: any | null = null;
  private paymentClient: any | null = null;
  private stripeInstance: Stripe | null = null;
  private stripeElements: StripeElements | null = null;

  constructor(session: CheckoutSession, backendUrl: string, onClose: () => void) {
    this.session = session;
    this.backendUrl = backendUrl;
    this.onCloseCallback = onClose;
    this.ensureDAppKit(); // Initialize early so wallets have time to inject
    this.injectStyles();
    this.createModal();
  }

  private injectStyles() {
    if (!document.getElementById("suioutkit-styles")) {
      const link = document.createElement("link");
      link.id = "suioutkit-styles";
      link.rel = "stylesheet";
      link.href = `${this.backendUrl}/style.css`;
      document.head.appendChild(link);
    }

    if (!document.getElementById("suioutkit-lucide")) {
      const script = document.createElement("script");
      script.id = "suioutkit-lucide";
      script.src = "https://unpkg.com/lucide@latest";
      script.onload = () => this.renderIcons();
      document.head.appendChild(script);
    } else {
      this.renderIcons();
    }
  }

  private renderIcons() {
    const globalWindow = window as any;
    if (globalWindow.lucide) {
      globalWindow.lucide.createIcons();
    }
  }

  private createModal() {
    this.overlay = document.createElement("div");
    this.overlay.className = "suioutkit-overlay";
    this.overlay.innerHTML = `
      <div class="suioutkit-card">
        <button class="suioutkit-close" id="sok-close-btn">&times;</button>
        <div class="suioutkit-content" id="sok-content-panel"></div>
      </div>
    `;

    document.body.appendChild(this.overlay);

    const closeBtn = this.overlay.querySelector("#sok-close-btn");
    closeBtn?.addEventListener("click", () => this.destroy());

    const card = this.overlay.querySelector(".suioutkit-card");
    card?.addEventListener("click", (e) => e.stopPropagation());

    this.overlay.addEventListener("click", () => this.destroy());

    this.renderSelectionPanel();

    setTimeout(() => {
      this.overlay?.classList.add("active");
    }, 50);
  }

  private renderSelectionPanel() {
    const container = this.overlay?.querySelector("#sok-content-panel");
    if (!container) return;

    const currencySymbol = this.session.currency === "NGN" ? "₦" : "";
    const formattedAmount = `${currencySymbol}${this.session.amount.toLocaleString()}`;

    container.innerHTML = `
      <div class="suioutkit-header">
        <h2 class="suioutkit-title">Checkout</h2>
        <p class="suioutkit-subtitle">Select payment method to settle ${formattedAmount}</p>
      </div>
      <div class="suioutkit-body">
        <button class="suioutkit-option" id="sok-method-bank">
          <div class="suioutkit-option-content">
            <img src="${this.backendUrl}/assets/flutterwave.png" class="suioutkit-option-img" alt="Bank Transfer" />
            <span class="suioutkit-option-name">Bank Transfer</span>
          </div>
        </button>

        <button class="suioutkit-option" id="sok-method-stripe">
          <div class="suioutkit-option-content">
            <img src="${this.backendUrl}/assets/stripe_c.jpeg" class="suioutkit-option-img" alt="Card / Global" />
            <span class="suioutkit-option-name">Card / Global</span>
          </div>
        </button>

        <button class="suioutkit-option" id="sok-method-opay">
          <div class="suioutkit-option-content">
            <img src="${this.backendUrl}/assets/opay.png" class="suioutkit-option-img" alt="OPay Account" />
            <span class="suioutkit-option-name">OPay Account</span>
          </div>
        </button>

        <button class="suioutkit-option" id="sok-method-crypto">
          <div class="suioutkit-option-content">
            <img src="${this.backendUrl}/assets/sui.png" class="suioutkit-option-img" alt="Sui Wallet" />
            <span class="suioutkit-option-name">Sui Wallet</span>
          </div>
        </button>
      </div>
    `;

    this.renderIcons();

    container.querySelector("#sok-method-bank")?.addEventListener("click", () => this.handleCharge("bank_transfer"));
    container.querySelector("#sok-method-stripe")?.addEventListener("click", () => void this.handleStripePaymentPanel());
    container.querySelector("#sok-method-opay")?.addEventListener("click", () => this.renderOPayFormPanel());
    container.querySelector("#sok-method-crypto")?.addEventListener("click", () => void this.handleCryptoPaymentPanel());
  }

  private async handleCharge(method: "bank_transfer" | "opay", phoneNumber?: string) {
    this.renderLoadingPanel("Allocating checkout session...");

    try {
      const response = await fetch(joinApiPath(this.backendUrl, "checkout", "charge"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: this.session.token,
          method,
          phoneNumber
        })
      });

      const result: ChargeResponse = await response.json();

      if (result.status === "success") {
        if (method === "bank_transfer" && result.virtualAccount) {
          this.renderBankTransferPanel(result.virtualAccount);
        } else if (method === "opay") {
          this.renderOPayInstructionsPanel(result.opayPrompt || "Approve OPay payment prompt on your phone.");
        }
      } else {
        this.renderErrorPanel(result.message || "Failed to process charge.");
      }
    } catch (err) {
      this.renderErrorPanel("Connection to payment server failed.");
    }
  }

  private renderLoadingPanel(message: string) {
    const container = this.overlay?.querySelector("#sok-content-panel");
    if (!container) return;

    container.innerHTML = `
      <div class="suioutkit-panel">
        <div class="sok-spinner"></div>
        <p class="sok-status-text">${message}</p>
      </div>
    `;
  }

  private renderBankTransferPanel(va: any) {
    const container = this.overlay?.querySelector("#sok-content-panel");
    if (!container) return;

    container.innerHTML = `
      <button class="suioutkit-back" id="sok-back-btn">← Back to methods</button>
      <div class="suioutkit-panel">
        <div class="suioutkit-amount-box">
          <p class="suioutkit-subtitle">Please transfer exactly</p>
          <h2 class="sok-fiat-amt">₦${va.amount.toLocaleString()}</h2>
        </div>

        <div class="sok-va-card">
          <div class="sok-copied-alert" id="sok-copy-bubble">Copied!</div>
          
          <div class="sok-va-row">
            <div class="sok-va-lbl">Bank Name</div>
            <div class="sok-va-val">${va.bankName}</div>
          </div>

          <div class="sok-va-row">
            <div class="sok-va-lbl">Account Number</div>
            <div class="sok-va-val">
              <span id="sok-acct-num">${va.accountNumber}</span>
              <button class="sok-copy-btn" id="sok-copy-acct">Copy</button>
            </div>
          </div>
        </div>

        <div id="sok-status-react"></div>
        <p class="sok-status-text">Waiting for your bank transfer alert...</p>
      </div>
    `;

    container.querySelector("#sok-back-btn")?.addEventListener("click", () => {
      this.stopPolling();
      this.renderSelectionPanel();
    });

    container.querySelector("#sok-copy-acct")?.addEventListener("click", () => {
      const numSpan = container.querySelector("#sok-acct-num");
      if (numSpan) {
        navigator.clipboard.writeText(numSpan.textContent || "");
        const bubble = container.querySelector("#sok-copy-bubble");
        bubble?.classList.add("show");
        setTimeout(() => bubble?.classList.remove("show"), 2000);
      }
    });

    this.mountPaymentStatus(container as HTMLElement);
    this.startPolling();
  }

  private mountPaymentStatus(container: HTMLElement) {
    const statusDiv = container.querySelector("#sok-status-react");
    if (!statusDiv) return;
    const root = createRoot(statusDiv as HTMLElement);
    root.render(
      React.createElement(PaymentStatusUI, {
        backendUrl: this.backendUrl,
        nonce: this.session.nonce,
      })
    );
  }

  private renderOPayFormPanel() {
    const container = this.overlay?.querySelector("#sok-content-panel");
    if (!container) return;

    container.innerHTML = `
      <button class="suioutkit-back" id="sok-back-btn">← Back to methods</button>
      <div class="suioutkit-header">
        <h2 class="suioutkit-title">OPay Direct</h2>
        <p class="suioutkit-subtitle">Enter your OPay registered phone number</p>
      </div>
      <div class="sok-panel">
        <form class="sok-form" id="sok-opay-form">
          <input type="tel" class="sok-input" placeholder="e.g. 08012345678" id="sok-phone-input" required />
          <button type="submit" class="sok-btn">Send Prompt</button>
        </form>
      </div>
    `;

    container.querySelector("#sok-back-btn")?.addEventListener("click", () => this.renderSelectionPanel());

    container.querySelector("#sok-opay-form")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const phoneInput = container.querySelector("#sok-phone-input") as HTMLInputElement;
      if (phoneInput) {
        this.handleCharge("opay", phoneInput.value.trim());
      }
    });
  }

  private renderOPayInstructionsPanel(promptText: string) {
    const container = this.overlay?.querySelector("#sok-content-panel");
    if (!container) return;

    container.innerHTML = `
      <button class="suioutkit-back" id="sok-back-btn">← Back to methods</button>
      <div class="suioutkit-panel">
        <div class="suioutkit-amount-box">
          <p class="suioutkit-subtitle">Check your phone to approve</p>
          <h2 class="sok-fiat-amt">OPay Prompt</h2>
        </div>
        <p class="sok-status-text" style="margin-bottom: 20px; font-weight:600;">${promptText}</p>
        <div class="sok-spinner"></div>
        <p class="sok-status-text">Waiting for your OPay confirmation...</p>
      </div>
    `;

    container.querySelector("#sok-back-btn")?.addEventListener("click", () => {
      this.stopPolling();
      this.renderSelectionPanel();
    });

    this.startPolling();
  }

  private async handleStripePaymentPanel() {
    this.renderLoadingPanel("Initializing secure global checkout...");
    try {
      const response = await fetch(joinApiPath(this.backendUrl, "checkout", "charge"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: this.session.token,
          method: "stripe"
        })
      });

      const result: any = await response.json();
      if (result.status === "success" && result.clientSecret && result.stripePublicKey) {
        this.renderStripeElementsPanel(result.clientSecret, result.stripePublicKey, result.validatedRate);
      } else {
        this.renderErrorPanel(result.message || "Failed to initialize Stripe checkout.");
      }
    } catch (err) {
      this.renderErrorPanel("Connection to payment server failed.");
    }
  }

  private async renderStripeElementsPanel(clientSecret: string, publicKey: string, rate: number) {
    const container = this.overlay?.querySelector("#sok-content-panel");
    if (!container) return;

    container.innerHTML = `
      <button class="suioutkit-back" id="sok-back-btn">← Back to methods</button>
      <div class="suioutkit-header">
        <h2 class="suioutkit-title">Global Checkout</h2>
        <p class="suioutkit-subtitle">Secured by Stripe</p>
      </div>
      <div class="suioutkit-panel" style="gap: 16px; display: flex; flex-direction: column; width: 100%;">
        <form id="payment-form" style="width: 100%;">
          <div id="payment-element" style="min-height: 200px; margin-bottom: 16px;">
            <div class="sok-spinner" style="margin: 0 auto;"></div>
          </div>
          <button class="sok-btn" id="submit-stripe-btn" style="background: linear-gradient(135deg, #6366f1 0%, #4338ca 100%); width: 100%;">
            Pay Now
          </button>
          <div id="payment-message" style="color: #ef4444; font-size: 13px; margin-top: 8px; text-align: center; display: none;"></div>
        </form>
      </div>
    `;

    this.renderIcons();
    container.querySelector("#sok-back-btn")?.addEventListener("click", () => this.renderSelectionPanel());

    try {
      if (!this.stripeInstance) {
        this.stripeInstance = await loadStripe(publicKey);
      }

      if (!this.stripeInstance) throw new Error("Stripe failed to load");

      const appearance = { theme: 'night' as const, variables: { colorPrimary: '#6366f1', colorBackground: 'rgba(15,23,42,0.6)' } };
      this.stripeElements = this.stripeInstance.elements({ appearance, clientSecret });
      const paymentElement = this.stripeElements.create("payment");
      paymentElement.mount("#payment-element");

      const form = document.getElementById("payment-form");
      form?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const submitBtn = document.getElementById("submit-stripe-btn") as HTMLButtonElement;
        submitBtn.disabled = true;
        submitBtn.textContent = "Processing...";

        const { error } = await this.stripeInstance!.confirmPayment({
          elements: this.stripeElements!,
          confirmParams: {
            return_url: window.location.href, // Fallback, we use 'if_required' for cards
          },
          redirect: "if_required"
        });

        if (error) {
          const msg = document.getElementById("payment-message");
          if (msg) {
            msg.textContent = error.message || "An unexpected error occurred.";
            msg.style.display = "block";
          }
          submitBtn.disabled = false;
          submitBtn.textContent = "Pay Now";
        } else {
          this.renderLoadingPanel("Payment approved! Waiting for settlement...");
          this.startPolling();
        }
      });
    } catch (e: any) {
      this.renderErrorPanel("Failed to load Stripe: " + e.message);
    }
  }

  private async handleCryptoPaymentPanel() {
    const container = this.overlay?.querySelector("#sok-content-panel");
    if (!container) return;

    this.renderLoadingPanel("Preparing crypto payment...");

    try {
      this.cryptoIntent = await this.loadCryptoIntent("sui_wallet");
    } catch (err: any) {
      this.renderErrorPanel(err.message || "Failed to prepare crypto payment.");
      return;
    }

    container.innerHTML = `
      <button class="suioutkit-back" id="sok-back-btn">← Back to methods</button>
      <div class="suioutkit-header">
        <h2 class="suioutkit-title">Pay with Sui Wallet</h2>
        <p class="suioutkit-subtitle">Choose SUI payment channel</p>
      </div>
      <div class="suioutkit-panel" style="gap: 12px; display: flex; flex-direction: column; width: 100%;">
        <p class="sok-status-text" style="margin-bottom: 12px;">
          Choose whether to pay via a desktop extension wallet or scan a dynamic QR Code with your mobile wallet.
        </p>
        <button class="sok-btn" id="sok-connect-extension-btn" style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); margin-bottom: 4px;">
          Standard Connect Wallet
        </button>
        <button class="sok-btn" id="sok-outpay-qr-btn" style="background: linear-gradient(135deg, #10b981 0%, #047857 100%);">
          outPay (Scan QR Code)
        </button>
      </div>
    `;

    container.querySelector("#sok-back-btn")?.addEventListener("click", () => this.renderSelectionPanel());

    container.querySelector("#sok-connect-extension-btn")?.addEventListener("click", () => {
      if (!this.cryptoIntent) {
        this.renderErrorPanel("Crypto intent not ready.");
        return;
      }
      void this.openStandardConnectWallet();
    });

    container.querySelector("#sok-outpay-qr-btn")?.addEventListener("click", () => void this.renderOutPayQRPanel());
  }

  private async renderCustomWalletListPanel() {
    await this.openStandardConnectWallet();
  }

  private async openStandardConnectWallet() {
    if (!this.cryptoIntent) {
      this.renderErrorPanel("Crypto intent not ready.");
      return;
    }

    if (this.isFileOrigin()) {
      this.renderUnsupportedOriginPanel();
      return;
    }

    const wallets = await this.getCompatibleWallets();

    if (wallets.length === 0) {
      this.renderNoSupportedWalletsPanel();
      return;
    }

    this.renderWalletPickerPanel(wallets);
  }

  private async getCompatibleWallets() {
    const dAppKit = this.ensureDAppKit();
    const getWallets = () => (dAppKit.stores as any)?.$wallets?.get?.() || [];

    let wallets: any[] = getWallets();
    if (wallets.length === 0) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      wallets = getWallets();
    }

    return wallets
      .filter((wallet) => wallet?.name && wallet?.icon)
      .sort((a, b) => {
        const rank = (name: string) => {
          const normalized = name.toLowerCase();
          if (normalized.includes("slush")) return 0;
          if (normalized.includes("phantom")) return 1;
          return 2;
        };

        return rank(String(a.name)) - rank(String(b.name)) || String(a.name).localeCompare(String(b.name));
      });
  }

  private renderWalletPickerPanel(wallets: any[]) {
    const container = this.overlay?.querySelector("#sok-content-panel");
    if (!container) return;

    const walletCardsHtml = wallets
      .map((wallet, index) => this.renderWalletCard(wallet, index))
      .join("");

    container.innerHTML = `
      <button class="suioutkit-back" id="sok-back-btn">← Back to Sui options</button>
      <div class="suioutkit-header">
        <h2 class="suioutkit-title">Connect Wallet</h2>
        <p class="suioutkit-subtitle">Choose the extension you want to use</p>
      </div>
      <div style="display: grid; grid-template-columns: 1fr; gap: 12px; width: 100%;">
        ${walletCardsHtml}
      </div>
      <p class="sok-status-text" style="font-size: 12px; opacity: 0.75; margin-top: 14px; text-align: center;">
        Wallets are filtered from the browser extensions detected by dApp Kit.
      </p>
    `;

    this.renderIcons();

    container.querySelector("#sok-back-btn")?.addEventListener("click", () => this.handleCryptoPaymentPanel());

    wallets.forEach((wallet, index) => {
      const btn = container.querySelector(`[data-wallet-index="${index}"]`);
      btn?.addEventListener("click", async () => {
        const dAppKit = this.ensureDAppKit();
        this.renderLoadingPanel(`Connecting to ${wallet.name}...`);

        try {
          const result = await dAppKit.connectWallet({ wallet });
          const connection = (dAppKit.stores as any)?.$connection?.get?.() || {};
          const account = result.accounts?.[0] || connection.currentAccount || connection.account;

          if (!account) {
            this.renderErrorPanel("Wallet connected, but no account was returned. Please unlock the wallet and try again.");
            return;
          }

          this.renderPaymentConfirmPanel(account);
        } catch (err: any) {
          const errMsg = err?.message || "Failed to connect wallet.";
          if (errMsg.toLowerCase().includes("no accounts were authorized") || errMsg.toLowerCase().includes("rejected")) {
            this.renderErrorPanel("Connection rejected or wallet is locked. Please unlock your wallet and try again.");
          } else {
            this.renderErrorPanel(errMsg);
          }
        }
      });
    });
  }

  private ensureDAppKit() {
    if (this.dAppKit) {
      return this.dAppKit;
    }

    const requestedNetwork = (window as any).SuiOutKitNetwork as string | undefined;
    const network: SupportedNetwork = requestedNetwork === "mainnet" || requestedNetwork === "testnet" ? requestedNetwork : "testnet";

    this.dAppKit = createDAppKit({
      networks: [network],
      defaultNetwork: network,
      autoConnect: false,
      slushWalletConfig: null,
      createClient: (selectedNetwork) =>
        new SuiGrpcClient({
          network: selectedNetwork,
          baseUrl: SUI_GRPC_URLS[selectedNetwork as keyof typeof SUI_GRPC_URLS] || SUI_GRPC_URLS.testnet
        })
    });

    return this.dAppKit;
  }

  private clearWalletConnectionWaiter() {
    if (this.walletConnectionUnsubscribe) {
      this.walletConnectionUnsubscribe();
      this.walletConnectionUnsubscribe = null;
    }
  }

  private isFileOrigin() {
    return window.location.protocol === "file:";
  }

  private renderUnsupportedOriginPanel() {
    const container = this.overlay?.querySelector("#sok-content-panel");
    if (!container) return;

    container.innerHTML = `
      <button class="suioutkit-back" id="sok-back-btn">← Back to Sui options</button>
      <div class="suioutkit-panel" style="gap: 12px; display: flex; flex-direction: column; align-items: center; text-align: center;">
        <div class="sok-success-icon" style="color: #f59e0b; display: flex; align-items: center; justify-content: center; margin-bottom: 8px;">
          <i data-lucide="alert-circle" style="width: 48px; height: 48px;"></i>
        </div>
        <h2 class="sok-success-title">Open this demo from localhost</h2>
        <p class="sok-status-text" style="max-width: 320px;">
          This page is running from a local file URL. Browser extension wallets like Slush and Phantom do not reliably inject into file:// pages, so dApp Kit cannot list them here.
        </p>
        <p class="sok-status-text" style="max-width: 320px; font-size: 12px; opacity: 0.78;">
          Open the demo over http://localhost or another web server, then reload. That is the supported origin for wallet detection and connection.
        </p>
      </div>
    `;

    this.renderIcons();
    container.querySelector("#sok-back-btn")?.addEventListener("click", () => this.handleCryptoPaymentPanel());
  }

  private renderWalletCard(wallet: any, index: number): string {
    const walletName = wallet.name || "Unknown Wallet";
    const icon = wallet.icon || "https://via.placeholder.com/48";

    return `
      <button
        class="sok-wallet-card"
        data-wallet-index="${index}"
        style="display: flex; align-items: center; gap: 14px; width: 100%; padding: 14px 16px; border-radius: 18px; border: 1px solid rgba(255,255,255,0.08); background: linear-gradient(135deg, rgba(17,24,39,0.88), rgba(15,23,42,0.96)); color: #fff; text-align: left; box-shadow: 0 18px 40px rgba(0,0,0,0.22);"
      >
        <img src="${icon}" alt="${walletName}" class="sok-wallet-icon" style="width: 44px; height: 44px; border-radius: 14px; flex: none; background: rgba(255,255,255,0.08); padding: 4px;" />
        <span style="display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0;">
          <span class="sok-wallet-name" style="font-weight: 700; font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${walletName}</span>
          <span style="font-size: 12px; opacity: 0.74;">Detected browser wallet</span>
        </span>
        <span style="font-size: 12px; font-weight: 700; color: #93c5fd;">Connect</span>
      </button>
    `;
  }

  private renderNoSupportedWalletsPanel() {
    const container = this.overlay?.querySelector("#sok-content-panel");
    if (!container) return;

    container.innerHTML = `
      <button class="suioutkit-back" id="sok-back-btn">← Back to Sui options</button>
      <div class="suioutkit-panel">
        <div class="sok-success-icon" style="color: #f59e0b; display: flex; align-items: center; justify-content: center; margin-bottom: 16px;">
          <i data-lucide="alert-circle" style="width: 48px; height: 48px;"></i>
        </div>
        <h2 class="sok-success-title">No Wallets Detected</h2>
        <p class="sok-status-text" style="margin-top: 16px;">
          We couldn't find any installed Sui wallets. Please install a wallet extension like Phantom, Slush, or others from the app store and refresh the page.
        </p>
        <p class="sok-status-text" style="font-size: 12px; opacity: 0.7; margin-top: 12px;">
          Alternatively, you can use the outPay QR option to pay from a mobile wallet.
        </p>
      </div>
    `;

    this.renderIcons();
    container.querySelector("#sok-back-btn")?.addEventListener("click", () => this.handleCryptoPaymentPanel());
  }

  // Step 2 of crypto flow: show payment summary after wallet connected
  private renderPaymentConfirmPanel(account: any) {
    const container = this.overlay?.querySelector("#sok-content-panel");
    if (!container) return;

    const currencySymbol = this.session.currency === "NGN" ? "₦" : "";
    const formattedAmount = `${currencySymbol}${this.session.amount.toLocaleString()}`;
    const shortAddress = `${account.address.substring(0, 6)}...${account.address.slice(-4)}`;
    const network = ((window as any).SuiOutKitNetwork as string) || "testnet";

    container.innerHTML = `
      <button class="suioutkit-back" id="sok-back-btn">← Change wallet</button>
      <div class="suioutkit-header">
        <h2 class="suioutkit-title">Confirm Payment</h2>
        <p class="suioutkit-subtitle">Review and approve this transaction</p>
      </div>
      <div class="suioutkit-panel" style="gap: 12px; display: flex; flex-direction: column; width: 100%;">
        <div class="sok-va-card">
          <div class="sok-va-row">
            <div class="sok-va-lbl">Amount</div>
            <div class="sok-va-val" style="color: #10b981; font-weight: 700;">${formattedAmount}</div>
          </div>
          <div class="sok-va-row">
            <div class="sok-va-lbl">From Wallet</div>
            <div class="sok-va-val">${shortAddress}</div>
          </div>
          <div class="sok-va-row">
            <div class="sok-va-lbl">Network</div>
            <div class="sok-va-val">${network}</div>
          </div>
        </div>
        <button class="sok-btn" id="sok-confirm-pay-btn" style="background: linear-gradient(135deg, #10b981 0%, #047857 100%);">
          Confirm & Pay
        </button>
      </div>
    `;

    container.querySelector("#sok-back-btn")?.addEventListener("click", () => void this.openStandardConnectWallet());
    container.querySelector("#sok-confirm-pay-btn")?.addEventListener("click", () => void this.executeWalletPayment());
  }

  // Step 3 of crypto flow: sign and submit the transaction
  private async executeWalletPayment() {
    if (!this.cryptoIntent) {
      this.renderErrorPanel("Crypto intent not ready.");
      return;
    }

    this.renderLoadingPanel("Waiting for wallet approval...");

    const dAppKit = this.ensureDAppKit();
    const connection = (dAppKit.stores as any)?.$connection?.get?.() || {};
    const account = connection.currentAccount || connection.account;

    if (!account) {
      this.renderErrorPanel("No connected wallet account found.");
      return;
    }

    const baseUnits = this.cryptoIntent.amountBaseUnits;
    const walrusBlobId = this.cryptoIntent.walrusBlobId;

    if (!this.cryptoIntent.packageId) {
      this.renderErrorPanel("Crypto intent is missing the contract package id.");
      return;
    }

    if (!walrusBlobId) {
      this.renderErrorPanel("Crypto intent is missing the Walrus receipt blob id.");
      return;
    }

    try {
      const paymentClient = this.ensurePaymentClient();
      const tx = new Transaction();
      const paymentReceipt = tx.add(paymentClient.paymentKit.calls.processRegistryPayment({
        nonce: this.cryptoIntent.nonce,
        coinType: this.cryptoIntent.coinType,
        amount: BigInt(baseUnits),
        receiver: this.cryptoIntent.receiverAddress,
        sender: account.address,
        ...(this.cryptoIntent.registryName ? { registryName: this.cryptoIntent.registryName } : {})
      }));

      const [suioutkitReceipt] = tx.moveCall({
        target: `${this.cryptoIntent.packageId}::checkout::mint_suioutkit_receipt`,
        arguments: [
          paymentReceipt,
          tx.pure.address(this.cryptoIntent.receiverAddress),
          tx.pure.u64(BigInt(baseUnits)),
          tx.pure.string(this.cryptoIntent.nonce),
          tx.pure.string(this.cryptoIntent.coinType),
          tx.pure.string("sui_wallet"),
          tx.pure.string(walrusBlobId)
        ]
      });

      tx.transferObjects([suioutkitReceipt], this.cryptoIntent.receiverAddress);

      const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });

      if ((result as any).FailedTransaction) {
        this.renderErrorPanel(
          `Transaction failed: ${(result as any).FailedTransaction?.status?.error?.message || "Unknown error"}`
        );
        return;
      }

      const txDigest = (result as any).Transaction?.digest || "";

      // Notify backend to verify on-chain and store Walrus receipt
      this.renderLoadingPanel("Confirming payment on-chain...");
      const confirmResponse = await fetch(joinApiPath(this.backendUrl, "checkout", "crypto", "confirm"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nonce: this.session.nonce,
          txDigest,
          method: "sui_wallet"
        })
      });

      const confirmResult: any = await confirmResponse.json().catch(() => ({}));
      if (!confirmResponse.ok) {
        this.renderErrorPanel(confirmResult.error || confirmResult.message || "Unable to confirm payment on-chain.");
        return;
      }

      // Poll for SETTLED status (backend verifies + emits Walrus receipt)
      this.startPolling();
    } catch (err) {
      this.renderErrorPanel(`Payment failed: ${(err as any)?.message || String(err)}`);
    }
  }

  private async renderOutPayQRPanel() {
    const container = this.overlay?.querySelector("#sok-content-panel");
    if (!container) return;

    this.renderLoadingPanel("Preparing outPay QR...");

    try {
      this.cryptoIntent = await this.loadCryptoIntent("outpay");
    } catch (err: any) {
      this.renderErrorPanel(err.message || "Failed to prepare outPay QR.");
      return;
    }

    const paymentUri = this.buildPaymentUri(this.cryptoIntent);
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(paymentUri)}`;

    container.innerHTML = `
      <button class="suioutkit-back" id="sok-back-btn">← Back to Sui options</button>
      <div class="suioutkit-panel">
        <div class="suioutkit-amount-box" style="margin-bottom: 12px;">
          <p class="suioutkit-subtitle">Scan to approve and pay SUI/Tokens</p>
          <h2 class="sok-fiat-amt" style="font-size: 24px; color: #10b981;">outPay Mobile</h2>
        </div>

        <div class="sok-qr-card">
          <div class="sok-qr-frame">
            <img src="${qrCodeUrl}" alt="outPay QR Code" class="sok-qr-img" />
            <div class="sok-qr-logo-badge">
              <i data-lucide="droplet" style="width: 16px; height: 16px; color: white;"></i>
            </div>
            <div class="sok-qr-scan-pulse"></div>
          </div>
          <p class="sok-status-text" style="font-size: 11px; word-break: break-all; opacity: 0.8; margin-bottom: 4px;">
            ${paymentUri.substring(0, 60)}...
          </p>
        </div>

        <div class="sok-spinner"></div>
        <p class="sok-status-text">Awaiting scan & on-chain verification...</p>
      </div>
    `;

    this.renderIcons();

    container.querySelector("#sok-back-btn")?.addEventListener("click", () => this.handleCryptoPaymentPanel());

    this.startPolling();
  }

  private buildPaymentUri(intent: CryptoIntentResponse): string {
    return createPaymentTransactionUri({
      receiverAddress: intent.receiverAddress,
      amount: BigInt(intent.amountBaseUnits),
      coinType: intent.coinType,
      nonce: intent.nonce,
      registryName: intent.registryName,
      label: "SuiOutKit Payment",
      message: `Payment for ${intent.nonce.substring(0, 8)}`,
      iconUrl: "https://raw.githubusercontent.com/MystenLabs/sui/refs/heads/main/docs/site/static/img/logo.svg"
    });
  }

  private async loadCryptoIntent(method: "sui_wallet" | "outpay"): Promise<CryptoIntentResponse> {
    const response = await fetch(joinApiPath(this.backendUrl, "checkout", "crypto", "intent"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: this.session.token,
        method
      })
    });

    const result: any = await response.json();
    if (!response.ok) {
      throw new Error(result.error || "Failed to prepare crypto intent.");
    }

    return result as CryptoIntentResponse;
  }

  private ensurePaymentClient() {
    if (this.paymentClient) {
      return this.paymentClient;
    }

    const requestedNetwork = (window as any).SuiOutKitNetwork as string | undefined;
    const network: SupportedNetwork = requestedNetwork === "mainnet" || requestedNetwork === "testnet" ? requestedNetwork : "testnet";

    this.paymentClient = new SuiGrpcClient({
      network,
      baseUrl: SUI_GRPC_URLS[network]
    }).$extend(paymentKit());

    return this.paymentClient;
  }

  private renderSuccessPanel(txDigest: string, walrusBlobId: string) {
    const container = this.overlay?.querySelector("#sok-content-panel");
    if (!container) return;

    this.stopPolling();
    const walrusNetworkPath = getExplorerNetworkPath();

    container.innerHTML = `
      <div class="suioutkit-panel">
        <div class="sok-success-icon" style="color: #10b981; display: flex; align-items: center; justify-content: center; margin-bottom: 16px;">
          <i data-lucide="check-circle" style="width: 48px; height: 48px;"></i>
        </div>
        <h2 class="sok-success-title">Payment Successful!</h2>
        <p class="sok-success-desc">The merchant has been paid on-chain.</p>

        <div class="sok-success-details">
          <div class="sok-receipt-row">
            <span class="sok-receipt-lbl">Amount Paid</span>
            <span class="sok-receipt-val" style="color: #10b981; font-weight:700;">
              ${this.session.currency === "NGN" ? "₦" : ""}${this.session.amount.toLocaleString()}
            </span>
          </div>

          <div class="sok-receipt-row">
            <span class="sok-receipt-lbl">Sui Transaction</span>
            <span class="sok-receipt-val">
              <a href="https://suiscan.xyz/testnet/tx/${txDigest}" target="_blank">${txDigest.substring(0, 10)}...</a>
            </span>
          </div>

          <div class="sok-receipt-row">
            <span class="sok-receipt-lbl">Walrus Invoice ID</span>
            <span class="sok-receipt-val">
              <a href="https://walruscan.com/${walrusNetworkPath}/blob/${walrusBlobId}" target="_blank">${walrusBlobId.substring(0, 10)}...</a>
            </span>
          </div>
        </div>
      </div>
    `;

    this.renderIcons();
  }

  private renderErrorPanel(message: string) {
    const container = this.overlay?.querySelector("#sok-content-panel");
    if (!container) return;

    container.innerHTML = `
      <button class="suioutkit-back" id="sok-back-btn">← Back to methods</button>
      <div class="suioutkit-panel">
        <div class="sok-success-icon" style="color: #ef4444; display: flex; align-items: center; justify-content: center; margin-bottom: 16px;">
          <i data-lucide="x-circle" style="width: 48px; height: 48px;"></i>
        </div>
        <h2 class="sok-success-title">Payment Failed</h2>
        <p class="sok-status-text" style="color: #ef4444; margin-bottom: 20px;">${message}</p>
      </div>
    `;

    this.renderIcons();

    container.querySelector("#sok-back-btn")?.addEventListener("click", () => this.renderSelectionPanel());
  }

  private startPolling() {
    this.stopPolling();
    this.pollInterval = setInterval(async () => {
      try {
        const response = await fetch(joinApiPath(this.backendUrl, "checkout", "status", this.session.nonce));
        const result: CheckoutStatusResponse = await response.json();

        if (result.status === "SETTLED" && result.txDigest && result.walrusBlobId) {
          this.renderSuccessPanel(result.txDigest, result.walrusBlobId);
        }
      } catch (err) {
        // Soft fail on polling connectivity issues, keep retrying
      }
    }, 3000);
  }

  private stopPolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  public destroy() {
    this.stopPolling();
    this.clearWalletConnectionWaiter();
    if (this.dAppKit) {
      this.dAppKit.disconnectWallet().catch(() => { });
    }
    this.overlay?.classList.remove("active");
    setTimeout(() => {
      this.overlay?.remove();
      this.onCloseCallback();
    }, 300);
  }
}
