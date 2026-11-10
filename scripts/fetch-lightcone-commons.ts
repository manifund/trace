// Snapshots the latest finalized Lightcone Commons round into
// data/curated/lightcone-commons.json (ingested by ingest-curated.ts).
//
// The site publishes no per-recipient totals. Each public evaluator profile
// (/profiles/<code>) embeds, in its React Server Components payload, a
// `funded` map: recipient id -> how much of that evaluator's recommendation
// ended up funded, counting money from every funder who backed the grant.
// The largest figure across public profiles is a lower bound on the grant
// (an evaluator with a private order may have taken it higher). The homepage
// payload carries the round summary (`granted`, `orgsFunded`, `evaluators`,
// `finalizedAt`); whatever the named recipients don't account for becomes one
// Unknown Recipients row.
//
// Rows from other rounds already in the file are kept, so each round only
// needs fetching once, after it is finalized and the profiles show it.
// Usage: bun run scripts/fetch-lightcone-commons.ts
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const SITE = 'https://www.lightconecommons.com'
const OUT = 'data/curated/lightcone-commons.json'
// Lightcone Commons is a platform that routes funders' money, like SFF's
// S-process; it has not said who its round funders are.
const FUNDER = 'Unknown Donors'

// Lightcone's listing name -> Trace recipient name, where the listing is a
// project title or a variant of an org Trace already has. Lightcone's name
// stays in the grant description.
const RECIPIENTS: Record<string, string> = {
  'ACS Research': 'Alignment of Complex Systems Research Group',
  'Ovelle Bio Corp. (Nonprofit Operations)': 'Ovelle Bio',
  'ERA – Frontier AI Security & Verification Testbed': 'ERA',
  'ERA – AIxComms': 'ERA',
  'Swift Centre Research': 'Swift Centre for Applied Forecasting',
  "John Wentworth's Research": 'John Wentworth',
  'YouTube channel: Chez Anatole': 'Anatole Chouard',
  'Core funding for PauseAI UK': 'PauseAI UK',
  'Scaling adoption of synthesis screening outside the US and EU': 'IBBIS',
  "Reading China's AI Registry: A Public Monitor": 'Sofia Yablonskaya',
  'Belief state geometry of language model personas': 'Logan Graves',
  'More End Kidney Deaths campaigning': 'Elaine Perlman',
  'Building Tooling to Map how Ideas Spread': 'Francisco Carvalho',
  'Grant to establish an AI safety lab and fellowship from India': 'Redarc Labs',
  'Gretta Duleba – Independent Research': 'Gretta Duleba',
  'Gwern.net (and other websites and projects)': 'Gwern Branwen',
  'American Shield': 'Lauren Daugherty (American Shield)',
  'Pause IA: Community Organiser': 'Pause IA',
  'Pause IA: Advocacy Officer': 'Pause IA',
  'MIT: AI Research RCT': 'MIT',
}

