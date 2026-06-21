import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static HTML export, served by the FastAPI backend at "/".
  output: "export",
};

export default nextConfig;
