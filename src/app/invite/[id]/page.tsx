import type { Metadata } from "next";
import { cache } from "react";
import { DEMO_INVITES } from "@/lib/demo-invites";
import { getGuestEntryServer, getPublicInviteServer } from "@/lib/storage.server";
import { buildDemoInviteViewModel, buildPublicInviteViewModel, isValidSlug } from "@/lib/invite-view-model";
import { resolveComposition } from "@/lib/composition/resolve";
import { InvitationExperience } from "@/components/experience/InvitationExperience";
import { UnavailableInvite } from "@/components/invite/UnavailableInvite";

/**
 * The server-rendered public invitation route — Stage 4 (2026-09-09)
 * introduced server rendering; Stage 6 (2026-09-10, see
 * PROJECT_STATUS.md's Stage 6 section) replaces the monolithic
 * `PublicInviteView` with the trusted composition renderer
 * (src/components/composition/CompositionRenderer.tsx) — the same
 * renderer /preview/[token] and /dashboard/invite/[id] now use too.
 *
 * Every request is rendered fresh, per-request, never cached or shared
 * across invitations/guests/sessions — required given a single URL
 * shape (/invite/[id]?guest=...) resolves to genuinely different,
 * privacy-sensitive content depending on which invitation and which
 * guest token, if any, is in the URL. `force-dynamic` makes that
 * guarantee explicit rather than an incidental side effect of reading
 * cookies/searchParams elsewhere in the tree.
 *
 * What this route does NOT do, deliberately: call
 * supabase.auth.getUser() (no authentication check gates anything a
 * guest sees — this is a PUBLIC page); fetch the raw `invites` table
 * (getInviteServer(), the owner-only read, is never imported here);
 * import or mount any owner-management UI at all — see
 * src/app/dashboard/invite/[id]/ for that, a fully separate route with
 * its own bundle.
 */

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ guest?: string }>;
};

/**
 * The one place this route touches the database. Wrapped in React's
 * cache() so generateMetadata() and the page component (both of which
 * need the same data) share a single underlying fetch per request,
 * never duplicating it — and, just as importantly, never leaking it
 * across requests: React's cache() is request-scoped only, reset for
 * every new render, the same guarantee already relied on for
 * checkAdmin() in src/lib/auth/admin.server.ts (Stage 2).
 *
 * Both `id` and `guestSlug` are validated against isValidSlug() BEFORE
 * either ever reaches a database call — "high-confidence input
 * validation", not blindly passing whatever the URL contains. An
 * invalid id short-circuits to {publicInvite: null, guestEntry: null}
 * (i.e. unavailable) without any query at all. The guest lookup is
 * additionally skipped whenever the invitation itself isn't published —
 * saving a round trip for the (safe either way, since
 * resolve_invite_guest() gates on published_at internally too) case
 * where it could only ever resolve to null.
 */
const loadInviteData = cache(async (id: string, guestSlug: string | null) => {
  if (!isValidSlug(id)) {
    return { publicInvite: null, guestEntry: null };
  }

  const publicInvite = await getPublicInviteServer(id);

  const guestEntry =
    publicInvite?.publishedAt && guestSlug && isValidSlug(guestSlug)
      ? await getGuestEntryServer(id, guestSlug)
      : null;

  return { publicInvite, guestEntry };
});

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { id } = await params;
  const { guest } = await searchParams;

  const demo = DEMO_INVITES[id];
  if (demo) {
    const title = demo.content.headline;
    const description = demo.content.subheadline;
    return {
      title,
      description,
      openGraph: { title, description, type: "website" },
      twitter: { card: "summary", title, description },
    };
  }

  const { publicInvite, guestEntry } = await loadInviteData(id, guest ?? null);
  const model = buildPublicInviteViewModel({ publicInvite, guestEntry });

  // Unavailable, for any reason — do not leak a name, date, or any other
  // detail through the title/description/Open Graph tags. An empty
  // Metadata object means Next.js falls back to the root layout's
  // generic title/description, exactly like any other page that hasn't
  // resolved to specific content.
  if (!model) return {};

  // A personal guest link leads with their teaser line ("Click me.") so
  // it reads as a message, not a link, when previewed in WhatsApp/
  // iMessage/etc. guestEntry (not the model) is used here since
  // clickTeaser is a metadata-only concern, not part of what's rendered
  // inside the page body. Metadata is still built from `model.content`
  // (Stage 4/5's sanitized shape), never from the raw `composition` —
  // there is no reason metadata generation needs to validate a whole
  // composition document just to read a headline/subheadline.
  const title = guestEntry?.clickTeaser ?? model.content.headline;
  const description = guestEntry?.clickTeaser ? model.content.headline : model.content.subheadline;

  return {
    title,
    description,
    openGraph: { title, description, type: "website" },
    twitter: { card: "summary", title, description },
  };
}

export default async function InvitePage({ params, searchParams }: Props) {
  const { id } = await params;
  const { guest } = await searchParams;

  const demo = DEMO_INVITES[id];

  // Most demos have no composition of their own — resolveComposition()
  // falls back to the legacy adapter for them, exactly as before Stage
  // 6. The one exception (Stage 7, Part J) is `demo-hindu`, which
  // carries a real, pre-authored `composition` so the hindu-wedding
  // cultural pack has something to render for visual review; when
  // present, it's fed straight through, the same as a database row's.
  let model, rawComposition: unknown;
  if (demo) {
    model = buildDemoInviteViewModel(demo);
    rawComposition = demo.composition ?? null;
  } else {
    const { publicInvite, guestEntry } = await loadInviteData(id, guest ?? null);
    model = buildPublicInviteViewModel({ publicInvite, guestEntry });
    rawComposition = publicInvite?.composition ?? null;
  }

  const composition = resolveComposition(model, rawComposition);

  return (
    <main>
      {composition && model ? (
        <InvitationExperience
          composition={composition}
          inviteId={model.inviteId}
          guestId={model.guestId}
          guestName={model.guestName}
          song={model.song}
          canRsvp={model.isPublished}
          mode="guest"
        />
      ) : (
        <UnavailableInvite />
      )}
    </main>
  );
}
