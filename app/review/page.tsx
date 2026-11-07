import { redirect } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth/session'
import { facilityScope, isLender } from '@/lib/auth/access'
import { formatThreshold } from '@/lib/extraction/review'
import { agreementHref } from '@/lib/extraction/runs'
import { existingCovenants, findDuplicate } from '@/lib/extraction/duplicates'
import { readStepDowns } from '@/lib/covenants/test'
import { StepDownList } from '@/components/features/StepDowns'
import { VerifiedBadge } from '@/components/features/VerifiedBadge'
import { failStaleRuns } from '@/lib/extraction/store'
import { Badge, Card, CardContent, CardTitle } from '@/components/ui/core'
import ReviewActions from './ReviewActions'
import ReviewItem from './ReviewItem'
import ImportAgreement, { type RunSummary } from './ImportAgreement'

// Recent imports shown by default; ?runs=all shows up to RUNS_MAX.
const RUNS_SHOWN = 10
const RUNS_MAX = 100

export default async function ReviewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
    const showAllRuns = (await searchParams).runs === 'all'
    const session = await getSession()
    if (!session) redirect('/login')
    if (!isLender(session)) redirect('/portal')

    // Only active facilities take new agreements.
    const facilities = await prisma.facility.findMany({
        where: { ...facilityScope(session), status: 'ACTIVE' },
        select: { id: true, name: true, facilityReference: true },
        orderBy: { name: 'asc' },
    })
    await failStaleRuns(prisma, new Date(), { facility: facilityScope(session) })
    const [recentRuns, runTotal] = await Promise.all([
        prisma.extractionRun.findMany({
            where: { facility: facilityScope(session) },
            orderBy: { createdAt: 'desc' },
            take: showAllRuns ? RUNS_MAX : RUNS_SHOWN,
            include: { facility: { select: { id: true, name: true } }, _count: { select: { items: true } } },
        }),
        prisma.extractionRun.count({ where: { facility: facilityScope(session) } }),
    ])
    const runs: RunSummary[] = recentRuns.map((run) => ({
        id: run.id,
        facilityId: run.facility.id,
        facilityName: run.facility.name,
        sourceUrl: run.sourceUrl,
        sourceName: run.sourceName,
        sourceHref: agreementHref(run),
        status: run.status,
        error: run.error,
        itemCount: run._count.items,
        createdAt: run.createdAt.toISOString(),
    }))

    const items = await prisma.extractedCovenant.findMany({
        where: { status: 'PENDING', run: { facility: facilityScope(session) } },
        orderBy: [{ run: { createdAt: 'desc' } }, { citationStart: 'asc' }],
        include: { run: { select: { id: true, sourceUrl: true, sourceName: true, fileKey: true, model: true, createdAt: true, facility: { select: { id: true, name: true } } } } },
    })

    // Covenants each item would duplicate, and items extracted twice (e.g. the same agreement imported again).
    const existing = await existingCovenants(prisma, [...new Set(items.map(i => i.run.facility.id))])
    const duplicateOf = (item: (typeof items)[number]) => findDuplicate(item, existing.get(item.run.facility.id) ?? [])
    const pendingTwice = (item: (typeof items)[number]) =>
        items.some(other => other.id !== item.id && other.run.facility.id === item.run.facility.id && other.metric === item.metric)

    // Recently rejected items, so a rejection can be checked and undone.
    const rejected = await prisma.extractedCovenant.findMany({
        where: { status: 'REJECTED', run: { facility: facilityScope(session) } },
        orderBy: { reviewedAt: 'desc' },
        take: 20,
        include: { reviewedBy: { select: { name: true } }, run: { select: { facility: { select: { id: true, name: true } } } } },
    })

    // Group by facility, keeping the newest-run-first order.
    const groups = new Map<string, { facility: { id: string, name: string }, items: typeof items }>()
    for (const item of items) {
        const { facility } = item.run
        const group = groups.get(facility.id) ?? { facility, items: [] }
        group.items.push(item)
        groups.set(facility.id, group)
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Review extracted covenants</h1>
                <p className="text-sm text-muted-foreground">
                    Covenants read from credit agreements. Approve to add them to the facility, or reject.
                </p>
            </div>

            <ImportAgreement facilities={facilities} runs={runs} runTotal={runTotal} showingAll={showAllRuns} />

            {groups.size === 0 && (
                <Card>
                    <CardContent className="p-6 text-sm text-muted-foreground">
                        {runs.some(run => run.status === 'RUNNING')
                            ? 'An import is still running. Its covenants appear here when it finishes.'
                            : 'Nothing waiting for review.'}
                    </CardContent>
                </Card>
            )}

            {[...groups.values()].map(({ facility, items }) => (
                <section key={facility.id} className="space-y-3">
                    <h2 className="text-lg font-semibold">
                        <Link href={`/facilities/${facility.id}`} className="hover:underline">{facility.name}</Link>
                        <span className="ml-2 text-sm font-normal text-muted-foreground">{items.length} pending</span>
                    </h2>
                    {items.map((item) => {
                        const flagged = !item.verified || item.directionConflict
                        const stepDowns = readStepDowns(item.stepDowns)
                        const duplicate = duplicateOf(item)
                        return (
                            <ReviewItem
                                key={item.id}
                                item={{ id: item.id, name: item.name, operator: item.operator, limit: item.limit, stepDowns }}
                                flagged={flagged}
                                duplicateOf={duplicate?.title ?? null}
                                summary={<>
                                    <CardTitle className="text-base">{item.name}</CardTitle>
                                    <div className="text-sm">
                                        <span className="font-mono font-semibold">{formatThreshold(item.operator, item.limit)}</span>
                                        <span className="text-muted-foreground"> · {item.metric}</span>
                                        {item.page !== null && <span className="text-muted-foreground"> · page {item.page}</span>}
                                    </div>
                                    <StepDownList operator={item.operator} stepDowns={stepDowns} />
                                    <div className="flex flex-wrap gap-1 pt-1">
                                        <VerifiedBadge verified={item.verified} />
                                        {item.limitInQuote
                                            ? <Badge variant="secondary">limit in quote</Badge>
                                            : <Badge variant="warning">limit not in quote</Badge>}
                                        {item.operatorCorrected && <Badge variant="warning">operator corrected</Badge>}
                                        {item.directionConflict && <Badge variant="destructive">check direction</Badge>}
                                        {duplicate && <Badge variant="warning" title="Approving would add a second covenant and double its obligations">already on facility: {duplicate.title}</Badge>}
                                        {!duplicate && pendingTwice(item) && <Badge variant="warning" title="Another import found the same covenant; approve only one">also pending from another import</Badge>}
                                    </div>
                                </>}
                            >
                                <blockquote className="border-l-2 pl-3 text-sm italic text-muted-foreground whitespace-pre-line">
                                    {item.quote}
                                </blockquote>
                                <p className="text-xs text-muted-foreground">
                                    {agreementHref(item.run)
                                        ? <a href={agreementHref(item.run)!} className="font-medium text-primary hover:underline" target="_blank" rel="noreferrer">View agreement{item.run.sourceName ? ` (${item.run.sourceName})` : ''}</a>
                                        : <span>{item.run.sourceName ?? 'Uploaded agreement'} (not stored)</span>}
                                    {' · '}{item.run.model}{' · '}{item.run.createdAt.toISOString().slice(0, 10)}
                                </p>
                            </ReviewItem>
                        )
                    })}
                </section>
            ))}

            {rejected.length > 0 && (
                <details className="group rounded-lg border bg-card">
                    <summary className="cursor-pointer list-none px-6 py-4 text-sm font-medium">
                        Recently rejected <span className="text-muted-foreground">({rejected.length})</span>
                        <span className="ml-2 text-xs font-normal text-muted-foreground group-open:hidden">Show</span>
                    </summary>
                    <ul className="divide-y border-t">
                        {rejected.map((item) => (
                            <li key={item.id} className="flex flex-col gap-2 px-6 py-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="min-w-0 text-sm">
                                    <p className="font-medium">{item.name}</p>
                                    <p className="text-xs text-muted-foreground">
                                        <Link href={`/facilities/${item.run.facility.id}`} className="hover:underline">{item.run.facility.name}</Link>
                                        {' · '}<span className="font-mono">{formatThreshold(item.operator, item.limit)}</span>
                                        {' · '}Rejected{item.reviewedBy && <> by {item.reviewedBy.name}</>}
                                        {item.reviewedAt && <> on {item.reviewedAt.toISOString().slice(0, 10)}</>}
                                    </p>
                                </div>
                                <ReviewActions id={item.id} actions={['restore']} />
                            </li>
                        ))}
                    </ul>
                </details>
            )}
        </div>
    )
}
