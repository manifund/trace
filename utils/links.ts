// Profile links shown on a person's page, in display order. Stored as one
// jsonb object on orgs.links, keyed by kind; data/person-links.json owns it.
export const LINK_KINDS = [
  'website',
  'twitter',
  'linkedin',
  'manifund',
  'lesswrong',
  'eaforum',
] as const
export type LinkKind = (typeof LINK_KINDS)[number]
export type OrgLinks = Partial<Record<LinkKind, string>>

export const LINK_LABELS: Record<LinkKind, string> = {
  website: 'Website',
  twitter: 'Twitter',
  linkedin: 'LinkedIn',
  manifund: 'Manifund',
  lesswrong: 'LessWrong',
  eaforum: 'EA Forum',
}
