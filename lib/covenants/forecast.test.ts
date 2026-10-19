import { describe, expect, it } from 'vitest'
import { addMonths, forecastBreach, headroomSeries } from './forecast'

const leverage = { operator: '<=' as const, limit: 5 }

describe('headroomSeries', () => {
    it('tests each period against the limit in force on its date', () => {
        const terms = { ...leverage, stepDowns: [{ from: '2025-06-30', limit: 4.5 }] }
        const series = headroomSeries([
            { periodEnd: '2025-06-30', value: 4.6 },
            { periodEnd: '2025-03-31', value: 4.6 },
        ], terms)
        expect(series.map((p) => p.periodEnd)).toEqual(['2025-03-31', '2025-06-30'])
        expect(series[0]).toMatchObject({ applicableLimit: 5, compliant: true })
        expect(series[1]).toMatchObject({ applicableLimit: 4.5, compliant: false })
        expect(series[1].headroom).toBeCloseTo(-0.1)
    })
})

describe('addMonths', () => {
    it('keeps quarter ends at month end', () => {
        expect(addMonths('2025-03-31', 3)).toBe('2025-06-30')
        expect(addMonths('2025-06-30', 3)).toBe('2025-09-30')
        expect(addMonths('2025-09-30', 3)).toBe('2025-12-31')
        expect(addMonths('2025-12-31', 3)).toBe('2026-03-31')
        expect(addMonths('2023-11-30', 3)).toBe('2024-02-29')
    })

    it('clamps days that are not month end', () => {
        expect(addMonths('2025-01-15', 1)).toBe('2025-02-15')
        expect(addMonths('2025-01-30', 1)).toBe('2025-02-28')
    })
})

describe('forecastBreach', () => {
    it('finds a breach two quarters out on rising leverage', () => {
        const forecast = forecastBreach([
            { periodEnd: '2024-09-30', value: 4.1 },
            { periodEnd: '2024-12-31', value: 4.3 },
            { periodEnd: '2025-03-31', value: 4.5 },
            { periodEnd: '2025-06-30', value: 4.7 },
        ], leverage)!
        expect(forecast.trendPerQuarter).toBeCloseTo(0.2)
        expect(forecast.confidence).toBe('medium')
        expect(forecast.projections.map((p) => p.periodEnd)).toEqual(['2025-09-30', '2025-12-31', '2026-03-31', '2026-06-30'])
        expect(forecast.projections[0].compliant).toBe(true)
        expect(forecast.firstBreach?.periodEnd).toBe('2025-12-31')
        expect(forecast.firstBreach?.projectedValue).toBeCloseTo(5.1)
        expect(forecast.firstBreach?.limit).toBe(5)
    })

    it('finds no breach on a flat series', () => {
        const points = ['2024-12-31', '2025-03-31', '2025-06-30', '2025-09-30'].map((periodEnd) => ({ periodEnd, value: 4 }))
        const forecast = forecastBreach(points, leverage)!
        expect(forecast.trendPerQuarter).toBe(0)
        expect(forecast.firstBreach).toBeNull()
        expect(forecast.confidence).toBe('medium')
    })

    it('finds a breach caused by a step-down even with flat values', () => {
        const points = ['2024-12-31', '2025-03-31', '2025-06-30', '2025-09-30'].map((periodEnd) => ({ periodEnd, value: 4.6 }))
        const terms = { ...leverage, stepDowns: [{ from: 'fiscal quarter ending March 31, 2026', limit: 4.5 }] }
        const forecast = forecastBreach(points, terms)!
        expect(forecast.projections[0]).toMatchObject({ periodEnd: '2025-12-31', limit: 5, compliant: true })
        expect(forecast.firstBreach).toEqual({ periodEnd: '2026-03-31', projectedValue: 4.6, limit: 4.5 })
    })

    it('gives no forecast with fewer than 3 points', () => {
        expect(forecastBreach([
            { periodEnd: '2025-03-31', value: 4 },
            { periodEnd: '2025-06-30', value: 4.5 },
        ], leverage)).toBeNull()
    })

    it('reports low confidence with 3 points or a noisy series', () => {
        const three = forecastBreach([
            { periodEnd: '2025-03-31', value: 4 },
            { periodEnd: '2025-06-30', value: 4.1 },
            { periodEnd: '2025-09-30', value: 4.2 },
        ], leverage)!
        expect(three.confidence).toBe('low')
        expect(three.projections).toHaveLength(4)

        const noisy = forecastBreach([
            { periodEnd: '2024-12-31', value: 4 },
            { periodEnd: '2025-03-31', value: 3 },
            { periodEnd: '2025-06-30', value: 4 },
            { periodEnd: '2025-09-30', value: 3 },
        ], leverage)!
        expect(noisy.confidence).toBe('low')
    })

    it('uses only the most recent quarters and respects periodsAhead', () => {
        const forecast = forecastBreach([
            { periodEnd: '2024-03-31', value: 9 },
            { periodEnd: '2024-06-30', value: 4 },
            { periodEnd: '2024-09-30', value: 4 },
            { periodEnd: '2024-12-31', value: 4 },
        ], leverage, { periodsAhead: 2, lookback: 3 })!
        expect(forecast.trendPerQuarter).toBe(0)
        expect(forecast.projections).toHaveLength(2)
    })
})
