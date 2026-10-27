import type { FacilityStatus, Prisma } from '@prisma/client'

// Search, filter, sort and paging for the facilities list, all carried in the URL.

export const PAGE_SIZE = 10

export const FACILITY_STATUSES: FacilityStatus[] = ['ACTIVE', 'MATURED', 'DEFAULTED']

export const FACILITY_SORTS = ['name', 'borrower', 'commitment', 'status', 'covenants', 'updated'] as const
export type FacilitySort = (typeof FACILITY_SORTS)[number]
export type SortDir = 'asc' | 'desc'

export type FacilityListParams = {
    q: string
    status?: FacilityStatus
    sort: FacilitySort
    dir: SortDir
    page: number
}

export const DEFAULT_PARAMS: FacilityListParams = { q: '', sort: 'updated', dir: 'desc', page: 1 }

type RawParams = Record<string, string | string[] | undefined>

function first(value: string | string[] | undefined): string | undefined {
    return Array.isArray(value) ? value[0] : value
}

export function parseFacilityListParams(raw: RawParams): FacilityListParams {
    const status = FACILITY_STATUSES.find(s => s === first(raw.status))
    const sort = FACILITY_SORTS.find(s => s === first(raw.sort)) ?? DEFAULT_PARAMS.sort
    const dir = first(raw.dir) === 'asc' ? 'asc' : first(raw.dir) === 'desc' ? 'desc' : DEFAULT_PARAMS.dir
    const page = Number.parseInt(first(raw.page) ?? '', 10)
    return {
        q: (first(raw.q) ?? '').trim().slice(0, 100),
        status,
        sort,
        dir,
        page: Number.isFinite(page) && page > 0 ? page : 1,
    }
}

// Search matches facility name, reference or borrower name. Status is left out
// so the page can count each status for the filter chips.
export function facilitySearchWhere(scope: Prisma.FacilityWhereInput, q: string): Prisma.FacilityWhereInput {
    if (!q) return scope
    return {
        ...scope,
        OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { facilityReference: { contains: q, mode: 'insensitive' } },
            { borrower: { name: { contains: q, mode: 'insensitive' } } },
        ],
    }
}

export function facilityOrderBy(sort: FacilitySort, dir: SortDir): Prisma.FacilityOrderByWithRelationInput[] {
    const primary: Record<FacilitySort, Prisma.FacilityOrderByWithRelationInput> = {
        name: { name: dir },
        borrower: { borrower: { name: dir } },
        commitment: { totalCommitment: dir },
        status: { status: dir },
        covenants: { covenants: { _count: dir } },
        updated: { updatedAt: dir },
    }
    // Tie-break on id so paging is stable.
    return [primary[sort], { id: 'asc' }]
}

export function pageCount(total: number): number {
    return Math.max(1, Math.ceil(total / PAGE_SIZE))
}

// Builds a /facilities link, leaving out values that match the defaults.
// Changing anything but the page sends you back to page 1.
export function facilitiesHref(current: FacilityListParams, changes: Partial<FacilityListParams>): string {
    const next = { ...current, ...changes }
    if (!('page' in changes)) next.page = 1

    const query = new URLSearchParams()
    if (next.q) query.set('q', next.q)
    if (next.status) query.set('status', next.status)
    if (next.sort !== DEFAULT_PARAMS.sort || next.dir !== DEFAULT_PARAMS.dir) {
        query.set('sort', next.sort)
        query.set('dir', next.dir)
    }
    if (next.page > 1) query.set('page', String(next.page))

    const qs = query.toString()
    return qs ? `/facilities?${qs}` : '/facilities'
}

// Clicking the active column flips direction; a new column starts ascending,
// except dates and numbers which start with the largest first.
export function sortHref(current: FacilityListParams, sort: FacilitySort): string {
    const dir: SortDir = current.sort === sort
        ? (current.dir === 'asc' ? 'desc' : 'asc')
        : (sort === 'updated' || sort === 'commitment' || sort === 'covenants' ? 'desc' : 'asc')
    return facilitiesHref(current, { sort, dir })
}
