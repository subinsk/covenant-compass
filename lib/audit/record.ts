import type { AuditAction, EntityType, Prisma, PrismaClient } from '@prisma/client'

type Db = Pick<PrismaClient, 'auditLog'> | Pick<Prisma.TransactionClient, 'auditLog'>

export type AuditEntry = {
    entityType: EntityType
    entityId: string
    action: AuditAction
    userId: string
    details?: Prisma.InputJsonValue
}

// Records a user action. Pass the transaction client when the change and its
// audit entry must succeed or fail together.
export function recordAudit(db: Db, entry: AuditEntry) {
    return db.auditLog.create({
        data: {
            entityType: entry.entityType,
            entityId: entry.entityId,
            action: entry.action,
            performedByUserId: entry.userId,
            details: entry.details,
        },
    })
}
