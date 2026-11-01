'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { Building2, CircleCheck, Loader2, Pencil, Plus, UserRound } from 'lucide-react'
import { Button, Input } from '@/components/ui/core'
import { useOverlay } from '@/components/ui/useOverlay'
import { InviteLink, type Invite } from '@/components/features/BorrowerInvite'
import { saveErrorMessage } from '@/lib/covenants/new-covenant'
import {
    EMPTY_BORROWER_FORM, borrowerFormErrors, buildBorrowerRequestBody, buildBorrowerUpdateBody, type BorrowerForm,
} from '@/lib/borrowers/new-borrower'

export type CreatedBorrower = { id: string; name: string }
// The borrower being edited, with the form pre-filled from it.
export type EditedBorrower = { id: string; form: BorrowerForm }

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
                    onSaved={() => { setIsOpen(false); router.refresh() }}
                />,
                document.body
            )}
        </>
    )
}

export function EditBorrowerButton({ borrower }: { borrower: EditedBorrower }) {
    const router = useRouter()
    const [isOpen, setIsOpen] = useState(false)
    return (
        <>
            <button
                type="button"
                onClick={() => setIsOpen(true)}
                aria-label={`Edit ${borrower.form.name}`}
                title="Edit borrower"
                // Above the row's stretched link.
                className="relative z-10 rounded p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
                <Pencil className="h-4 w-4" />
            </button>
            {isOpen && createPortal(
                <NewBorrowerModal
                    borrower={borrower}
                    onClose={() => setIsOpen(false)}
                    onSaved={() => { setIsOpen(false); router.refresh() }}
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

// Form for a new borrower organization, or for editing one when `borrower` is given.
// `initialName` pre-fills the name, e.g. with what was typed in a borrower search.
export function NewBorrowerModal({ onClose, onSaved, borrower, initialName = '', stacked = false }: {
    onClose: () => void
    onSaved: (borrower: CreatedBorrower) => void
    borrower?: EditedBorrower
    initialName?: string
    // Opened on top of another modal: sits above it.
    stacked?: boolean
}) {
    const isEdit = !!borrower
    // Set once the borrower is saved with a contact email: the modal then shows the invite.
    const [created, setCreated] = useState<{ borrower: CreatedBorrower; invite: Invite | null; inviteError?: string } | null>(null)
    const backdrop = useOverlay(() => (created ? onSaved(created.borrower) : onClose()))
    const [form, setForm] = useState<BorrowerForm>(borrower?.form ?? { ...EMPTY_BORROWER_FORM, name: initialName })
    const [submitted, setSubmitted] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [message, setMessage] = useState<string | null>(null)
    const [serverErrors, setServerErrors] = useState<Partial<Record<keyof BorrowerForm, string>>>({})

    // Editing sends every field so a blanked one is cleared.
    const body = isEdit ? buildBorrowerUpdateBody(form) : buildBorrowerRequestBody(form)
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
            const res = await fetch(isEdit ? `/api/borrowers/${borrower.id}` : '/api/borrowers', {
                method: isEdit ? 'PATCH' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            })
            const data = await res.json().catch(() => null)
            if (res.ok && data?.id) {
                const saved = { id: data.id, name: data.name }
                if (data.invite || data.inviteError) setCreated({ borrower: saved, invite: data.invite, inviteError: data.inviteError })
                else onSaved(saved)
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

    if (created) {
        const done = () => onSaved(created.borrower)
        return (
            <div
                {...backdrop}
                className={`fixed inset-0 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-fade-in ${stacked ? 'z-[60]' : 'z-50'}`}
            >
                <div role="dialog" aria-modal="true" aria-labelledby="borrower-added-title" className="bg-background w-full max-w-lg rounded-lg border p-6 shadow-lg space-y-4 animate-fade-up">
                    <h2 id="borrower-added-title" className="flex items-center gap-2 text-lg font-semibold">
                        <CircleCheck className="h-5 w-5 text-emerald-600" />
                        {created.borrower.name} added
                    </h2>
                    {created.invite && <InviteLink invite={created.invite} />}
                    {created.inviteError && <p role="status" className="rounded-md bg-amber-500/10 p-3 text-sm text-amber-800">{created.inviteError}</p>}
                    <div className="flex justify-end border-t pt-4">
                        <Button type="button" onClick={done}>Done</Button>
                    </div>
                </div>
            </div>
        )
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
                        <h2 id="new-borrower-title" className="text-lg font-semibold">{isEdit ? 'Edit Borrower' : 'Add Borrower'}</h2>
                        <p className="text-sm text-muted-foreground">Only your organization can see this borrower.</p>
                    </div>
                    <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">✕</button>
                </div>

                <Section icon={<Building2 className="h-4 w-4" />} title="Company">
                    <Field label="Name" error={shown.name}>
                        <Input autoFocus value={form.name} onChange={set('name')} placeholder="e.g. Initech" />
                    </Field>
                    <Field label="Legal name (optional)">
                        <Input value={form.legalName} onChange={set('legalName')} placeholder="e.g. Initech Holdings Ltd." />
                    </Field>
                    <Field label="Registration number (optional)">
                        <Input value={form.registrationNumber} onChange={set('registrationNumber')} />
                    </Field>
                    <Field label="Industry (optional)">
                        <Input value={form.industry} onChange={set('industry')} placeholder="e.g. Manufacturing" />
                    </Field>
                    <Field label="Country (optional)">
                        <Input value={form.country} onChange={set('country')} placeholder="e.g. United States" />
                    </Field>
                    <Field label="Website (optional)">
                        <Input value={form.website} onChange={set('website')} placeholder="e.g. initech.com" />
                    </Field>
                </Section>

                <Section icon={<UserRound className="h-4 w-4" />} title="Primary contact">
                    <Field label="Name (optional)">
                        <Input value={form.contactName} onChange={set('contactName')} placeholder="e.g. Bill Lumbergh" />
                    </Field>
                    <Field label={isEdit ? 'Email (optional)' : 'Email (optional, gets a portal invite)'} error={shown.contactEmail}>
                        <Input type="email" value={form.contactEmail} onChange={set('contactEmail')} placeholder="e.g. cfo@initech.com" />
                        {isEdit && (
                            <span className="block text-xs text-muted-foreground">
                                Doesn&apos;t change the login email of a portal user who already exists.
                            </span>
                        )}
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
                        {isEdit ? 'Save changes' : 'Add Borrower'}
                    </Button>
                </div>
            </form>
        </div>
    )
}
