import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Refreshes the Supabase auth cookie on navigation so server components see a
// live session. Only runs on the pages that care about who you are.
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      ...(process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN
        ? { cookieOptions: { domain: process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN } }
        : {}),
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list: { name: string; value: string; options?: Record<string, unknown> }[]) => {
          for (const { name, value } of list) request.cookies.set(name, value)
          response = NextResponse.next({ request })
          for (const { name, value, options } of list) response.cookies.set(name, value, options)
        },
      },
    }
  )
  await supabase.auth.getUser()
  return response
}

export const config = {
  matcher: ['/suggest/:path*', '/edit/:path*', '/auth/:path*'],
}
