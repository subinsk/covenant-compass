import { describe, expect, it } from 'vitest'
import { evalCompanies, isCompliant } from './companies'

describe('eval companies', () => {
    it('loads 15 companies with unique tickers', () => {
        expect(evalCompanies).toHaveLength(15)
        expect(new Set(evalCompanies.map((c) => c.ticker)).size).toBe(15)
    })

    it('points every source and agreement at SEC EDGAR', () => {
        for (const c of evalCompanies) {
            for (const url of [c.source, ...c.agreements]) {
                expect(url).toMatch(/^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\//)
            }
        }
    })

    it('flags TTEC as the only disclosed breach', () => {
        const breaches = evalCompanies.flatMap((c) =>
            c.covenants
                .filter((cov) => cov.actual !== null && !isCompliant(cov, cov.actual))
                .map((cov) => `${c.ticker}: ${cov.name}`),
        )
        expect(breaches).toEqual(['TTEC: Net Leverage Ratio'])
    })
})

describe('isCompliant', () => {
    it('handles each operator, including the boundary', () => {
        expect(isCompliant({ operator: '<=', limit: 4 }, 4)).toBe(true)
        expect(isCompliant({ operator: '<', limit: 4 }, 4)).toBe(false)
        expect(isCompliant({ operator: '>=', limit: 3 }, 3)).toBe(true)
        expect(isCompliant({ operator: '>', limit: 3 }, 3)).toBe(false)
    })
})
