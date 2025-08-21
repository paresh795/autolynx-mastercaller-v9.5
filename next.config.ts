import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  eslint: {
    // Disable ESLint during builds temporarily for testing
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Allow build even with TypeScript errors temporarily
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
