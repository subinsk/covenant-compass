import { describe, expect, it, vi } from 'vitest'
import {
    buildPayload, notificationHref, notificationRows, notificationText, notifyOccurrence, recipientOrgIds, type NotifiedOccurrence,
} from './notify'

const facility = { id: 'fac-1', name: 'Term Loan A', lenderOrgId: 'lender-org', borrowerOrgId: 'borrower-org' }
const occurrence: NotifiedOccurrence = {
    id: 'occ-1',
    dueDate: new Date('2026-04-30T00:00:00Z'),
    covenant: { title: 'Quarterly compliance certificate' },
    facility,
}

describe('recipientOrgIds', () => {
    it('sends evidence to the lender org only', () => {
        expect(recipientOrgIds('EVIDENCE_RECEIVED', facility)).toEqual(['lender-org'])
    })

    it('sends completions and waivers to the borrower org only', () => {
        expect(recipientOrgIds('COMPLETED', facility)).toEqual(['borrower-org'])
        expect(recipientOrgIds('WAIVED', facility)).toEqual(['borrower-org'])
    })

    it('sends overdue alerts to both sides', () => {
        expect(recipientOrgIds('OVERDUE', facility)).toEqual(['borrower-org', 'lender-org'])
    })

    it('sends nothing for types without a rule', () => {
        expect(recipientOrgIds('BREACH', facility)).toEqual([])
    })
})

describe('buildPayload', () => {
    it('holds what a list line needs', () => {
        expect(buildPayload(occurrence, { actorName: 'Jane CFO', fileName: 'q1.pdf' })).toEqual({
            covenantTitle: 'Quarterly compliance certificate',
            facilityId: 'fac-1',
            facilityName: 'Term Loan A',
            dueDate: '2026-04-30T00:00:00.000Z',
            actorName: 'Jane CFO',
            fileName: 'q1.pdf',
            reason: null,
        })
    })

    it('trims the reason and drops a blank one', () => {
        expect(buildPayload(occurrence, { reason: '  agreed by email ' }).reason).toBe('agreed by email')
        expect(buildPayload(occurrence, { reason: '  ' }).reason).toBeNull()
    })
})

describe('notificationRows', () => {
    it('makes one unread in-app row per user', () => {
        const now = new Date('2026-05-01T00:00:00Z')
        const rows = notificationRows('WAIVED', 'occ-1', ['u1', 'u2'], { covenantTitle: 'X' }, now)
        expect(rows).toEqual([
            { userId: 'u1', covenantOccurrenceId: 'occ-1', type: 'WAIVED', channel: 'IN_APP', sentAt: now, payload: { covenantTitle: 'X' } },
            { userId: 'u2', covenantOccurrenceId: 'occ-1', type: 'WAIVED', channel: 'IN_APP', sentAt: now, payload: { covenantTitle: 'X' } },
        ])
    })
})

describe('notifyOccurrence', () => {
    function fakeDb(userIds: string[]) {
        return {
            user: { findMany: vi.fn(async () => userIds.map(id => ({ id }))) },
            notification: { createMany: vi.fn(async ({ data }: { data: unknown[] }) => ({ count: data.length })) },
        }
    }

    it('looks up the users of the recipient orgs and notifies each', async () => {
        const db = fakeDb(['l1', 'l2'])
        const count = await notifyOccurrence(db as never, 'EVIDENCE_RECEIVED', occurrence, { fileName: 'q1.pdf' })
        expect(count).toBe(2)
        expect(db.user.findMany).toHaveBeenCalledWith({ where: { organizationId: { in: ['lender-org'] } }, select: { id: true } })
        expect(db.notification.createMany.mock.calls[0][0].data).toHaveLength(2)
    })

    it('writes nothing when the org has no users', async () => {
        const db = fakeDb([])
        expect(await notifyOccurrence(db as never, 'COMPLETED', occurrence)).toBe(0)
        expect(db.notification.createMany).not.toHaveBeenCalled()
    })
})

describe('notificationText', () => {
    const payload = buildPayload(occurrence, { actorName: 'Jane CFO', fileName: 'q1.pdf', reason: 'agreed' })

    it('describes each event', () => {
        expect(notificationText('EVIDENCE_RECEIVED', payload)).toBe('Jane CFO uploaded q1.pdf for Quarterly compliance certificate')
        expect(notificationText('COMPLETED', payload)).toBe('Quarterly compliance certificate was marked complete by Jane CFO')
        expect(notificationText('WAIVED', payload)).toBe('Quarterly compliance certificate was waived by Jane CFO: agreed')
        expect(notificationText('OVERDUE', payload)).toBe('Quarterly compliance certificate is overdue (due 2026-04-30)')
    })

    it('falls back to the title of older rows', () => {
        expect(notificationText('OVERDUE', { title: 'Overdue: Leverage' })).toBe('Overdue: Leverage')
        expect(notificationText('REMINDER', {})).toBe('An obligation')
    })
})

describe('notificationHref', () => {
    it('sends lenders to the facility schedule', () => {
        expect(notificationHref('EVIDENCE_RECEIVED', { facilityId: 'fac-1' }, true)).toBe('/facilities/fac-1?tab=schedule')
    })

    it('sends borrowers to the portal, closed obligations to its history', () => {
        expect(notificationHref('OVERDUE', { facilityId: 'fac-1' }, false)).toBe('/portal')
        expect(notificationHref('COMPLETED', { facilityId: 'fac-1' }, false)).toBe('/portal?view=history')
    })
})
