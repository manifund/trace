import { SuggestForm, type ExistingGrant } from '@/components/suggest-form'
import { AuthButton } from '@/components/auth-button'
import { getGrantById } from '@/db/grant'
import { getUser } from '@/db/supabase-auth'

export const dynamic = 'force-dynamic'

export default async function Page(props: { searchParams: Promise<{ grant?: string }> }) {
  const { grant: grantId } = await props.searchParams
  const user = await getUser()
  const row = grantId ? await getGrantById(grantId) : null
  const grant: ExistingGrant | null = row
    ? {
        id: row.id,
        funderName: row.funderName,
        recipientName: row.recipientName,
        amountUsd: row.amountUsd,
        date: row.date,
        datePrecision: row.datePrecision,
        description: row.description,
        url: row.url,
      }
    : null

  return (
    <div>
      <h1 className="mb-2 font-serif text-2xl font-bold">
        {grant ? 'Suggest an edit' : 'Suggest a grant'}
      </h1>
      {!grant && (
        <p className="mb-4 max-w-2xl text-ink-muted">
          To correct an existing grant instead, use the “suggest an edit” link on any row of the{' '}
          <a href="/grants">grants table</a>.
        </p>
      )}
      {!user ? (
        <div className="flex flex-col items-start gap-2">
          <p>Sign in with your Manifund account to suggest a change.</p>
          <AuthButton email={null} />
        </div>
      ) : (
        <>
          <p className="mb-3 text-sm text-ink-muted">
            Signed in as <AuthButton email={user.email ?? null} />
          </p>
          <SuggestForm grant={grant} signedIn />
        </>
      )}
    </div>
  )
}
