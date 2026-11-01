import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth/session'
import { isLender } from '@/lib/auth/access'
import { NOTIFICATION_LIST_LIMIT, ownNotifications } from '@/lib/notifications/list'
import { notificationHref, notificationPayloadSchema, notificationText } from '@/lib/notifications/notify'
import { NotificationList } from '@/components/features/NotificationList'

export default async function NotificationsPage() {
    const session = await getSession()
    if (!session) redirect('/login')

    const lender = isLender(session)
    const rows = await prisma.notification.findMany(ownNotifications(session.userId))
    const items = rows.map(row => {
        const parsed = notificationPayloadSchema.safeParse(row.payload ?? {})
        const payload = parsed.success ? parsed.data : {}
        return {
            id: row.id,
            text: notificationText(row.type, payload),
            facilityName: payload.facilityName ?? null,
            href: notificationHref(row.type, payload, lender),
            createdAt: row.createdAt.toISOString(),
            unread: row.readAt === null,
        }
    })

    return (
        <div className="space-y-6">
            <div className="animate-fade-up">
                <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
                <p className="mt-1 text-sm text-muted-foreground">Your latest {NOTIFICATION_LIST_LIMIT} notifications, newest first.</p>
            </div>
            <NotificationList items={items} />
        </div>
    )
}
