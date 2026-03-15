import type { NextConfig } from 'next';
import path from 'path';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL ?? 'https://pay.hedwigbot.xyz';

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname, '..', '..'),
  async rewrites() {
    return [
      {
        // Proxy /api/backend/* → backend server (browser stays same-origin, no CORS)
        source: '/api/backend/:path*',
        destination: `${BACKEND_URL}/:path*`
      }
    ];
  }
};

export default nextConfig;
