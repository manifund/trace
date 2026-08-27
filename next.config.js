/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // /suggestions was the old name for /edit; keep shared links working.
  async redirects() {
    return [{ source: '/suggestions', destination: '/edit', permanent: true }]
  },
}

module.exports = nextConfig
