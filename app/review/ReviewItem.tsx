'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2 } from 'lucide-react'
import { Button, Card, CardContent, CardHeader, Input, cn } from '@/components/ui/core'
import { Combobox } from '@/components/ui/Combobox'
import { FREQUENCY_LABELS } from '@/lib/covenants/new-covenant'
import { parseFromDate, undatedStepDowns, type StepDown } from '@/lib/covenants/test'
import { OPERATORS, REVIEW_FREQUENCIES, UNDATED_STEP_DOWN_ERROR, reviewEditsSchema, type ReviewEdits } from '@/lib/extraction/review'

const OPERATOR_LABELS: Record<(typeof OPERATORS)[number], string> = {
    '<=': 'At most (<=)',
    '<': 'Below (<)',
    '>=': 'At least (>=)',
    '>': 'Above (>)',
}

type Item = { id: string, name: string, operator: string, limit: number, stepDowns: StepDown[] }

// A step-down row in the form. original keeps the extracted text when its date couldn't be read.
type StepRow = { from: string, limit: string, original?: string }

// One pending extracted covenant: approve or reject as extracted, or edit first.
// summary is the server-rendered heading (name, threshold, badges); children the quote and source.
export default function ReviewItem({ item, flagged, duplicateOf, summary, children }: {
    item: Item
    flagged: boolean
    // Title of the facility covenant this one matches; approving needs a second click.
    duplicateOf: string | null
    summary: React.ReactNode
    children: React.ReactNode
}) {
    const router = useRouter()
    const [editing, setEditing] = useState(false)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)
    // Set once the reviewer has been told about a duplicate and can approve anyway.
    const [confirmDuplicate, setConfirmDuplicate] = useState(false)

    const [name, setName] = useState(item.name)
    const [frequency, setFrequency] = useState<string>('QUARTERLY')
    const [operator, setOperator] = useState(item.operator)
    const [limit, setLimit] = useState(String(item.limit))
    const [steps, setSteps] = useState<StepRow[]>(() => item.stepDowns.map(step => {
        const date = parseFromDate(step.from)
        return date ? { from: date, limit: String(step.limit) } : { from: '', limit: String(step.limit), original: step.from }
    }))

    // Only what differs from the extraction, so the audit shows the actual corrections.
    function changedEdits(): ReviewEdits {
        const edits: Record<string, unknown> = {}
        if (name.trim() !== item.name) edits.name = name
        if (frequency !== 'QUARTERLY') edits.frequency = frequency
        if (operator !== item.operator) edits.operator = operator
        if (Number(limit) !== item.limit) edits.limit = limit.trim() === '' ? NaN : Number(limit)
        const stepDowns = steps.map(s => ({ from: s.from, limit: s.limit.trim() === '' ? NaN : Number(s.limit) }))
        // Compared by date, so "June 30, 2027" shown as 2027-06-30 doesn't count as a change.
        const original = JSON.stringify(item.stepDowns.map(s => ({ from: parseFromDate(s.from) ?? s.from, limit: s.limit })))
        if (JSON.stringify(stepDowns) !== original) edits.stepDowns = stepDowns
        return edits as ReviewEdits
    }

    async function send(action: 'approve' | 'reject', allowDuplicate = false) {
        // An undated step-down can't be approved as extracted: open the form to date it.
        if (action === 'approve' && !editing && undatedStepDowns(item.stepDowns).length > 0) {
            setEditing(true)
            setError(UNDATED_STEP_DOWN_ERROR)
            return
        }
        let edits: ReviewEdits | undefined
        if (action === 'approve' && editing) {
            const parsed = reviewEditsSchema.safeParse(changedEdits())
            if (!parsed.success) {
                setError(parsed.error.issues[0]?.message ?? 'Check the fields')
                return
            }
            edits = parsed.data
        }
        setBusy(true)
        setError(null)
        try {
            const res = await fetch(`/api/extracted-covenants/${item.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, edits, allowDuplicate }),
            })
            if (!res.ok) {
                const body = await res.json().catch(() => null)
                if (res.status === 409 && body?.duplicate) setConfirmDuplicate(true)
                setError(body?.error ?? `Request failed (${res.status})`)
                return
            }
            router.refresh()
        } catch {
            setError('Could not reach the server. Try again.')
        } finally {
            setBusy(false)
        }
    }

    const setStep = (i: number, change: Partial<StepRow>) =>
        setSteps(rows => rows.map((row, j) => (j === i ? { ...row, ...change } : row)))

    return (
        <Card id={`item-${item.id}`} className={cn('scroll-mt-20', flagged && 'border-destructive border-2')}>
            <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-1">{summary}</div>
                <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" size="sm" disabled={busy} onClick={() => send('reject')}>Reject</Button>
                    <Button variant="outline" size="sm" disabled={busy} onClick={() => { setEditing(e => !e); setError(null) }}>
                        {editing ? 'Cancel edit' : 'Edit'}
                    </Button>
                    {confirmDuplicate || duplicateOf ? (
                        <Button
                            size="sm"
                            disabled={busy}
                            onClick={() => (confirmDuplicate ? send('approve', true) : (setConfirmDuplicate(true), setError(`This facility already has "${duplicateOf}". Approving adds a second covenant with its own obligations.`)))}
                        >
                            {confirmDuplicate ? 'Approve anyway' : 'Approve'}
                        </Button>
                    ) : (
                        <Button size="sm" disabled={busy} onClick={() => send('approve')}>{editing ? 'Approve with changes' : 'Approve'}</Button>
                    )}
                </div>
            </CardHeader>
            <CardContent className="space-y-3">
                {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

                {editing && (
                    <div className="space-y-4 rounded-md border bg-muted/30 p-4 text-sm">
                        <div className="grid gap-3 sm:grid-cols-2">
                            <Field label="Name" className="sm:col-span-2">
                                <Input value={name} onChange={e => setName(e.target.value)} />
                            </Field>
                            <Field label="Tested">
                                <Combobox
                                    searchable={false}
                                    options={REVIEW_FREQUENCIES.map(f => ({ value: f, label: FREQUENCY_LABELS[f] }))}
                                    value={frequency}
                                    onChange={setFrequency}
                                />
                            </Field>
                            <Field label="Limit">
                                <div className="flex gap-2">
                                    <div className="w-40 shrink-0">
                                        <Combobox
                                            searchable={false}
                                            options={OPERATORS.map(o => ({ value: o, label: OPERATOR_LABELS[o] }))}
                                            value={operator}
                                            onChange={setOperator}
                                        />
                                    </div>
                                    <Input type="number" step="any" min="0" inputMode="decimal" value={limit} onChange={e => setLimit(e.target.value)} aria-label="Limit" />
                                </div>
                            </Field>
                        </div>

                        <div className="space-y-2">
                            <p className="text-xs font-medium text-muted-foreground">Step-downs (later limits, from the test date on)</p>
                            {steps.length === 0 && <p className="text-xs text-muted-foreground">None.</p>}
                            {steps.map((step, i) => (
                                <div key={i} className="flex flex-wrap items-center gap-2">
                                    <span className="text-muted-foreground">From</span>
                                    <Input type="date" className="w-44" value={step.from} onChange={e => setStep(i, { from: e.target.value })} aria-label="Step-down start date" />
                                    <span className="text-muted-foreground">limit</span>
                                    <Input type="number" step="any" min="0" inputMode="decimal" className="w-28" value={step.limit} onChange={e => setStep(i, { limit: e.target.value })} aria-label="Step-down limit" />
                                    <Button variant="ghost" size="sm" onClick={() => setSteps(rows => rows.filter((_, j) => j !== i))} aria-label="Remove step-down">
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                    {step.original && !step.from && (
                                        <span className="w-full text-xs text-amber-600">Extracted as &ldquo;{step.original}&rdquo;: pick the date it starts.</span>
                                    )}
                                </div>
                            ))}
                            <Button variant="outline" size="sm" onClick={() => setSteps(rows => [...rows, { from: '', limit: '' }])}>
                                <Plus className="mr-1 h-4 w-4" /> Add step-down
                            </Button>
                        </div>
                    </div>
                )}

                {children}
            </CardContent>
        </Card>
    )
}

function Field({ label, className, children }: { label: string, className?: string, children: React.ReactNode }) {
    return (
        <label className={cn('flex flex-col gap-1 text-xs font-medium text-muted-foreground', className)}>
            {label}
            <div className="text-sm font-normal text-foreground">{children}</div>
        </label>
    )
}
