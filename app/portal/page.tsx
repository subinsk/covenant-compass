import Link from 'next/link'
import { redirect } from 'next/navigation'
import { format } from 'date-fns'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth/session'
import { facilityScope } from '@/lib/auth/access'
import { isOnTime, onTimeRate } from '@/lib/dashboard/metrics'
import { formatPeriod } from '@/lib/format/period'
import { HISTORY_PAGE_SIZE, historyWhere, parsePage, parsePortalView, waiverReason, type PortalView } from '@/lib/portal/history'
import { Badge, Card, CardContent, cn } from '@/components/ui/core'
import { EvidenceUpload } from '@/components/features/EvidenceUpload'

const VIEWS: { key: PortalView; label: string }[] = [
    { key: 'open', label: 'Action Items' },
    { key: 'history', label: 'History' },
]

export default async function BorrowerPortal({ searchParams }: { searchParams: Promise<{ view?: string; page?: string }> }) {
    const session = await getSession()
    if (!session) redirect('/login')
    if (session.role !== 'BORROWER_USER') redirect('/')

    const params = await searchParams
    const view = parsePortalView(params.view)
    const scope = facilityScope(session)

    const [org, occurrences] = await Promise.all([
        prisma.organization.findUnique({ where: { id: session.orgId }, select: { name: true } }),
        prisma.covenantOccurrence.findMany({
            where: { facility: scope },
            orderBy: { dueDate: 'asc' },
            include: {
                covenant: true,
                documents: { orderBy: { uploadedAt: 'asc' }, select: { id: true, fileName: true, uploadedAt: true } },
            },
        }),
    ])

    const score = onTimeRate(occurrences)
    const actionItems = occurrences.filter(o => o.status === 'PENDING' || o.status === 'OVERDUE')

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between bg-blue-900 text-white p-6 rounded-lg shadow-md">
                <div>
                    <h1 className="text-2xl font-bold">Borrower Portal</h1>
                    <p className="text-blue-100">{org?.name ?? 'Unknown organization'}</p>
                </div>
                <div className="text-right">
                    <p className="text-sm opacity-80">Compliance Score</p>
                    <p className="text-3xl font-bold">{score.rate === null ? '—' : `${score.rate}%`}</p>
                    {score.rate !== null && (
                        <p className="text-xs opacity-80">{score.onTime} of {score.completed + score.overdue} on time</p>
                    )}
                </div>
            </div>

            <nav className="flex flex-wrap gap-2">
                {VIEWS.map(v => (
                    <Link
                        key={v.key}
                        href={v.key === 'open' ? '/portal' : `/portal?view=${v.key}`}
                        aria-current={v.key === view ? 'page' : undefined}
                        className={cn(
                            'rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
                            v.key === view
                                ? 'bg-primary text-primary-foreground shadow-sm'
                                : 'bg-muted text-muted-foreground hover:bg-accent hover:text-foreground'
                        )}
                    >
                        {v.label}
                    </Link>
                ))}
            </nav>

            {view === 'history' ? (
                <History scope={scope} page={parsePage(params.page)} />
            ) : (
                <div className="space-y-4">
                    {actionItems.length === 0 && (
                        <p className="text-muted-foreground">No open obligations.</p>
                    )}
                    {actionItems.map(item => (
                        <Card key={item.id}>
                            <CardContent className="p-6 flex items-start justify-between gap-4">
                                <div>
                                    <p className="text-sm text-muted-foreground uppercase tracking-wider">{item.covenant.type}</p>
                                    <h3 className="text-lg font-medium">{item.covenant.title}</h3>
                                    <p className="text-sm text-muted-foreground">
                                        Due: {new Date(item.dueDate).toLocaleDateString()}
                                        {item.status === 'OVERDUE' && <span className="ml-2 text-red-600 font-medium">Overdue</span>}
                                    </p>
                                </div>
                                <EvidenceUpload
                                    occurrenceId={item.id}
                                    documents={item.documents.map(d => ({ ...d, uploadedAt: d.uploadedAt.toISOString() }))}
                                />
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    )
}

async function History({ scope, page: requested }: { scope: ReturnType<typeof facilityScope>; page: number }) {
    const where = historyWhere(scope)
    const total = await prisma.covenantOccurrence.count({ where })
    const totalPages = Math.max(1, Math.ceil(total / HISTORY_PAGE_SIZE))
    const page = Math.min(requested, totalPages)

    const rows = await prisma.covenantOccurrence.findMany({
        where,
        orderBy: [{ dueDate: 'desc' }, { completionDate: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * HISTORY_PAGE_SIZE,
        take: HISTORY_PAGE_SIZE,
        include: {
            covenant: { select: { title: true } },
            facility: { select: { name: true } },
            documents: { orderBy: { uploadedAt: 'asc' }, select: { id: true, fileName: true } },
        },
    })

    if (rows.length === 0) return <p className="text-muted-foreground">No completed or waived obligations yet.</p>

    const fmt = (d: Date) => format(d, 'd MMM yyyy')
    const pageHref = (p: number) => `/portal?view=history&page=${p}`

    return (
        <div className="space-y-4">
            <Card>
                <CardContent className="p-0">
                    <ul className="divide-y">
                        {rows.map(row => {
                            const onTime = isOnTime(row)
                            const reason = row.status === 'WAIVED' ? waiverReason(row.notes) : null
                            const period = formatPeriod(row.periodStartDate, row.periodEndDate)
                            return (
                                <li key={row.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
                                    <div className="min-w-0 space-y-1">
                                        <p className="text-sm font-medium">{row.covenant.title}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {row.facility.name}
                                            {period && <> · {period}</>}
                                            {' · '}Due {fmt(row.dueDate)}
                                        </p>
                                        {reason && <p className="text-xs text-muted-foreground">Waiver reason: {reason}</p>}
                                        {row.documents.length > 0 && (
                                            <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                                                {row.documents.map(d => (
                                                    <li key={d.id}>
                                                        <a href={`/api/documents/${d.id}`} className="text-primary hover:underline">{d.fileName}</a>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </div>
                                    <div className="shrink-0 space-y-1 sm:text-right">
                                        <Badge variant={row.status === 'COMPLETED' ? 'success' : 'warning'}>
                                            {row.status === 'COMPLETED' ? 'Completed' : 'Waived'}
                                        </Badge>
                                        {row.completionDate && (
                                            <p className="text-xs text-muted-foreground">Completed {fmt(row.completionDate)}</p>
                                        )}
                                        {onTime !== null && (
                                            <p className={cn('text-xs font-medium', onTime ? 'text-emerald-600' : 'text-red-600')}>
                                                {onTime ? 'On time' : 'Late'}
                                            </p>
                                        )}
                                    </div>
                                </li>
                            )
                        })}
                    </ul>
                </CardContent>
            </Card>

            <nav className="flex items-center justify-between text-sm" aria-label="Pagination">
                <span className="text-muted-foreground">
                    {(page - 1) * HISTORY_PAGE_SIZE + 1}–{(page - 1) * HISTORY_PAGE_SIZE + rows.length} of {total}
                </span>
                <span className="flex gap-3">
                    {page > 1 ? <Link href={pageHref(page - 1)} className="text-primary hover:underline">Previous</Link> : <span className="text-muted-foreground opacity-40">Previous</span>}
                    {page < totalPages ? <Link href={pageHref(page + 1)} className="text-primary hover:underline">Next</Link> : <span className="text-muted-foreground opacity-40">Next</span>}
                </span>
            </nav>
        </div>
    )
}
