import { readFileSync } from 'node:fs';

const nextVersion = JSON.parse(readFileSync(new URL('./node_modules/next/package.json', import.meta.url), 'utf8')).version;

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  env: { OWNCRM_BUILT_AT: new Date().toISOString(), OWNCRM_NEXT_VERSION: nextVersion },
  experimental: { serverActions: { bodySizeLimit: '4.5mb' } },
};
export default nextConfig;
