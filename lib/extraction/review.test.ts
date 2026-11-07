import { describe, expect, it } from 'vitest'
import { formatMetricFormula, formatThreshold, requiredStatus, reviewActionSchema, reviewDecision, type ReviewableCovenant } from './review'

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

describe('reviewActionSchema', () => {
    it('accepts approve, reject and restore only', () => {
        expect(reviewActionSchema.safeParse({ action: 'approve' }).success).toBe(true)
        expect(reviewActionSchema.safeParse({ action: 'reject' }).success).toBe(true)
        expect(reviewActionSchema.safeParse({ action: 'restore' }).success).toBe(true)
        expect(reviewActionSchema.safeParse({ action: 'delete' }).success).toBe(false)
        expect(reviewActionSchema.safeParse({}).success).toBe(false)
    })
})
