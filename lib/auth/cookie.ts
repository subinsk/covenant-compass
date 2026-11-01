import type { NextResponse } from 'next/server'
import { signToken } from '@/lib/auth/jwt'

// Signs the user in on this response: a JWT in an httpOnly `token` cookie.
export async function setSessionCookie(
    response: NextResponse,
    user: { id: string; email: string; role: string; organizationId: string },
) {
    const token = await signToken({
        userId: user.id,
        email: user.email,
        role: user.role,
        orgId: user.organizationId,
    })
    response.cookies.set('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24, // 1 day
    })
    return response
}
