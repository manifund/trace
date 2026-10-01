import logos from '@/data/org-logos.json'

const LOGO_SLUGS = new Set<string>(logos.slugs)

// The org's logo from public/logos, when it has one.
export function OrgLogo(props: { slug: string; size?: number; className?: string }) {
  if (!LOGO_SLUGS.has(props.slug)) return null
  const size = props.size ?? 36
  return (
    <img
      src={`/logos/${props.slug}.png`}
      alt=""
      className={props.className}
      style={{ width: size, height: size, objectFit: 'contain' }}
    />
  )
}
