import type { WrittenReview } from '@/db/review'
import { Markdown } from '@/utils/markdown'
import { reviewDate, splitLead } from './org-reviews'

// What a person has written about other orgs: one line each, the verdict
// line of the review, linking to the org it is about.
export function OrgReviewsWritten(props: { name: string; reviews: WrittenReview[] }) {
  if (props.reviews.length === 0) return null
  return (
    <section className="mb-8 max-w-3xl">
      <h2 className="mb-2 font-display text-lg font-bold">Reviews by {props.name}</h2>
      <ul className="text-sm">
        {props.reviews.map((review) => {
          const [lead] = splitLead(review.body)
          return (
            <li key={review.id} className="mb-2">
              <a href={`/orgs/${review.orgSlug}`} className="font-semibold">
                {review.orgName}
              </a>
              <span className="text-ink-muted">
                {review.venue && review.venue !== review.reviewer && <> · {review.venue}</>}
                {' · '}
                {reviewDate(review.reviewedAt)}
              </span>
              <span className="block text-ink-muted">
                <Markdown text={lead} className="inline" />
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
