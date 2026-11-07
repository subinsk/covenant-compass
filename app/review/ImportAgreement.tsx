'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input } from '@/components/ui/core'
import { Combobox } from '@/components/ui/Combobox'

export type RunSummary = {
    id: string
    facilityName: string
    sourceUrl: string | null
    sourceName: string | null
    sourceHref: string | null
    status: 'RUNNING' | 'DONE' | 'FAILED'
    error: string | null
    itemCount: number
    createdAt: string
}

const POLL_MS = 4000

export default function ImportAgreement({ facilities, runs }: { facilities: { id: string, name: string, facilityReference: string }[], runs: RunSummary[] }) {
    const router = useRouter()
    // No default: picking the facility is deliberate, so an import can't land on the wrong one.
    const [facilityId, setFacilityId] = useState('')
    const [url, setUrl] = useState('')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Refresh the page while a run is in progress so its status and items show up.
    const running = runs.some((run) => run.status === 'RUNNING')
    useEffect(() => {
        if (!running) return
        const timer = setInterval(() => router.refresh(), POLL_MS)
        return () => clearInterval(timer)
    }, [running, router])

    async function submit(e: React.FormEvent) {
        e.preventDefault()
        setBusy(true)
        setError(null)
        try {
            const res = await fetch('/api/extraction-runs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ facilityId, url }),
            })
            if (!res.ok) {
                const body = await res.json().catch(() => null)
                const fieldError = body?.issues?.fieldErrors && Object.values(body.issues.fieldErrors).flat()[0]
                setError(typeof fieldError === 'string' ? fieldError : body?.error ?? `Request failed (${res.status})`)
                return
            }
            setUrl('')
            router.refresh()
        } catch {
            setError('Request failed')
        } finally {
            setBusy(false)
        }
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Import agreement</CardTitle>
                <p className="text-sm text-muted-foreground">
                    Read the financial covenants from a credit agreement on EDGAR. They appear below for review when the import is done.
                </p>
            </CardHeader>
            <CardContent className="space-y-4">
                {facilities.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Add an active facility first.</p>
                ) : (
                    <form onSubmit={submit} className="flex flex-col gap-2 md:flex-row md:items-center">
                        <div className="shrink-0 md:w-80">
                            <Combobox
                                options={facilities.map((f) => ({ value: f.id, label: f.name, hint: f.facilityReference }))}
                                value={facilityId}
                                onChange={setFacilityId}
                                placeholder="Choose a facility"
                                searchPlaceholder="Search name or reference"
                            />
                        </div>
                        <Input
                            aria-label="Agreement URL"
                            type="url"
                            required
                            placeholder="https://www.sec.gov/Archives/edgar/data/..."
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                        />
                        <Button type="submit" disabled={busy || !facilityId}>{busy ? 'Starting...' : 'Import'}</Button>
                    </form>
                )}
                {error && <p className="text-sm text-destructive">{error}</p>}

                {runs.length > 0 && (
                    <ul className="divide-y text-sm">
                        {runs.map((run) => (
                            <li key={run.id} className="flex flex-col gap-1 py-2 md:flex-row md:items-center md:justify-between">
                                <div className="min-w-0">
                                    <span className="font-medium">{run.facilityName}</span>
                                    <span className="text-muted-foreground"> · {run.createdAt.slice(0, 16).replace('T', ' ')} · </span>
                                    {run.sourceHref ? (
                                        <a href={run.sourceHref} target="_blank" rel="noreferrer" className="break-all text-muted-foreground hover:underline">
                                            {run.sourceName ?? run.sourceUrl?.split('/').pop()}
                                        </a>
                                    ) : (
                                        <span className="break-all text-muted-foreground">{run.sourceName ?? 'Uploaded agreement'}</span>
                                    )}
                                </div>
                                <RunStatus run={run} />
                            </li>
                        ))}
                    </ul>
                )}
            </CardContent>
        </Card>
    )
}

function RunStatus({ run }: { run: RunSummary }) {
    if (run.status === 'RUNNING') {
        return (
            <span className="flex items-center gap-1 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Extracting...
            </span>
        )
    }
    if (run.status === 'FAILED') return <span className="text-destructive">Failed: {run.error ?? 'unknown error'}</span>
    return <Badge variant="success">{run.itemCount} covenant{run.itemCount === 1 ? '' : 's'} found</Badge>
}
