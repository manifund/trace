'use client'

import useSWRImmutable from 'swr/immutable'
import type { GrantRow } from '@/db/grant'

// Every approved grant, loaded once per session and shared by every page.
// Server components render their default view from the same rows; a client
// component falls back to that server-rendered slice until this resolves:
//   const grants = useGrants(props.version) ?? props.initial
export function useGrants(version: string): GrantRow[] | undefined {
  const { data } = useSWRImmutable<GrantRow[]>(`/grants.json?v=${version}`, (url: string) =>
    fetch(url).then((res) => res.json())
  )
  return data
}
