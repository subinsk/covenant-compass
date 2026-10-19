import type { Prisma } from '@prisma/client'
import type { SessionPayload } from '@/lib/auth/jwt'

type ScopeSession = Pick<SessionPayload, 'role' | 'orgId'>

export function isLender(session: Pick<SessionPayload, 'role'>): boolean {
    return session.role.includes('LENDER')
}

// Lenders can access facilities their org lends on; borrowers, facilities their org borrows on.
export function canAccessFacility(
    session: ScopeSession,
    facility: { lenderOrgId: string; borrowerOrgId: string },
): boolean {
    return isLender(session)
        ? facility.lenderOrgId === session.orgId
        : facility.borrowerOrgId === session.orgId
}

// Prisma filter for the facilities a session can see (same rule as canAccessFacility).
export function facilityScope(session: ScopeSession): Prisma.FacilityWhereInput {
    return isLender(session)
        ? { lenderOrgId: session.orgId }
        : { borrowerOrgId: session.orgId }
}

// Organizations a session can list: lenders see their own org plus borrower orgs
// (needed to create facilities); borrowers see only their own org.
export function organizationScope(session: ScopeSession): Prisma.OrganizationWhereInput {
    return isLender(session)
        ? { OR: [{ id: session.orgId }, { type: 'BORROWER' }] }
        : { id: session.orgId }
}
