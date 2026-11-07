'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/core'

type Action = 'approve' | 'reject' | 'restore'

export default function ReviewActions({ id, actions = ['reject', 'approve'] }: { id: string, actions?: Action[] }) {
    const router = useRouter()
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)

    async function review(action: Action) {
        setBusy(true)
        setError(null)
        try {
            const res = await fetch(`/api/extracted-covenants/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action }),
            })
            if (!res.ok) {
                const body = await res.json().catch(() => null)
                setError(body?.error ?? `Request failed (${res.status})`)
                return
            }
            router.refresh()
        } catch {
            setError('Request failed')
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="flex items-center gap-2">
            {error && <span className="text-xs text-destructive">{error}</span>}
            {actions.includes('restore') && <Button variant="outline" size="sm" disabled={busy} onClick={() => review('restore')}>Restore</Button>}
            {actions.includes('reject') && <Button variant="outline" size="sm" disabled={busy} onClick={() => review('reject')}>Reject</Button>}
            {actions.includes('approve') && <Button size="sm" disabled={busy} onClick={() => review('approve')}>Approve</Button>}
        </div>
    )
}
