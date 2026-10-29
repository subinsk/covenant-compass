'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Check, FileSearch, Loader2, X } from 'lucide-react'
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, cn } from '@/components/ui/core'
import { formatThreshold } from '@/lib/extraction/review'
import type { AgreementRunView, PendingExtractedItem } from '@/lib/extraction/runs'

const POLL_MS = 2000

const STEPS = [
    { stage: 'READING', label: 'Reading document' },
    { stage: 'EXTRACTING', label: 'Finding covenants with AI' },
    { stage: 'SAVING', label: 'Saving' },
]

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

// Progress and results of agreement uploads on a facility page.
export function AgreementExtractionCard({ runs }: { runs: AgreementRunView[] }) {
    return (
        <Card className="animate-fade-up">
            <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                    <FileSearch className="h-4 w-4 text-muted-foreground" />
                    Agreement extraction
                </CardTitle>
            </CardHeader>
            <CardContent className="divide-y">
                {runs.map(run => (
                    <div key={run.id} className="py-3 first:pt-0 last:pb-0">
                        {run.status === 'RUNNING' && <RunningRun run={run} />}
                        {run.status === 'FAILED' && (
                            <div className="flex items-start gap-2 text-sm">
                                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                                <p>
                                    <span className="font-medium">Couldn&apos;t extract covenants from {run.sourceName ?? 'the agreement'}.</span>{' '}
                                    <span className="text-muted-foreground">{run.error ?? 'Unknown error'}</span>
                                </p>
                            </div>
                        )}
                        {run.status === 'DONE' && <DoneRun run={run} />}
                    </div>
                ))}
            </CardContent>
        </Card>
    )
}

// Polls the run until it finishes, then refreshes the page so the results come from the server.
function RunningRun({ run }: { run: AgreementRunView }) {
    const router = useRouter()
    const [stage, setStage] = useState(run.stage)

    useEffect(() => {
        let cancelled = false
        let timer: ReturnType<typeof setTimeout> | undefined
        // Each request is scheduled after the previous one returns, so they never overlap.
        const tick = async () => {
            try {
                const res = await fetch(`/api/extraction-runs/${run.id}`, { cache: 'no-store' })
                if (cancelled) return
                if (res.ok) {
                    const data: { status: string, stage: string | null } = await res.json()
                    if (cancelled) return
                    setStage(data.stage)
                    if (data.status !== 'RUNNING') {
                        router.refresh()
                        return
                    }
                } else if (res.status === 401 || res.status === 403 || res.status === 404) {
                    return
                }
            } catch {
                // Network blip: try again on the next tick.
            }
            if (!cancelled) timer = setTimeout(tick, POLL_MS)
        }
        timer = setTimeout(tick, POLL_MS)
        return () => {
            cancelled = true
            clearTimeout(timer)
        }
    }, [run.id, router])

    const current = Math.max(0, STEPS.findIndex(s => s.stage === stage))
    return (
        <div className="space-y-3">
            <p className="text-sm">
                Extracting covenants from <span className="font-medium">{run.sourceName ?? 'the agreement'}</span>
                <span className="text-muted-foreground"> · runs in the background, you can keep working</span>
            </p>
            <ol className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                {STEPS.map((step, i) => (
                    <li key={step.stage} className="flex items-center gap-2 text-sm sm:flex-1">
                        <span className={cn(
                            'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-colors',
                            i < current && 'border-emerald-500 bg-emerald-500 text-white',
                            i === current && 'border-primary bg-primary/10 text-primary animate-pulse',
                            i > current && 'text-muted-foreground',
                        )}>
                            {i < current ? <Check className="h-3.5 w-3.5" /> : i + 1}
                        </span>
                        <span className={cn(i === current ? 'font-medium' : 'text-muted-foreground')}>{step.label}</span>
                        {i < STEPS.length - 1 && <span className="hidden h-px flex-1 bg-border sm:block" />}
                    </li>
                ))}
            </ol>
        </div>
    )
}

function DoneRun({ run }: { run: AgreementRunView }) {
    const source = run.sourceName ?? 'the agreement'
    if (run.itemCount === 0) {
        return (
            <p className="text-sm text-muted-foreground">
                No financial covenants found in <span className="font-medium text-foreground">{source}</span>.
                Add covenants by pasting the clause instead.
            </p>
        )
    }
    const reviewed = run.itemCount - run.items.length
    return (
        <div className="space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm">
                    <span className="font-medium">{plural(run.itemCount, 'covenant')} found</span> in {source}
                    {reviewed > 0 && <span className="text-muted-foreground"> · {reviewed} reviewed</span>}
                </p>
                <Link href="/review" className="text-sm font-medium text-primary hover:underline">Open review queue</Link>
            </div>
            <ul className="space-y-2">
                {run.items.map(item => <ItemRow key={item.id} item={item} />)}
            </ul>
        </div>
    )
}

function ItemRow({ item }: { item: PendingExtractedItem }) {
    const router = useRouter()
    const [busy, setBusy] = useState<'approve' | 'reject' | null>(null)
    const [decided, setDecided] = useState<'approve' | 'reject' | null>(null)
    const [error, setError] = useState<string | null>(null)

    const review = async (action: 'approve' | 'reject') => {
        setBusy(action)
        setError(null)
        try {
            const res = await fetch(`/api/extracted-covenants/${item.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action }),
            })
            if (!res.ok) {
                const body = await res.json().catch(() => null)
                setError(typeof body?.error === 'string' ? body.error : `Request failed (${res.status})`)
                return
            }
            setDecided(action)
            router.refresh()
        } catch {
            setError('Could not reach the server. Try again.')
        } finally {
            setBusy(null)
        }
    }

    return (
        <li className="rounded-md border p-3 animate-fade-in">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{item.name}</span>
                        {item.verified
                            ? <Badge variant="success" title="The quote was found in the document">Verified</Badge>
                            : <Badge variant="warning" title="The quote was not found in the document; check it">Unverified</Badge>}
                    </div>
                    <p className="text-sm">
                        <span className="font-mono font-semibold">{formatThreshold(item.operator, item.limit)}</span>
                        <span className="text-muted-foreground"> · {item.metric}</span>
                        {item.page !== null && <span className="text-muted-foreground"> · page {item.page}</span>}
                    </p>
                </div>
                <div className="flex shrink-0 gap-2">
                    {decided ? (
                        <span className="text-sm text-muted-foreground">{decided === 'approve' ? 'Approved' : 'Rejected'}</span>
                    ) : (
                        <>
                            <Button size="sm" onClick={() => review('approve')} disabled={busy !== null}>
                                {busy === 'approve' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />}
                                Approve
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => review('reject')} disabled={busy !== null}>
                                {busy === 'reject' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <X className="mr-1 h-4 w-4" />}
                                Reject
                            </Button>
                        </>
                    )}
                </div>
            </div>
            <details className="mt-2 text-sm">
                <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">Show quote</summary>
                <blockquote className="mt-2 border-l-2 pl-3 italic text-muted-foreground whitespace-pre-line">{item.quote}</blockquote>
            </details>
            {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
        </li>
    )
}
