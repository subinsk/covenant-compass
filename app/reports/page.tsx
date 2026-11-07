import { redirect } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'
import type { CovenantType, OccurrenceStatus, RagStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth/session'
import { facilityScope, isLender } from '@/lib/auth/access'
import { obligationWhere } from '@/lib/dashboard/filters'
import {
    COVENANT_TYPES,
    OCCURRENCE_STATUSES,
    RAG_STATUSES,
    REPORT_PAGE_SIZE,
    hasReportFilters,
    parseReportParams,
    reportBaseWhere,
    reportOrderBy,
    reportPageCount,
    reportQuery,
    reportSortHref,
    reportWhere,
    reportsHref,
    type ReportParams,
    type ReportSort,
} from '@/lib/reports/list'
import { Card, CardContent, CardHeader, CardTitle, Badge, cn } from '@/components/ui/core'
import { FacilitySearch } from '@/components/features/FacilitySearch'
import { ReportFilters } from '@/components/features/ReportFilters'
import { LinkPagination } from '@/components/ui/LinkPagination'
import { ArrowDown, ArrowUp, ArrowUpDown, Download, SearchX } from 'lucide-react'

const STATUS_LABEL: Record<OccurrenceStatus, string> = {
    PENDING: 'Pending',
    OVERDUE: 'Overdue',
    COMPLETED: 'Completed',
    WAIVED: 'Waived',
}

const STATUS_BADGE = {
    PENDING: 'outline',
    OVERDUE: 'destructive',
    COMPLETED: 'success',
    WAIVED: 'secondary',
} as const

const TYPE_LABEL: Record<CovenantType, string> = {
    FINANCIAL: 'Financial',
    REPORTING: 'Reporting',
    GENERAL: 'General',
    ESG: 'ESG',
}

const RAG_LABEL: Record<RagStatus, string> = { RED: 'Red', AMBER: 'Amber', GREEN: 'Green' }
const RAG_BADGE = { RED: 'destructive', AMBER: 'warning', GREEN: 'success' } as const
const RAG_DOT: Record<RagStatus, string> = { RED: 'bg-red-500', AMBER: 'bg-amber-500', GREEN: 'bg-emerald-500' }

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
    const session = await getSession()
    if (!session) redirect('/login')
    if (!isLender(session)) redirect('/portal')

    const scope = facilityScope(session)
    const params = parseReportParams(await searchParams)

    // Counts per status for the filter chips, within the other filters.
    const [statusGroups, totalAll, overdueAll, comingDue] = await Promise.all([
        prisma.covenantOccurrence.groupBy({ by: ['status'], where: reportBaseWhere(scope, params), _count: true }),
        prisma.covenantOccurrence.count({ where: { facility: scope } }),
        prisma.covenantOccurrence.count({ where: obligationWhere('overdue', scope, new Date()) }),
        prisma.covenantOccurrence.count({ where: obligationWhere('upcoming', scope, new Date()) }),
    ])
    const statusCounts = Object.fromEntries(statusGroups.map(g => [g.status, g._count])) as Partial<Record<OccurrenceStatus, number>>
    const allCount = statusGroups.reduce((sum, g) => sum + g._count, 0)
    const total = params.status ? statusCounts[params.status] ?? 0 : allCount

    const totalPages = reportPageCount(total)
    const page = Math.min(params.page, totalPages)
    const current = { ...params, page }

    const occurrences = await prisma.covenantOccurrence.findMany({
        where: reportWhere(scope, params),
        orderBy: reportOrderBy(params.sort, params.dir),
        skip: (page - 1) * REPORT_PAGE_SIZE,
        take: REPORT_PAGE_SIZE,
        include: {
            facility: { select: { id: true, name: true, borrower: { select: { name: true } } } },
            covenant: { select: { title: true, type: true, frequency: true } },
        },
    })

    const from = total === 0 ? 0 : (page - 1) * REPORT_PAGE_SIZE + 1
    const to = Math.min(page * REPORT_PAGE_SIZE, total)
    const exportQuery = reportQuery(current, { withPage: false })
    const filtered = hasReportFilters(params)

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between animate-fade-up">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Compliance Reports</h1>
                    <p className="mt-1 text-sm text-muted-foreground">Every obligation across your facilities.</p>
                </div>
                <a
                    href={exportQuery ? `/api/reports/export?${exportQuery}` : '/api/reports/export'}
                    download
                    className="inline-flex h-10 items-center justify-center self-start rounded-md border border-input bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:self-auto"
                >
                    <Download className="w-4 h-4 mr-2" />
                    {filtered ? 'Export filtered CSV' : 'Export CSV'}
                </a>
            </div>

            <div className="grid gap-4 sm:grid-cols-3 animate-fade-up" style={{ animationDelay: '60ms' }}>
                <Kpi label="Total Obligations" value={totalAll} />
                <Kpi label="Overdue" value={overdueAll} className="text-destructive" />
                <Kpi label="Coming Due (30d)" value={comingDue} className="text-amber-500" />
            </div>

            <Card className="overflow-hidden animate-fade-up" style={{ animationDelay: '120ms' }}>
                <CardHeader className="space-y-4 border-b">
                    <CardTitle>Master Compliance Schedule</CardTitle>
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                        <FacilitySearch placeholder="Search covenant, facility or borrower" label="Search obligations" />
                        <ReportFilters
                            types={COVENANT_TYPES.map(t => ({ value: t, label: TYPE_LABEL[t] }))}
                            rags={RAG_STATUSES.map(r => ({ value: r, label: RAG_LABEL[r], dot: RAG_DOT[r] }))}
                        />
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <nav className="flex flex-wrap gap-2" aria-label="Filter by status">
                            <FilterChip href={reportsHref(current, { status: undefined })} active={!params.status} label="All" count={allCount} />
                            {OCCURRENCE_STATUSES.map(s => (
                                <FilterChip key={s} href={reportsHref(current, { status: s })} active={params.status === s} label={STATUS_LABEL[s]} count={statusCounts[s] ?? 0} />
                            ))}
                        </nav>
                        {filtered && (
                            <Link href="/reports" className="text-sm font-medium text-primary hover:underline">Clear all filters</Link>
                        )}
                    </div>
                </CardHeader>

                <CardContent className="p-0">
                    {occurrences.length === 0 ? (
                        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                            <div className="rounded-full bg-muted p-3 text-muted-foreground"><SearchX className="h-6 w-6" /></div>
                            <div>
                                <p className="text-sm font-medium">No obligations found</p>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    {filtered ? 'Try a different search or filter.' : 'Obligations appear here once facilities have covenants.'}
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className="w-full overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-muted/50 border-b">
                                    <tr>
                                        <SortHeader current={current} sort="due" label="Due" />
                                        <SortHeader current={current} sort="covenant" label="Covenant" />
                                        <SortHeader current={current} sort="facility" label="Facility / Borrower" className="hidden lg:table-cell" />
                                        <th className="hidden md:table-cell h-11 px-4 font-medium text-muted-foreground">Type</th>
                                        <th className="hidden xl:table-cell h-11 px-4 font-medium text-muted-foreground">Frequency</th>
                                        <SortHeader current={current} sort="status" label="Status" />
                                        <th className="hidden sm:table-cell h-11 px-4 font-medium text-muted-foreground">RAG</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {occurrences.map(item => (
                                        <tr key={item.id} className="transition-colors hover:bg-muted/50">
                                            <td className="px-4 py-3 whitespace-nowrap tabular-nums">{format(item.dueDate, 'd MMM yyyy')}</td>
                                            <td className="px-4 py-3 min-w-40">
                                                <div className="font-medium break-words">{item.covenant.title}</div>
                                                {/* Facility moves under the title when its column is hidden */}
                                                <div className="text-xs text-muted-foreground lg:hidden">{item.facility.name} · {item.facility.borrower.name}</div>
                                            </td>
                                            <td className="hidden lg:table-cell px-4 py-3">
                                                <Link href={`/facilities/${item.facility.id}`} className="font-medium hover:text-primary hover:underline">{item.facility.name}</Link>
                                                <div className="text-xs text-muted-foreground">{item.facility.borrower.name}</div>
                                            </td>
                                            <td className="hidden md:table-cell px-4 py-3 whitespace-nowrap">{TYPE_LABEL[item.covenant.type]}</td>
                                            <td className="hidden xl:table-cell px-4 py-3 whitespace-nowrap capitalize">{item.covenant.frequency.toLowerCase().replace('_', ' ')}</td>
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                <Badge variant={STATUS_BADGE[item.status]}>{STATUS_LABEL[item.status]}</Badge>
                                            </td>
                                            <td className="hidden sm:table-cell px-4 py-3 whitespace-nowrap">
                                                <Badge variant={RAG_BADGE[item.ragStatus]}>{RAG_LABEL[item.ragStatus]}</Badge>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>

                {total > 0 && (
                    <div className="flex flex-col items-center gap-2 border-t px-4 py-3 sm:flex-row sm:justify-between">
                        <p className="text-sm text-muted-foreground">
                            Showing <span className="font-medium text-foreground">{from}–{to}</span> of <span className="font-medium text-foreground">{total}</span>
                        </p>
                        {totalPages > 1 && <LinkPagination page={page} totalPages={totalPages} hrefFor={p => reportsHref(current, { page: p })} />}
                    </div>
                )}
            </Card>
        </div>
    )
}

function Kpi({ label, value, className }: { label: string; value: number; className?: string }) {
    return (
        <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">{label}</CardTitle></CardHeader>
            <CardContent><div className={cn('text-2xl font-bold tabular-nums', className)}>{value}</div></CardContent>
        </Card>
    )
}

function FilterChip({ href, active, label, count }: { href: string; active: boolean; label: string; count: number }) {
    return (
        <Link
            href={href}
            scroll={false}
            aria-current={active ? 'true' : undefined}
            className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-all active:scale-95',
                active ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-muted text-muted-foreground hover:bg-accent hover:text-foreground'
            )}
        >
            {label}
            <span className={cn('rounded-full px-1.5 text-xs tabular-nums', active ? 'bg-primary-foreground/20' : 'bg-background')}>{count}</span>
        </Link>
    )
}

function SortHeader({ current, sort, label, className }: { current: ReportParams; sort: ReportSort; label: string; className?: string }) {
    const active = current.sort === sort
    const Icon = !active ? ArrowUpDown : current.dir === 'asc' ? ArrowUp : ArrowDown
    return (
        <th
            className={cn('h-11 px-4 font-medium text-muted-foreground whitespace-nowrap', className)}
            aria-sort={active ? (current.dir === 'asc' ? 'ascending' : 'descending') : undefined}
        >
            <Link
                href={reportSortHref(current, sort)}
                scroll={false}
                className={cn('group/sort inline-flex items-center gap-1 rounded transition-colors hover:text-foreground', active && 'text-foreground')}
            >
                {label}
                <Icon className={cn('h-3.5 w-3.5 transition-opacity', active ? 'opacity-100' : 'opacity-0 group-hover/sort:opacity-60')} />
            </Link>
        </th>
    )
}
