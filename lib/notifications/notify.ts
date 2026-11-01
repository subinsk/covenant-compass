import { z } from 'zod'
import type { NotificationType, Prisma, PrismaClient } from '@prisma/client'

type Db = Pick<PrismaClient, 'user' | 'notification'> | Pick<Prisma.TransactionClient, 'user' | 'notification'>

// What a notification line needs, stored on the row so the list needs no joins.
export const notificationPayloadSchema = z.object({
    covenantTitle: z.string().optional(),
    facilityId: z.string().optional(),
    facilityName: z.string().optional(),
    actorName: z.string().nullish(),
    fileName: z.string().nullish(),
    reason: z.string().nullish(),
    dueDate: z.string().optional(),
    // Older rows written by the nightly job before this payload shape
    title: z.string().optional(),
})

export type NotificationPayload = z.infer<typeof notificationPayloadSchema>

export type NotifiedOccurrence = {
    id: string
    dueDate: Date
    covenant: { title: string }
    facility: { id: string; name: string; lenderOrgId: string; borrowerOrgId: string }
}

export type NotificationExtra = { actorName?: string | null; fileName?: string | null; reason?: string | null }

// Who hears about each event: evidence goes to the lender, decisions go to the
// borrower, and an overdue obligation concerns both sides.
export function recipientOrgIds(type: NotificationType, facility: { lenderOrgId: string; borrowerOrgId: string }): string[] {
    switch (type) {
        case 'EVIDENCE_RECEIVED':
            return [facility.lenderOrgId]
        case 'COMPLETED':
        case 'WAIVED':
            return [facility.borrowerOrgId]
        case 'OVERDUE':
            return [facility.borrowerOrgId, facility.lenderOrgId]
        default:
            return []
    }
}

export function buildPayload(occurrence: NotifiedOccurrence, extra: NotificationExtra = {}): NotificationPayload {
    return {
        covenantTitle: occurrence.covenant.title,
        facilityId: occurrence.facility.id,
        facilityName: occurrence.facility.name,
        dueDate: occurrence.dueDate.toISOString(),
        actorName: extra.actorName ?? null,
        fileName: extra.fileName ?? null,
        reason: extra.reason?.trim() || null,
    }
}

export function notificationRows(
    type: NotificationType,
    occurrenceId: string,
    userIds: string[],
    payload: NotificationPayload,
    now: Date,
): Prisma.NotificationCreateManyInput[] {
    return userIds.map(userId => ({
        userId,
        covenantOccurrenceId: occurrenceId,
        type,
        channel: 'IN_APP',
        sentAt: now,
        payload,
    }))
}

// Creates one in-app notification for every user of the orgs that should hear
// about this event. Pass the transaction client to tie it to the action.
export async function notifyOccurrence(
    db: Db,
    type: NotificationType,
    occurrence: NotifiedOccurrence,
    extra: NotificationExtra = {},
): Promise<number> {
    const orgIds = recipientOrgIds(type, occurrence.facility)
    if (orgIds.length === 0) return 0
    const users = await db.user.findMany({ where: { organizationId: { in: orgIds } }, select: { id: true } })
    if (users.length === 0) return 0
    const rows = notificationRows(type, occurrence.id, users.map(u => u.id), buildPayload(occurrence, extra), new Date())
    const { count } = await db.notification.createMany({ data: rows })
    return count
}

const fmtDate = (iso?: string) => (iso ? new Date(iso).toISOString().slice(0, 10) : null)

// One line of text for the notifications list.
export function notificationText(type: NotificationType, payload: NotificationPayload): string {
    const what = payload.covenantTitle ?? payload.title ?? 'An obligation'
    switch (type) {
        case 'EVIDENCE_RECEIVED':
            return `${payload.actorName ?? 'The borrower'} uploaded ${payload.fileName ?? 'evidence'} for ${what}`
        case 'COMPLETED':
            return `${what} was marked complete${payload.actorName ? ` by ${payload.actorName}` : ''}`
        case 'WAIVED':
            return `${what} was waived${payload.actorName ? ` by ${payload.actorName}` : ''}${payload.reason ? `: ${payload.reason}` : ''}`
        case 'OVERDUE': {
            const due = fmtDate(payload.dueDate)
            return payload.covenantTitle ? `${what} is overdue${due ? ` (due ${due})` : ''}` : what
        }
        case 'REMINDER': {
            const due = fmtDate(payload.dueDate)
            return payload.covenantTitle ? `${what} is due soon${due ? ` (${due})` : ''}` : what
        }
        default:
            return what
    }
}

// Where a notification line leads: the facility schedule for lenders; the
// portal (its history view for closed obligations) for borrowers.
export function notificationHref(type: NotificationType, payload: NotificationPayload, lender: boolean): string {
    if (lender) return payload.facilityId ? `/facilities/${payload.facilityId}?tab=schedule` : '/obligations'
    return type === 'COMPLETED' || type === 'WAIVED' ? '/portal?view=history' : '/portal'
}
