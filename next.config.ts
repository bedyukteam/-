import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Canva OAuth requires the 127.0.0.1 redirect host in dev; without this the
  // dev server serves HTML on that origin but blocks hydration scripts.
  allowedDevOrigins: ["127.0.0.1"],
  // Keep ffmpeg-static external so its bundled binary path resolves at runtime,
  // and trace the binary into the serverless function bundle for Vercel.
  serverExternalPackages: ["ffmpeg-static"],
  outputFileTracingIncludes: {
    "/api/episodes/[id]/process-stage": ["./node_modules/ffmpeg-static/ffmpeg"],
  },
};

export default nextConfig;
