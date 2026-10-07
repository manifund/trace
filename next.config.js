/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // One static-generation worker: every worker loads the whole grants table
  // through getGrants(), so parallel workers each re-download it, trip
  // Supabase's statement timeout, and race on the same fetch-cache files
  // (a torn write there broke every later build until it was deleted).
  // Pages are cheap once the table is in memory, so one worker is faster.
  experimental: { cpus: 1 },
  // /suggestions was the old name for /edit; keep shared links working.
  async redirects() {
    return [{ source: '/suggestions', destination: '/edit', permanent: true }]
  },
}

module.exports = nextConfig
