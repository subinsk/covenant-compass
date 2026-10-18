import { cookies } from 'next/headers'
import { verifyToken, SessionPayload } from '@/lib/auth/jwt'

// For server components: the current user's session from the `token` cookie, or null.
export async function getSession(): Promise<SessionPayload | null> {
    const cookieStore = await cookies()
    const token = cookieStore.get('token')?.value
    if (!token) return null
    return verifyToken(token)
}
