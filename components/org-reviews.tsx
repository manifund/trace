import type { OrgReview } from '@/db/review'
import { Markdown } from '@/utils/markdown'

function hostname(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '')
}

export function OrgReviews(props: { reviews: OrgReview[] }) {
  if (props.reviews.length === 0) return null
  return (
    <section className="mb-8 max-w-3xl">
      <h2 className="mb-2 font-display text-lg font-bold">Reviews</h2>
      {props.reviews.map((review) => (
        <article key={review.id} className="mb-6">
          <p className="mb-1 text-sm text-ink-muted">
            <span className="font-semibold text-ink">{review.reviewer}</span>
            {review.reviewerUrl && (
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
            {new Date(`${review.reviewedAt}T00:00:00Z`).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
              timeZone: 'UTC',
            })}
          </p>
          <Markdown text={review.body} className="mb-3 text-sm leading-relaxed" />
        </article>
      ))}
    </section>
  )
}
