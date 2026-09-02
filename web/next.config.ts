import type { NextConfig } from 'next';

const apiProxy = process.env.API_PROXY_URL || 'http://127.0.0.1:4000';

const nextConfig: NextConfig = {
  output: 'standalone',
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiProxy.replace(/\/$/, '')}/api/:path*` }];
  },
};

export default nextConfig;
