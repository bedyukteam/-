import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep ffmpeg-static external so its bundled binary path resolves at runtime,
  // and trace the binary into the serverless function bundle for Vercel.
  serverExternalPackages: ["ffmpeg-static"],
  outputFileTracingIncludes: {
    "/api/episodes/[id]/process-stage": ["./node_modules/ffmpeg-static/ffmpeg"],
  },
};

export default nextConfig;
