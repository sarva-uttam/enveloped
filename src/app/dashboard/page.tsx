"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Trash2, ArrowUpRight, Plus } from "lucide-react";
import { Navbar } from "@/components/site/Navbar";
import { Footer } from "@/components/site/Footer";
import { getAllInvites, forgetInvite, type StoredInvite } from "@/lib/storage";
import { getTier } from "@/lib/tiers";

export default function DashboardPage() {
  const [invites, setInvites] = useState<StoredInvite[] | null>(null);

  useEffect(() => {
    setInvites(getAllInvites());
  }, []);

  return (
    <>
      <Navbar />
      <main className="flex-1">
        <section className="mx-auto max-w-4xl px-6 py-16">
          <div className="flex items-center justify-between">
            <h1 className="font-display text-4xl">My invites</h1>
            <Link
              href="/survey"
              className="inline-flex items-center gap-1.5 rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper transition hover:bg-ink-soft"
            >
              <Plus className="h-4 w-4" /> New invite
            </Link>
          </div>
          <p className="mt-2 text-sm text-ink-soft">
            Invites you&apos;ve created on this device. The list below is
            local to this browser, but each link works anywhere — invites
            are backed by a real database now.
          </p>

          {invites === null && <p className="mt-10 text-sm text-ink-soft">Loading…</p>}

          {invites?.length === 0 && (
            <div className="mt-14 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line py-16 text-center">
              <p className="text-ink-soft">You haven&apos;t made an invite yet.</p>
              <Link href="/survey" className="text-sm font-medium text-ink underline underline-offset-4">
                Start your first one
              </Link>
            </div>
          )}

          <div className="mt-10 space-y-3">
            {invites?.map((invite) => {
              const tier = getTier(invite.answers.tier || "bronze");
              return (
                <div
                  key={invite.id}
                  className="flex items-center justify-between gap-4 rounded-2xl border border-line bg-paper-raised p-5"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className="rounded-full px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wide"
                        style={{ background: tier.softVar, color: tier.colorVar }}
                      >
                        {tier.name}
                      </span>
                      <span className="font-medium text-ink">{invite.content.headline}</span>
                    </div>
                    <div className="mt-1 text-xs text-ink-soft">
                      {invite.guestList.length > 0
                        ? `${invite.guestList.length} guest links · `
                        : ""}
                      Created {new Date(invite.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/invite/${invite.id}`}
                      className="inline-flex items-center gap-1 rounded-full border border-line px-3 py-1.5 text-xs text-ink-soft transition hover:border-ink hover:text-ink"
                    >
                      Open <ArrowUpRight className="h-3.5 w-3.5" />
                    </Link>
                    <button
                      onClick={() => {
                        forgetInvite(invite.id);
                        setInvites(getAllInvites());
                      }}
                      className="rounded-full border border-line p-2 text-ink-soft transition hover:border-red-400 hover:text-red-500"
                      aria-label="Remove from this list"
                      title="Removes it from this device's list only — the shared link still works"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
