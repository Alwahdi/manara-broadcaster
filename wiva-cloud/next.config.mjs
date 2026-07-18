/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Next dev otherwise blocks its client runtime when a phone opens WIVA over LAN.
  allowedDevOrigins: ["127.0.0.1", "192.168.1.200"],
  experimental: {
    serverActions: {
      bodySizeLimit: "1mb",
    },
  },
};

export default nextConfig;
