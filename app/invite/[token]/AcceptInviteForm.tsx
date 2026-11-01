'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { Button, Input } from '@/components/ui/core'

// minLength comes from the server page: lib/auth/invite uses node:crypto, so it stays server-side.
export function AcceptInviteForm({ token, initialName, minLength }: { token: string; initialName: string; minLength: number }) {
    const router = useRouter()
    const [name, setName] = useState(initialName)
    const [password, setPassword] = useState('')
    const [confirm, setConfirm] = useState('')
    const [error, setError] = useState('')
    const [isSaving, setIsSaving] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!name.trim()) return setError('Enter your name.')
        if (password.length < minLength) return setError(`Use at least ${minLength} characters for your password.`)
        if (password !== confirm) return setError('The passwords do not match.')
        setIsSaving(true)
        setError('')
        try {
            const res = await fetch('/api/invite', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, name, password }),
            })
            const data = await res.json().catch(() => null)
            if (res.ok) {
                router.push(data?.redirectTo ?? '/portal')
                router.refresh()
                return
            }
            const fieldErrors = data?.issues?.fieldErrors as Record<string, string[] | undefined> | undefined
            setError(fieldErrors?.password?.[0] ?? fieldErrors?.name?.[0] ?? data?.error ?? 'Could not set up your account.')
        } catch {
            setError('Could not reach the server. Try again.')
        }
        setIsSaving(false)
    }

    return (
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <label className="block space-y-2">
                <span className="text-sm font-medium">Your name</span>
                <Input value={name} onChange={e => setName(e.target.value)} autoComplete="name" autoFocus />
            </label>
            <label className="block space-y-2">
                <span className="text-sm font-medium">Password</span>
                <Input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" />
                <span className="block text-xs text-muted-foreground">At least {minLength} characters.</span>
            </label>
            <label className="block space-y-2">
                <span className="text-sm font-medium">Confirm password</span>
                <Input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="new-password" />
            </label>

            {error && <div role="alert" className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">{error}</div>}

            <Button className="w-full" type="submit" disabled={isSaving}>
                {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Create account
            </Button>
        </form>
    )
}
