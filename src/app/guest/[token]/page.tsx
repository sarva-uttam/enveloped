import type { Metadata } from "next";
import { getGuestInviteServer } from "@/lib/guest-client.server";
import { buildGuestInviteViewModel } from "@/lib/invite-view-model";
import { isValidGuestTokenFormat } from "@/lib/guest-tokens.server";
import { resolveComposition } from "@/lib/composition/resolve";
import { PALETTE_REGISTRY } from "@/lib/composition/theme";
import { InvitationExperience } from "@/components/experience/InvitationExperience";
import { UnavailableInvite } from "@/components/invite/UnavailableInvite";
import { GuestRsvpPanel } from "@/components/invite/GuestRsvpPanel";

/**
 * The personalized guest route — Stage 10 (see
 * supabase/migrations/20260914090000_guest_management.sql). Structured
 * exactly like /preview/[token] (its own route, its own credential type,
 * never combined with /invite/[id]'s slug+query-param shape), with one
 * deliberate difference in trust model: a guest link grants NO early
 * access — get_guest_invite() gates on the invitation's real
 * published_at, so this route behaves like /invite/[id] for publication
 * state, while /preview/[token] deliberately does not.
 *
 * Never calls supabase.auth.getUser(), never imports getInviteServer()/
 * admin.server.ts/review-*.server.ts/requests-admin.server.ts — a guest
 * link is its own, independent credential with no path to owner, admin,
 * request, payment, or review data. `token` stays a local variable in
 * this function; the sanitized `guest`/`model`/`composition` values it
 * produces are the only things ever passed to a component.
 */

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ token: string }>;
};

/** Deliberately generic and constant, regardless of token validity —
 *  same rationale as /preview/[token]'s generateMetadata(): never let a
 *  crawler, link-unfurling bot, or synced browser history entry see a
 *  real guest's name or invitation detail. */
export function generateMetadata(): Metadata {
  return {
    title: "You're invited — Enveloped",
    description: "A personalized invitation.",
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  };
}

function extractScheduleEntries(composition: ReturnType<typeof resolveComposition>): { id: string; label: string }[] {
  if (!composition) return [];
  const entries: { id: string; label: string }[] = [];
  for (const section of composition.sections) {
    if (section.type === "schedule" && section.enabled) {
      for (const entry of section.data.entries) {
        entries.push({ id: entry.id, label: entry.label });
      }
    }
  }
  return entries;
}

/** The composition's own `rsvp` section carries only a cosmetic prompt
 *  string (see src/lib/composition/schema.ts's RsvpSection) — shown
 *  above GuestRsvpPanel for continuity with however the invitation's
 *  author worded it, since CompositionRenderer itself never renders this
 *  section here (canRsvp is deliberately false on this route — the
 *  richer GuestRsvpPanel below is the real RSVP surface). */
function extractRsvpPrompt(composition: ReturnType<typeof resolveComposition>): string | undefined {
  if (!composition) return undefined;
  const section = composition.sections.find((s) => s.type === "rsvp" && s.enabled);
  return section && section.type === "rsvp" ? section.data.prompt : undefined;
}

export default async function GuestInvitePage({ params }: Props) {
  const { token } = await params;

  const guest = isValidGuestTokenFormat(token) ? await getGuestInviteServer(token) : null;
  const model = buildGuestInviteViewModel(guest);
  const composition = resolveComposition(model, guest?.composition ?? null);

  if (!composition || !model || !guest) {
    return (
      <main>
        <UnavailableInvite homeHref="/" homeLabel="Go to Enveloped" />
      </main>
    );
  }

  const palette = PALETTE_REGISTRY[composition.themeTokens.paletteId];
  const accent = composition.themeTokens.accentOverride ?? palette.accent;

  return (
    <main>
      <InvitationExperience
        composition={composition}
        inviteId={model.inviteId}
        guestId={model.guestId}
        guestName={model.guestName}
        song={model.song}
        canRsvp={false}
        mode="guest"
      />
      <div className="relative mx-auto max-w-2xl px-6 pb-20">
        {extractRsvpPrompt(composition) && (
          <p className="mb-3 text-center text-sm text-ink-soft">{extractRsvpPrompt(composition)}</p>
        )}
        <GuestRsvpPanel
          token={token}
          accent={accent}
          guestName={guest.guestName}
          permittedAttendees={guest.permittedAttendees}
          allowPlusOne={guest.allowPlusOne}
          initialStatus={guest.rsvpStatus}
          initialAttendeeCount={guest.attendeeCount}
          initialPlusOneName={guest.plusOneName}
          initialDietaryNotes={guest.dietaryNotes}
          initialEventAttendance={guest.eventAttendance}
          scheduleEntries={extractScheduleEntries(composition)}
        />
      </div>
    </main>
  );
}
