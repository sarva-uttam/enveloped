"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Copy, Check, ArrowLeft, Clock } from "lucide-react";
import { InviteCanvas } from "@/components/invite/InviteCanvas";
import { PaywallPanel } from "@/components/invite/PaywallPanel";
import { DEMO_INVITES } from "@/lib/demo-invites";
import { getInvite, type StoredInvite } from "@/lib/storage";
import { getTier } from "@/lib/tiers";
import type { GeneratedInviteContent, TierId } from "@/lib/types";

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
      className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs text-ink-soft transition hover:border-ink hover:text-ink"
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copied" : "Copy link"}
    </button>
  );
}

export function InviteClient() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const guestSlug = search.get("guest");

  const [stored, setStored] = useState<StoredInvite | null | undefined>(undefined);

  useEffect(() => {
    if (params.id.startsWith("demo-")) return;
    let cancelled = false;
    getInvite(params.id).then((result) => {
      if (!cancelled) setStored(result);
    });
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  const demo = DEMO_INVITES[params.id];

  let tier: TierId;
  let content: GeneratedInviteContent;
  let eventDate: string | undefined;
  let song: string | undefined;
  let guestName: string | undefined;
  let guestId: string | undefined;
  let guestList: StoredInvite["guestList"] = [];
  let origin = "";

  if (demo) {
    tier = demo.tier;
    content = demo.content;
    eventDate = demo.eventDate;
    song = demo.song;
    guestName = demo.guestName;
  } else if (stored) {
    tier = stored.answers.tier || "bronze";
    content = stored.content;
    eventDate = stored.answers.eventDate;
    song = stored.answers.song;
    guestList = stored.guestList;
    const match = guestSlug ? stored.guestList.find((g) => g.slug === guestSlug) : null;
    guestName = match?.name;
    guestId = match?.id;
  } else if (stored === null) {
    return <NotFound />;
  } else {
    return null;
  }

  if (typeof window !== "undefined") origin = window.location.origin;

  const isOwnerView = !demo && !guestSlug;
  const isUnpaid = !demo && stored ? !stored.paid : false;

  // Owner previewing their own unpublished invite: show the design, gate
  // sharing behind payment. No demo invites are ever unpaid.
  if (isOwnerView && isUnpaid) {
    return (
      <div className="flex min-h-screen flex-col">
        <div className="border-b border-line px-6 py-3">
          <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-xs text-ink-soft hover:text-ink">
            <ArrowLeft className="h-3.5 w-3.5" /> My invites
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-center px-6 py-16">
          <PaywallPanel
            inviteId={params.id}
            tier={getTier(tier)}
            onPaid={async () => setStored(await getInvite(params.id))}
          />
        </div>
      </div>
    );
  }

  // A guest link to an invite that hasn't been paid for yet — no payment UI
  // shown here, that's the owner's job.
  if (!isOwnerView && isUnpaid) {
    return <NotPublishedYet />;
  }

  const showOwnerPanel = isOwnerView && !demo;

  return (
    <div className="min-h-screen">
      {showOwnerPanel && (
        <div className="sticky top-0 z-50 border-b border-line bg-paper/95 backdrop-blur">
          <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-3 px-6 py-3">
            <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-xs text-ink-soft hover:text-ink">
              <ArrowLeft className="h-3.5 w-3.5" /> My invites
            </Link>
            <div className="flex items-center gap-2">
              <span className="text-xs text-ink-soft">Share:</span>
              <CopyLink text={`${origin}/invite/${params.id}`} />
            </div>
          </div>
          {guestList.length > 0 && (
            <div className="mx-auto max-w-2xl px-6 pb-4">
              <div className="text-xs font-medium uppercase tracking-wide text-ink-soft">
                {guestList.length} personal invite links
              </div>
              <div className="mt-2 max-h-40 space-y-1.5 overflow-y-auto rounded-xl border border-line bg-paper-raised p-2">
                {guestList.map((g) => (
                  <div key={g.id} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-xs">
                    <div>
                      <div className="font-medium text-ink">{g.name}</div>
                      <div className="text-ink-soft">&ldquo;{g.clickTeaser}&rdquo;</div>
                    </div>
                    <CopyLink text={`${origin}/invite/${params.id}?guest=${g.slug}`} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      <InviteCanvas
        tier={tier}
        content={content}
        eventDate={eventDate}
        song={song}
        guestName={guestName}
        inviteId={demo ? undefined : params.id}
        guestId={guestId}
      />
    </div>
  );
}

function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="font-display text-3xl">We couldn&apos;t find that invite</h1>
      <p className="max-w-sm text-sm text-ink-soft">
        Invites created here are stored on the device that made them. Try
        creating a new one, or check the link you were sent.
      </p>
      <Link href="/survey" className="rounded-full bg-ink px-6 py-3 text-sm font-medium text-paper">
        Start a new invite
      </Link>
    </div>
  );
}

function NotPublishedYet() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <Clock className="h-6 w-6 text-ink-soft" />
      <h1 className="font-display text-3xl">This invite isn&apos;t live yet</h1>
      <p className="max-w-sm text-sm text-ink-soft">
        The person who made it hasn&apos;t published it yet. Check back
        soon, or reach out to them directly.
      </p>
    </div>
  );
}
