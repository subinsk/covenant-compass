import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { verifyToken } from '@/lib/auth/jwt'

export async function middleware(request: NextRequest) {
    const token = request.cookies.get('token')?.value
    const { pathname } = request.nextUrl

    // Exclude public paths
    if (
        pathname.startsWith('/_next') ||
        pathname.startsWith('/api/auth') ||
        pathname === '/api/system/cron' || // authorized by CRON_SECRET in the route
        pathname === '/login' ||
        pathname.endsWith('.ico')
    ) {
        return NextResponse.next()
    }

    const session = token ? await verifyToken(token) : null
    if (session) return NextResponse.next()

    // API routes get a 401; pages redirect to login. Either way, drop a bad cookie.
    const response = pathname.startsWith('/api/')
        ? NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        : NextResponse.redirect(new URL('/login', request.url))
    if (token) response.cookies.delete('token')
    return response
}

export const config = {
    matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
