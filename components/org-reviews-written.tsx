import type { WrittenReview } from '@/db/review'
import { ReviewEntry, reviewDate } from './org-reviews'

// What a person has written about other orgs: each review headed by the org
// it is about (linked), the venue and date, with the full text behind a
// click as on the org's own page.
export function OrgReviewsWritten(props: { name: string; reviews: WrittenReview[] }) {
  if (props.reviews.length === 0) return null
  return (
    <section className="mb-8 max-w-3xl">
      <h2 className="mb-2 font-display text-lg font-bold">Reviews by {props.name}</h2>
      {props.reviews.map((review) => (
        <ReviewEntry
          key={review.id}
          review={review}
          meta={
            <>
              <a href={`/orgs/${review.orgSlug}`} className="font-semibold text-ink">
                {review.orgName}
              </a>
              {review.venue && review.venue !== review.reviewer && (
                <>
                  {' · '}
                  {review.venue}
                </>
              )}
              {review.sourceUrl && (
                <>
                  {' · '}
                  <a href={review.sourceUrl}>full post</a>
                </>
              )}
              {' · '}
              {reviewDate(review.reviewedAt)}
            </>
          }
        />
      ))}
    </section>
  )
}
