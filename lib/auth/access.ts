import type { SessionPayload } from '@/lib/auth/jwt'

export function isLender(session: Pick<SessionPayload, 'role'>): boolean {
    return session.role.includes('LENDER')
}

// Lenders can access facilities their org lends on; borrowers, facilities their org borrows on.
export function canAccessFacility(
    session: Pick<SessionPayload, 'role' | 'orgId'>,
    facility: { lenderOrgId: string; borrowerOrgId: string },
): boolean {
    return isLender(session)
        ? facility.lenderOrgId === session.orgId
        : facility.borrowerOrgId === session.orgId
}
