// Runs every tier-1 ingester in sequence, then dedup in report mode.
// Each ingester self-executes on import, except SFF, which exports its
// parser for the key migration and runs only as a main module.
import { runIngest } from './lib/ingest'

await import('./ingest-ea-funds')
await runIngest('sff', await (await import('./ingest-sff')).sffRecords())
await import('./ingest-vipul')
await import('./ingest-coefficient')
await import('./ingest-manifund')
await import('./ingest-jaan')
await import('./ingest-clr')
await import('./ingest-sentinel-bio')
await import('./dedup')
