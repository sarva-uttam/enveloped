"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Lock } from "lucide-react";
import type { Tier } from "@/lib/types";

declare global {
  interface Window {
    paypal?: {
      createInstance: (opts: {
        clientId: string;
        components: string[];
        pageType?: string;
      }) => Promise<PayPalSdkInstance>;
    };
  }
}

interface PayPalSdkInstance {
  findEligibleMethods: (opts: {
    currencyCode: string;
    amount: string;
  }) => Promise<{ isEligible: (method: string) => boolean }>;
  createPayPalOneTimePaymentSession: (callbacks: {
    onApprove: (data: { orderId: string }) => void | Promise<void>;
    onCancel?: () => void;
    onError?: (error: { code?: string; message?: string }) => void;
  }) => {
    start: (
      opts: { presentationMode: string },
      order: Promise<{ orderId: string }>
    ) => Promise<void>;
  };
}

// Mirrors PAYPAL_API_BASE_URL (server-side) — flip NEXT_PUBLIC_PAYPAL_ENV to
// "live" together with the server env var when you're ready for real charges.
const SDK_SRC =
  process.env.NEXT_PUBLIC_PAYPAL_ENV === "live"
    ? "https://www.paypal.com/web-sdk/v6/core"
    : "https://www.sandbox.paypal.com/web-sdk/v6/core";

export function PaywallPanel({
  inviteId,
  tier,
  onPaid,
}: {
  inviteId: string;
  tier: Tier;
  onPaid: () => void;
}) {
  // NEXT_PUBLIC_* env vars are inlined at build time, so this is a true
  // constant — safe to fold into the initial state (no SSR/hydration
  // mismatch risk, same value in both environments) instead of setting it
  // synchronously inside the effect below.
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable" | "processing" | "error">(
    () => (process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID ? "loading" : "unavailable")
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const buttonRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;
    if (!clientId) return;

    let cancelled = false;

    async function init(clientId: string) {
      const existing = document.querySelector<HTMLScriptElement>(`script[src="${SDK_SRC}"]`);
      if (!existing) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement("script");
          script.src = SDK_SRC;
          script.async = true;
          script.onload = () => resolve();
          script.onerror = () => reject(new Error("Could not load PayPal SDK"));
          document.head.appendChild(script);
        });
      } else if (!window.paypal) {
        await new Promise<void>((resolve) => existing.addEventListener("load", () => resolve()));
      }

      if (cancelled || !window.paypal) return;

      const sdkInstance = await window.paypal.createInstance({
        clientId,
        components: ["paypal-payments"],
        pageType: "checkout",
      });

      const methods = await sdkInstance.findEligibleMethods({
        currencyCode: "USD",
        amount: tier.price.toFixed(2),
      });

      if (cancelled) return;

      if (!methods.isEligible("paypal")) {
        setStatus("unavailable");
        return;
      }

      const session = sdkInstance.createPayPalOneTimePaymentSession({
        onApprove: async (data) => {
          setStatus("processing");
          try {
            const res = await fetch(`/api/paypal/orders/${data.orderId}/capture`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ inviteId }),
            });
            if (!res.ok) throw new Error((await res.json()).error || "Capture failed");
            onPaid();
          } catch (err) {
            setStatus("error");
            setErrorMessage(err instanceof Error ? err.message : "Payment could not be confirmed.");
          }
        },
        onCancel: () => setStatus("ready"),
        onError: (error) => {
          setStatus("error");
          setErrorMessage(error.message || "Something went wrong with PayPal.");
        },
      });

      setStatus("ready");

      // Wait a tick for the web component to be in the DOM before attaching.
      requestAnimationFrame(() => {
        const button = buttonRef.current;
        if (!button) return;
        button.addEventListener("click", async () => {
          try {
            await session.start(
              { presentationMode: "auto" },
              (async () => {
                const res = await fetch("/api/paypal/orders", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ inviteId }),
                });
                if (!res.ok) throw new Error((await res.json()).error || "Could not start checkout");
                const { orderId } = await res.json();
                return { orderId };
              })()
            );
          } catch (err) {
            setStatus("error");
            setErrorMessage(err instanceof Error ? err.message : "Could not start checkout.");
          }
        });
      });
    }

    init(clientId).catch((err) => {
      if (!cancelled) {
        setStatus("error");
        setErrorMessage(err instanceof Error ? err.message : "Could not load PayPal.");
      }
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inviteId, tier.price]);

  return (
    <div className="mx-auto max-w-md rounded-2xl border border-line bg-paper-raised p-8 text-center">
      <Lock className="mx-auto h-6 w-6 text-ink-soft" />
      <h2 className="mt-4 font-display text-2xl">Publish this invite</h2>
      <p className="mt-2 text-sm text-ink-soft">
        This is a preview. Pay ${tier.price} to unlock sharing — the guest
        links only work once it&apos;s published.
      </p>

      {status === "loading" && (
        <div className="mt-6 flex items-center justify-center gap-2 text-sm text-ink-soft">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading payment options…
        </div>
      )}

      {status === "processing" && (
        <div className="mt-6 flex items-center justify-center gap-2 text-sm text-ink-soft">
          <Loader2 className="h-4 w-4 animate-spin" /> Confirming your payment…
        </div>
      )}

      {status === "unavailable" && (
        <p className="mt-6 text-sm text-red-500">
          Payments aren&apos;t available right now. Please try again shortly.
        </p>
      )}

      {status === "error" && (
        <p className="mt-6 text-sm text-red-500">{errorMessage}</p>
      )}

      <div className={status === "ready" ? "mt-6" : "mt-6 hidden"}>
        {/* @ts-expect-error -- PayPal v6 web component, not a typed React element */}
        <paypal-button ref={buttonRef} type="pay" class="paypal-gold" style={{ width: "100%" }} />
      </div>
    </div>
  );
}
