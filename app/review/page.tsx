import { redirect } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth/session'
import { facilityScope, isLender } from '@/lib/auth/access'
import { formatThreshold } from '@/lib/extraction/review'
import { Badge, Card, CardContent, CardHeader, CardTitle, cn } from '@/components/ui/core'
import ReviewActions from './ReviewActions'
import ImportAgreement, { type RunSummary } from './ImportAgreement'

export default async function ReviewPage() {
    const session = await getSession()
    if (!session) redirect('/login')
    if (!isLender(session)) redirect('/portal')

    const facilities = await prisma.facility.findMany({
        where: facilityScope(session),
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
    })
    const recentRuns = await prisma.extractionRun.findMany({
        where: { facility: facilityScope(session) },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: { facility: { select: { name: true } }, _count: { select: { items: true } } },
    })
    const runs: RunSummary[] = recentRuns.map((run) => ({
        id: run.id,
        facilityName: run.facility.name,
        sourceUrl: run.sourceUrl,
        status: run.status,
        error: run.error,
        itemCount: run._count.items,
        createdAt: run.createdAt.toISOString(),
    }))

    const items = await prisma.extractedCovenant.findMany({
        where: { status: 'PENDING', run: { facility: facilityScope(session) } },
        orderBy: [{ run: { createdAt: 'desc' } }, { citationStart: 'asc' }],
        include: { run: { select: { sourceUrl: true, model: true, createdAt: true, facility: { select: { id: true, name: true } } } } },
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

            <ImportAgreement facilities={facilities} runs={runs} />

            {groups.size === 0 && (
                <Card>
                    <CardContent className="p-6 text-sm text-muted-foreground">Nothing waiting for review.</CardContent>
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
                        return (
                            <Card key={item.id} className={cn(flagged && 'border-destructive border-2')}>
                                <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
                                    <div className="space-y-1">
                                        <CardTitle className="text-base">{item.name}</CardTitle>
                                        <div className="text-sm">
                                            <span className="font-mono font-semibold">{formatThreshold(item.operator, item.limit)}</span>
                                            <span className="text-muted-foreground"> · {item.metric}</span>
                                            {item.page !== null && <span className="text-muted-foreground"> · page {item.page}</span>}
                                        </div>
                                        <div className="flex flex-wrap gap-1 pt-1">
                                            {item.verified
                                                ? <Badge variant="success">quote found in source</Badge>
                                                : <Badge variant="destructive">quote not found in source</Badge>}
                                            {item.limitInQuote
                                                ? <Badge variant="secondary">limit in quote</Badge>
                                                : <Badge variant="warning">limit not in quote</Badge>}
                                            {item.operatorCorrected && <Badge variant="warning">operator corrected</Badge>}
                                            {item.directionConflict && <Badge variant="destructive">check direction</Badge>}
                                        </div>
                                    </div>
                                    <ReviewActions id={item.id} />
                                </CardHeader>
                                <CardContent className="space-y-2">
                                    <blockquote className="border-l-2 pl-3 text-sm italic text-muted-foreground whitespace-pre-line">
                                        {item.quote}
                                    </blockquote>
                                    <p className="text-xs text-muted-foreground">
                                        <a href={item.run.sourceUrl} className="hover:underline" target="_blank" rel="noreferrer">Source</a>
                                        {' · '}{item.run.model}{' · '}{item.run.createdAt.toISOString().slice(0, 10)}
                                    </p>
                                </CardContent>
                            </Card>
                        )
                    })}
                </section>
            ))}
        </div>
    )
}
