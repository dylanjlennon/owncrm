/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  env: { OWNCRM_BUILT_AT: new Date().toISOString() },
  experimental: { serverActions: { bodySizeLimit: '6mb' } },
};
export default nextConfig;
