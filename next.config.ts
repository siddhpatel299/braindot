import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Type errors fail the build again. They were ignored here, and behind that
  // the tree had drifted to 19 of them — including four files importing types
  // that no longer existed, which the build shipped without a word.
  reactStrictMode: false,
};

export default nextConfig;
