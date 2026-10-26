import { describe, expect, it, vi } from 'vitest'
import { recordAudit } from './record'

describe('recordAudit', () => {
    it('writes an audit row with the acting user', async () => {
        const create = vi.fn().mockResolvedValue({ id: 'a1' })
        await recordAudit({ auditLog: { create } } as never, {
            entityType: 'OCCURRENCE', entityId: 'o1', action: 'COMPLETE', userId: 'u1', details: { note: 'received' },
        })
        expect(create).toHaveBeenCalledWith({
            data: { entityType: 'OCCURRENCE', entityId: 'o1', action: 'COMPLETE', performedByUserId: 'u1', details: { note: 'received' } },
        })
    })
})
