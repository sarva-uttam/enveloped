import type { Metadata } from "next";
import { DEMO_INVITES } from "@/lib/demo-invites";
import { getInvite } from "@/lib/storage";
import { InviteClient } from "./InviteClient";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ guest?: string }>;
};

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { id } = await params;
  const { guest } = await searchParams;

  const demo = DEMO_INVITES[id];
  const stored = demo ? null : await getInvite(id);

  const content = demo?.content ?? stored?.content;
  if (!content) return {};

  const guestEntry = guest ? stored?.guestList.find((g) => g.slug === guest) : undefined;

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
