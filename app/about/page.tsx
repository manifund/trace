import { listSources } from '@/db/grant'

export const revalidate = 600

export default async function Page() {
  const sources = await listSources()
  return (
    <div className="max-w-3xl">
      <p className="mb-4">
        Trace compiles data on donations from a variety of sources. The code is open-source and
        can be seen at <a href="https://github.com/manifund/grantbook">GitHub</a>. The compilation
        is released under <a href="https://creativecommons.org/publicdomain/zero/1.0/">CC0</a>;
        underlying records come from the listed sources.
      </p>
      <p className="mb-4">
        Programmatic access: <a href="/api/v0">API</a> · MCP endpoint at <code>/api/mcp</code> ·{' '}
        <a href="/grants.csv">CSV</a>
      </p>
      <p className="mb-4">
        Cause area tags are mostly done by AI and may be inaccurate. Aggregate fund estimates are
        our best guesses for funders that don&apos;t report donations, in the spirit of{' '}
        <a href="https://slatestarcodex.com/2013/05/02/if-its-worth-doing-its-worth-doing-with-made-up-statistics/">
          If It&apos;s Worth Doing, It&apos;s Worth Doing With Made-Up Statistics
        </a>
        .
      </p>
      <p className="mb-6">
        Thanks to Vipul Naik for creating{' '}
        <a href="https://donations.vipulnaik.com/">donations.vipulnaik.com</a>, a spiritual
        predecessor to this site and source for some of the data. At his request, we would like to
        caveat that data from his site is preliminary and has not been completely vetted.
      </p>
      <h1 className="mb-4 font-serif text-2xl font-bold">Sources</h1>
      <div className="overflow-x-auto">
        <table className="gb-table">
          <thead>
            <tr>
              <th>Source</th>
              <th>Last updated</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((source) => (
              <tr key={source.id}>
                <td>{source.url ? <a href={source.url}>{source.name}</a> : source.name}</td>
                <td className="whitespace-nowrap">
                  {source.last_ingested_at ? source.last_ingested_at.slice(0, 10) : 'planned'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
