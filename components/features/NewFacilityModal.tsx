'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { Loader2, Plus } from 'lucide-react'
import { Button, Input } from '@/components/ui/core'
import { Combobox } from '@/components/ui/Combobox'
import { useOverlay } from '@/components/ui/useOverlay'
import { saveErrorMessage } from '@/lib/covenants/new-covenant'
import {
    buildFacilityRequestBody, EMPTY_FACILITY_FORM, facilityFormErrors, type FacilityForm,
} from '@/lib/facilities/new-facility'

type Borrower = { id: string, name: string }

export function NewFacilityButton({ borrowers }: { borrowers: Borrower[] }) {
    const [isOpen, setIsOpen] = useState(false)
    return (
        <>
            <Button onClick={() => setIsOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                New Facility
            </Button>
            {/* Portal to body so styles on the page around the button can't clip or cover the modal */}
            {isOpen && createPortal(<NewFacilityModal borrowers={borrowers} onClose={() => setIsOpen(false)} />, document.body)}
        </>
    )
}

function Field({ label, error, children }: { label: string, error?: string, children: React.ReactNode }) {
    return (
        <label className="space-y-1 block">
            <span className="text-xs font-medium text-muted-foreground">{label}</span>
            {children}
            {error && <span className="block text-xs text-destructive">{error}</span>}
        </label>
    )
}

export function NewFacilityModal({ borrowers, onClose }: { borrowers: Borrower[], onClose: () => void }) {
    const router = useRouter()
    const [form, setForm] = useState<FacilityForm>(EMPTY_FACILITY_FORM)
    const [submitted, setSubmitted] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [message, setMessage] = useState<string | null>(null)

    const body = buildFacilityRequestBody(form)
    const errors = facilityFormErrors(body)
    const shown = submitted ? errors : {}
    const set = (field: keyof FacilityForm) =>
        (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
            setForm({ ...form, [field]: e.target.value })

    const backdrop = useOverlay(onClose)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setSubmitted(true)
        if (Object.keys(errors).length > 0) return
        setIsSaving(true)
        setMessage(null)
        try {
            const res = await fetch('/api/facilities', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            })
            const data = await res.json().catch(() => null)
            if (res.ok && data?.id) {
                router.push(`/facilities/${data.id}`)
                return
            }
            setMessage(saveErrorMessage(res.status, data))
        } catch (err) {
            console.error(err)
            setMessage('Could not reach the server. Try again.')
        }
        setIsSaving(false)
    }

    return (
        <div {...backdrop} className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-contain bg-black/50 p-4 backdrop-blur-sm animate-fade-in sm:items-center">
            <form
                onSubmit={handleSubmit}
                noValidate
                role="dialog"
                aria-modal="true"
                aria-labelledby="new-facility-title"
                className="bg-background w-full max-w-lg rounded-lg shadow-lg border p-6 space-y-4 animate-fade-up"
            >
                <div className="flex justify-between items-center">
                    <h2 id="new-facility-title" className="text-lg font-semibold">New Facility</h2>
                    <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">✕</button>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                        <Field label="Name" error={shown.name}>
                            <Input value={form.name} onChange={set('name')} />
                        </Field>
                    </div>
                    <Field label="Borrower" error={shown.borrowerOrgId}>
                        <Combobox
                            options={borrowers.map(b => ({ value: b.id, label: b.name }))}
                            value={form.borrowerOrgId}
                            onChange={borrowerOrgId => setForm({ ...form, borrowerOrgId })}
                            placeholder="Select a borrower"
                            searchPlaceholder="Search borrowers…"
                            invalid={!!shown.borrowerOrgId}
                        />
                    </Field>
                    <Field label="Facility reference (optional)" error={shown.facilityReference}>
                        <Input value={form.facilityReference} onChange={set('facilityReference')} />
                    </Field>
                    <Field label="Currency" error={shown.currency}>
                        <Input value={form.currency} onChange={set('currency')} maxLength={3} />
                    </Field>
                    <Field label="Total commitment" error={shown.totalCommitment}>
                        <Input value={form.totalCommitment} onChange={set('totalCommitment')} inputMode="decimal" placeholder="10,000,000" />
                    </Field>
                    <Field label="Start date" error={shown.startDate}>
                        <Input type="date" value={form.startDate} onChange={set('startDate')} />
                    </Field>
                    <Field label="End date" error={shown.endDate}>
                        <Input type="date" value={form.endDate} onChange={set('endDate')} />
                    </Field>
                    <div className="col-span-2">
                        <Field label="Description (optional)">
                            <textarea
                                className="w-full min-h-[80px] p-3 rounded-md border bg-transparent text-sm"
                                value={form.description}
                                onChange={set('description')}
                            />
                        </Field>
                    </div>
                </div>

                {message && <p role="alert" className="text-sm text-destructive">{message}</p>}

                <div className="flex justify-end gap-2 pt-2">
                    <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
                    <Button type="submit" disabled={isSaving}>
                        {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                        Create Facility
                    </Button>
                </div>
            </form>
        </div>
    )
}
