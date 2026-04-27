import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const PUBLIC_ROUTES = new Set([
  '/',
  '/login',
  '/signup',
  '/api/waitlist',
  '/api/twilio/incoming',
  '/api/twilio/missed-call',
  '/api/auth/callback',
])

function isPublicPath(pathname: string) {
  return (
    PUBLIC_ROUTES.has(pathname) ||
    pathname.startsWith('/_next/') ||
    pathname === '/favicon.ico' ||
    pathname.startsWith('/public/') ||
    /\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map)$/.test(pathname)
  )
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (isPublicPath(pathname)) return NextResponse.next()

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[middleware] Missing Supabase environment variables')
    return NextResponse.redirect(new URL('/login', req.url))
  }

  const res = NextResponse.next()
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name) {
        return req.cookies.get(name)?.value
      },
      set(name, value, options) {
        res.cookies.set({ name, value, ...options })
      },
      remove(name, options) {
        res.cookies.set({ name, value: '', ...options, maxAge: 0 })
      },
    },
  })

  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    const loginUrl = new URL('/login', req.url)
    loginUrl.searchParams.set('next', `${pathname}${req.nextUrl.search}`)
    return NextResponse.redirect(loginUrl)
  }

  return res
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
