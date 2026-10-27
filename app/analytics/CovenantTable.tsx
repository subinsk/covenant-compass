import Link from 'next/link'
import type { CovenantAnalysis, OverviewRow } from '@/lib/analytics/covenants'
import { formatThreshold } from '@/lib/extraction/review'
import { Badge, cn } from '@/components/ui/core'

export function formatPct(value: number): string {
    return `${value >= 0 ? '' : '−'}${Math.abs(value).toFixed(1)}%`
}

export function formatRatio(value: number): string {
    return `${value.toFixed(2)}x`
}

function Status({ row }: { row: CovenantAnalysis }) {
    if (!row.result) return <Badge variant="secondary">not disclosed</Badge>
    return row.result.compliant
        ? <Badge variant="success">compliant</Badge>
        : <Badge variant="destructive">breach</Badge>
}

// Covenant rows for the overview (with company columns) or one company's detail.
export default function CovenantTable({ rows }: { rows: (CovenantAnalysis & Partial<OverviewRow>)[] }) {
    const withCompany = rows.some((r) => r.ticker)
    return (
        <div className="overflow-x-auto rounded-md border bg-card">
            <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                    <tr>
                        {withCompany && <th className="px-3 py-2">Company</th>}
                        <th className="px-3 py-2">Covenant</th>
                        <th className="px-3 py-2">Limit</th>
                        <th className="px-3 py-2 text-right">Actual</th>
                        {withCompany && <th className="px-3 py-2">Period</th>}
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2 text-right">Headroom</th>
                        <th className="px-3 py-2 text-right">Headroom %</th>
                        <th className="px-3 py-2 text-right" title="How far covenant EBITDA can fall before a leverage covenant breaches">EBITDA cushion</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row) => {
                        const breach = row.result?.compliant === false
                        return (
                            <tr key={`${row.ticker ?? ''}-${row.name}`} className={cn('border-t', breach && 'bg-destructive/10 font-medium')}>
                                {withCompany && (
                                    <td className="px-3 py-2">
                                        <Link href={`/analytics/${row.ticker}`} className="font-semibold hover:underline">{row.ticker}</Link>
                                        <div className="text-xs text-muted-foreground">
                                            {row.company}
                                            {row.source && <> · <a href={row.source} target="_blank" rel="noreferrer" className="hover:underline">10-Q</a></>}
                                        </div>
                                    </td>
                                )}
                                <td className="px-3 py-2">{row.name}</td>
                                <td className="px-3 py-2 font-mono">{formatThreshold(row.operator, row.limit)}</td>
                                <td className="px-3 py-2 text-right font-mono">{row.actual === null ? '—' : formatRatio(row.actual)}</td>
                                {withCompany && <td className="px-3 py-2 whitespace-nowrap">{row.periodEnd}</td>}
                                <td className="px-3 py-2"><Status row={row} /></td>
                                <td className={cn('px-3 py-2 text-right font-mono', breach && 'text-destructive')}>
                                    {row.result ? row.result.headroom.toFixed(2) : '—'}
                                </td>
                                <td className={cn('px-3 py-2 text-right font-mono', breach && 'text-destructive')}>
                                    {row.result ? formatPct(row.result.headroomPct) : '—'}
                                </td>
                                <td className={cn('px-3 py-2 text-right font-mono', breach && 'text-destructive')}>
                                    {row.ebitdaCushionPct === null ? '—' : formatPct(row.ebitdaCushionPct)}
                                </td>
                            </tr>
                        )
                    })}
                </tbody>
            </table>
        </div>
    )
}
