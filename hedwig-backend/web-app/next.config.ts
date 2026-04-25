import type { NextConfig } from 'next';
import path from 'path';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL ?? 'https://pay.hedwigbot.xyz';

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname, '..', '..'),
  experimental: {
    browserDebugInfoInTerminal: false,
    optimizePackageImports: [
      'recharts',
      'posthog-js',
      '@hugeicons/react',
      '@hugeicons/core-free-icons',
      '@radix-ui/react-avatar',
      '@radix-ui/react-dialog',
      '@radix-ui/react-scroll-area',
      '@radix-ui/react-separator',
      '@radix-ui/react-slot',
      '@radix-ui/react-tabs',
      '@radix-ui/react-toast',
    ],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' }
        ]
      }
    ];
  },
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
