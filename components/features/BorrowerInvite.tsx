'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { Check, Copy, Loader2, RefreshCw, UserPlus } from 'lucide-react'
import { Badge, Button, Input } from '@/components/ui/core'
import { useOverlay } from '@/components/ui/useOverlay'
import type { PortalAccess } from '@/lib/borrowers/invite'

export type Invite = { email: string; path: string; expiresAt: string }

// The invite link with a copy button. There's no email sending yet, so the lender
// passes the link on themselves.
export function InviteLink({ invite }: { invite: Invite }) {
    const [copied, setCopied] = useState(false)
    const url = `${window.location.origin}${invite.path}`

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(url)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        } catch {
            // Clipboard blocked (e.g. not a secure context): the field can still be selected by hand.
        }
    }

    return (
        <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
                Send this link to <span className="font-medium text-foreground">{invite.email}</span> so they can set a password
                and sign in to the borrower portal. It works once and expires on {format(new Date(invite.expiresAt), 'd MMM yyyy')}.
            </p>
            <div className="flex gap-2">
                <Input readOnly value={url} aria-label="Invite link" onFocus={e => e.target.select()} className="font-mono text-xs" />
                <Button type="button" variant="outline" onClick={copy} className="shrink-0">
                    {copied ? <Check className="w-4 h-4 mr-2 text-emerald-600" /> : <Copy className="w-4 h-4 mr-2" />}
                    {copied ? 'Copied' : 'Copy invite link'}
                </Button>
            </div>
        </div>
    )
}

function InviteModal({ borrowerName, onClose, children }: { borrowerName: string; onClose: () => void; children: React.ReactNode }) {
    const backdrop = useOverlay(onClose)
    return (
        <div {...backdrop} className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-fade-in">
            <div role="dialog" aria-modal="true" aria-labelledby="invite-title" className="bg-background w-full max-w-lg rounded-lg border p-6 shadow-lg space-y-4 animate-fade-up">
                <div className="flex items-center justify-between">
                    <h2 id="invite-title" className="text-lg font-semibold">Portal invite for {borrowerName}</h2>
                    <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">✕</button>
                </div>
                {children}
            </div>
        </div>
    )
}

// Portal status for one borrower on the Borrowers page, with the action that fits it:
// invite a first user, or renew a pending invite's link.
export function BorrowerPortalAccess({ borrowerId, borrowerName, contactEmail, access }: {
    borrowerId: string
    borrowerName: string
    contactEmail: string | null
    access: PortalAccess
}) {
    const router = useRouter()
    const [open, setOpen] = useState(false)
    const [email, setEmail] = useState(contactEmail ?? '')
    const [invite, setInvite] = useState<Invite | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [isSaving, setIsSaving] = useState(false)

    const request = async (body: { email?: string }) => {
        setIsSaving(true)
        setError(null)
        try {
            const res = await fetch(`/api/borrowers/${borrowerId}/invite`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            })
            const data = await res.json().catch(() => null)
            if (res.ok && data?.path) setInvite(data)
            else setError(data?.issues?.fieldErrors?.email?.[0] ?? data?.error ?? 'Could not create the invite.')
        } catch {
            setError('Could not reach the server. Try again.')
        }
        setIsSaving(false)
    }

    const start = () => {
        setOpen(true)
        setInvite(null)
        setError(null)
        // A borrower with no user and no contact email needs an email first.
        if (access.status === 'INVITED' || contactEmail) void request({})
    }

    const close = () => {
        setOpen(false)
        // Pick up the new status (e.g. No user -> Invited).
        if (invite) router.refresh()
    }

    if (access.status === 'ACTIVE') return <Badge variant="success">Active</Badge>

    return (
        // Sits above the row's stretched link so the button gets the click.
        <div className="relative z-10 flex flex-col items-start gap-1">
            {access.status === 'INVITED'
                ? <Badge variant={access.expired ? 'secondary' : 'warning'} title={access.email}>{access.expired ? 'Invite expired' : 'Invited'}</Badge>
                : <span className="text-xs text-muted-foreground">No portal user</span>}
            <button
                type="button"
                onClick={start}
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
                {access.status === 'INVITED'
                    ? <><RefreshCw className="h-3 w-3" />Regenerate link</>
                    : <><UserPlus className="h-3 w-3" />Invite user</>}
            </button>

            {open && createPortal(
                <InviteModal borrowerName={borrowerName} onClose={close}>
                    {invite ? (
                        <InviteLink invite={invite} />
                    ) : isSaving ? (
                        <p className="flex items-center text-sm text-muted-foreground"><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating invite link…</p>
                    ) : access.status === 'NONE' ? (
                        <form
                            noValidate
                            className="space-y-3"
                            onSubmit={e => { e.preventDefault(); void request({ email: email.trim() }) }}
                        >
                            <label className="block space-y-1">
                                <span className="text-xs font-medium text-muted-foreground">Email of the person to invite</span>
                                <Input type="email" autoFocus value={email} onChange={e => setEmail(e.target.value)} placeholder="e.g. cfo@initech.com" />
                            </label>
                            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
                            <div className="flex justify-end">
                                <Button type="submit" disabled={!email.trim()}>Create invite link</Button>
                            </div>
                        </form>
                    ) : (
                        error && <p role="alert" className="text-sm text-destructive">{error}</p>
                    )}
                    {invite && (
                        <p className="text-xs text-muted-foreground">Generating a new link later cancels this one.</p>
                    )}
                </InviteModal>,
                document.body,
            )}
        </div>
    )
}
