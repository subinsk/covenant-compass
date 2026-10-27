'use client'
import { useState } from 'react'
import { ebitdaWhatIf, type RatioCovenant } from '@/lib/analytics/covenants'
import { formatThreshold } from '@/lib/extraction/review'
import { Badge, cn } from '@/components/ui/core'
import { formatPct, formatRatio } from '../CovenantTable'

// EBITDA slider: re-tests each covenant with a disclosed ratio and sizes the
// equity cure for any that end up in breach.
export default function WhatIf({ covenants, asOf }: { covenants: RatioCovenant[], asOf: string }) {
    const [changePct, setChangePct] = useState(0)
    const rows = ebitdaWhatIf(covenants, asOf, changePct)

    if (rows.length === 0) return <p className="text-sm text-muted-foreground">No disclosed ratios to test.</p>

    return (
        <div className="space-y-4">
            <label className="block space-y-2">
                <span className="text-sm font-medium">
                    EBITDA change: <span className="font-mono">{changePct > 0 ? '+' : ''}{changePct}%</span>
                </span>
                <input
                    type="range"
                    min={-50}
                    max={20}
                    step={1}
                    value={changePct}
                    onChange={(e) => setChangePct(Number(e.target.value))}
                    className="w-full max-w-md accent-primary"
                />
            </label>
            <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                        <tr>
                            <th className="px-3 py-2">Covenant</th>
                            <th className="px-3 py-2">Limit</th>
                            <th className="px-3 py-2 text-right">Disclosed</th>
                            <th className="px-3 py-2 text-right">Scenario</th>
                            <th className="px-3 py-2 text-right">Headroom %</th>
                            <th className="px-3 py-2">Status</th>
                            <th className="px-3 py-2">Equity cure</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row) => (
                            <tr key={row.name} className={cn('border-t', !row.result.compliant && 'bg-destructive/10')}>
                                <td className="px-3 py-2">{row.name}</td>
                                <td className="px-3 py-2 font-mono">{formatThreshold(row.operator, row.limit)}</td>
                                <td className="px-3 py-2 text-right font-mono">{formatRatio(row.actual)}</td>
                                <td className="px-3 py-2 text-right font-mono">{formatRatio(row.value)}</td>
                                <td className={cn('px-3 py-2 text-right font-mono', !row.result.compliant && 'text-destructive')}>
                                    {formatPct(row.result.headroomPct)}
                                </td>
                                <td className="px-3 py-2">
                                    {row.result.compliant
                                        ? <Badge variant="success">compliant</Badge>
                                        : <Badge variant="destructive">{row.flipsToBreach ? 'flips to breach' : 'breach'}</Badge>}
                                </td>
                                <td className="px-3 py-2">
                                    {row.curePct === null
                                        ? <span className="text-muted-foreground">—</span>
                                        : <>EBITDA +{row.curePct.toFixed(1)}% needed</>}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <p className="text-xs text-muted-foreground">
                Only the ratios are disclosed, so the scenario moves the ratio with EBITDA: leverage (debt / EBITDA) divides by 1 + change,
                coverage (EBITDA / charges) multiplies by it, with debt and charges unchanged. The equity cure is the EBITDA increase that
                brings the ratio back to its limit, as a percent of covenant EBITDA in the scenario.
            </p>
        </div>
    )
}
