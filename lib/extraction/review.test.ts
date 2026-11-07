import { describe, expect, it } from 'vitest'
import { UNDATED_STEP_DOWN_ERROR, formatMetricFormula, formatThreshold, requiredStatus, reviewActionSchema, reviewDecision, reviewEditsSchema, type ReviewableCovenant } from './review'

const pending: ReviewableCovenant = {
    status: 'PENDING',
    name: 'Maximum Total Net Leverage Ratio',
    operator: '<=',
    limit: 5.75,
    stepDowns: null,
    numerator: 'Consolidated Total Net Debt',
    denominator: 'Consolidated EBITDA',
    quote: 'shall not permit the Total Net Leverage Ratio to exceed 5.75 to 1.00',
}

describe('formatThreshold', () => {
    it('joins operator and limit', () => {
        expect(formatThreshold('<=', 5.75)).toBe('<= 5.75')
        expect(formatThreshold('>=', 3)).toBe('>= 3')
        expect(formatThreshold('<', 3.5)).toBe('< 3.5')
    })
})

describe('formatMetricFormula', () => {
    it('writes numerator / denominator', () => {
        expect(formatMetricFormula('Total Debt', 'EBITDA')).toBe('Total Debt / EBITDA')
    })

    it('falls back to whichever side is present, or nothing', () => {
        expect(formatMetricFormula('Total Debt', null)).toBe('Total Debt')
        expect(formatMetricFormula(null, ' EBITDA ')).toBe('EBITDA')
        expect(formatMetricFormula(null, null)).toBeUndefined()
        expect(formatMetricFormula(' ', '')).toBeUndefined()
    })
})

describe('reviewDecision', () => {
    it('approves a pending item into a financial covenant', () => {
        expect(reviewDecision(pending, 'approve')).toEqual({
            ok: true,
            status: 'APPROVED',
            covenant: {
                title: 'Maximum Total Net Leverage Ratio',
                type: 'FINANCIAL',
                frequency: 'QUARTERLY',
                graceDays: 0,
                ownerRole: 'BORROWER',
                importance: 'MEDIUM',
                metricFormula: 'Consolidated Total Net Debt / Consolidated EBITDA',
                thresholdCondition: '<= 5.75',
                description: pending.quote,
            },
        })
    })

    it('carries step-downs onto the covenant', () => {
        const stepDowns = [{ from: 'June 30, 2027', limit: 5.25 }]
        const result = reviewDecision({ ...pending, stepDowns }, 'approve')
        expect(result.ok && result.covenant?.stepDowns).toEqual(stepDowns)
    })

    it("applies the reviewer's edits over the extraction", () => {
        const result = reviewDecision({ ...pending, stepDowns: [{ from: 'Q3 2027', limit: 5.25 }] }, 'approve', {
            name: 'Total Net Leverage',
            frequency: 'ANNUAL',
            operator: '<',
            limit: 5.5,
            stepDowns: [{ from: '2027-09-30', limit: 5 }],
        })
        expect(result.ok && result.covenant).toMatchObject({
            title: 'Total Net Leverage',
            frequency: 'ANNUAL',
            thresholdCondition: '< 5.5',
            stepDowns: [{ from: '2027-09-30', limit: 5 }],
        })
    })

    it('can clear step-downs, and keeps extracted values for fields not edited', () => {
        const result = reviewDecision({ ...pending, stepDowns: [{ from: '2027-09-30', limit: 5 }] }, 'approve', { stepDowns: [], limit: 6 })
        expect(result.ok && result.covenant).toMatchObject({ title: pending.name, frequency: 'QUARTERLY', thresholdCondition: '<= 6' })
        expect(result.ok && result.covenant?.stepDowns).toBeUndefined()
    })

    it('refuses to approve a step-down without a usable date, unless the edits date it', () => {
        const undated = { ...pending, stepDowns: [{ from: 'Q3 2027', limit: 5.25 }] }
        expect(reviewDecision(undated, 'approve')).toEqual({ ok: false, error: UNDATED_STEP_DOWN_ERROR })
        expect(reviewDecision(undated, 'approve', { stepDowns: [{ from: '2027-09-30', limit: 5.25 }] }).ok).toBe(true)
        expect(reviewDecision(undated, 'approve', { stepDowns: [] }).ok).toBe(true)
        expect(reviewDecision(undated, 'reject').ok).toBe(true)
    })

    it('leaves metricFormula out when the extraction had no terms', () => {
        const result = reviewDecision({ ...pending, numerator: null, denominator: null }, 'approve')
        expect(result.ok && result.covenant?.metricFormula).toBeUndefined()
    })

    it('rejects a pending item without a covenant', () => {
        expect(reviewDecision(pending, 'reject')).toEqual({ ok: true, status: 'REJECTED', covenant: null })
    })

    it('refuses items that were already reviewed', () => {
        expect(reviewDecision({ ...pending, status: 'APPROVED' }, 'approve')).toEqual({ ok: false, error: 'Already approved' })
        expect(reviewDecision({ ...pending, status: 'APPROVED' }, 'reject')).toEqual({ ok: false, error: 'Already approved' })
        expect(reviewDecision({ ...pending, status: 'REJECTED' }, 'approve')).toEqual({ ok: false, error: 'Already rejected' })
    })

    it('restores only rejected items, back to pending', () => {
        expect(reviewDecision({ ...pending, status: 'REJECTED' }, 'restore')).toEqual({ ok: true, status: 'PENDING', covenant: null })
        expect(reviewDecision(pending, 'restore')).toEqual({ ok: false, error: 'Already waiting for review' })
        expect(reviewDecision({ ...pending, status: 'APPROVED' }, 'restore')).toEqual({ ok: false, error: 'Only rejected items can be restored' })
        expect(requiredStatus('restore')).toBe('REJECTED')
        expect(requiredStatus('approve')).toBe('PENDING')
    })
})

describe('reviewEditsSchema', () => {
    it('accepts valid edits and rejects bad ones', () => {
        expect(reviewEditsSchema.safeParse({ name: ' Leverage ', frequency: 'MONTHLY', operator: '>=', limit: 1.25 }).data)
            .toEqual({ name: 'Leverage', frequency: 'MONTHLY', operator: '>=', limit: 1.25 })
        expect(reviewEditsSchema.safeParse({}).success).toBe(true)
        expect(reviewEditsSchema.safeParse({ name: ' ' }).success).toBe(false)
        expect(reviewEditsSchema.safeParse({ frequency: 'EVENT_DRIVEN' }).success).toBe(false)
        expect(reviewEditsSchema.safeParse({ operator: '=' }).success).toBe(false)
        expect(reviewEditsSchema.safeParse({ limit: 0 }).success).toBe(false)
        expect(reviewEditsSchema.safeParse({ stepDowns: [{ from: 'Q3 2027', limit: 4 }] }).success).toBe(false)
        expect(reviewEditsSchema.safeParse({ stepDowns: [{ from: '2027-09-30', limit: 4 }] }).success).toBe(true)
    })
})

describe('reviewActionSchema', () => {
    it('accepts approve, reject and restore only', () => {
        expect(reviewActionSchema.safeParse({ action: 'approve' }).success).toBe(true)
        expect(reviewActionSchema.safeParse({ action: 'reject' }).success).toBe(true)
        expect(reviewActionSchema.safeParse({ action: 'restore' }).success).toBe(true)
        expect(reviewActionSchema.safeParse({ action: 'delete' }).success).toBe(false)
        expect(reviewActionSchema.safeParse({}).success).toBe(false)
    })
})
