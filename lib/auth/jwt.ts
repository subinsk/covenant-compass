import { SignJWT, jwtVerify } from 'jose'

export type SessionPayload = {
    userId: string
    email: string
    role: string
    orgId: string
}

const DEV_SECRET = 'dev-only-secret-do-not-use-in-prod'

// Read lazily so `next build` works without the secret; production refuses to run without it.
function getKey() {
    const secret = process.env.JWT_SECRET
    if (!secret && process.env.NODE_ENV === 'production') {
        throw new Error('JWT_SECRET must be set in production')
    }
    return new TextEncoder().encode(secret || DEV_SECRET)
}

export async function signToken(payload: SessionPayload) {
    return new SignJWT(payload)
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('24h')
        .sign(getKey())
}

export async function verifyToken(token: string): Promise<SessionPayload | null> {
    const key = getKey()
    try {
        const { payload } = await jwtVerify(token, key, { algorithms: ['HS256'] })
        return payload as unknown as SessionPayload
    } catch {
        return null
    }
}
