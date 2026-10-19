import { describe, expect, it } from 'vitest'
import { canAccessFacility, isLender } from './access'

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
