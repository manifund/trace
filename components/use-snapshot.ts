'use client'

// Loads the whole-dataset snapshot once per browser session and hands every
// page the same expanded rows. The version comes from the server render;
// the URL is immutable, so repeat visits are served from the HTTP cache.
import { useEffect, useState } from 'react'
import type { GrantRow } from '@/db/grant'
import { expandGrants, type Snapshot } from '@/utils/snapshot'

type Loaded = { version: string; snapshot: Snapshot; grants: GrantRow[] }

let loaded: Loaded | null = null
let inflight: { version: string; promise: Promise<Loaded> } | null = null

export function loadSnapshot(version: string): Promise<Loaded> {
  if (loaded?.version === version) return Promise.resolve(loaded)
  if (inflight?.version === version) return inflight.promise
  const promise = fetch(`/snapshot/${version}`)
    .then((res) => {
      if (!res.ok) throw new Error(`snapshot ${res.status}`)
      return res.json() as Promise<Snapshot>
    })
    .then((snapshot) => {
      loaded = { version, snapshot, grants: expandGrants(snapshot) }
      return loaded
    })
    .finally(() => {
      if (inflight?.version === version) inflight = null
    })
  inflight = { version, promise }
  return promise
}

// null until the snapshot is in memory; callers render their SSR subset or a
// placeholder meanwhile. `version === null` means the server had no data.
export function useSnapshot(version: string | null): Loaded | null {
  const [state, setState] = useState<Loaded | null>(() =>
    loaded?.version === version ? loaded : null
  )
  useEffect(() => {
    if (!version) return
    let live = true
    loadSnapshot(version).then((result) => live && setState(result), console.error)
    return () => {
      live = false
    }
  }, [version])
  return state
}
