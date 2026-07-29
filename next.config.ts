import type { NextConfig } from "next";

// The desktop build needs a self-contained Node server that Electron can spawn,
// so `bun run desktop:build` sets BUILD_TARGET=desktop and we emit `standalone`.
// The Vercel build deliberately stays on the default output — Vercel does its
// own bundling and standalone would only get in the way.
const isDesktop = process.env.BUILD_TARGET === "desktop";

const nextConfig: NextConfig = {
  // A separate distDir keeps the desktop build from clobbering the .next that
  // a running `next dev` is using, so packaging never has to wait on the dev
  // server being stopped.
  ...(isDesktop
    ? {
        output: "standalone" as const,
        distDir: ".next-desktop",
        // There is no image CDN behind a desktop app, and nothing in the app
        // imports next/image. Turning the optimizer off keeps the bundled
        // server from ever reaching for sharp's native binary.
        images: { unoptimized: true },
      }
    : {}),
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
