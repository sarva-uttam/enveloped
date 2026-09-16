import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  // The Stage 12 Playwright suite (and its magic-link auth flow) must use
  // 127.0.0.1, not "localhost", to byte-match supabase/config.toml's [auth]
  // site_url — see playwright.config.ts. Without this, Next's dev server
  // blocks cross-origin dev-asset/HMR requests from that origin, which
  // silently prevents client hydration app-wide (no console error at all).
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
