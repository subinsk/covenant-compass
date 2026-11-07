import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { isLender } from '@/lib/auth/access'
import { applyReview } from '@/lib/extraction/apply-review'
import { reviewActionSchema } from '@/lib/extraction/review'
import { invalidInput } from '@/lib/validation/http'

// PATCH /api/extracted-covenants/[id]  { action: 'approve' | 'reject' | 'restore', edits?, allowDuplicate? }
// Approving creates a Covenant on the run's facility and links it. Restoring puts a
// rejected item back in the queue. Every decision is audited against the facility.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!isLender(session)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const parsed = reviewActionSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return invalidInput(parsed.error)

    const outcome = await applyReview(session, id, parsed.data)
    return NextResponse.json(outcome.body, { status: outcome.status })
}
