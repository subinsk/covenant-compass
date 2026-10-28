import { describe, expect, it } from 'vitest'
import { borrowerScope, canAccessFacility, facilityScope, isLender, organizationScope } from './access'

const facility = { lenderOrgId: 'bank', borrowerOrgId: 'acme' }

describe('isLender', () => {
    it('is true for lender roles only', () => {
        expect(isLender({ role: 'LENDER_ADMIN' })).toBe(true)
        expect(isLender({ role: 'LENDER_USER' })).toBe(true)
        expect(isLender({ role: 'BORROWER_USER' })).toBe(false)
    })
})

describe('canAccessFacility', () => {
    it('lets a lender access facilities its org lends on', () => {
        expect(canAccessFacility({ role: 'LENDER_USER', orgId: 'bank' }, facility)).toBe(true)
    })

    it('blocks a lender from another lender org', () => {
        expect(canAccessFacility({ role: 'LENDER_ADMIN', orgId: 'other-bank' }, facility)).toBe(false)
    })

    it('does not let a lender in through the borrower side', () => {
        expect(canAccessFacility({ role: 'LENDER_USER', orgId: 'acme' }, facility)).toBe(false)
    })

    it('lets a borrower access facilities its org borrows on', () => {
        expect(canAccessFacility({ role: 'BORROWER_USER', orgId: 'acme' }, facility)).toBe(true)
    })

    it('blocks a borrower from another borrower org or the lender side', () => {
        expect(canAccessFacility({ role: 'BORROWER_USER', orgId: 'other-co' }, facility)).toBe(false)
        expect(canAccessFacility({ role: 'BORROWER_USER', orgId: 'bank' }, facility)).toBe(false)
    })
})

describe('facilityScope', () => {
    it('filters lenders by lender org', () => {
        expect(facilityScope({ role: 'LENDER_ADMIN', orgId: 'bank' })).toEqual({ lenderOrgId: 'bank' })
        expect(facilityScope({ role: 'LENDER_USER', orgId: 'bank' })).toEqual({ lenderOrgId: 'bank' })
    })

    it('filters borrowers by borrower org', () => {
        expect(facilityScope({ role: 'BORROWER_USER', orgId: 'acme' })).toEqual({ borrowerOrgId: 'acme' })
    })
})

describe('borrowerScope', () => {
    it('limits borrowers to ones the lender added or lends to', () => {
        expect(borrowerScope({ role: 'LENDER_USER', orgId: 'bank' })).toEqual({
            type: 'BORROWER',
            OR: [
                { createdByOrgId: 'bank' },
                { borrowerFacilities: { some: { lenderOrgId: 'bank' } } },
            ],
        })
    })
})

describe('organizationScope', () => {
    it('gives lenders their own org plus their borrowers', () => {
        const session = { role: 'LENDER_USER', orgId: 'bank' }
        expect(organizationScope(session)).toEqual({ OR: [{ id: 'bank' }, borrowerScope(session)] })
    })

    it('gives borrowers only their own org', () => {
        expect(organizationScope({ role: 'BORROWER_USER', orgId: 'acme' })).toEqual({ id: 'acme' })
    })
})
