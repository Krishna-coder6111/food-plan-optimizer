/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',  // Static export — no server needed
  images: { unoptimized: true },
};

module.exports = nextConfig;
