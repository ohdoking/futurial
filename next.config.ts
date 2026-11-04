import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hide the dev-mode badge so it never covers the UI in demos or screenshots.
  devIndicators: false,
};

export default nextConfig;
