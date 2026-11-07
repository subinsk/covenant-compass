import type { CovenantType, OccurrenceStatus, Prisma, RagStatus } from '@prisma/client'

// Search, filters, sort and paging for the reports schedule, all carried in the URL.
// The CSV export reads the same params so it downloads exactly what the page shows.

export const REPORT_PAGE_SIZE = 10

export const OCCURRENCE_STATUSES: OccurrenceStatus[] = ['PENDING', 'OVERDUE', 'COMPLETED', 'WAIVED']
export const COVENANT_TYPES: CovenantType[] = ['FINANCIAL', 'REPORTING', 'GENERAL', 'ESG']
export const RAG_STATUSES: RagStatus[] = ['RED', 'AMBER', 'GREEN']

export const REPORT_SORTS = ['due', 'facility', 'covenant', 'status'] as const
export type ReportSort = (typeof REPORT_SORTS)[number]
export type SortDir = 'asc' | 'desc'

export type ReportParams = {
    q: string
    status?: OccurrenceStatus
    type?: CovenantType
    rag?: RagStatus
    from?: string // YYYY-MM-DD, due on or after
    to?: string // YYYY-MM-DD, due on or before
    sort: ReportSort
    dir: SortDir
    page: number
}

export const DEFAULT_REPORT_PARAMS: ReportParams = { q: '', sort: 'due', dir: 'asc', page: 1 }

type RawParams = Record<string, string | string[] | undefined>

function first(value: string | string[] | undefined): string | undefined {
    return Array.isArray(value) ? value[0] : value
}

function pick<T extends string>(options: readonly T[], value: string | undefined): T | undefined {
    return options.find(o => o === value)
}

// A real calendar date in YYYY-MM-DD form, or undefined.
function isoDay(value: string | undefined): string | undefined {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined
    const date = new Date(`${value}T00:00:00Z`)
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : undefined
}

export function parseReportParams(raw: RawParams): ReportParams {
    const dir = first(raw.dir)
    const page = Number.parseInt(first(raw.page) ?? '', 10)
    return {
        q: (first(raw.q) ?? '').trim().slice(0, 100),
        status: pick(OCCURRENCE_STATUSES, first(raw.status)),
        type: pick(COVENANT_TYPES, first(raw.type)),
        rag: pick(RAG_STATUSES, first(raw.rag)),
        from: isoDay(first(raw.from)),
        to: isoDay(first(raw.to)),
        sort: pick(REPORT_SORTS, first(raw.sort)) ?? DEFAULT_REPORT_PARAMS.sort,
        dir: dir === 'asc' || dir === 'desc' ? dir : DEFAULT_REPORT_PARAMS.dir,
        page: Number.isFinite(page) && page > 0 ? page : 1,
    }
}

// Everything except status, so the page can count each status for the filter chips.
export function reportBaseWhere(scope: Prisma.FacilityWhereInput, params: ReportParams): Prisma.CovenantOccurrenceWhereInput {
    const where: Prisma.CovenantOccurrenceWhereInput = { facility: scope }
    if (params.type) where.covenant = { type: params.type }
    if (params.rag) where.ragStatus = params.rag
    if (params.from || params.to) {
        where.dueDate = {
            ...(params.from && { gte: new Date(`${params.from}T00:00:00Z`) }),
            // "to" is inclusive: anything before the start of the next day.
            ...(params.to && { lt: new Date(Date.parse(`${params.to}T00:00:00Z`) + 86_400_000) }),
        }
    }
    if (params.q) {
        where.OR = [
            { covenant: { title: { contains: params.q, mode: 'insensitive' } } },
            { facility: { name: { contains: params.q, mode: 'insensitive' } } },
            { facility: { borrower: { name: { contains: params.q, mode: 'insensitive' } } } },
        ]
    }
    return where
}

export function reportWhere(scope: Prisma.FacilityWhereInput, params: ReportParams): Prisma.CovenantOccurrenceWhereInput {
    const where = reportBaseWhere(scope, params)
    return params.status ? { ...where, status: params.status } : where
}

export function reportOrderBy(sort: ReportSort, dir: SortDir): Prisma.CovenantOccurrenceOrderByWithRelationInput[] {
    const primary: Record<ReportSort, Prisma.CovenantOccurrenceOrderByWithRelationInput> = {
        due: { dueDate: dir },
        facility: { facility: { name: dir } },
        covenant: { covenant: { title: dir } },
        status: { status: dir },
    }
    // Then by due date and id so paging is stable.
    return [primary[sort], ...(sort === 'due' ? [] : [{ dueDate: 'asc' as const }]), { id: 'asc' }]
}

export function reportPageCount(total: number): number {
    return Math.max(1, Math.ceil(total / REPORT_PAGE_SIZE))
}

// Query string for the given params, leaving out defaults.
export function reportQuery(params: ReportParams, { withPage = true } = {}): string {
    const query = new URLSearchParams()
    if (params.q) query.set('q', params.q)
    if (params.status) query.set('status', params.status)
    if (params.type) query.set('type', params.type)
    if (params.rag) query.set('rag', params.rag)
    if (params.from) query.set('from', params.from)
    if (params.to) query.set('to', params.to)
    if (params.sort !== DEFAULT_REPORT_PARAMS.sort || params.dir !== DEFAULT_REPORT_PARAMS.dir) {
        query.set('sort', params.sort)
        query.set('dir', params.dir)
    }
    if (withPage && params.page > 1) query.set('page', String(params.page))
    return query.toString()
}

// Builds a /reports link. Changing anything but the page goes back to page 1.
export function reportsHref(current: ReportParams, changes: Partial<ReportParams>): string {
    const next = { ...current, ...changes }
    if (!('page' in changes)) next.page = 1
    const qs = reportQuery(next)
    return qs ? `/reports?${qs}` : '/reports'
}

// Clicking the active column flips direction; a new column starts ascending.
export function reportSortHref(current: ReportParams, sort: ReportSort): string {
    const dir: SortDir = current.sort === sort && current.dir === 'asc' ? 'desc' : 'asc'
    return reportsHref(current, { sort, dir })
}

export function hasReportFilters(params: ReportParams): boolean {
    return Boolean(params.q || params.status || params.type || params.rag || params.from || params.to)
}
