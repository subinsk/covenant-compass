import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth/session'

// PATCH /api/notifications/[id] — marks one of the user's own notifications read.
export async function PATCH(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const notification = await prisma.notification.findFirst({
        where: { id, userId: session.userId },
        select: { id: true, readAt: true },
    })
    if (!notification) return NextResponse.json({ error: 'Notification not found' }, { status: 404 })
    if (notification.readAt) return NextResponse.json(notification)

    const updated = await prisma.notification.update({
        where: { id },
        data: { readAt: new Date() },
        select: { id: true, readAt: true },
    })
    return NextResponse.json(updated)
}
