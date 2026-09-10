"use client";

import { useState } from "react";
import Link from "next/link";
import { Copy, Check, ArrowLeft, Clock } from "lucide-react";
import { PaywallPanel } from "@/components/invite/PaywallPanel";
import { getInvite } from "@/lib/storage";
import { getTier } from "@/lib/tiers";
import { buildOwnerManagementViewModel, type OwnerInviteViewModel } from "@/lib/owner-invite-view-model";

/**
 * The re-hosted, hardened owner-management chrome — Stage 5 (2026-09-10,
 * see PROJECT_STATUS.md's Stage 5 section). This is what Stage 4's
 * `OwnerPreview` (formerly `src/app/invite/[id]/InviteClient.tsx`,
 * deleted this stage — see its own removal note in the diff) became once
 * it was given its own real route instead of being reconnected to the
 * public one: the paywall/awaiting-publication status for an unpublished
 * invitation, and the share panel + per-guest link list for a published
 * one.
 *
 * HARDENED, not just relocated — the one substantive change from Stage
 * 4's version: this component no longer performs its own ownership
 * check. Stage 4's OwnerPreview independently fetched via getInvite()
 * (the browser client, RLS-scoped) and treated "did that fetch return a
 * row" as its own, client-side proof of ownership — a second, redundant
 * authorization decision living in the browser. The REAL boundary is now
 * src/app/dashboard/invite/[id]/page.tsx (a Server Component, verifying
 * both authentication and ownership via the session-aware SERVER client
 * before this component is ever rendered at all) — see that file's own
 * comment. This component trusts its `initial` prop completely and
 * performs no authorization logic of its own; it only re-fetches
 * (`getInvite()`, still the owner-scoped browser client — legitimate
 * here, since it runs after the owner has already been server-verified,
 * purely to refresh the UI after a client-side action) to reflect a
 * state change the OWNER's own action just caused (a completed PayPal
 * payment), never to decide who's allowed to see anything.
 *
 * Receives OwnerInviteViewModel, not a raw StoredInvite — never the
 * `answers` blob (raw survey free text), `content`, or anything this
 * component doesn't actually use; see owner-invite-view-model.ts's own
 * header comment. The post-payment refresh below narrows the refetched
 * StoredInvite through the same buildOwnerManagementViewModel() builder
 * before ever assigning it to state, so this component's state is always
 * the narrow shape too — the wider StoredInvite value exists only as a
 * local variable for the instant it takes to narrow it.
 */

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

export function OwnerManagementBar({ initial }: { initial: OwnerInviteViewModel }) {
  const [invite, setInvite] = useState<OwnerInviteViewModel>(initial);
  const [origin] = useState(() => (typeof window !== "undefined" ? window.location.origin : ""));
  const tier = getTier(invite.tier);

  if (!invite.publishedAt) {
    return (
      <div className="flex flex-col border-b border-line">
        <div className="px-6 py-3">
          <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-xs text-ink-soft hover:text-ink">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> My invites
          </Link>
        </div>
        <div className="flex items-center justify-center px-6 py-16">
          {invite.paid ? (
            <AwaitingPublication />
          ) : (
            <PaywallPanel
              inviteId={invite.inviteId}
              tier={tier}
              onPaid={async () => {
                const fresh = await getInvite(invite.inviteId);
                if (fresh) setInvite(buildOwnerManagementViewModel(fresh));
              }}
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
          <CopyLink text={`${origin}/invite/${invite.inviteId}`} />
        </div>
      </div>
      {invite.guestList.length > 0 && (
        <div className="mx-auto max-w-2xl px-6 pb-4">
          <div className="text-xs font-medium uppercase tracking-wide text-ink-soft">
            {invite.guestList.length} personal invite links
          </div>
          <div className="mt-2 max-h-40 space-y-1.5 overflow-y-auto rounded-xl border border-line bg-paper-raised p-2">
            {invite.guestList.map((g) => (
              <div key={g.id} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-xs">
                <div>
                  <div className="font-medium text-ink">{g.name}</div>
                  <div className="text-ink-soft">&ldquo;{g.clickTeaser}&rdquo;</div>
                </div>
                <CopyLink text={`${origin}/invite/${invite.inviteId}?guest=${g.slug}`} />
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
