'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatDistanceToNow } from 'date-fns'
import { Bell, ChevronRight, Loader2 } from 'lucide-react'
import { Button, Card, CardContent, cn } from '@/components/ui/core'
import { NOTIFICATIONS_CHANGED } from '@/components/layout/NotificationBell'

export type NotificationItem = {
    id: string
    text: string
    facilityName: string | null
    href: string
    createdAt: string
    unread: boolean
}

// Notification lines: opening one marks it read; "Mark all read" clears the rest.
export function NotificationList({ items: initial }: { items: NotificationItem[] }) {
    const router = useRouter()
    const [items, setItems] = useState(initial)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const unreadCount = items.filter(i => i.unread).length

    function markedRead(ids: string[] | 'all') {
        setItems(list => list.map(i => (ids === 'all' || ids.includes(i.id) ? { ...i, unread: false } : i)))
        window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED))
    }

    async function open(item: NotificationItem) {
        if (item.unread) {
            const res = await fetch(`/api/notifications/${item.id}`, { method: 'PATCH' }).catch(() => null)
            if (res?.ok) markedRead([item.id])
        }
        router.push(item.href)
    }

    async function markAllRead() {
        setBusy(true)
        setError(null)
        try {
            const res = await fetch('/api/notifications/read-all', { method: 'POST' })
            if (!res.ok) {
                setError(`Request failed (${res.status})`)
                return
            }
            markedRead('all')
        } catch {
            setError('Could not reach the server. Try again.')
        } finally {
            setBusy(false)
        }
    }

    return (
        <Card className="animate-fade-up" style={{ animationDelay: '60ms' }}>
            <div className="flex items-center justify-between gap-4 border-b px-4 py-3">
                <p className="text-sm text-muted-foreground">{unreadCount === 0 ? 'All caught up' : `${unreadCount} unread`}</p>
                <Button size="sm" variant="outline" disabled={busy || unreadCount === 0} onClick={markAllRead}>
                    {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Mark all read
                </Button>
            </div>
            {error && <p className="px-4 pt-3 text-sm text-red-600" role="alert">{error}</p>}
            <CardContent className="p-0">
                {items.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
                        <div className="rounded-full bg-muted p-3 text-muted-foreground"><Bell className="w-6 h-6" /></div>
                        <p className="text-sm text-muted-foreground">No notifications yet.</p>
                    </div>
                ) : (
                    <ul className="divide-y">
                        {items.map(item => (
                            <li key={item.id}>
                                <button
                                    onClick={() => open(item)}
                                    className={cn(
                                        'group flex w-full items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-accent',
                                        item.unread && 'bg-primary/5'
                                    )}
                                >
                                    <span
                                        className={cn('h-2 w-2 shrink-0 rounded-full', item.unread ? 'bg-primary' : 'bg-transparent')}
                                        aria-label={item.unread ? 'Unread' : undefined}
                                    />
                                    <div className="min-w-0 flex-1">
                                        <p className={cn('text-sm transition-colors group-hover:text-primary', item.unread ? 'font-semibold' : 'text-muted-foreground')}>
                                            {item.text}
                                        </p>
                                        {item.facilityName && <p className="truncate text-xs text-muted-foreground">{item.facilityName}</p>}
                                    </div>
                                    <p className="shrink-0 text-xs text-muted-foreground" suppressHydrationWarning title={new Date(item.createdAt).toLocaleString()}>
                                        {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                                    </p>
                                    <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </CardContent>
        </Card>
    )
}
