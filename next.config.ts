import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  serverExternalPackages: ["pdfjs-dist", "@napi-rs/canvas", "mammoth", "adm-zip"],
  experimental: {
    serverActions: {
      bodySizeLimit: "100mb",
    },
    middlewareClientMaxBodySize: "100mb",
  },
  images: {
    remotePatterns: [
      {
        protocol: "http",
        hostname: "192.168.4.240",
        port: "9000",
      },
    ],
  },
};

export default nextConfig;
