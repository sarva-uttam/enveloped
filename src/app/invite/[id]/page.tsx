import type { Metadata } from "next";
import { DEMO_INVITES } from "@/lib/demo-invites";
import { getInviteServer, getGuestEntryServer, getPublicInviteServer } from "@/lib/storage.server";
import { InviteClient } from "./InviteClient";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ guest?: string }>;
};

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { id } = await params;
  const { guest } = await searchParams;

  const demo = DEMO_INVITES[id];
  // getInviteServer only ever succeeds for the actual owner (RLS) — for
  // everyone else, including the anonymous request generating OG
  // metadata for a shared link, fall back to the sanitized public read.
  const owned = demo ? null : await getInviteServer(id);
  const pub = demo || owned ? null : await getPublicInviteServer(id);

  const content = demo?.content ?? owned?.content ?? (pub?.paid ? pub.content : null);
  if (!content) return {};

  // Resolved via the same SECURITY DEFINER lookup InviteClient uses — this
  // can run for an anonymous guest (no session), so it can't read
  // stored.guestList directly (that's owner-only now); resolve_invite_guest()
  // returns just this one guest's fields regardless of caller auth state.
  const guestEntry = !demo && guest ? await getGuestEntryServer(id, guest) : undefined;

  // A personal guest link leads with their teaser line ("Click me.") so it
  // reads as a message, not a link, when previewed in WhatsApp/iMessage/etc.
  const title = guestEntry?.clickTeaser ?? content.headline;
  const description = guestEntry?.clickTeaser ? content.headline : content.subheadline;

  return {
    title,
    description,
    openGraph: { title, description, type: "website" },
    twitter: { card: "summary", title, description },
  };
}

export default function InvitePage() {
  return <InviteClient />;
}
