/**
 * Next config for static export → GitHub Pages.
 *
 * - `output: 'export'` makes `next build` emit a fully static `out/` dir
 *   (no Node server required at runtime).
 * - `basePath` and `assetPrefix` are needed because GitHub Pages serves
 *   project sites under /<repo-name>/. Set NEXT_PUBLIC_BASE_PATH at build
 *   time (the GH Action does this); locally `npm run dev` leaves it empty
 *   so paths resolve at /.
 * - `images: { unoptimized: true }` since the Next image optimizer needs a
 *   server.
 * - Trailing slashes ensure refreshes on /sub/page/ work on GH Pages.
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  basePath,
  assetPrefix: basePath || undefined,
  images: { unoptimized: true },
};

module.exports = nextConfig;
