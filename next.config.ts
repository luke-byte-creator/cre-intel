import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow large file uploads (leases, trade records, underwriting docs)
  // Default is 1MB — raised for document uploads
  experimental: {
    serverActions: {
      bodySizeLimit: "20mb",
    },
  },
};

export default nextConfig;
