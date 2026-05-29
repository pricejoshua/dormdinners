/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // jsdom does dynamic requires that webpack can't bundle; keep it external
  // so it's required at runtime in the Node serverless function instead.
  experimental: {
    serverComponentsExternalPackages: ['jsdom'],
  },
};

module.exports = nextConfig;
