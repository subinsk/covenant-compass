'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { Loader2, Pencil, Plus } from 'lucide-react'
import { Button, Input } from '@/components/ui/core'
import { Combobox } from '@/components/ui/Combobox'
import { useOverlay } from '@/components/ui/useOverlay'
import { NewBorrowerModal } from './NewBorrowerModal'
import { saveErrorMessage } from '@/lib/covenants/new-covenant'
import {
    buildFacilityRequestBody, buildFacilityUpdateBody, EMPTY_FACILITY_FORM, FACILITY_STATUSES, facilityFormErrors,
    facilityUpdateErrors, type EditFacilityForm, type FacilityStatusValue,
} from '@/lib/facilities/new-facility'

type Borrower = { id: string, name: string }

// The facility being edited: its id, its borrower's name and the form pre-filled from it.
export type EditedFacility = { id: string, borrowerName: string, form: EditFacilityForm }

const STATUS_LABEL: Record<FacilityStatusValue, string> = { ACTIVE: 'Active', MATURED: 'Matured', DEFAULTED: 'Defaulted' }

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

export function EditFacilityButton({ facility }: { facility: EditedFacility }) {
    const [isOpen, setIsOpen] = useState(false)
    return (
        <>
            <Button variant="outline" onClick={() => setIsOpen(true)}>
                <Pencil className="w-4 h-4 mr-2" />
                Edit
            </Button>
            {isOpen && createPortal(<NewFacilityModal borrowers={[]} facility={facility} onClose={() => setIsOpen(false)} />, document.body)}
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

// Creates a facility, or edits one when `facility` is given (the borrower then stays fixed).
export function NewFacilityModal({ borrowers: initialBorrowers, facility, onClose }: {
    borrowers: Borrower[]
    facility?: EditedFacility
    onClose: () => void
}) {
    const router = useRouter()
    const isEdit = !!facility
    const [form, setForm] = useState<EditFacilityForm>(facility?.form ?? { ...EMPTY_FACILITY_FORM, status: 'ACTIVE' })
    // Borrowers added from this form join the list without a reload.
    const [borrowers, setBorrowers] = useState(initialBorrowers)
    // Name to pre-fill when the Add Borrower modal is open on top; null when closed.
    const [newBorrowerName, setNewBorrowerName] = useState<string | null>(null)
    const [submitted, setSubmitted] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [message, setMessage] = useState<string | null>(null)

    const body = isEdit ? buildFacilityUpdateBody(form) : buildFacilityRequestBody(form)
    const errors: Partial<Record<keyof EditFacilityForm, string>> = isEdit
        ? facilityUpdateErrors(buildFacilityUpdateBody(form))
        : facilityFormErrors(buildFacilityRequestBody(form))
    const shown = submitted ? errors : {}
    const set = (field: keyof EditFacilityForm) =>
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
            const res = await fetch(isEdit ? `/api/facilities/${facility.id}` : '/api/facilities', {
                method: isEdit ? 'PATCH' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            })
            const data = await res.json().catch(() => null)
            if (res.ok && data?.id) {
                if (isEdit) {
                    router.refresh()
                    onClose()
                } else {
                    router.push(`/facilities/${data.id}`)
                }
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
                    <h2 id="new-facility-title" className="text-lg font-semibold">{isEdit ? 'Edit Facility' : 'New Facility'}</h2>
                    <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">✕</button>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                        <Field label="Name" error={shown.name}>
                            <Input value={form.name} onChange={set('name')} />
                        </Field>
                    </div>
                    {isEdit ? (
                        <Field label="Borrower">
                            <Input value={facility.borrowerName} disabled title="The borrower can't be changed" />
                        </Field>
                    ) : (
                        <Field label="Borrower" error={shown.borrowerOrgId}>
                            <Combobox
                                options={borrowers.map(b => ({ value: b.id, label: b.name }))}
                                value={form.borrowerOrgId}
                                onChange={borrowerOrgId => setForm({ ...form, borrowerOrgId })}
                                placeholder="Select a borrower"
                                searchPlaceholder="Search borrowers…"
                                invalid={!!shown.borrowerOrgId}
                                onCreate={name => setNewBorrowerName(name)}
                                createLabel="Add new borrower"
                            />
                        </Field>
                    )}
                    <Field label={isEdit ? 'Facility reference' : 'Facility reference (optional)'} error={shown.facilityReference}>
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
                    {isEdit && (
                        <Field label="Status">
                            <select className="w-full h-10 px-3 rounded-md border text-sm bg-background" value={form.status} onChange={set('status')}>
                                {FACILITY_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                            </select>
                        </Field>
                    )}
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
                        {isEdit ? 'Save changes' : 'Create Facility'}
                    </Button>
                </div>
            </form>

            {newBorrowerName !== null && createPortal(
                <NewBorrowerModal
                    stacked
                    initialName={newBorrowerName}
                    onClose={() => setNewBorrowerName(null)}
                    onSaved={borrower => {
                        setBorrowers(list => [...list, borrower].sort((a, b) => a.name.localeCompare(b.name)))
                        setForm(f => ({ ...f, borrowerOrgId: borrower.id }))
                        setNewBorrowerName(null)
                        // So the page's borrower list includes it next time the form opens.
                        router.refresh()
                    }}
                />,
                document.body
            )}
        </div>
    )
}
