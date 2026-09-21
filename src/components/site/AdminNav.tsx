import Link from "next/link";

/**
 * Stage 11 — admin/layout.tsx previously rendered a bare "Admin" label
 * with no navigation at all (admin/page.tsx's own comment called the
 * dashboard "still deliberately a placeholder"). Lives inside the layout
 * that already re-verifies checkAdmin() on every render, so this adds no
 * new authorization logic of its own — it's discoverability only.
 * "Requests" is the one real entry point today: every other admin
 * surface (invitation generator, client review, guest management, RSVP
 * dashboard) is reached by drilling into a specific request/invitation
 * from there, since no separate invitations-index page exists yet.
 */
export function AdminNav() {
  const LINKS = [
    { href: "/admin", label: "Dashboard" },
    { href: "/admin/requests", label: "Requests" },
  ];

  return (
    <nav className="flex items-center gap-6">
      {LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className="focus-ring rounded-sm text-sm font-medium text-ink-soft transition hover:text-ink"
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
