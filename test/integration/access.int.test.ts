import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth/session'
import { canAccessFacility, facilityScope } from '@/lib/auth/access'
import type { SessionPayload } from '@/lib/auth/jwt'
import * as facilitiesRoute from '@/app/api/facilities/route'
import * as covenantsRoute from '@/app/api/facilities/[facilityId]/covenants/route'
import * as occurrencesRoute from '@/app/api/facilities/[facilityId]/occurrences/route'
import * as organizationsRoute from '@/app/api/organizations/route'
import { seedTwoTenants } from './fixtures'

vi.mock('@/lib/auth/session', () => ({ getSession: vi.fn() }))

type Fixtures = Awaited<ReturnType<typeof seedTwoTenants>>

function signInAs(session: SessionPayload) {
    vi.mocked(getSession).mockResolvedValue(session)
}

function request(path: string, init?: RequestInit) {
    return new Request(`http://localhost${path}`, init)
}

function facilityParams(facilityId: string) {
    return { params: Promise.resolve({ facilityId }) }
}

describe.skipIf(!process.env.DATABASE_URL_TEST)('cross-organization access (real database)', () => {
    let f: Fixtures

    beforeAll(async () => {
        f = await seedTwoTenants()
    })

    beforeEach(() => {
        vi.mocked(getSession).mockReset()
    })

    afterAll(async () => {
        await prisma.$disconnect()
    })

    describe('facilityScope', () => {
        it('limits facility queries to the lender org', async () => {
            const facilities = await prisma.facility.findMany({ where: facilityScope(f.sessions.bankA) })
            expect(facilities.map(x => x.id)).toEqual([f.facilityA.id])
        })

        it('limits facility queries to the borrower org', async () => {
            const facilities = await prisma.facility.findMany({ where: facilityScope(f.sessions.globex) })
            expect(facilities.map(x => x.id)).toEqual([f.facilityB.id])
        })

        it('limits occurrence queries filtered through the facility (as the calendar does)', async () => {
            const occurrences = await prisma.covenantOccurrence.findMany({
                where: { facility: facilityScope(f.sessions.bankA) },
            })
            expect(occurrences.map(x => x.id)).toEqual([f.facilityA.occurrence.id])
        })
    })

    describe('canAccessFacility', () => {
        it('allows only the lender and borrower of a stored facility', async () => {
            const facility = await prisma.facility.findUniqueOrThrow({ where: { id: f.facilityA.id } })
            expect(canAccessFacility(f.sessions.bankA, facility)).toBe(true)
            expect(canAccessFacility(f.sessions.acme, facility)).toBe(true)
            expect(canAccessFacility(f.sessions.bankB, facility)).toBe(false)
            expect(canAccessFacility(f.sessions.globex, facility)).toBe(false)
        })
    })

    describe('GET /api/facilities', () => {
        it('returns only the lender org\'s facilities', async () => {
            signInAs(f.sessions.bankB)
            const body = await (await facilitiesRoute.GET(request('/api/facilities'))).json()
            expect(body.facilities.map((x: { id: string }) => x.id)).toEqual([f.facilityB.id])
        })

        it('returns only the borrower org\'s facilities', async () => {
            signInAs(f.sessions.acme)
            const body = await (await facilitiesRoute.GET(request('/api/facilities'))).json()
            expect(body.facilities.map((x: { id: string }) => x.id)).toEqual([f.facilityA.id])
        })
    })

    describe('GET /api/facilities/[facilityId]/covenants', () => {
        it('returns covenants for the org\'s own facility', async () => {
            signInAs(f.sessions.acme)
            const res = await covenantsRoute.GET(request('/x'), facilityParams(f.facilityA.id))
            expect(res.status).toBe(200)
            const body = await res.json()
            expect(body.covenants.map((x: { id: string }) => x.id)).toEqual([f.facilityA.covenant.id])
        })

        it('returns 404 for another org\'s facility, for lenders and borrowers', async () => {
            for (const session of [f.sessions.bankA, f.sessions.acme]) {
                signInAs(session)
                const res = await covenantsRoute.GET(request('/x'), facilityParams(f.facilityB.id))
                expect(res.status).toBe(404)
                expect(JSON.stringify(await res.json())).not.toContain(f.facilityB.covenant.id)
            }
        })
    })

    describe('GET /api/facilities/[facilityId]/occurrences', () => {
        it('returns occurrences for the org\'s own facility', async () => {
            signInAs(f.sessions.bankA)
            const res = await occurrencesRoute.GET(request('/x'), facilityParams(f.facilityA.id))
            expect(res.status).toBe(200)
            const body = await res.json()
            expect(body.occurrences.map((x: { id: string }) => x.id)).toEqual([f.facilityA.occurrence.id])
        })

        it('returns 404 for another org\'s facility, for lenders and borrowers', async () => {
            for (const session of [f.sessions.bankB, f.sessions.globex]) {
                signInAs(session)
                const res = await occurrencesRoute.GET(request('/x'), facilityParams(f.facilityA.id))
                expect(res.status).toBe(404)
                expect(JSON.stringify(await res.json())).not.toContain(f.facilityA.occurrence.id)
            }
        })
    })

    describe('POST /api/facilities/[facilityId]/covenants', () => {
        const newCovenant = { title: 'Interest cover', type: 'FINANCIAL', frequency: 'EVENT_DRIVEN' }

        function post(facilityId: string) {
            return covenantsRoute.POST(
                request('/x', { method: 'POST', body: JSON.stringify(newCovenant) }),
                facilityParams(facilityId),
            )
        }

        it('forbids a borrower from adding covenants, even on its own facility', async () => {
            signInAs(f.sessions.acme)
            expect((await post(f.facilityA.id)).status).toBe(403)
        })

        it('hides another lender\'s facility', async () => {
            signInAs(f.sessions.bankB)
            expect((await post(f.facilityA.id)).status).toBe(404)
        })

        it('creates nothing when refused', async () => {
            expect(await prisma.covenant.count({ where: { title: newCovenant.title } })).toBe(0)
        })
    })

    describe('GET /api/organizations', () => {
        it('gives a lender its own org plus borrower orgs, never another lender', async () => {
            signInAs(f.sessions.bankA)
            const body = await (await organizationsRoute.GET(request('/api/organizations'))).json()
            const names = body.organizations.map((x: { name: string }) => x.name)
            expect(names).toEqual(['Acme', 'Bank A', 'Globex'])
        })

        it('gives a borrower only its own org', async () => {
            signInAs(f.sessions.acme)
            const body = await (await organizationsRoute.GET(request('/api/organizations'))).json()
            expect(body.organizations.map((x: { id: string }) => x.id)).toEqual([f.orgs.acme.id])
        })

        it('keeps a borrower inside its own org when filtering by type', async () => {
            signInAs(f.sessions.globex)
            const body = await (await organizationsRoute.GET(request('/api/organizations?type=BORROWER'))).json()
            expect(body.organizations.map((x: { id: string }) => x.id)).toEqual([f.orgs.globex.id])
        })
    })
})
