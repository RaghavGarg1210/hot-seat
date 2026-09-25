import type { NextConfig } from 'next';
const config: NextConfig = {
  devIndicators: false,
  transpilePackages: ['@hotseat/shared'],
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.API_INTERNAL_URL || 'http://127.0.0.1:4000'}/api/:path*`,
      },
    ];
  },
};
export default config;