// Hand-assigned causes by Lightcone listing name. Names not listed fall to
// the keyword classifier, then the lightcone_commons fallback in
// cause-area-map.json.
const CAUSES: Record<string, string[]> = {
  'Palisade Research': ['evals'],
  'Encode AI': ['ai-advocacy'],
  'AI Futures Project': ['ai-strategy'],
  '80,000 Hours': ['career-transition'],
  'AI Impacts': ['ai-strategy'],
  'Secure AI Project': ['ai-policy'],
  Mox: ['research-hubs'],
  CeSIA: ['ai-policy'],
  'Rationality Meetups': ['epistemic-infrastructure'],
  'American Shield': ['ai-advocacy'],
  'ACS Research': ['technical-ai-safety'],
  'Institute for Responsible Superintelligence': ['ai-safety'],
  Nightingale: ['ai-safety'],
  'Sparrow Infrastructure': ['ai-safety'],
  'Humanitarian OpenStreetMap Team': ['other'],
  'Berkeley Genomics Project': ['other'],
  'Ovelle Bio Corp. (Nonprofit Operations)': ['other'],
  'Who Decides': ['ai-advocacy'],
  'Stop The AI Race': ['ai-advocacy'],
  'Rob Miles AI Safety': ['ai-advocacy'],
  'AI Strategy Team': ['ai-strategy'],
  'Technology Strategy Roleplay': ['ai-strategy'],
  'Principles of Intelligence': ['ai-theory'],
  Vibecamp: ['other'],
  'Manifold Markets': ['epistemic-infrastructure'],
  'Sentinel Research': ['x-risk-other'],
  'The Metascience Observatory': ['epistemic-infrastructure'],
  'ERA – Frontier AI Security & Verification Testbed': ['technical-governance'],
  'Gretta Duleba – Independent Research': ['ai-advocacy'],
  'Lens Academy': ['training-pipelines'],
  'Beacon Institute for Global Catastrophic Risk': ['x-risk-other'],
  'Making unlearning robust': ['technical-ai-safety'],
  'ERA – AIxComms': ['ai-advocacy'],
  'Helping Rob Miles (and others in the AI Safety space)': ['ai-advocacy'],
  'Cascade: AI Safety Influencer Comms Agency': ['ai-advocacy'],
  'YouTube channel explaining AI capabilities and risks': ['ai-advocacy'],
  'Swift Centre Research': ['ai-strategy'],
  'Berkeley House Rental': ['other'],
  'Effective Theories of Agency': ['ai-theory'],
  'More End Kidney Deaths campaigning': ['global-health-development'],
  'Gwern.net (and other websites and projects)': ['epistemic-infrastructure'],
  'the mathematical structure of world models': ['ai-theory'],
  'The Unjournal': ['epistemic-infrastructure'],
  'Education Progress': ['other'],
  'Natural Abstraction + More Generally AGI-Not-Kill-Us-Research': ['ai-theory'],
  'MIT: AI Research RCT': ['ai-adjacent'],
  'Market Shaping Accelerator': ['other'],
  'The Conversation': ['other'],
  'Pause IA: Community Organiser': ['ai-advocacy'],
  'Pause IA: Advocacy Officer': ['ai-advocacy'],
  'Research on Generalized Instrumental Convergence': ['ai-theory'],
  'YouTube channel: Chez Anatole': ['ai-advocacy'],
  'Mathematical Foundations for Collective Intelligence': ['ai-theory'],
  'From economic theories of agency to physics': ['ai-theory'],
  "John Wentworth's Research": ['ai-theory'],
  'Finnish Center for Safe AI': ['ai-fieldbuilding'],
  'Alterman: Satirical AI Campaign': ['ai-advocacy'],
  'Cambridge AI Foresight: Quarterly Forecasts': ['ai-strategy'],
  'Core funding for PauseAI UK': ['ai-advocacy'],
  'PauseAI Germany': ['ai-advocacy'],
  'Handcrafting Neural Networks': ['interp'],
  'Abbasi: AI Incident Reporting': ['ai-policy'],
  'artificial.isabel': ['ai-advocacy'],
  'Testing Corrigibility as a Singular Target': ['alignment-methods'],
  'Hale: Mechanistic Interpretability Research': ['interp'],
  'Ram Potham': ['technical-ai-safety'],
  'Scaling adoption of synthesis screening outside the US and EU': ['biosecurity'],
  'safely.bio': ['biosecurity'],
  "Reading China's AI Registry: A Public Monitor": ['international-policy'],
  'AI safety & X-risk communications': ['ai-advocacy'],
  'DC Mini-Conference': ['ais-events'],
  'Rachel Farley starts an ambitious comms / special projects operation': ['ai-advocacy'],
  'Sar: AI Welfare Seminar': ['digital-minds'],
  'Grant to establish an AI safety lab and fellowship from India': ['ai-fieldbuilding'],
  'The Treacherous Team': ['ai-advocacy'],
  'Signal Technology Foundation': ['other'],
  'Mateusz Bagiński': ['technical-ai-safety'],
  'Belief state geometry of language model personas': ['interp'],
  'A Superhuman Language Model for the game of Go': ['technical-ai-safety'],
  'Sixsmith: Short-Form AI Risk Videos': ['ai-advocacy'],
  ClusterFree: ['global-health-development'],
  'Anima Labs': ['digital-minds'],
  'Cognitive Amplification Research Institute': ['x-risk-other'],
}

