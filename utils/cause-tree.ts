// Canonical cause-area tree, in display order. The single source for filter
// options, table display, and the seed script. Grants are tagged with their
// most specific causes plus all ancestors, so filtering on any level works.
// AIS taxonomy per Caroline, 2026-08.
export type CauseNode = { slug: string; name: string; parent: string | null }

export const CAUSE_TREE: CauseNode[] = [
  { slug: 'ai-safety', name: 'AI safety', parent: null },
  { slug: 'technical-ai-safety', name: 'Technical AI safety research', parent: 'ai-safety' },
  { slug: 'interp', name: 'Interpretability', parent: 'technical-ai-safety' },
  { slug: 'alignment-methods', name: 'Alignment methods', parent: 'technical-ai-safety' },
  { slug: 'ai-control', name: 'Control', parent: 'technical-ai-safety' },
  { slug: 'evals', name: 'Evals', parent: 'technical-ai-safety' },
  { slug: 'robustness-security', name: 'Security', parent: 'technical-ai-safety' },
  { slug: 'ai-theory', name: 'Foundations', parent: 'technical-ai-safety' },
  { slug: 'ai-policy', name: 'AI governance, policy, and advocacy', parent: 'ai-safety' },
  { slug: 'technical-governance', name: 'Technical governance', parent: 'ai-policy' },
  { slug: 'domestic-policy', name: 'Domestic policy', parent: 'ai-policy' },
  { slug: 'international-policy', name: 'International governance', parent: 'ai-policy' },
  { slug: 'corporate-governance', name: 'Corporate governance', parent: 'ai-policy' },
  { slug: 'ai-law', name: 'Legal', parent: 'ai-policy' },
  { slug: 'ai-advocacy', name: 'Advocacy', parent: 'ai-policy' },
  { slug: 'ai-fieldbuilding', name: 'AI safety fieldbuilding', parent: 'ai-safety' },
  { slug: 'training-pipelines', name: 'Training pipelines', parent: 'ai-fieldbuilding' },
  { slug: 'local-groups', name: 'Local groups', parent: 'ai-fieldbuilding' },
  { slug: 'career-transition', name: 'Career transitions', parent: 'ai-fieldbuilding' },
  { slug: 'ais-events', name: 'Events', parent: 'ai-fieldbuilding' },
  { slug: 'research-hubs', name: 'Research hubs', parent: 'ai-fieldbuilding' },
  { slug: 'ai-ecosystem', name: 'AI safety meta', parent: 'ai-safety' },
  { slug: 'funding-infrastructure', name: 'Funding infrastructure', parent: 'ai-ecosystem' },
  { slug: 'research-infrastructure', name: 'Research infrastructure', parent: 'ai-ecosystem' },
  { slug: 'ai-strategy', name: 'Strategy & forecasting', parent: 'ai-ecosystem' },
  { slug: 'epistemic-infrastructure', name: 'Epistemic infrastructure', parent: 'ai-ecosystem' },
  { slug: 'org-incubation', name: 'Org incubation & ops', parent: 'ai-ecosystem' },
  { slug: 'ai-adjacent', name: 'AI safety adjacent', parent: 'ai-safety' },
  { slug: 'ai-bio', name: 'AI × bio', parent: 'ai-adjacent' },
  { slug: 'ai-cyber', name: 'AI × cyber', parent: 'ai-adjacent' },
  { slug: 'digital-minds', name: 'AI welfare', parent: 'ai-adjacent' },
  { slug: 's-risk', name: 'S-risk', parent: 'ai-adjacent' },
  { slug: 'gradual-disempowerment', name: 'Economics', parent: 'ai-adjacent' },
  { slug: 'biosecurity', name: 'Biosecurity', parent: null },
  { slug: 'x-risk-other', name: 'Other existential risk', parent: null },
  { slug: 'ea-infrastructure', name: 'EA infrastructure', parent: null },
  { slug: 'animal-welfare', name: 'Animal welfare', parent: null },
  { slug: 'global-health-development', name: 'Global health and development', parent: null },
  { slug: 'other', name: 'Other', parent: null },
]

export const CAUSE_PARENTS: Record<string, string> = Object.fromEntries(
  CAUSE_TREE.filter((node) => node.parent).map((node) => [node.slug, node.parent as string])
)

function depthOf(slug: string): number {
  let depth = 0
  let parent = CAUSE_PARENTS[slug]
  while (parent) {
    depth++
    parent = CAUSE_PARENTS[parent]
  }
  return depth
}

// Filter-dropdown options with indentation depth, in tree order.
export const CAUSE_OPTIONS = CAUSE_TREE.map((node) => ({
  slug: node.slug,
  name: node.name,
  depth: depthOf(node.slug),
}))

// Names of the most specific causes in a tag set (ancestors of another
// present tag are implied, so they're hidden).
export function displayCauses(slugs: string[]): string[] {
  const set = new Set(slugs)
  const implied = new Set<string>()
  for (const slug of slugs) {
    let parent = CAUSE_PARENTS[slug]
    while (parent) {
      implied.add(parent)
      parent = CAUSE_PARENTS[parent]
    }
  }
  return CAUSE_TREE.filter((node) => set.has(node.slug) && !implied.has(node.slug)).map(
    (node) => node.name
  )
}
