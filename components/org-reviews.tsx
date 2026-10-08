import type { ReactNode } from 'react'
import type { OrgReview } from '@/db/review'
import { Markdown } from '@/utils/markdown'

function hostname(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '')
}

// A review's first paragraph is its one-line verdict (Zvi's ratings, Michael
// Dickens's classification); the rest opens on click.
export function splitLead(body: string): [string, string] {
  const i = body.search(/\n\s*\n/)
  return i === -1 ? [body, ''] : [body.slice(0, i).trim(), body.slice(i).trim()]
}

export function reviewDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

// Reviewer, linked to their own page when they have one, then where it ran.
export function ReviewerLine(props: { review: OrgReview }) {
  const { review } = props
  return (
    <>
      <span className="font-semibold text-ink">
        {review.reviewerSlug ? (
          <a href={`/orgs/${review.reviewerSlug}`}>{review.reviewer}</a>
        ) : (
          review.reviewer
        )}
      </span>
      {review.venue && review.venue !== review.reviewer && (
        <>
          {' · '}
          {review.venue}
        </>
      )}
      {review.reviewerUrl && !review.venue && (
        <>
          {' · '}
          <a href={review.reviewerUrl}>{hostname(review.reviewerUrl)}</a>
        </>
      )}
      {review.sourceUrl && review.sourceUrl !== review.reviewerUrl && (
        <>
          {' · '}
          <a href={review.sourceUrl}>full post</a>
        </>
      )}
      {' · '}
      {reviewDate(review.reviewedAt)}
    </>
  )
}

// One review: the meta line, the verdict line, and the rest behind a click.
export function ReviewEntry(props: { review: OrgReview; meta: ReactNode }) {
  const [lead, rest] = splitLead(props.review.body)
  const meta = <p className="mb-1 text-sm text-ink-muted">{props.meta}</p>
  if (!rest) {
    return (
      <article className="mb-4">
        {meta}
        <Markdown text={lead} className="text-sm leading-relaxed" />
      </article>
    )
  }
  return (
    <details className="group mb-4">
      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        {meta}
        <span className="text-sm leading-relaxed">
          <Markdown text={lead} className="inline" />
        </span>
        <span className="ml-2 text-xs text-brand">
          <span className="group-open:hidden">Read more ▾</span>
          <span className="hidden group-open:inline">Show less ▴</span>
        </span>
      </summary>
      <div className="mt-2">
        <Markdown text={rest} className="mb-3 text-sm leading-relaxed" />
      </div>
    </details>
  )
}

export function OrgReviews(props: { reviews: OrgReview[] }) {
  if (props.reviews.length === 0) return null
  return (
    <section className="mb-8 max-w-3xl">
      <h2 className="mb-2 font-display text-lg font-bold">Reviews</h2>
      {props.reviews.map((review) => (
        <ReviewEntry key={review.id} review={review} meta={<ReviewerLine review={review} />} />
      ))}
    </section>
  )
}
