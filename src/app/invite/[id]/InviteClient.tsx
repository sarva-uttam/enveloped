"use client";

/**
 * STATUS AS OF STAGE 4 (2026-09-09, see PROJECT_STATUS.md's Stage 4
 * section): NOT MOUNTED ANYWHERE. src/app/invite/[id]/page.tsx no
 * longer imports this file at all.
 *
 * What this is: the OWNER-authenticated view of an invitation — the
 * paywall/awaiting-publication status for an unpublished invite, and
 * the share panel + per-guest link list for a published one. Before
 * Stage 4, this same component ALSO rendered the public/guest view
 * (fetching both the owner-only and sanitized-public reads, deciding
 * which applied, then rendering the invitation content itself via
 * InviteCanvas) — that responsibility has fully moved to page.tsx +
 * PublicInviteView/UnavailableInvite (server-rendered, no auth check,
 * no client-side waterfall). This file has been trimmed accordingly: it
 * no longer fetches the public read, no longer renders invitation
 * content at all (guests get that from the server now), and no longer
 * imports InviteCanvas (deleted this stage — its rendering logic was
 * ported to src/components/invite/PublicInviteView.tsx). Only the
 * owner-specific concern remains.
 *
 * WHY it's disconnected rather than reconnected: the owner view depends
 * on knowing who's signed in (useAuth() below) and on PaywallPanel,
 * which loads the PayPal SDK. Mounting either unconditionally on the
 * public route — even just to decide "is this viewer the owner" — would
 * ship owner-management and PayPal-loading code to every guest visitor,
 * which this stage's performance requirements explicitly rule out (see
 * PROJECT_STATUS.md — "avoid loading owner-management, PayPal, or
 * dashboard code on the public guest page"). There is currently no other
 * surface (a dedicated `/dashboard/invite/[id]` route, for instance)
 * that hosts this behavior instead.
 *
 * WHY it's retained rather than deleted: per this stage's own
 * instructions — remove only once "all necessary behavior has been
 * safely moved"; the owner-management behavior below hasn't been moved
 * anywhere. An owner visiting their own invite link today sees exactly
 * what a guest would (the public view, or the unavailable state) — they
 * have temporarily lost the paywall/awaiting-publication status and
 * share panel that used to live on this URL. This is a real, deliberate,
 * documented regression, not an oversight — see PROJECT_STATUS.md's
 * Stage 4 "Remaining risks" for the trade-off and the recommendation
 * that a proper owner-management surface (Stage 5 or a dedicated earlier
 * follow-up) is what should replace it, rather than re-mounting this
 * component on the public route as-is.
 *
 * If reconnecting this: give the owner view its own route/URL instead of
 * importing it from page.tsx again, so the public route's bundle and
 * rendering path stay guest-only.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Copy, Check, ArrowLeft, Clock } from "lucide-react";
import { PaywallPanel } from "@/components/invite/PaywallPanel";
import { getInvite, type StoredInvite } from "@/lib/storage";
import { getTier } from "@/lib/tiers";
import { useAuth } from "@/lib/auth/AuthContext";

function CopyLink({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          // clipboard unavailable — no-op
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs text-ink-soft transition hover:border-ink hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2"
    >
      {copied ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
      {copied ? "Copied" : "Copy link"}
    </button>
  );
}

/**
 * The owner-only management overlay for a single invitation. Renders
 * nothing at all — not even a loading state — for anyone who isn't
 * signed in as this invite's real owner (including every real guest;
 * ownership is verified server-side via RLS on getInvite()'s query, the
 * same owner-only read this component always used, never inferred from
 * a URL param or client-side guess).
 */
export function OwnerPreview({ inviteId }: { inviteId: string }) {
  const { user, loading: authLoading } = useAuth();
  const [ownerInvite, setOwnerInvite] = useState<StoredInvite | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    getInvite(inviteId).then((result) => {
      if (!cancelled) setOwnerInvite(result);
    });
    return () => {
      cancelled = true;
    };
  }, [inviteId]);

  if (authLoading || ownerInvite === undefined || !ownerInvite || !user) return null;

  const tier = getTier(ownerInvite.answers.tier || "bronze");
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  if (!ownerInvite.publishedAt) {
    return (
      <div className="flex min-h-screen flex-col">
        <div className="border-b border-line px-6 py-3">
          <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-xs text-ink-soft hover:text-ink">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> My invites
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-center px-6 py-16">
          {ownerInvite.paid ? (
            <AwaitingPublication />
          ) : (
            <PaywallPanel
              inviteId={inviteId}
              tier={tier}
              onPaid={async () => setOwnerInvite(await getInvite(inviteId))}
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="sticky top-0 z-50 border-b border-line bg-paper/95 backdrop-blur">
      <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-3 px-6 py-3">
        <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-xs text-ink-soft hover:text-ink">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> My invites
        </Link>
        <div className="flex items-center gap-2">
          <span className="text-xs text-ink-soft">Share:</span>
          <CopyLink text={`${origin}/invite/${inviteId}`} />
        </div>
      </div>
      {ownerInvite.guestList.length > 0 && (
        <div className="mx-auto max-w-2xl px-6 pb-4">
          <div className="text-xs font-medium uppercase tracking-wide text-ink-soft">
            {ownerInvite.guestList.length} personal invite links
          </div>
          <div className="mt-2 max-h-40 space-y-1.5 overflow-y-auto rounded-xl border border-line bg-paper-raised p-2">
            {ownerInvite.guestList.map((g) => (
              <div key={g.id} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-xs">
                <div>
                  <div className="font-medium text-ink">{g.name}</div>
                  <div className="text-ink-soft">&ldquo;{g.clickTeaser}&rdquo;</div>
                </div>
                <CopyLink text={`${origin}/invite/${inviteId}?guest=${g.slug}`} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Shown to the OWNER when their invite is paid but not yet published.
 * Deliberately not a "payment required" message — payment is already
 * done here; the actual reason it isn't live is that publication is an
 * administrator action (see PROJECT_STATUS.md's Stage 3 section), not
 * something a self-service payment ever triggers automatically.
 */
function AwaitingPublication() {
  return (
    <div className="mx-auto max-w-md rounded-2xl border border-line bg-paper-raised p-8 text-center">
      <Clock className="mx-auto h-6 w-6 text-ink-soft" aria-hidden="true" />
      <h2 className="mt-4 font-display text-2xl">Payment received</h2>
      <p className="mt-2 text-sm text-ink-soft">
        Your invite is ready and awaiting publication. We&apos;ll let you
        know as soon as it&apos;s live — guest links won&apos;t work until then.
      </p>
    </div>
  );
}
