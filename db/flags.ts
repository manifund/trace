// Code-level switches, deliberately not environment variables: flip the
// constant, rebuild, compare.

// Read grants from the cached whole-database snapshot (see db/snapshot.ts)
// instead of paging through PostgREST on every render. The snapshot path
// returns short 8-hex grant ids; the original path returns full UUIDs.
export const USE_SNAPSHOT = true

// How many rows the home page renders on the server before the browser has
// the snapshot. Only the first screen matters; the rest arrives in ~100ms.
export const SSR_ROWS = 400
