import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  async redirects() {
    return [{ source: '/aag', destination: '/aag/index.html', permanent: false }];
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.API_INTERNAL_URL ?? 'http://localhost:4000'}/:path*`,
      },
      {
        source: '/cyber-safe',
        destination: `${process.env.CYBER_SAFE_INTERNAL_URL ?? 'http://localhost:8000'}/`,
      },
      {
        source: '/cyber-safe/:path*',
        destination: `${process.env.CYBER_SAFE_INTERNAL_URL ?? 'http://localhost:8000'}/:path*`,
      },
      {
        source: '/aag/:path*',
        destination: `${process.env.AAG_INTERNAL_URL ?? 'http://localhost:4180'}/:path*`,
      },
    ];
  },
};

export default nextConfig;
