import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth/session'
import { canAccessFacility, facilityScope } from '@/lib/auth/access'
import type { SessionPayload } from '@/lib/auth/jwt'
import * as facilitiesRoute from '@/app/api/facilities/route'
import * as covenantsRoute from '@/app/api/facilities/[facilityId]/covenants/route'
import * as occurrencesRoute from '@/app/api/facilities/[facilityId]/occurrences/route'
import * as organizationsRoute from '@/app/api/organizations/route'
import * as borrowersRoute from '@/app/api/borrowers/route'
import * as borrowerInviteRoute from '@/app/api/borrowers/[id]/invite/route'
import * as acceptInviteRoute from '@/app/api/invite/route'
import * as loginRoute from '@/app/api/auth/login/route'
import * as uploadRunRoute from '@/app/api/facilities/[facilityId]/extraction-runs/route'
import * as runStatusRoute from '@/app/api/extraction-runs/[id]/route'
import { runExtraction } from '@/lib/extraction/import'
import { agreementRunsWhere } from '@/lib/extraction/runs'
import { RUN_IN_PROGRESS_ERROR, STALE_RUN_ERROR, STALE_RUN_MS } from '@/lib/extraction/store'
import { seedTwoTenants } from './fixtures'

vi.mock('@/lib/auth/session', () => ({ getSession: vi.fn() }))
// Never run a real extraction (it would call the LLM); the upload route only needs to start one.
vi.mock('@/lib/extraction/import', async (importOriginal) => ({
    ...await importOriginal<typeof import('@/lib/extraction/import')>(),
    runExtraction: vi.fn(async () => 'DONE'),
}))
// after() needs a Next request scope; here the routes are called directly, so run the task now.
vi.mock('next/server', async (importOriginal) => ({
    ...await importOriginal<typeof import('next/server')>(),
    after: (task: () => unknown) => { void task() },
}))

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
        vi.mocked(runExtraction).mockClear()
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
        it("gives a lender its own org plus its own borrowers, never another lender's", async () => {
            signInAs(f.sessions.bankA)
            const body = await (await organizationsRoute.GET(request('/api/organizations'))).json()
            const names = body.organizations.map((x: { name: string }) => x.name)
            expect(names).toEqual(['Acme', 'Bank A'])
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

    describe('POST /api/borrowers', () => {
        const post = (body: unknown) => borrowersRoute.POST(request('/api/borrowers', { method: 'POST', body: JSON.stringify(body) }))
        const listOrgs = async () => (await (await organizationsRoute.GET(request('/api/organizations?type=BORROWER'))).json())
            .organizations.map((x: { name: string }) => x.name)

        it("adds a borrower only its lender can see", async () => {
            signInAs(f.sessions.bankA)
            const res = await post({ name: 'Initech', contactEmail: 'cfo@initech.test' })
            expect(res.status).toBe(201)
            const created = await res.json()
            expect(created.createdByOrgId).toBe(f.orgs.bankA.id)
            expect(await listOrgs()).toEqual(['Acme', 'Initech'])

            signInAs(f.sessions.bankB)
            expect(await listOrgs()).toEqual(['Globex'])
        })

        it("stops another lender putting a facility on that borrower", async () => {
            const initech = await prisma.organization.findFirstOrThrow({ where: { name: 'Initech' } })
            signInAs(f.sessions.bankB)
            const res = await facilitiesRoute.POST(request('/api/facilities', {
                method: 'POST',
                body: JSON.stringify({
                    name: 'Sneaky', borrowerOrgId: initech.id, currency: 'USD', totalCommitment: 1,
                    startDate: '2026-01-01', endDate: '2027-01-01',
                }),
            }))
            expect(res.status).toBe(400)
            expect(await prisma.facility.count({ where: { name: 'Sneaky' } })).toBe(0)
        })

        it('rejects a duplicate name for the same lender', async () => {
            signInAs(f.sessions.bankA)
            expect((await post({ name: 'initech' })).status).toBe(409)
        })

        it('forbids borrowers from adding borrowers', async () => {
            signInAs(f.sessions.acme)
            expect((await post({ name: 'Hooli' })).status).toBe(403)
            expect(await prisma.organization.count({ where: { name: 'Hooli' } })).toBe(0)
        })
    })

    describe('borrower invites', () => {
        const invite = (orgId: string, body: unknown = {}) => borrowerInviteRoute.POST(
            request('/x', { method: 'POST', body: JSON.stringify(body) }),
            { params: Promise.resolve({ id: orgId }) },
        )
        const accept = (body: unknown) => acceptInviteRoute.POST(request('/api/invite', { method: 'POST', body: JSON.stringify(body) }))
        const login = (email: string, password: string) => loginRoute.POST(request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }))
        const tokenOf = (path: string) => path.split('/').pop()!

        it('invites the contact when a borrower is added with an email, storing only a hash', async () => {
            signInAs(f.sessions.bankA)
            const res = await borrowersRoute.POST(request('/api/borrowers', {
                method: 'POST', body: JSON.stringify({ name: 'Hooli', contactName: 'Gavin', contactEmail: 'Gavin@Hooli.test' }),
            }))
            expect(res.status).toBe(201)
            const body = await res.json()
            expect(body.invite).toMatchObject({ email: 'gavin@hooli.test', path: expect.stringMatching(/^\/invite\/.+/) })
            const user = await prisma.user.findUniqueOrThrow({ where: { email: 'gavin@hooli.test' } })
            expect(user).toMatchObject({ organizationId: body.id, role: 'BORROWER_USER', passwordHash: null, name: 'Gavin' })
            expect(user.inviteTokenHash).not.toBe(tokenOf(body.invite.path))
            expect(await prisma.auditLog.count({ where: { entityId: body.id, action: 'INVITE' } })).toBe(1)
        })

        it('adds the borrower but no user when the email is taken', async () => {
            signInAs(f.sessions.bankA)
            const res = await borrowersRoute.POST(request('/api/borrowers', {
                method: 'POST', body: JSON.stringify({ name: 'Acme Two', contactEmail: 'cfo@acme.test' }),
            }))
            expect(res.status).toBe(201)
            const body = await res.json()
            expect(body.invite).toBeNull()
            expect(body.inviteError).toMatch(/already exists/)
            expect(await prisma.user.count({ where: { organizationId: body.id } })).toBe(0)
        })

        it("only lets the borrower's lender invite", async () => {
            const hooli = await prisma.organization.findFirstOrThrow({ where: { name: 'Hooli' } })
            signInAs(f.sessions.bankB)
            expect((await invite(hooli.id)).status).toBe(404)
            signInAs(f.sessions.acme)
            expect((await invite(f.orgs.acme.id)).status).toBe(403)
            // Bank A lends to Acme (not created by it) but Acme already has an active user.
            signInAs(f.sessions.bankA)
            expect((await invite(f.orgs.acme.id)).status).toBe(409)
        })

        it('renews a pending invite so only the newest link works', async () => {
            const hooli = await prisma.organization.findFirstOrThrow({ where: { name: 'Hooli' } })
            signInAs(f.sessions.bankA)
            const first = await (await invite(hooli.id)).json()
            const second = await (await invite(hooli.id)).json()
            expect(await prisma.user.count({ where: { organizationId: hooli.id } })).toBe(1)

            expect((await accept({ token: tokenOf(first.path), name: 'Gavin B', password: 'password123' })).status).toBe(410)
            expect((await login('gavin@hooli.test', 'password123')).status).toBe(401)

            const res = await accept({ token: tokenOf(second.path), name: 'Gavin B', password: 'password123' })
            expect(res.status).toBe(200)
            expect(await res.json()).toEqual({ redirectTo: '/portal' })
            expect(res.headers.get('set-cookie')).toContain('token=')
            const user = await prisma.user.findUniqueOrThrow({ where: { email: 'gavin@hooli.test' } })
            expect(user).toMatchObject({ name: 'Gavin B', inviteTokenHash: null, inviteExpiresAt: null })
            expect(await prisma.auditLog.count({ where: { entityId: hooli.id, action: 'ACCEPT_INVITE', performedByUserId: user.id } })).toBe(1)

            // The link is used up; the password now works.
            expect((await accept({ token: tokenOf(second.path), name: 'X', password: 'password456' })).status).toBe(410)
            expect((await login('gavin@hooli.test', 'password123')).status).toBe(200)
        })

        it('rejects an expired invite and a short password', async () => {
            const initech = await prisma.organization.findFirstOrThrow({ where: { name: 'Initech' } })
            signInAs(f.sessions.bankA)
            const { path } = await (await invite(initech.id)).json()
            expect((await accept({ token: tokenOf(path), name: 'Bill', password: 'short' })).status).toBe(400)

            await prisma.user.updateMany({ where: { organizationId: initech.id }, data: { inviteExpiresAt: new Date(Date.now() - 1000) } })
            const res = await accept({ token: tokenOf(path), name: 'Bill', password: 'password123' })
            expect(res.status).toBe(410)
            expect((await res.json()).error).toMatch(/expired/)
        })
    })

    describe('POST /api/facilities/[facilityId]/extraction-runs', () => {
        beforeAll(() => {
            vi.stubEnv('LLM_BASE_URL', 'http://llm.invalid')
            vi.stubEnv('LLM_MODEL', 'test-model')
        })

        afterAll(() => {
            vi.unstubAllEnvs()
        })

        function upload(facilityId: string, file?: File) {
            const form = new FormData()
            if (file) form.append('file', file)
            return uploadRunRoute.POST(request('/x', { method: 'POST', body: form }), facilityParams(facilityId))
        }

        const agreement = () => new File(['The Borrower shall not permit the Leverage Ratio to exceed 3.50:1.00.'], 'Credit Agreement.txt')

        it('forbids a borrower, even on its own facility', async () => {
            signInAs(f.sessions.acme)
            expect((await upload(f.facilityA.id, agreement())).status).toBe(403)
        })

        it("hides another lender's facility", async () => {
            signInAs(f.sessions.bankB)
            expect((await upload(f.facilityA.id, agreement())).status).toBe(404)
        })

        it('rejects a missing file or an unsupported type', async () => {
            signInAs(f.sessions.bankA)
            expect((await upload(f.facilityA.id)).status).toBe(400)
            expect((await upload(f.facilityA.id, new File(['x'], 'agreement.doc'))).status).toBe(400)
            expect((await upload(f.facilityA.id, new File([], 'agreement.pdf'))).status).toBe(400)
        })

        it('creates nothing and starts nothing when refused', async () => {
            expect(await prisma.extractionRun.count()).toBe(0)
            expect(runExtraction).not.toHaveBeenCalled()
        })

        it('starts a background run for the lender and returns 202', async () => {
            signInAs(f.sessions.bankA)
            const res = await upload(f.facilityA.id, agreement())
            expect(res.status).toBe(202)
            const run = await res.json()
            expect(run).toMatchObject({
                facilityId: f.facilityA.id, status: 'RUNNING', stage: 'READING', sourceName: 'Credit Agreement.txt',
                sourceUrl: null, model: 'test-model', createdByUserId: f.sessions.bankA.userId,
            })
            expect(runExtraction).toHaveBeenCalledWith(run.id, 'Credit Agreement.txt', expect.objectContaining({ load: expect.any(Function) }))
            expect(await prisma.auditLog.count({ where: { entityId: f.facilityA.id, action: 'CREATE' } })).toBe(1)
        })

        it('refuses a second run while one is in progress', async () => {
            signInAs(f.sessions.bankA)
            const res = await upload(f.facilityA.id, agreement())
            expect(res.status).toBe(409)
            expect(await res.json()).toEqual({ error: RUN_IN_PROGRESS_ERROR })
            expect(await prisma.extractionRun.count({ where: { facilityId: f.facilityA.id } })).toBe(1)
            expect(runExtraction).not.toHaveBeenCalled()
        })
    })

    describe('GET /api/extraction-runs/[id]', () => {
        const get = (id: string) => runStatusRoute.GET(request('/x'), { params: Promise.resolve({ id }) })

        it("returns the run's progress to its facility's lender", async () => {
            const run = await prisma.extractionRun.findFirstOrThrow({ where: { facilityId: f.facilityA.id } })
            signInAs(f.sessions.bankA)
            const res = await get(run.id)
            expect(res.status).toBe(200)
            expect(await res.json()).toMatchObject({
                id: run.id, status: 'RUNNING', stage: 'READING', error: null, sourceName: 'Credit Agreement.txt', itemCount: 0,
            })
        })

        it("returns 404 to another lender and 403 to a borrower", async () => {
            const run = await prisma.extractionRun.findFirstOrThrow({ where: { facilityId: f.facilityA.id } })
            signInAs(f.sessions.bankB)
            const res = await get(run.id)
            expect(res.status).toBe(404)
            expect(JSON.stringify(await res.json())).not.toContain('Credit Agreement')
            signInAs(f.sessions.acme)
            expect((await get(run.id)).status).toBe(403)
        })

        it('fails a run left running past the cutoff, which then no longer blocks a new upload', async () => {
            vi.stubEnv('LLM_BASE_URL', 'http://llm.invalid')
            vi.stubEnv('LLM_MODEL', 'test-model')
            const run = await prisma.extractionRun.findFirstOrThrow({ where: { facilityId: f.facilityA.id } })
            await prisma.extractionRun.update({
                where: { id: run.id },
                data: { createdAt: new Date(Date.now() - STALE_RUN_MS - 60_000) },
            })
            signInAs(f.sessions.bankA)
            expect(await (await get(run.id)).json()).toMatchObject({ status: 'FAILED', error: STALE_RUN_ERROR })
            expect(await prisma.extractionRun.findUniqueOrThrow({ where: { id: run.id } })).toMatchObject({ status: 'FAILED' })

            const form = new FormData()
            form.append('file', new File(['Leverage Ratio not to exceed 3.50:1.00.'], 'Amendment.txt'))
            const res = await uploadRunRoute.POST(request('/x', { method: 'POST', body: form }), facilityParams(f.facilityA.id))
            expect(res.status).toBe(202)
            await prisma.extractionRun.delete({ where: { id: (await res.json()).id } })
            vi.unstubAllEnvs()
        })
    })

    describe('agreementRunsWhere (facility page)', () => {
        it('shows running runs, runs with covenants to review, and recent failures or empty results', async () => {
            const now = new Date()
            const hoursAgo = (h: number) => new Date(now.getTime() - h * 60 * 60 * 1000)
            const item = { name: 'Leverage', metric: 'leverage', operator: '<=', limit: 3.5, quote: 'q', verified: true, limitInQuote: true, operatorCorrected: false, directionConflict: false }
            const make = (sourceName: string, status: 'RUNNING' | 'DONE' | 'FAILED', createdAt: Date, items: { status: 'PENDING' | 'APPROVED' }[] = []) =>
                prisma.extractionRun.create({
                    data: {
                        facilityId: f.facilityB.id, sourceName, status, createdAt, model: 'm', promptChars: 0,
                        items: { create: items.map(i => ({ ...item, status: i.status })) },
                    },
                })
            await make('running', 'RUNNING', hoursAgo(1))
            await make('pending', 'DONE', hoursAgo(72), [{ status: 'PENDING' }, { status: 'APPROVED' }])
            await make('all-reviewed', 'DONE', hoursAgo(2), [{ status: 'APPROVED' }])
            await make('failed-recent', 'FAILED', hoursAgo(2))
            await make('failed-old', 'FAILED', hoursAgo(30))
            await make('empty-recent', 'DONE', hoursAgo(2))
            await make('empty-old', 'DONE', hoursAgo(30))
            await make('pending-too-old', 'DONE', hoursAgo(24 * 8), [{ status: 'PENDING' }])

            const runs = await prisma.extractionRun.findMany({ where: agreementRunsWhere(f.facilityB.id, now), select: { sourceName: true } })
            expect(runs.map(r => r.sourceName).sort()).toEqual(['empty-recent', 'failed-recent', 'pending', 'running'])
        })
    })
})
