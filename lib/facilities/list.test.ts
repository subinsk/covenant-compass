import { describe, expect, it } from 'vitest'
import {
    DEFAULT_PARAMS,
    facilitiesHref,
    facilityOrderBy,
    facilitySearchWhere,
    pageCount,
    parseFacilityListParams,
    sortHref,
} from './list'

describe('parseFacilityListParams', () => {
    it('uses defaults when nothing is given', () => {
        expect(parseFacilityListParams({})).toEqual(DEFAULT_PARAMS)
    })

    it('reads valid values', () => {
        expect(parseFacilityListParams({ q: ' acme ', status: 'MATURED', sort: 'name', dir: 'asc', page: '3' })).toEqual({
            q: 'acme',
            status: 'MATURED',
            sort: 'name',
            dir: 'asc',
            page: 3,
        })
    })

    it('ignores invalid values', () => {
        expect(parseFacilityListParams({ status: 'active', sort: 'password', dir: 'up', page: '-2' })).toEqual(DEFAULT_PARAMS)
        expect(parseFacilityListParams({ page: 'abc' }).page).toBe(1)
    })

    it('takes the first of repeated values', () => {
        expect(parseFacilityListParams({ status: ['DEFAULTED', 'ACTIVE'] }).status).toBe('DEFAULTED')
    })
})

describe('facilitySearchWhere', () => {
    const scope = { lenderOrgId: 'org-1' }

    it('returns the scope unchanged without a query', () => {
        expect(facilitySearchWhere(scope, '')).toBe(scope)
    })

    it('keeps the scope when searching', () => {
        const where = facilitySearchWhere(scope, 'acme')
        expect(where.lenderOrgId).toBe('org-1')
        expect(where.OR).toHaveLength(3)
    })
})

describe('facilityOrderBy', () => {
    it('tie-breaks on id for stable paging', () => {
        expect(facilityOrderBy('borrower', 'desc')).toEqual([{ borrower: { name: 'desc' } }, { id: 'asc' }])
    })
})

describe('pageCount', () => {
    it('never returns less than one page', () => {
        expect(pageCount(0)).toBe(1)
        expect(pageCount(10)).toBe(1)
        expect(pageCount(11)).toBe(2)
    })
})

describe('facilitiesHref', () => {
    it('leaves defaults out of the URL', () => {
        expect(facilitiesHref(DEFAULT_PARAMS, {})).toBe('/facilities')
    })

    it('resets to page 1 when a filter changes', () => {
        const current = { ...DEFAULT_PARAMS, page: 4 }
        expect(facilitiesHref(current, { status: 'ACTIVE' })).toBe('/facilities?status=ACTIVE')
    })

    it('keeps search, filter and sort when paging', () => {
        const current = { ...DEFAULT_PARAMS, q: 'a&b', status: 'ACTIVE' as const, sort: 'name' as const, dir: 'asc' as const }
        expect(facilitiesHref(current, { page: 2 })).toBe('/facilities?q=a%26b&status=ACTIVE&sort=name&dir=asc&page=2')
    })
})

describe('sortHref', () => {
    it('flips direction on the active column', () => {
        const current = { ...DEFAULT_PARAMS, sort: 'name' as const, dir: 'asc' as const }
        expect(sortHref(current, 'name')).toBe('/facilities?sort=name&dir=desc')
    })

    it('starts text columns ascending and number columns descending', () => {
        expect(sortHref(DEFAULT_PARAMS, 'borrower')).toBe('/facilities?sort=borrower&dir=asc')
        expect(sortHref(DEFAULT_PARAMS, 'commitment')).toBe('/facilities?sort=commitment&dir=desc')
    })
})
