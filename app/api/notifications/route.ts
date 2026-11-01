import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth/session'
import { ownNotifications } from '@/lib/notifications/list'

// GET /api/notifications — the signed-in user's latest 50 notifications and unread count.
export async function GET() {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const [notifications, unreadCount] = await Promise.all([
        prisma.notification.findMany(ownNotifications(session.userId)),
        prisma.notification.count({ where: { userId: session.userId, readAt: null } }),
    ])
    return NextResponse.json({ notifications, unreadCount })
}
