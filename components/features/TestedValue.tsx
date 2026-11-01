'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { Loader2 } from 'lucide-react'
import { Badge, Button } from '@/components/ui/core'
import { evaluateThreshold } from '@/lib/covenants/test'

export const formatHeadroom = (headroom: number) => `${headroom >= 0 ? '+' : ''}${headroom.toFixed(1)}%`

// Pass/Breach badge for a recorded test; nothing when the result is unknown.
export function TestBadge({ passed }: { passed: boolean | null }) {
    if (passed === null) return null
    return <Badge variant={passed ? 'success' : 'destructive'}>{passed ? 'Pass' : 'Breach'}</Badge>
}

// Details-panel section for a financial obligation: the threshold, the recorded
// tested value with its result, and a form to record or correct it.
export function TestedValueSection({ occurrence }: {
    occurrence: {
        id: string
        testedValue: number | null
        testPassed: boolean | null
        testedAt: Date | string | null
        covenant: { thresholdCondition: string | null }
    }
}) {
    const router = useRouter()
    const [value, setValue] = useState(occurrence.testedValue?.toString() ?? '')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const threshold = occurrence.covenant.thresholdCondition
    const result = occurrence.testedValue === null ? null : evaluateThreshold(threshold, occurrence.testedValue)
    const number = Number(value)
    const valid = value.trim() !== '' && Number.isFinite(number)

    async function save() {
        setBusy(true)
        setError(null)
        try {
            const res = await fetch(`/api/occurrences/${occurrence.id}/tested-value`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ value: number }),
            })
            if (!res.ok) {
                const json = await res.json().catch(() => null)
                setError(json?.error ?? `Request failed (${res.status})`)
                return
            }
            router.refresh()
        } catch {
            setError('Could not reach the server. Try again.')
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="space-y-3 text-sm">
            <h3 className="font-medium">Financial test</h3>
            <div className="flex justify-between gap-4 border-b pb-2">
                <span className="text-muted-foreground">Threshold</span>
                <span className="font-medium">{threshold || '—'}</span>
            </div>
            {occurrence.testedValue !== null && (
                <div className="flex items-center justify-between gap-4 border-b pb-2">
                    <span className="text-muted-foreground">Tested value</span>
                    <span className="flex items-center gap-2 font-medium tabular-nums">
                        {occurrence.testedValue}
                        <TestBadge passed={occurrence.testPassed} />
                        {result && <span className="text-xs text-muted-foreground">{formatHeadroom(result.headroom)} headroom</span>}
                    </span>
                </div>
            )}
            {occurrence.testedValue !== null && occurrence.testedAt && (
                <p className="text-xs text-muted-foreground">
                    Recorded {format(new Date(occurrence.testedAt), 'd MMM yyyy')}
                    {occurrence.testPassed === null && ' · threshold could not be read, so the value was not tested'}
                </p>
            )}
            <form className="flex items-end gap-2" onSubmit={e => { e.preventDefault(); if (valid) save() }}>
                <div className="flex-1 space-y-1">
                    <label htmlFor="tested-value" className="text-xs font-medium">Tested value</label>
                    <input
                        id="tested-value"
                        type="number"
                        step="any"
                        inputMode="decimal"
                        className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                        value={value}
                        onChange={e => setValue(e.target.value)}
                    />
                </div>
                <Button type="submit" disabled={busy || !valid}>
                    {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Save
                </Button>
            </form>
            {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
        </div>
    )
}
