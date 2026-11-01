import type { Prisma } from '@prisma/client'

export const NOTIFICATION_LIST_LIMIT = 50

// The latest notifications of one user, newest first.
export function ownNotifications(userId: string) {
    return {
        where: { userId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: NOTIFICATION_LIST_LIMIT,
        select: { id: true, type: true, readAt: true, createdAt: true, payload: true, covenantOccurrenceId: true },
    } satisfies Prisma.NotificationFindManyArgs
}
