import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow large file uploads (leases, trade records, underwriting docs)
  // Default is 1MB — raised to 50MB for demo day (consider tuning down later)
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
};

export default nextConfig;
