import { describe, expect, it } from 'vitest'
import {
    DEFAULT_REPORT_PARAMS,
    hasReportFilters,
    parseReportParams,
    reportOrderBy,
    reportPageCount,
    reportQuery,
    reportSortHref,
    reportWhere,
    reportsHref,
} from './list'

const scope = { lenderOrgId: 'org-1' }

describe('parseReportParams', () => {
    it('uses defaults when nothing is given', () => {
        expect(parseReportParams({})).toEqual(DEFAULT_REPORT_PARAMS)
    })

    it('reads valid values', () => {
        expect(parseReportParams({
            q: ' leverage ', status: 'OVERDUE', type: 'FINANCIAL', rag: 'RED',
            from: '2026-01-01', to: '2026-03-31', sort: 'facility', dir: 'desc', page: '2',
        })).toEqual({
            q: 'leverage', status: 'OVERDUE', type: 'FINANCIAL', rag: 'RED',
            from: '2026-01-01', to: '2026-03-31', sort: 'facility', dir: 'desc', page: 2,
        })
    })

    it('ignores invalid values', () => {
        expect(parseReportParams({
            status: 'overdue', type: 'X', rag: 'BLUE', from: '2026-02-30', to: 'yesterday',
            sort: 'password', dir: 'up', page: '0',
        })).toEqual(DEFAULT_REPORT_PARAMS)
    })

    it('takes the first value of repeated params', () => {
        expect(parseReportParams({ status: ['WAIVED', 'PENDING'] }).status).toBe('WAIVED')
    })
})

describe('reportWhere', () => {
    it('only scopes when there are no filters', () => {
        expect(reportWhere(scope, DEFAULT_REPORT_PARAMS)).toEqual({ facility: scope })
    })

    it('applies every filter, with an inclusive end date', () => {
        const where = reportWhere(scope, {
            ...DEFAULT_REPORT_PARAMS, q: 'acme', status: 'PENDING', type: 'ESG', rag: 'AMBER', from: '2026-01-01', to: '2026-01-31',
        })
        expect(where).toEqual({
            facility: scope,
            status: 'PENDING',
            covenant: { type: 'ESG' },
            ragStatus: 'AMBER',
            dueDate: { gte: new Date('2026-01-01T00:00:00Z'), lt: new Date('2026-02-01T00:00:00Z') },
            OR: [
                { covenant: { title: { contains: 'acme', mode: 'insensitive' } } },
                { facility: { name: { contains: 'acme', mode: 'insensitive' } } },
                { facility: { borrower: { name: { contains: 'acme', mode: 'insensitive' } } } },
            ],
        })
    })
})

describe('reportOrderBy', () => {
    it('breaks ties by due date then id', () => {
        expect(reportOrderBy('facility', 'desc')).toEqual([{ facility: { name: 'desc' } }, { dueDate: 'asc' }, { id: 'asc' }])
        expect(reportOrderBy('due', 'asc')).toEqual([{ dueDate: 'asc' }, { id: 'asc' }])
    })
})

describe('links', () => {
    const current = { ...DEFAULT_REPORT_PARAMS, status: 'OVERDUE' as const, page: 3 }

    it('keeps filters and resets the page when a filter changes', () => {
        expect(reportsHref(current, { rag: 'RED' })).toBe('/reports?status=OVERDUE&rag=RED')
        expect(reportsHref(current, { status: undefined })).toBe('/reports')
    })

    it('keeps the page when paging', () => {
        expect(reportsHref(current, { page: 4 })).toBe('/reports?status=OVERDUE&page=4')
    })

    it('flips direction on the active column and starts new columns ascending', () => {
        expect(reportSortHref(DEFAULT_REPORT_PARAMS, 'due')).toBe('/reports?sort=due&dir=desc')
        expect(reportSortHref({ ...DEFAULT_REPORT_PARAMS, sort: 'due', dir: 'desc' }, 'due')).toBe('/reports')
        expect(reportSortHref(DEFAULT_REPORT_PARAMS, 'status')).toBe('/reports?sort=status&dir=asc')
    })

    it('leaves the page out of the export query', () => {
        expect(reportQuery(current, { withPage: false })).toBe('status=OVERDUE')
    })
})

describe('helpers', () => {
    it('counts pages and spots active filters', () => {
        expect(reportPageCount(0)).toBe(1)
        expect(reportPageCount(21)).toBe(3)
        expect(hasReportFilters(DEFAULT_REPORT_PARAMS)).toBe(false)
        expect(hasReportFilters({ ...DEFAULT_REPORT_PARAMS, to: '2026-01-01' })).toBe(true)
    })
})
