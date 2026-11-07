import { beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth/session'
import type { SessionPayload } from '@/lib/auth/jwt'
import * as reviewRoute from '@/app/api/extracted-covenants/[id]/route'
import { createExtractedItem, seedTwoTenants } from './fixtures'

vi.mock('@/lib/auth/session', () => ({ getSession: vi.fn() }))

// Lets a test make schedule generation fail part-way through.
const scheduleFailure = vi.hoisted(() => ({ fail: false }))
vi.mock('@/lib/services/schedule-engine', async (importOriginal) => {
    const original = await importOriginal<typeof import('@/lib/services/schedule-engine')>()
    return {
        ...original,
        generateScheduleForCovenant: vi.fn(async (...args: Parameters<typeof original.generateScheduleForCovenant>) => {
            const count = await original.generateScheduleForCovenant(...args)
            if (scheduleFailure.fail) throw new Error('schedule failed')
            return count
        }),
    }
})

type Fixtures = Awaited<ReturnType<typeof seedTwoTenants>>

function signInAs(session: SessionPayload) {
    vi.mocked(getSession).mockResolvedValue(session)
}

function review(id: string, body: unknown) {
    return reviewRoute.PATCH(
        new Request(`http://localhost/api/extracted-covenants/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
        { params: Promise.resolve({ id }) },
    )
}

describe.skipIf(!process.env.DATABASE_URL_TEST)('reviewing extracted covenants (real database)', () => {
    let f: Fixtures

    beforeEach(async () => {
        f = await seedTwoTenants()
        scheduleFailure.fail = false
    })

    it('approving creates the covenant with its schedule', async () => {
        signInAs(f.sessions.bankA)
        const item = await createExtractedItem(f.facilityA.id)

        const res = await review(item.id, { action: 'approve' })
        expect(res.status).toBe(200)
        const { covenantId } = await res.json()

        const covenant = await prisma.covenant.findUniqueOrThrow({ where: { id: covenantId }, include: { _count: { select: { occurrences: true } } } })
        expect(covenant.thresholdCondition).toBe('<= 4.5')
        expect(covenant._count.occurrences).toBeGreaterThan(0)
        expect((await prisma.extractedCovenant.findUniqueOrThrow({ where: { id: item.id } })).status).toBe('APPROVED')
    })

    it('leaves nothing behind when the schedule fails, so approving again works', async () => {
        signInAs(f.sessions.bankA)
        const item = await createExtractedItem(f.facilityA.id)
        const covenantsBefore = await prisma.covenant.count()

        scheduleFailure.fail = true
        const failed = await review(item.id, { action: 'approve' })
        expect(failed.status).toBe(500)
        expect((await failed.json()).error).toMatch(/nothing was saved/)
        expect(await prisma.covenant.count()).toBe(covenantsBefore)
        expect(await prisma.extractedCovenant.findUniqueOrThrow({ where: { id: item.id } })).toMatchObject({ status: 'PENDING', covenantId: null })

        scheduleFailure.fail = false
        expect((await review(item.id, { action: 'approve' })).status).toBe(200)
        expect(await prisma.covenant.count()).toBe(covenantsBefore + 1)
    })

    it('audits each decision, and a rejected item can be restored and approved', async () => {
        signInAs(f.sessions.bankA)
        const item = await createExtractedItem(f.facilityA.id)

        expect((await review(item.id, { action: 'reject' })).status).toBe(200)
        expect((await review(item.id, { action: 'approve' })).status).toBe(409)
        expect((await review(item.id, { action: 'restore' })).status).toBe(200)
        expect(await prisma.extractedCovenant.findUniqueOrThrow({ where: { id: item.id } }))
            .toMatchObject({ status: 'PENDING', reviewedByUserId: null, reviewedAt: null })
        expect((await review(item.id, { action: 'restore' })).status).toBe(409)
        expect((await review(item.id, { action: 'approve' })).status).toBe(200)

        const audits = await prisma.auditLog.findMany({ where: { entityId: f.facilityA.id, action: 'UPDATE' }, orderBy: { timestamp: 'asc' } })
        expect(audits.map(a => (a.details as { decision: string }).decision)).toEqual(['reject', 'restore', 'approve'])
        expect(audits.every(a => a.performedByUserId === f.sessions.bankA.userId)).toBe(true)
    })

    it("approves with the reviewer's edits and audits what changed", async () => {
        signInAs(f.sessions.bankA)
        const item = await createExtractedItem(f.facilityA.id, { stepDowns: [{ from: 'Q3 2027', limit: 4 }] })
        const edits = { frequency: 'ANNUAL', limit: 4.75, stepDowns: [{ from: '2027-09-30', limit: 4 }] }

        const res = await review(item.id, { action: 'approve', edits })
        expect(res.status).toBe(200)
        const covenant = await prisma.covenant.findUniqueOrThrow({ where: { id: (await res.json()).covenantId } })
        expect(covenant).toMatchObject({ title: item.name, frequency: 'ANNUAL', thresholdCondition: '<= 4.75', stepDowns: edits.stepDowns })
        // The extraction keeps what the model found.
        expect(await prisma.extractedCovenant.findUniqueOrThrow({ where: { id: item.id } })).toMatchObject({ limit: 4.5 })

        const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityId: f.facilityA.id, action: 'UPDATE' } })
        expect(audit.details).toMatchObject({ decision: 'approve', edits })
    })

    it('refuses invalid edits without approving', async () => {
        signInAs(f.sessions.bankA)
        const item = await createExtractedItem(f.facilityA.id)
        expect((await review(item.id, { action: 'approve', edits: { stepDowns: [{ from: 'Q3 2027', limit: 4 }] } })).status).toBe(400)
        expect((await prisma.extractedCovenant.findUniqueOrThrow({ where: { id: item.id } })).status).toBe('PENDING')
    })

    it("can't review another lender's items", async () => {
        signInAs(f.sessions.bankB)
        const item = await createExtractedItem(f.facilityA.id)
        expect((await review(item.id, { action: 'approve' })).status).toBe(404)
    })
})
