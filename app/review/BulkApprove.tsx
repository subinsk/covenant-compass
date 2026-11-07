'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCheck, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/core'

// Approves a facility's clean items in one go: verified, direction not in doubt,
// dated step-downs, not a duplicate. Anything else stays for one-by-one review.
export default function BulkApprove({ ids }: { ids: string[] }) {
    const router = useRouter()
    const [busy, setBusy] = useState(false)
    const [message, setMessage] = useState<string | null>(null)

    if (ids.length === 0) return null

    async function approveAll() {
        setBusy(true)
        setMessage(null)
        try {
            const res = await fetch('/api/extracted-covenants/approve', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids }),
            })
            const body = await res.json().catch(() => null)
            if (!res.ok) {
                setMessage(body?.error ?? `Request failed (${res.status})`)
                return
            }
            const skipped = body.skipped?.length ?? 0
            if (skipped > 0) setMessage(`Approved ${body.approved.length}. ${skipped} left for review: ${body.skipped[0].reason}`)
            router.refresh()
        } catch {
            setMessage('Could not reach the server. Try again.')
        } finally {
            setBusy(false)
        }
    }

    return (
        <span className="inline-flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" disabled={busy} onClick={approveAll} title="Approve every verified item without a warning, as extracted">
                {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <CheckCheck className="mr-1 h-4 w-4" />}
                Approve all verified ({ids.length})
            </Button>
            {message && <span role="status" className="text-xs font-normal text-muted-foreground">{message}</span>}
        </span>
    )
}
