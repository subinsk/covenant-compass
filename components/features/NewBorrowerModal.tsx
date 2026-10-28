'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { Building2, Loader2, Plus, UserRound } from 'lucide-react'
import { Button, Input } from '@/components/ui/core'
import { useOverlay } from '@/components/ui/useOverlay'
import { saveErrorMessage } from '@/lib/covenants/new-covenant'
import {
    EMPTY_BORROWER_FORM, borrowerFormErrors, buildBorrowerRequestBody, type BorrowerForm,
} from '@/lib/borrowers/new-borrower'

export type CreatedBorrower = { id: string; name: string }

export function NewBorrowerButton() {
    const router = useRouter()
    const [isOpen, setIsOpen] = useState(false)
    return (
        <>
            <Button onClick={() => setIsOpen(true)} className="shadow-sm transition-all hover:shadow-md active:scale-[0.98]">
                <Plus className="w-4 h-4 mr-2" />
                Add Borrower
            </Button>
            {isOpen && createPortal(
                <NewBorrowerModal
                    onClose={() => setIsOpen(false)}
                    onCreated={() => { setIsOpen(false); router.refresh() }}
                />,
                document.body
            )}
        </>
    )
}

function Field({ label, error, className, children }: { label: string; error?: string; className?: string; children: React.ReactNode }) {
    return (
        <label className={`block space-y-1 ${className ?? ''}`}>
            <span className="text-xs font-medium text-muted-foreground">{label}</span>
            {children}
            {error && <span className="block text-xs text-destructive">{error}</span>}
        </label>
    )
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
    return (
        <fieldset className="space-y-3">
            <legend className="mb-3 flex items-center gap-2 text-sm font-medium">
                <span className="rounded-md bg-muted p-1 text-muted-foreground">{icon}</span>
                {title}
            </legend>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
        </fieldset>
    )
}

// Form for a new borrower organization. `initialName` pre-fills the name, e.g.
// with what was typed in a borrower search.
export function NewBorrowerModal({ onClose, onCreated, initialName = '', stacked = false }: {
    onClose: () => void
    onCreated: (borrower: CreatedBorrower) => void
    initialName?: string
    // Opened on top of another modal: sits above it.
    stacked?: boolean
}) {
    const backdrop = useOverlay(onClose)
    const [form, setForm] = useState<BorrowerForm>({ ...EMPTY_BORROWER_FORM, name: initialName })
    const [submitted, setSubmitted] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [message, setMessage] = useState<string | null>(null)
    const [serverErrors, setServerErrors] = useState<Partial<Record<keyof BorrowerForm, string>>>({})

    const body = buildBorrowerRequestBody(form)
    const errors = borrowerFormErrors(body)
    const shown = { ...(submitted ? errors : {}), ...serverErrors }
    const set = (field: keyof BorrowerForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setForm({ ...form, [field]: e.target.value })
        setServerErrors(prev => {
            const next = { ...prev }
            delete next[field]
            return next
        })
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        // Don't let the submit bubble to a form this modal is stacked over.
        e.stopPropagation()
        setSubmitted(true)
        if (Object.keys(errors).length > 0) return
        setIsSaving(true)
        setMessage(null)
        try {
            const res = await fetch('/api/borrowers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            })
            const data = await res.json().catch(() => null)
            if (res.ok && data?.id) {
                onCreated({ id: data.id, name: data.name })
                return
            }
            const fieldErrors = data?.issues?.fieldErrors as Record<string, string[] | undefined> | undefined
            const inline = Object.fromEntries(
                Object.entries(fieldErrors ?? {}).filter(([k, v]) => k in EMPTY_BORROWER_FORM && v?.length).map(([k, v]) => [k, v![0]])
            )
            if (Object.keys(inline).length > 0) setServerErrors(inline)
            else setMessage(saveErrorMessage(res.status, data))
        } catch (err) {
            console.error(err)
            setMessage('Could not reach the server. Try again.')
        }
        setIsSaving(false)
    }

    return (
        <div
            {...backdrop}
            className={`fixed inset-0 flex items-start justify-center overflow-y-auto overscroll-contain bg-black/50 p-4 backdrop-blur-sm animate-fade-in sm:items-center ${stacked ? 'z-[60]' : 'z-50'}`}
        >
            <form
                onSubmit={handleSubmit}
                noValidate
                role="dialog"
                aria-modal="true"
                aria-labelledby="new-borrower-title"
                className="bg-background w-full max-w-2xl rounded-lg border p-6 shadow-lg space-y-6 animate-fade-up"
            >
                <div className="flex items-center justify-between">
                    <div>
                        <h2 id="new-borrower-title" className="text-lg font-semibold">Add Borrower</h2>
                        <p className="text-sm text-muted-foreground">Only your organization can see this borrower.</p>
                    </div>
                    <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">✕</button>
                </div>

                <Section icon={<Building2 className="h-4 w-4" />} title="Company">
                    <Field label="Name" error={shown.name}>
                        <Input autoFocus value={form.name} onChange={set('name')} placeholder="Initech" />
                    </Field>
                    <Field label="Legal name (optional)">
                        <Input value={form.legalName} onChange={set('legalName')} placeholder="Initech Holdings Ltd." />
                    </Field>
                    <Field label="Registration number (optional)">
                        <Input value={form.registrationNumber} onChange={set('registrationNumber')} />
                    </Field>
                    <Field label="Industry (optional)">
                        <Input value={form.industry} onChange={set('industry')} placeholder="Manufacturing" />
                    </Field>
                    <Field label="Country (optional)">
                        <Input value={form.country} onChange={set('country')} placeholder="United States" />
                    </Field>
                    <Field label="Website (optional)">
                        <Input value={form.website} onChange={set('website')} placeholder="initech.com" />
                    </Field>
                </Section>

                <Section icon={<UserRound className="h-4 w-4" />} title="Primary contact">
                    <Field label="Name (optional)">
                        <Input value={form.contactName} onChange={set('contactName')} placeholder="Bill Lumbergh" />
                    </Field>
                    <Field label="Email (optional)" error={shown.contactEmail}>
                        <Input type="email" value={form.contactEmail} onChange={set('contactEmail')} placeholder="cfo@initech.com" />
                    </Field>
                    <Field label="Phone (optional)">
                        <Input type="tel" value={form.contactPhone} onChange={set('contactPhone')} />
                    </Field>
                    <Field label="Address (optional)">
                        <Input value={form.address} onChange={set('address')} />
                    </Field>
                    <Field label="Notes (optional)" className="sm:col-span-2">
                        <textarea
                            className="w-full min-h-[72px] rounded-md border bg-transparent p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            value={form.notes}
                            onChange={set('notes')}
                        />
                    </Field>
                </Section>

                {message && <p role="alert" className="text-sm text-destructive">{message}</p>}

                <div className="flex justify-end gap-2 border-t pt-4">
                    <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
                    <Button type="submit" disabled={isSaving}>
                        {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                        Add Borrower
                    </Button>
                </div>
            </form>
        </div>
    )
}
