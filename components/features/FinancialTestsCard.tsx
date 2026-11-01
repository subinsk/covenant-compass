import { Activity } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, cn } from '@/components/ui/core'
import { evaluateThreshold } from '@/lib/covenants/test'
import { testedTrend } from '@/lib/occurrences/tested'
import { TestBadge, formatHeadroom } from './TestedValue'

// Facility overview: for each financial covenant, the latest tested value and
// the last few values before it.
export function FinancialTestsCard({ covenants, occurrences, onShowSchedule }: {
    covenants: { id: string; title: string; type: string; thresholdCondition: string | null }[]
    occurrences: Parameters<typeof testedTrend>[0]
    onShowSchedule: (covenantId: string) => void
}) {
    const financial = covenants.filter(c => c.type === 'FINANCIAL')
    if (financial.length === 0) return null
    const trend = testedTrend(occurrences)

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                    <Activity className="h-4 w-4 text-muted-foreground" />
                    Financial tests
                </CardTitle>
            </CardHeader>
            <CardContent>
                <ul className="-mx-1 space-y-1">
                    {financial.map(cov => {
                        const points = trend.get(cov.id) ?? []
                        const latest = points.at(-1)
                        const result = latest && evaluateThreshold(cov.thresholdCondition, latest.value)
                        return (
                            <li key={cov.id}>
                                <button
                                    onClick={() => onShowSchedule(cov.id)}
                                    className="w-full rounded px-1 py-1.5 text-left text-sm transition-colors hover:bg-accent"
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="truncate font-medium">{cov.title}</span>
                                        {latest ? (
                                            <span className="flex shrink-0 items-center gap-1.5 tabular-nums">
                                                {latest.value}
                                                <TestBadge passed={latest.passed} />
                                            </span>
                                        ) : <span className="shrink-0 text-xs text-muted-foreground">Not tested</span>}
                                    </div>
                                    <div className="flex justify-between gap-2 text-xs text-muted-foreground">
                                        <span>{cov.thresholdCondition || 'No threshold'}{result && ` · ${formatHeadroom(result.headroom)}`}</span>
                                        {points.length > 1 && (
                                            <span className="tabular-nums" title="Last tested values, oldest first">
                                                {points.map((p, i) => (
                                                    <span key={i} className={cn(p.passed === false && 'text-red-600')}>
                                                        {i > 0 && ' → '}{p.value}
                                                    </span>
                                                ))}
                                            </span>
                                        )}
                                    </div>
                                </button>
                            </li>
                        )
                    })}
                </ul>
            </CardContent>
        </Card>
    )
}
