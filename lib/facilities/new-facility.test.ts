import { describe, expect, it } from 'vitest'
import {
    buildFacilityRequestBody, buildFacilityUpdateBody, EMPTY_FACILITY_FORM, facilityFormErrors, facilityFormFrom, facilityUpdateErrors,
} from './new-facility'

const filled = {
    ...EMPTY_FACILITY_FORM,
    name: '  Term Loan B ',
    borrowerOrgId: 'org-1',
    currency: ' eur ',
    totalCommitment: '1,250,000.50',
    startDate: '2026-01-01',
    endDate: '2031-01-01',
}

describe('buildFacilityRequestBody', () => {
    it('trims text, upper-cases the currency and parses the amount', () => {
        expect(buildFacilityRequestBody(filled)).toEqual({
            name: 'Term Loan B',
            borrowerOrgId: 'org-1',
            facilityReference: undefined,
            currency: 'EUR',
            totalCommitment: 1250000.5,
            startDate: '2026-01-01',
            endDate: '2031-01-01',
            description: undefined,
        })
    })

    it('keeps optional fields when filled in', () => {
        const body = buildFacilityRequestBody({ ...filled, facilityReference: ' TLB-01 ', description: ' Senior secured ' })
        expect(body.facilityReference).toBe('TLB-01')
        expect(body.description).toBe('Senior secured')
    })

    it('leaves the amount out when blank or not a number', () => {
        expect(buildFacilityRequestBody({ ...filled, totalCommitment: '  ' }).totalCommitment).toBeUndefined()
        expect(buildFacilityRequestBody({ ...filled, totalCommitment: '12abc' }).totalCommitment).toBeUndefined()
    })
})

describe('facilityFormErrors', () => {
    it('accepts a complete form', () => {
        expect(facilityFormErrors(buildFacilityRequestBody(filled))).toEqual({})
    })

    it('flags every required field on an empty form', () => {
        const errors = facilityFormErrors(buildFacilityRequestBody({ ...EMPTY_FACILITY_FORM, currency: '' }))
        expect(Object.keys(errors).sort()).toEqual(
            ['borrowerOrgId', 'currency', 'endDate', 'name', 'startDate', 'totalCommitment'],
        )
    })

    it('rejects a non-positive commitment and a bad currency', () => {
        const errors = facilityFormErrors(buildFacilityRequestBody({ ...filled, totalCommitment: '0', currency: 'EURO' }))
        expect(errors.totalCommitment).toBe('Must be greater than zero')
        expect(errors.currency).toBe('Expected a 3-letter currency code')
    })

    it('requires the end date to be after the start date', () => {
        expect(facilityFormErrors(buildFacilityRequestBody({ ...filled, endDate: '2026-01-01' })).endDate)
            .toBe('End date must be after start date')
        expect(facilityFormErrors(buildFacilityRequestBody({ ...filled, endDate: '2025-12-31' })).endDate)
            .toBe('End date must be after start date')
    })
})

const stored = {
    name: 'Term Loan B',
    borrowerOrgId: 'org-1',
    facilityReference: 'TLB-01',
    currency: 'EUR',
    totalCommitment: '1250000.5',
    startDate: new Date('2026-01-01T00:00:00.000Z'),
    endDate: '2031-01-01T00:00:00.000Z',
    description: null,
    status: 'ACTIVE' as const,
}

describe('facilityFormFrom', () => {
    it('pre-fills the edit form with date-input values and blanks for nulls', () => {
        expect(facilityFormFrom(stored)).toEqual({
            ...stored,
            startDate: '2026-01-01',
            endDate: '2031-01-01',
            description: '',
        })
    })
})

describe('buildFacilityUpdateBody', () => {
    it('leaves the borrower out and sends the status and a blank description to clear it', () => {
        const body = buildFacilityUpdateBody({ ...facilityFormFrom(stored), status: 'MATURED', currency: ' usd ' })
        expect(body).toEqual({
            name: 'Term Loan B',
            facilityReference: 'TLB-01',
            currency: 'USD',
            totalCommitment: 1250000.5,
            startDate: '2026-01-01',
            endDate: '2031-01-01',
            description: '',
            status: 'MATURED',
        })
        expect(body).not.toHaveProperty('borrowerOrgId')
    })
})

describe('facilityUpdateErrors', () => {
    it('accepts an unchanged facility', () => {
        expect(facilityUpdateErrors(buildFacilityUpdateBody(facilityFormFrom(stored)))).toEqual({})
    })

    it('requires the reference and keeps the New Facility checks', () => {
        const errors = facilityUpdateErrors(buildFacilityUpdateBody({
            ...facilityFormFrom(stored), facilityReference: ' ', endDate: '2025-06-01', totalCommitment: '',
        }))
        expect(errors).toEqual({
            facilityReference: 'Required',
            endDate: 'End date must be after start date',
            totalCommitment: 'Enter an amount',
        })
    })
})
