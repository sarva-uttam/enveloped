import type { Metadata } from "next";
import { getInvitePreviewServer } from "@/lib/storage.server";
import { buildPreviewInviteViewModel } from "@/lib/invite-view-model";
import { isValidPreviewTokenFormat } from "@/lib/preview-tokens.server";
import { PreviewBanner } from "@/components/invite/PreviewBanner";
import { PublicInviteView } from "@/components/invite/PublicInviteView";
import { UnavailableInvite } from "@/components/invite/UnavailableInvite";

/**
 * The private preview route — Stage 5 (2026-09-10, see PROJECT_STATUS.md's
 * Stage 5 section). A concierge client reviews their invitation — before
 * OR after publication — through this unguessable, revocable link,
 * without ever needing an account. Structured as its own route rather
 * than folded into /invite/[id] (Part D's own instruction: "do not
 * combine preview access with the public /invite/[id] route unless
 * there is a strong security reason") specifically so a preview token
 * never has to travel through the SAME route that also accepts a
 * `?guest=` query param, a slug, and public caching assumptions — one
 * URL shape, one credential type, one code path, easier to reason about
 * and to keep out of any future public-route caching decision.
 *
 * Every request is rendered fresh, per-request (`force-dynamic`), same
 * as /invite/[id] — a preview response is exactly as request-scoped and
 * privacy-sensitive as a guest-personalized one, for the same reason:
 * different tokens resolve to genuinely different, private content, and
 * this must never be cached or shared across visitors.
 *
 * Never calls supabase.auth.getUser() — "never require the client to
 * sign in" is not just a UX choice here, there is no code path in this
 * file that could even check a session. Never imports getInviteServer()
 * (the owner-only read) or admin.server.ts — a preview token is its own,
 * independent credential, unrelated to whether the VIEWER happens to
 * also be signed in as the owner or an administrator.
 */

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ token: string }>;
};

/**
 * Deliberately generic and constant — Part D's privacy requirements:
 * "use generic metadata that contains no names, dates, venues or private
 * wording," and noindex/nofollow/no-referrer regardless of whether the
 * token in the URL is valid, expired, or entirely made up. This is why
 * generateMetadata() here never reads the token or touches the database
 * at all — there is no "valid token" branch that could ever leak a real
 * headline into a crawler-visible <title>, a social-preview card, or a
 * browser history entry's tab title synced to another device.
 */
export function generateMetadata(): Metadata {
  return {
    title: "Private preview — Enveloped",
    description: "A private, unlisted invitation preview.",
    robots: { index: false, follow: false },
    referrer: "no-referrer",
    // No openGraph/twitter block at all — Part D: "do not create Open
    // Graph previews containing invitation details for private preview
    // URLs." Omitting the block entirely (rather than filling it with
    // generic text) means a link-unfurling bot gets nothing to render
    // beyond the generic title/description above, not a card that might
    // still tempt someone into forwarding the link expecting a normal
    // preview.
  };
}

export default async function PreviewPage({ params }: Props) {
  const { token } = await params;

  // High-confidence format validation BEFORE any database call — same
  // principle as isValidSlug()/isValidPreviewTokenFormat()'s own
  // comment. An invalid shape (wrong length, wrong alphabet) never
  // reaches get_invite_preview() at all.
  const preview = isValidPreviewTokenFormat(token) ? await getInvitePreviewServer(token) : null;
  const model = buildPreviewInviteViewModel(preview);

  return (
    <main>
      {model ? (
        <>
          {/* isPublished only — never the token itself, which this
              component tree never receives in the first place (only
              `model`, built server-side from the RPC result, is passed
              down; `token` stays a local variable in this function and
              is never threaded into any component prop, so it cannot
              appear in serialized client-component props even by
              accident). */}
          <PreviewBanner isPublished={model.isPublished} />
          <PublicInviteView model={model} />
        </>
      ) : (
        <UnavailableInvite homeHref="/" homeLabel="Go to Enveloped" />
      )}
    </main>
  );
}
