// Runs every tier-1 ingester in sequence, then dedup in report mode.
// Each ingester self-executes on import.
export {}

await import('./ingest-ea-funds')
await import('./ingest-sff')
await import('./ingest-vipul')
await import('./ingest-coefficient')
await import('./ingest-manifund')
await import('./ingest-jaan')
await import('./ingest-clr')
await import('./dedup')
