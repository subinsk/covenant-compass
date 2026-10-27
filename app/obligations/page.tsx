import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth/session'
import { facilityScope, isLender } from '@/lib/auth/access'
import { Card, CardContent, Badge, cn } from '@/components/ui/core'
import { ChevronRight, Inbox } from 'lucide-react'
import { format } from 'date-fns'
import { OBLIGATION_FILTERS, obligationWhere, parseObligationFilter } from '@/lib/dashboard/filters'

const STATUS_BADGE = {
    PENDING: 'secondary',
    COMPLETED: 'success',
    OVERDUE: 'destructive',
    WAIVED: 'warning',
} as const

const RAG_DOT = {
    GREEN: 'bg-emerald-500',
    AMBER: 'bg-amber-500',
    RED: 'bg-red-500',
}

export default async function ObligationsPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
    const session = await getSession()
    if (!session) redirect('/login')
    if (!isLender(session)) redirect('/portal')

    const filter = parseObligationFilter((await searchParams).filter)
    const occurrences = await prisma.covenantOccurrence.findMany({
        where: obligationWhere(filter, facilityScope(session), new Date()),
        include: {
            facility: { select: { id: true, name: true } },
            covenant: { select: { title: true } }
        },
        orderBy: { dueDate: filter === 'closed' ? 'desc' : 'asc' }
    })

    return (
        <div className="space-y-6">
            <div className="animate-fade-up">
                <h1 className="text-2xl font-bold tracking-tight">{OBLIGATION_FILTERS[filter].label}</h1>
                <p className="mt-1 text-sm text-muted-foreground">{OBLIGATION_FILTERS[filter].description}</p>
            </div>

            <nav className="flex flex-wrap gap-2 animate-fade-up" style={{ animationDelay: '60ms' }}>
                {Object.entries(OBLIGATION_FILTERS).map(([key, f]) => (
                    <Link
                        key={key}
                        href={`/obligations?filter=${key}`}
                        className={cn(
                            'rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
                            key === filter
                                ? 'bg-primary text-primary-foreground shadow-sm'
                                : 'bg-muted text-muted-foreground hover:bg-accent hover:text-foreground'
                        )}
                    >
                        {f.label}
                    </Link>
                ))}
            </nav>

            <Card className="animate-fade-up" style={{ animationDelay: '120ms' }}>
                <CardContent className="p-0">
                    {occurrences.length === 0 ? (
                        <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
                            <div className="rounded-full bg-muted p-3 text-muted-foreground"><Inbox className="w-6 h-6" /></div>
                            <p className="text-sm text-muted-foreground">Nothing here right now.</p>
                        </div>
                    ) : (
                        <ul className="divide-y">
                            {occurrences.map((occ, i) => (
                                <li key={occ.id} className="animate-fade-up" style={{ animationDelay: `${160 + Math.min(i, 10) * 40}ms` }}>
                                    <Link
                                        href={`/facilities/${occ.facility.id}?tab=schedule`}
                                        className="group flex items-center gap-4 px-4 py-3 transition-colors hover:bg-accent"
                                    >
                                        <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', RAG_DOT[occ.ragStatus])} title={`RAG: ${occ.ragStatus}`} />
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm font-medium transition-colors group-hover:text-primary">{occ.covenant.title}</p>
                                            <p className="truncate text-xs text-muted-foreground">{occ.facility.name}</p>
                                        </div>
                                        <div className="shrink-0 text-right">
                                            <Badge variant={STATUS_BADGE[occ.status]}>{occ.status}</Badge>
                                            <p className="mt-1 text-xs text-muted-foreground">Due {format(occ.dueDate, 'd MMM yyyy')}</p>
                                        </div>
                                        <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
