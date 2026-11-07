import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth/session'
import { isLender } from '@/lib/auth/access'
import { applyReview, approvableInBulk } from '@/lib/extraction/apply-review'
import { invalidInput } from '@/lib/validation/http'

const bulkApproveSchema = z.object({ ids: z.array(z.uuid()).min(1).max(50) })

// POST /api/extracted-covenants/approve  { ids: string[] }
// Approves several extracted covenants as extracted, one transaction each. Items that need a
// closer look (not verified, direction in doubt, an undated step-down, a likely duplicate) are
// skipped and listed with the reason, so they can be reviewed one by one.
export async function POST(request: Request) {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!isLender(session)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const parsed = bulkApproveSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return invalidInput(parsed.error)

    const flags = await prisma.extractedCovenant.findMany({
        where: { id: { in: parsed.data.ids } },
        select: { id: true, verified: true, directionConflict: true, stepDowns: true },
    })
    const byId = new Map(flags.map(f => [f.id, f]))

    const approved: string[] = []
    const skipped: { id: string, reason: string }[] = []
    // One at a time, so each duplicate check sees the covenants approved before it.
    for (const id of new Set(parsed.data.ids)) {
        const item = byId.get(id)
        if (item && !approvableInBulk(item)) {
            skipped.push({ id, reason: 'Needs a closer look' })
            continue
        }
        // applyReview checks access, so another lender's ids come back as not found.
        const outcome = await applyReview(session, id, { action: 'approve' })
        if (outcome.status === 200) approved.push(id)
        else skipped.push({ id, reason: String(outcome.body.error ?? 'Not approved') })
    }

    return NextResponse.json({ approved, skipped })
}
