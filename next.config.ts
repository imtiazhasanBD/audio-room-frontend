import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "http://localhost:3000",
    "http://192.168.0.102:3000",
    "192.168.0.102",
  ],

  images: {
    remotePatterns: [
      // Local backend
      {
        protocol: "http",
        hostname: "localhost",
        port: "8000",
        pathname: "/uploads/**",
      },

      // Production backend
      {
        protocol: "https",
        hostname: "kotkoti.stallforest.com",
        pathname: "/uploads/**",
      },
    ],
  },
};

export default nextConfig;
