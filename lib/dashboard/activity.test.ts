import { describe, expect, it } from 'vitest'
import { describeAudit, type AuditLookups } from './activity'

const lookups: AuditLookups = {
    facilities: new Map([['fac-1', { name: 'Acme Term Loan' }]]),
    occurrences: new Map([['occ-1', { facilityId: 'fac-1', title: 'Quarterly Financials', dueDate: new Date('2026-03-31T12:00:00Z') }]]),
    documents: new Map([['doc-1', { facilityId: 'fac-1', fileName: 'q1.pdf' }]]),
}

const alice = { name: 'Alice Lender' }
const bob = { name: 'Bob Borrower' }
const entry = (entityType: string, entityId: string, action: string, details: unknown = null, performedBy = alice) =>
    ({ entityType, entityId, action, details, performedBy })

describe('describeAudit', () => {
    it('describes occurrence completions, waivers and reopens', () => {
        expect(describeAudit(entry('OCCURRENCE', 'occ-1', 'COMPLETE', { action: 'complete' }), lookups)).toEqual({
            facilityId: 'fac-1',
            facilityName: 'Acme Term Loan',
            text: 'Alice Lender marked Quarterly Financials (due 31 Mar 2026) complete',
        })
        expect(describeAudit(entry('OCCURRENCE', 'occ-1', 'WAIVE', { action: 'waive', reason: ' Covered by amendment ' }), lookups)?.text)
            .toBe('Alice Lender waived Quarterly Financials (due 31 Mar 2026): Covered by amendment')
        expect(describeAudit(entry('OCCURRENCE', 'occ-1', 'UPDATE', { action: 'reopen', reason: null }), lookups)?.text)
            .toBe('Alice Lender reopened Quarterly Financials (due 31 Mar 2026)')
    })

    it('describes document uploads through the document facility', () => {
        expect(describeAudit(entry('DOCUMENT', 'doc-1', 'UPLOAD_DOCUMENT', { fileName: 'q1.pdf' }, bob), lookups)).toEqual({
            facilityId: 'fac-1',
            facilityName: 'Acme Term Loan',
            text: 'Bob Borrower uploaded q1.pdf',
        })
    })

    it('tells facility creation apart from an import', () => {
        expect(describeAudit(entry('FACILITY', 'fac-1', 'CREATE', { name: 'Acme Term Loan' }), lookups)?.text)
            .toBe('Alice Lender created the facility')
        expect(describeAudit(entry('FACILITY', 'fac-1', 'CREATE', { kind: 'extraction', url: 'https://x' }), lookups)?.text)
            .toBe('Alice Lender started an agreement import')
    })

    it('returns null for entities outside the lookups', () => {
        expect(describeAudit(entry('FACILITY', 'fac-2', 'CREATE'), lookups)).toBeNull()
        expect(describeAudit(entry('OCCURRENCE', 'occ-2', 'COMPLETE'), lookups)).toBeNull()
        expect(describeAudit(entry('DOCUMENT', 'doc-2', 'UPLOAD_DOCUMENT'), lookups)).toBeNull()
        expect(describeAudit(entry('COVENANT', 'cov-1', 'CREATE'), lookups)).toBeNull()
    })
})
