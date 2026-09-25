/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    // Serve the ForensAI static frontend at the site root.
    return [{ source: "/", destination: "/index.html" }];
  },
};

module.exports = nextConfig;
