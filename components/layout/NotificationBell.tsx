'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Bell } from 'lucide-react'

// Fired after notifications are marked read, so the bell refreshes its count.
export const NOTIFICATIONS_CHANGED = 'notifications-changed'

// Header bell with the unread count; refreshed on every page change.
export function NotificationBell() {
    const pathname = usePathname()
    const [unread, setUnread] = useState(0)

    useEffect(() => {
        let cancelled = false
        const load = () => {
            fetch('/api/notifications')
                .then(res => (res.ok ? res.json() : null))
                .then(json => { if (!cancelled && json) setUnread(json.unreadCount) })
                .catch(() => {})
        }
        load()
        window.addEventListener(NOTIFICATIONS_CHANGED, load)
        return () => {
            cancelled = true
            window.removeEventListener(NOTIFICATIONS_CHANGED, load)
        }
    }, [pathname])

    return (
        <Link
            href="/notifications"
            className="relative p-2 rounded-full hover:bg-accent text-muted-foreground"
            aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        >
            <Bell className="w-5 h-5" />
            {unread > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-[10px] font-semibold leading-[18px] text-center text-white border border-card tabular-nums">
                    {unread > 99 ? '99+' : unread}
                </span>
            )}
        </Link>
    )
}
