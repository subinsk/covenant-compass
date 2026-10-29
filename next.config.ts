import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  experimental: {
    // middleware.ts makes Next.js buffer request bodies, 10 MB by default; agreement uploads go up to 20 MB.
    proxyClientMaxBodySize: '25mb',
  },
};

export default nextConfig;
