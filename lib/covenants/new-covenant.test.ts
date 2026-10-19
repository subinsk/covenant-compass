import { describe, expect, it } from 'vitest'
import { buildCovenantRequestBody } from './new-covenant'

describe('buildCovenantRequestBody', () => {
    it('sends the suggested title as title', () => {
        const body = buildCovenantRequestBody({
            suggestedTitle: 'Leverage Ratio',
            type: 'FINANCIAL',
            frequency: 'QUARTERLY',
            dueRule: '45 days after period end',
            graceDays: 0,
            importance: 'MEDIUM',
            category: 'Financials',
            metricFormula: 'NetDebt / EBITDA',
            thresholdCondition: '<= 4.0',
        })
        expect(body).toEqual({
            title: 'Leverage Ratio',
            type: 'FINANCIAL',
            frequency: 'QUARTERLY',
            dueRule: '45 days after period end',
            graceDays: 0,
            importance: 'MEDIUM',
            category: 'Financials',
            metricFormula: 'NetDebt / EBITDA',
            thresholdCondition: '<= 4.0',
        })
        expect(body).not.toHaveProperty('suggestedTitle')
    })

    it('prefers an explicit title and trims whitespace', () => {
        expect(buildCovenantRequestBody({ title: '  Interest Cover ', suggestedTitle: 'Other' }).title).toBe('Interest Cover')
    })

    it('falls back to the defaults shown in the form', () => {
        const body = buildCovenantRequestBody({})
        expect(body.title).toBe('')
        expect(body.type).toBe('FINANCIAL')
        expect(body.frequency).toBe('QUARTERLY')
        expect(body.graceDays).toBe(0)
    })

    it('turns empty strings into undefined', () => {
        const body = buildCovenantRequestBody({ suggestedTitle: 'X', dueRule: '', category: '  ' })
        expect(body.dueRule).toBeUndefined()
        expect(body.category).toBeUndefined()
    })

    it('parses grace days from a string and rejects junk', () => {
        expect(buildCovenantRequestBody({ graceDays: '5' }).graceDays).toBe(5)
        expect(buildCovenantRequestBody({ graceDays: 'abc' }).graceDays).toBe(0)
        expect(buildCovenantRequestBody({ graceDays: -3 }).graceDays).toBe(0)
    })

    it('drops formula and threshold for non-financial covenants', () => {
        const body = buildCovenantRequestBody({
            suggestedTitle: 'Annual Accounts',
            type: 'REPORTING',
            metricFormula: 'NetDebt / EBITDA',
            thresholdCondition: '<= 4.0',
        })
        expect(body.metricFormula).toBeUndefined()
        expect(body.thresholdCondition).toBeUndefined()
    })
})