// Causes for the round's Unknown Recipients row.
const UNKNOWN_CAUSES = ['ai-safety']

const ORDINALS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']

async function get(path: string): Promise<string> {
  const res = await fetch(`${SITE}${path}`)
  if (!res.ok) throw new Error(`${path}: ${res.status}`)
  return res.text()
}

// The RSC payload is streamed as self.__next_f.push([1,"<chunk>"]) calls.
function payload(html: string): string {
  let out = ''
  for (const m of html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)) {
    out += JSON.parse(m[1]) as string
  }
  return out
}

// Parses the JSON object or array that opens at text[start].
function jsonAt<T>(text: string, start: number): T {
  const open = text[start]
  const close = open === '{' ? '}' : ']'
  let depth = 0
  let inString = false
  for (let i = start; i < text.length; i++) {
    const c = text[i]
    if (inString) {
      if (c === '\\') i++
      else if (c === '"') inString = false
    } else if (c === '"') inString = true
    else if (c === open) depth++
    else if (c === close && --depth === 0) return JSON.parse(text.slice(start, i + 1)) as T
  }
  throw new Error('unterminated JSON')
}

function jsonAfter<T>(text: string, marker: string): T | null {
  const at = text.indexOf(marker)
  return at < 0 ? null : jsonAt<T>(text, at + marker.length - 1)
}

type Summary = { finalizedAt: string; granted: number; orgsFunded: number; evaluators: number }
type Evaluator = { codename: string; name: string }

const home = payload(await get('/'))
const summaryAt = home.lastIndexOf('{', home.indexOf('"finalizedAt"'))
if (summaryAt < 0) throw new Error('round summary not found on homepage')
const summary = jsonAt<Summary>(home, summaryAt)
const evaluatorsAt = home.indexOf('[{"codename"')
const evaluators = evaluatorsAt < 0 ? [] : jsonAt<Evaluator[]>(home, evaluatorsAt)
const evaluatorName = new Map(evaluators.map((e) => [e.codename, e.name]))

const codes = Array.from(
  new Set(
    Array.from((await get('/profiles')).matchAll(/href="\/profiles\/([A-Za-z0-9]+)"/g), (m) => m[1])
  )
)
if (codes.length === 0) throw new Error('no public evaluator profiles found')

type Recipient = {
  id: string
  name: string
  evaluators: { code: string; funded: number }[]
}
const recipients = new Map<string, Recipient>()
let roundWord: string | null = null

for (const code of codes) {
  const html = await get(`/profiles/${code}`)
  const word = html.match(/evaluator in round (\w+)/)?.[1] ?? null
  if (!word) throw new Error(`/profiles/${code}: no round in title`)
  if (roundWord && word !== roundWord)
    throw new Error(`profiles span rounds ${roundWord} and ${word}`)
  roundWord = word

  const rsc = payload(html)
  const funded = jsonAfter<Record<string, number>>(rsc, '"funded":{')
  if (!funded) throw new Error(`/profiles/${code}: no funded map`)
  const names = new Map<string, string>()
  for (const m of rsc.matchAll(
    /\{"id":"([0-9a-f-]{36})","name":("(?:[^"\\]|\\.)*"),"organizationType"/g
  )) {
    names.set(m[1], JSON.parse(m[2]) as string)
  }
  for (const [id, amount] of Object.entries(funded)) {
    const name = names.get(id)
    if (!name) throw new Error(`/profiles/${code}: no name for ${id}`)
    const r = recipients.get(id) ?? { id, name, evaluators: [] }
    r.evaluators.push({ code, funded: amount })
    recipients.set(id, r)
  }
}

