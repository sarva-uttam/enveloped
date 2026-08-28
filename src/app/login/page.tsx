"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { Mail, Loader2, CheckCircle2 } from "lucide-react";
import { Navbar } from "@/components/site/Navbar";
import { Footer } from "@/components/site/Footer";
import { supabase, supabaseConfigured } from "@/lib/supabase/client";
import { sanitizeRedirectPath } from "@/lib/safe-redirect";

function LoginForm() {
  const searchParams = useSearchParams();
  // next is attacker-controlled (anyone can craft /login?next=...) — see
  // sanitizeRedirectPath's doc comment for the exact open-redirect this
  // closes.
  const next = sanitizeRedirectPath(searchParams.get("next"));

  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (!supabaseConfigured || !supabase) {
      setStatus("error");
      setError("Sign-in isn't configured yet — the site owner needs to set up Supabase.");
      return;
    }

    setStatus("sending");
    setError(null);

    const { error: signInError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });

    if (signInError) {
      setStatus("error");
      setError(signInError.message);
      return;
    }

    setStatus("sent");
  }

  if (status === "sent") {
    return (
      <div className="mx-auto max-w-sm rounded-2xl border border-line bg-paper-raised p-8 text-center">
        <CheckCircle2 className="mx-auto h-8 w-8 text-blush" />
        <h1 className="mt-4 font-display text-2xl">Check your email</h1>
        <p className="mt-2 text-sm text-ink-soft">
          We sent a sign-in link to <span className="font-medium text-ink">{email}</span>. Open it
          on this device to continue.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="text-center font-display text-3xl">Sign in</h1>
      <p className="mt-2 text-center text-sm text-ink-soft">
        We&apos;ll email you a link — no password needed.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 rounded-2xl border border-line bg-paper-raised p-6">
        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wide text-ink-soft">Email</span>
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="mt-1.5 w-full rounded-xl border border-line bg-paper px-4 py-3 text-sm outline-none transition focus:border-ink"
          />
        </label>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={status === "sending" || !email.trim()}
          className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-ink px-6 py-3.5 text-sm font-medium text-paper transition hover:bg-ink-soft disabled:opacity-60"
        >
          {status === "sending" ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Sending link…
            </>
          ) : (
            <>
              <Mail className="h-4 w-4" /> Send magic link
            </>
          )}
        </button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <>
      <Navbar />
      <main className="flex-1">
        <section className="mx-auto max-w-4xl px-6 py-24">
          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
        </section>
      </main>
      <Footer />
    </>
  );
}
