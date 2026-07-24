import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll() { /* Session refresh is handled by middleware. */ },
      },
    },
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })

  const token = process.env.BRIDGE_TOKEN
  const base = process.env.BRIDGE_URL
  if (!token || !base) {
    return NextResponse.json({ detail: 'Bridge proxy is not configured' }, { status: 503 })
  }

  const { path } = await context.params
  if (!path.length || path.some((part) => !/^[A-Za-z0-9._-]+$/.test(part))) {
    return NextResponse.json({ detail: 'Invalid bridge path' }, { status: 400 })
  }

  const upstreamUrl = new URL(path.join('/'), `${base.replace(/\/$/, '')}/`)
  upstreamUrl.search = request.nextUrl.search
  const headers = new Headers({ 'X-Jarvis-Token': token })
  const contentType = request.headers.get('content-type')
  if (contentType) headers.set('content-type', contentType)
  const range = request.headers.get('range')
  if (range) headers.set('range', range)

  const body = ['GET', 'HEAD'].includes(request.method)
    ? undefined
    : await request.arrayBuffer()
  const response = await fetch(upstreamUrl, {
    method: request.method,
    headers,
    body,
    cache: 'no-store',
  })

  const responseHeaders = new Headers()
  for (const name of ['content-type', 'content-length', 'content-disposition', 'cache-control', 'content-range', 'accept-ranges', 'etag', 'last-modified']) {
    const value = response.headers.get(name)
    if (value) responseHeaders.set(name, value)
  }
  return new NextResponse(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  })
}

export const GET = proxy
export const POST = proxy
export const PUT = proxy
export const PATCH = proxy
export const DELETE = proxy
