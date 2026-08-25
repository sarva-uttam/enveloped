import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-line bg-paper-raised">
      <div className="mx-auto max-w-6xl px-6 py-14">
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
              <li><Link href="/templates" className="hover:text-ink">Templates</Link></li>
              <li><Link href="/pricing" className="hover:text-ink">Pricing</Link></li>
              <li><Link href="/survey" className="hover:text-ink">Start an invite</Link></li>
            </ul>
          </div>
          <div>
            <div className="text-sm font-medium text-ink">Company</div>
            <ul className="mt-3 space-y-2 text-sm text-ink-soft">
              <li><Link href="/how-it-works" className="hover:text-ink">How it works</Link></li>
              <li><Link href="/dashboard" className="hover:text-ink">My invites</Link></li>
            </ul>
          </div>
        </div>
        <div className="mt-12 border-t border-line pt-6 text-xs text-ink-soft">
          © {new Date().getFullYear()} Enveloped. Made for the people who'd
          rather send a moment than a message.
        </div>
      </div>
    </footer>
  );
}
