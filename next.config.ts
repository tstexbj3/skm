import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // Supabase Storage serves tenant photos / slips / scans from this host.
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
      { protocol: "http", hostname: "127.0.0.1" },
    ],
  },
  experimental: {
    // Document/photo uploads (phone cameras) go through Server Actions; the
    // default 1 MB cap is too small. Allow multi-image submissions.
    serverActions: {
      bodySizeLimit: "25mb",
    },
  },
};

export default withNextIntl(nextConfig);
