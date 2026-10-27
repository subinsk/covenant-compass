'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Download, Loader2, X } from 'lucide-react'
import { Badge, Button } from '@/components/ui/core'
import { format } from 'date-fns'
import { formatPeriod } from '@/lib/format/period'
import type { OccurrenceAction } from '@/lib/occurrences/transitions'
import type { FacilityView } from './FacilityDetailView'

type Occurrence = FacilityView['occurrences'][number]

const RAG_VARIANT = { GREEN: 'success', AMBER: 'warning', RED: 'destructive' } as const

function Row({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex justify-between gap-4 border-b pb-2">
            <span className="text-muted-foreground">{label}</span>
            <span className="font-medium text-right">{children}</span>
        </div>
    )
}

// Side panel for one obligation: its details, evidence, and lender actions.
export function OccurrenceDetails({ occurrence, canManage, onClose }: {
    occurrence: Occurrence
    canManage: boolean
    onClose: () => void
}) {
    const router = useRouter()
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [waiving, setWaiving] = useState(false)
    const [reason, setReason] = useState('')

    const isOpen = occurrence.status === 'PENDING' || occurrence.status === 'OVERDUE'

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [onClose])

    async function act(action: OccurrenceAction) {
        setBusy(true)
        setError(null)
        try {
            const res = await fetch(`/api/occurrences/${occurrence.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(action === 'waive' ? { action, reason } : { action }),
            })
            if (!res.ok) {
                const json = await res.json().catch(() => null)
                setError(json?.error ?? `Request failed (${res.status})`)
                return
            }
            setWaiving(false)
            setReason('')
            router.refresh()
        } catch {
            setError('Could not reach the server. Try again.')
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-[2px] animate-fade-in" onClick={onClose}>
            <aside
                className="bg-background w-full max-w-md h-full overflow-y-auto border-l shadow-2xl p-6 space-y-6 animate-slide-in-right"
                onClick={e => e.stopPropagation()}
                aria-label="Obligation details"
            >
                <div className="flex justify-between items-start gap-4">
                    <div>
                        <h2 className="text-lg font-semibold">{occurrence.covenant.title}</h2>
                        <p className="text-sm text-muted-foreground">{formatPeriod(occurrence.periodStartDate, occurrence.periodEndDate)}</p>
                    </div>
                    <Button size="icon" variant="ghost" onClick={onClose} aria-label="Close">
                        <X className="w-4 h-4" />
                    </Button>
                </div>

                <div className="space-y-3 text-sm">
                    <Row label="Due date">{format(new Date(occurrence.dueDate), 'd MMM yyyy')}</Row>
                    <Row label="Status">
                        <Badge variant={occurrence.status === 'COMPLETED' ? 'success' : occurrence.status === 'OVERDUE' ? 'destructive' : 'secondary'}>
                            {occurrence.status}
                        </Badge>
                    </Row>
                    <Row label="RAG"><Badge variant={RAG_VARIANT[occurrence.ragStatus]}>{occurrence.ragStatus}</Badge></Row>
                    <Row label="Completed">{occurrence.completionDate ? format(new Date(occurrence.completionDate), 'd MMM yyyy') : '—'}</Row>
                </div>

                <div className="space-y-2 text-sm">
                    <h3 className="font-medium">Notes</h3>
                    <p className="whitespace-pre-wrap text-muted-foreground">{occurrence.notes || 'No notes.'}</p>
                </div>

                <div className="space-y-2 text-sm">
                    <h3 className="font-medium">Evidence</h3>
                    {occurrence.documents.length === 0 ? (
                        <p className="text-muted-foreground">No documents uploaded.</p>
                    ) : (
                        <ul className="space-y-2">
                            {occurrence.documents.map(doc => (
                                <li key={doc.id}>
                                    <a href={`/api/documents/${doc.id}`} className="inline-flex items-center text-blue-700 hover:underline">
                                        <Download className="w-3 h-3 mr-1" />
                                        {doc.fileName}
                                    </a>
                                    <div className="text-xs text-muted-foreground">
                                        {doc.uploadedBy.name}, {format(new Date(doc.uploadedAt), 'd MMM yyyy')}
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                {canManage && (
                    <div className="space-y-3 border-t pt-4">
                        {isOpen && !waiving && (
                            <div className="flex gap-2">
                                <Button disabled={busy} onClick={() => act('complete')}>
                                    {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                    Mark complete
                                </Button>
                                <Button variant="outline" disabled={busy} onClick={() => setWaiving(true)}>Waive…</Button>
                            </div>
                        )}
                        {isOpen && waiving && (
                            <div className="space-y-2">
                                <label htmlFor="waive-reason" className="text-sm font-medium">Reason for waiver</label>
                                <textarea
                                    id="waive-reason"
                                    className="w-full min-h-[80px] rounded-md border bg-background p-2 text-sm"
                                    value={reason}
                                    onChange={e => setReason(e.target.value)}
                                />
                                <div className="flex gap-2">
                                    <Button disabled={busy || !reason.trim()} onClick={() => act('waive')}>
                                        {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                        Waive
                                    </Button>
                                    <Button variant="ghost" disabled={busy} onClick={() => { setWaiving(false); setReason('') }}>Cancel</Button>
                                </div>
                            </div>
                        )}
                        {!isOpen && (
                            <Button variant="outline" disabled={busy} onClick={() => act('reopen')}>
                                {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                Reopen
                            </Button>
                        )}
                        {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
                    </div>
                )}
            </aside>
        </div>
    )
}
