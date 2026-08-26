// Runs every tier-1 ingester in sequence, then dedup in report mode.
// Each ingester self-executes on import.
export {}

await import('./ingest-ea-funds')
await import('./ingest-sff')
await import('./ingest-vipul')
await import('./ingest-coefficient')
await import('./ingest-manifund')
await import('./ingest-jaan')
await import('./dedup')

// Tell the deployed site to rebuild its snapshot now rather than at the next
// cache window. Optional: needs REVALIDATE_URL and REVALIDATE_SECRET.
if (process.env.REVALIDATE_URL && process.env.REVALIDATE_SECRET) {
  const res = await fetch(process.env.REVALIDATE_URL, {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.REVALIDATE_SECRET}` },
  })
  console.log(`revalidate: ${res.status}`)
}
