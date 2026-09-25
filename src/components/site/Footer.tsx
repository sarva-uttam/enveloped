import Link from "next/link";

const PRODUCT_LINKS = [
  { href: "/templates", label: "Templates" },
  { href: "/pricing", label: "Pricing" },
  { href: "/survey", label: "Start an invite" },
  { href: "/consultation", label: "Request a consultation" },
];

const COMPANY_LINKS = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/dashboard", label: "My invites" },
  { href: "/sponsor", label: "Sponsor us" },
];

const LEGAL_LINKS = [
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
];

/**
 * Stage 11 rebuild — richer than the previous 4-column grid (brand block,
 * product, company) with a legal row added. No admin route is ever
 * linked from here (admin discoverability is handled inside the
 * authenticated /admin layout itself, never from public chrome).
 */
export function Footer() {
  return (
    <footer className="border-t border-line bg-paper-raised">
      <div className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-10 sm:grid-cols-2 md:grid-cols-4">
          <div className="md:col-span-2">
            <div className="font-display text-xl">
              Envel<span className="italic text-blush">oped</span>
            </div>
            <p className="mt-3 max-w-sm text-sm text-ink-soft">
              Digital invites for weddings and every celebration in between —
              designed, animated, and personalized down to the guest.
            </p>
          </div>
          <div>
            <div className="text-sm font-medium text-ink">Product</div>
            <ul className="mt-3 space-y-2 text-sm text-ink-soft">
              {PRODUCT_LINKS.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="focus-ring rounded-sm hover:text-ink">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="text-sm font-medium text-ink">Company</div>
            <ul className="mt-3 space-y-2 text-sm text-ink-soft">
              {COMPANY_LINKS.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="focus-ring rounded-sm hover:text-ink">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="mt-12 flex flex-col gap-4 border-t border-line pt-6 text-xs text-ink-soft sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} Enveloped. Made for the people who&apos;d
            rather send a moment than a message.
          </p>
          <ul className="flex gap-5">
            {LEGAL_LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="focus-ring rounded-sm hover:text-ink">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
}
