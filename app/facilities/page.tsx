import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth/session'
import { facilityScope, isLender } from '@/lib/auth/access'
import { Card, CardContent, Badge, cn } from '@/components/ui/core'
import { NewFacilityButton } from '@/components/features/NewFacilityModal'
import { FacilitySearch } from '@/components/features/FacilitySearch'
import Link from 'next/link'
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, SearchX } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import type { FacilityStatus } from '@prisma/client'
import {
    FACILITY_STATUSES,
    PAGE_SIZE,
    facilitiesHref,
    facilityOrderBy,
    facilitySearchWhere,
    pageCount,
    parseFacilityListParams,
    sortHref,
    type FacilityListParams,
    type FacilitySort,
} from '@/lib/facilities/list'

const STATUS_BADGE = {
    ACTIVE: 'success',
    MATURED: 'secondary',
    DEFAULTED: 'destructive',
} as const

const STATUS_LABEL: Record<FacilityStatus, string> = {
    ACTIVE: 'Active',
    MATURED: 'Matured',
    DEFAULTED: 'Defaulted',
}

export default async function FacilitiesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
    const session = await getSession()
    if (!session) redirect('/login')
    if (!isLender(session)) redirect('/portal')

    const params = parseFacilityListParams(await searchParams)
    const searchWhere = facilitySearchWhere(facilityScope(session), params.q)
    const where = params.status ? { ...searchWhere, status: params.status } : searchWhere

    // Counts per status for the filter chips, within the current search.
    const statusGroups = await prisma.facility.groupBy({ by: ['status'], where: searchWhere, _count: true })
    const statusCounts = Object.fromEntries(statusGroups.map(g => [g.status, g._count])) as Partial<Record<FacilityStatus, number>>
    const allCount = statusGroups.reduce((sum, g) => sum + g._count, 0)
    const total = params.status ? statusCounts[params.status] ?? 0 : allCount

    const totalPages = pageCount(total)
    const page = Math.min(params.page, totalPages)

    const facilities = await prisma.facility.findMany({
        where,
        orderBy: facilityOrderBy(params.sort, params.dir),
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: {
            borrower: { select: { name: true } },
            _count: { select: { covenants: true } }
        }
    })

    const borrowers = await prisma.organization.findMany({
        where: { type: 'BORROWER' },
        select: { id: true, name: true },
        orderBy: { name: 'asc' }
    })

    const current = { ...params, page }
    const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
    const to = Math.min(page * PAGE_SIZE, total)

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between animate-fade-up">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Facilities</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        {allCount} {allCount === 1 ? 'facility' : 'facilities'}{params.q && <> matching &ldquo;{params.q}&rdquo;</>}
                    </p>
                </div>
                <NewFacilityButton borrowers={borrowers} />
            </div>

            {/* Toolbar: search and status filter */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between animate-fade-up" style={{ animationDelay: '60ms' }}>
                <FacilitySearch />
                <nav className="flex flex-wrap gap-2" aria-label="Filter by status">
                    <FilterChip href={facilitiesHref(current, { status: undefined })} active={!params.status} label="All" count={allCount} />
                    {FACILITY_STATUSES.map(s => (
                        <FilterChip key={s} href={facilitiesHref(current, { status: s })} active={params.status === s} label={STATUS_LABEL[s]} count={statusCounts[s] ?? 0} />
                    ))}
                </nav>
            </div>

            <Card className="overflow-hidden animate-fade-up" style={{ animationDelay: '120ms' }}>
                <CardContent className="p-0">
                    {facilities.length === 0 ? (
                        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                            <div className="rounded-full bg-muted p-3 text-muted-foreground"><SearchX className="h-6 w-6" /></div>
                            <div>
                                <p className="text-sm font-medium">No facilities found</p>
                                <p className="mt-1 text-sm text-muted-foreground">Try a different search or filter.</p>
                            </div>
                            {(params.q || params.status) && (
                                <Link href="/facilities" className="text-sm font-medium text-primary hover:underline">Clear search and filters</Link>
                            )}
                        </div>
                    ) : (
                        <div className="relative w-full overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-muted/50 border-b">
                                    <tr>
                                        <SortHeader current={current} sort="name" label="Facility" />
                                        <SortHeader current={current} sort="borrower" label="Borrower" />
                                        <SortHeader current={current} sort="commitment" label="Commitment" align="right" />
                                        <SortHeader current={current} sort="status" label="Status" />
                                        <SortHeader current={current} sort="covenants" label="Covenants" align="right" />
                                        <SortHeader current={current} sort="updated" label="Updated" />
                                        <th className="w-10" />
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {facilities.map((facility, i) => (
                                        <tr
                                            key={facility.id}
                                            className="group relative transition-colors hover:bg-accent/60 animate-fade-up"
                                            style={{ animationDelay: `${160 + i * 30}ms` }}
                                        >
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-3">
                                                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-semibold text-primary transition-transform group-hover:scale-105">
                                                        {facility.name.charAt(0).toUpperCase()}
                                                    </div>
                                                    <div className="min-w-0">
                                                        {/* The link stretches over the whole row */}
                                                        <Link
                                                            href={`/facilities/${facility.id}`}
                                                            className="block truncate font-medium transition-colors group-hover:text-primary after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring"
                                                        >
                                                            {facility.name}
                                                        </Link>
                                                        <p className="truncate text-xs text-muted-foreground">{facility.facilityReference}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3">{facility.borrower.name}</td>
                                            <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">
                                                {new Intl.NumberFormat('en-US', { style: 'currency', currency: facility.currency, maximumFractionDigits: 0 }).format(Number(facility.totalCommitment))}
                                            </td>
                                            <td className="px-4 py-3">
                                                <Badge variant={STATUS_BADGE[facility.status]}>{STATUS_LABEL[facility.status]}</Badge>
                                            </td>
                                            <td className="px-4 py-3 text-right tabular-nums">{facility._count.covenants}</td>
                                            <td className="px-4 py-3 whitespace-nowrap text-muted-foreground" title={facility.updatedAt.toLocaleString()}>
                                                {formatDistanceToNow(facility.updatedAt, { addSuffix: true })}
                                            </td>
                                            <td className="px-2 py-3">
                                                <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>

                {total > 0 && (
                    <div className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-sm text-muted-foreground">
                            Showing <span className="font-medium text-foreground">{from}–{to}</span> of <span className="font-medium text-foreground">{total}</span>
                        </p>
                        <Pagination current={current} totalPages={totalPages} />
                    </div>
                )}
            </Card>
        </div>
    )
}

function FilterChip({ href, active, label, count }: { href: string; active: boolean; label: string; count: number }) {
    return (
        <Link
            href={href}
            aria-current={active ? 'true' : undefined}
            className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-all active:scale-95',
                active
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-muted text-muted-foreground hover:bg-accent hover:text-foreground'
            )}
        >
            {label}
            <span className={cn('rounded-full px-1.5 text-xs tabular-nums', active ? 'bg-primary-foreground/20' : 'bg-background')}>{count}</span>
        </Link>
    )
}

function SortHeader({ current, sort, label, align = 'left' }: { current: FacilityListParams; sort: FacilitySort; label: string; align?: 'left' | 'right' }) {
    const active = current.sort === sort
    const Icon = !active ? ArrowUpDown : current.dir === 'asc' ? ArrowUp : ArrowDown
    return (
        <th
            className={cn('h-11 px-4 font-medium text-muted-foreground whitespace-nowrap', align === 'right' && 'text-right')}
            aria-sort={active ? (current.dir === 'asc' ? 'ascending' : 'descending') : undefined}
        >
            <Link
                href={sortHref(current, sort)}
                scroll={false}
                className={cn('group/sort inline-flex items-center gap-1 rounded transition-colors hover:text-foreground', active && 'text-foreground')}
            >
                {label}
                <Icon className={cn('h-3.5 w-3.5 transition-opacity', active ? 'opacity-100' : 'opacity-0 group-hover/sort:opacity-60')} />
            </Link>
        </th>
    )
}

function Pagination({ current, totalPages }: { current: FacilityListParams; totalPages: number }) {
    const { page } = current
    // First, last, and a window around the current page, with gaps marked.
    const pages = [...new Set([1, page - 1, page, page + 1, totalPages])]
        .filter(p => p >= 1 && p <= totalPages)
        .sort((a, b) => a - b)

    const button = 'inline-flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-sm font-medium transition-colors'
    return (
        <nav className="flex items-center gap-1" aria-label="Pagination">
            <PageLink href={page > 1 ? facilitiesHref(current, { page: page - 1 }) : undefined} label="Previous page" className={button}>
                <ChevronLeft className="h-4 w-4" />
            </PageLink>
            {pages.map((p, i) => (
                <span key={p} className="flex items-center gap-1">
                    {i > 0 && p - pages[i - 1] > 1 && <span className="px-1 text-muted-foreground">…</span>}
                    <Link
                        href={facilitiesHref(current, { page: p })}
                        scroll={false}
                        aria-current={p === page ? 'page' : undefined}
                        className={cn(button, p === page ? 'bg-primary text-primary-foreground shadow-sm' : 'hover:bg-accent')}
                    >
                        {p}
                    </Link>
                </span>
            ))}
            <PageLink href={page < totalPages ? facilitiesHref(current, { page: page + 1 }) : undefined} label="Next page" className={button}>
                <ChevronRight className="h-4 w-4" />
            </PageLink>
        </nav>
    )
}

function PageLink({ href, label, className, children }: { href?: string; label: string; className: string; children: React.ReactNode }) {
    if (!href) {
        return <span aria-disabled="true" aria-label={label} className={cn(className, 'text-muted-foreground opacity-40')}>{children}</span>
    }
    return <Link href={href} scroll={false} aria-label={label} className={cn(className, 'hover:bg-accent')}>{children}</Link>
}