const round = ORDINALS.indexOf(roundWord!)
if (round < 1) throw new Error(`unknown round word "${roundWord}"`)
const program = `Lightcone Commons Round ${round}`
const date = summary.finalizedAt.slice(0, 10)

const rows = Array.from(recipients.values())
  .map((r) => ({
    ...r,
    evaluators: r.evaluators.sort((a, b) => b.funded - a.funded),
    amount: Math.round(Math.max(...r.evaluators.map((e) => e.funded))),
  }))
  .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name))

const named = rows.reduce((sum, r) => sum + r.amount, 0)
if (rows.length < 50) throw new Error(`only ${rows.length} recipients parsed`)
if (named > summary.granted) throw new Error(`named $${named} exceeds granted $${summary.granted}`)

const grants: Record<string, unknown>[] = rows.map((r) => {
  const recipient = RECIPIENTS[r.name] ?? r.name
  const by = r.evaluators.map((e) => evaluatorName.get(e.code) ?? e.code).join(', ')
  return {
    recipient,
    funder: FUNDER,
    via: 'Lightcone Commons',
    amount: r.amount,
    currency: 'USD',
    date,
    datePrecision: 'day',
    program,
    description: `${recipient === r.name ? '' : `${r.name}. `}Public evaluators: ${by}.`,
    sourceUrl: `${SITE}/profiles/${r.evaluators[0].code}`,
    amountEstimated: true,
    estimateNote: `Lower bound: the largest funded amount on the ${codes.length} public evaluator profiles; an evaluator with a private order may have taken the grant higher.`,
    key: `r${round}:${r.id}`,
    ...(CAUSES[r.name] ? { causes: CAUSES[r.name] } : {}),
  }
})

const unnamed = summary.orgsFunded - rows.length
const privateEvaluators = summary.evaluators - codes.length
grants.push({
  recipient: 'Unknown Recipients',
  funder: FUNDER,
  via: 'Lightcone Commons',
  amount: summary.granted - named,
  currency: 'USD',
  date,
  datePrecision: 'day',
  program,
  description: `Round ${round} granted $${summary.granted.toLocaleString('en-US')} to ${summary.orgsFunded} recipients; ${unnamed} appear only in the ${privateEvaluators} private evaluator orders. This is the total minus the lower bounds recorded for the ${rows.length} named recipients.`,
  sourceUrl: `${SITE}/#round-${roundWord}`,
  amountEstimated: true,
  estimateNote:
    "Upper bound for the unnamed recipients: any shortfall in the named recipients' lower bounds is counted here.",
  key: `r${round}:unknown-recipients`,
  causes: UNKNOWN_CAUSES,
})

const previous = existsSync(OUT)
  ? (JSON.parse(readFileSync(OUT, 'utf8')) as { grants: { program?: string }[] }).grants
  : []
const kept = previous.filter((g) => g.program !== program)

const file = {
  _comment:
    'Lightcone Commons rounds, written by scripts/fetch-lightcone-commons.ts from the public evaluator profiles at lightconecommons.com/profiles (the `funded` map embedded in each page) and the round summary on the homepage. Per-recipient totals are not published: each amount is the largest funded figure across the public profiles, and an Unknown Recipients row per round takes the rest of the round total. The funders are unnamed, so each grant is from Unknown Donors via Lightcone Commons. Hand mappings (recipient names, causes) live in the script.',
  grants: [...kept, ...grants],
}
writeFileSync(OUT, `${JSON.stringify(file, null, 2)}\n`)
console.log(
  `${program} (final ${date}): ${rows.length} named recipients, $${named.toLocaleString('en-US')} of $${summary.granted.toLocaleString('en-US')}; ${codes.length}/${summary.evaluators} public evaluators; kept ${kept.length} rows from other rounds`
)
