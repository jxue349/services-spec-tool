/** @type {import('next').NextConfig} */
const nextConfig = {
  // A production build writes to the same directory the dev server is serving
  // from, so verifying a build while `npm run dev` is running leaves the dev
  // server with no stylesheet — the page loads completely unstyled. Honour an
  // override so `npm run build:verify` can build somewhere else.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  eslint: {
    // Lint is run explicitly via `npm run lint`; don't couple it to the Docker build.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
