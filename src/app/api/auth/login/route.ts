import { NextResponse } from 'next/server'
import { createSessionToken, SESSION_COOKIE } from '@/lib/session'

export async function POST(request: Request) {
  let credentials: { email?: string; password?: string }
  try {
    credentials = await request.json()
  } catch {
    return NextResponse.json({ detail: 'Invalid request' }, { status: 400 })
  }

  const expectedEmail = process.env.COMMAND_CENTER_EMAIL
  const expectedPassword = process.env.COMMAND_CENTER_PASSWORD
  if (!expectedEmail || !expectedPassword || !process.env.AUTH_SECRET) {
    return NextResponse.json({ detail: 'Authentication is not configured' }, { status: 503 })
  }

  if (credentials.email !== expectedEmail || credentials.password !== expectedPassword) {
    return NextResponse.json({ detail: 'Invalid email or password' }, { status: 401 })
  }

  const response = NextResponse.json({ ok: true })
  response.cookies.set(SESSION_COOKIE, await createSessionToken(expectedEmail), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  })
  return response
}
