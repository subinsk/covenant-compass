import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth/session'
import { canAccessFacility } from '@/lib/auth/access'
import { recordAudit } from '@/lib/audit/record'
import { evaluateThreshold, readStepDowns, testDate, thresholdOn } from '@/lib/covenants/test'
import { ragAfterTest, recordTestSchema } from '@/lib/occurrences/tested'
import { invalidInput } from '@/lib/validation/http'

// PUT /api/occurrences/[id]/tested-value  { value: number }
// Records the tested ratio for a financial obligation and checks it against the
// covenant's threshold. Lenders record it; borrowers submit it as they would in a
// compliance certificate. A breach turns the obligation RED.
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const occurrence = await prisma.covenantOccurrence.findUnique({
        where: { id },
        select: {
            id: true, status: true, dueDate: true, periodEndDate: true, ragStatus: true, testedValue: true, testPassed: true,
            covenant: { select: { type: true, thresholdCondition: true, stepDowns: true } },
            facility: { select: { lenderOrgId: true, borrowerOrgId: true } },
        },
    })
    if (!occurrence || !canAccessFacility(session, occurrence.facility)) {
        return NextResponse.json({ error: 'Obligation not found' }, { status: 404 })
    }
    if (occurrence.covenant.type !== 'FINANCIAL') {
        return NextResponse.json({ error: 'Only financial covenants have a tested value' }, { status: 400 })
    }

    const parsed = recordTestSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return invalidInput(parsed.error)
    const { value } = parsed.data

    // Tested against the limit in force at the period end, so step-downs apply.
    // Null when the threshold can't be read: the value is still stored.
    const stepDowns = readStepDowns(occurrence.covenant.stepDowns)
    const asOf = testDate(occurrence)
    const result = evaluateThreshold(occurrence.covenant.thresholdCondition, value, stepDowns, asOf)
    const now = new Date()
    const data = {
        testedValue: value,
        testPassed: result?.passed ?? null,
        testedAt: now,
        testedByUserId: session.userId,
        ragStatus: ragAfterTest(occurrence, result?.passed ?? null, now),
    }

    await prisma.$transaction(async (tx) => {
        await tx.covenantOccurrence.update({ where: { id }, data })
        await recordAudit(tx, {
            entityType: 'OCCURRENCE',
            entityId: id,
            action: 'UPDATE',
            userId: session.userId,
            details: {
                action: 'recordTest',
                testedValue: value,
                testPassed: data.testPassed,
                headroom: result?.headroom ?? null,
                thresholdCondition: thresholdOn(occurrence.covenant.thresholdCondition, stepDowns, asOf),
                previousValue: occurrence.testedValue?.toNumber() ?? null,
                previousRagStatus: occurrence.ragStatus,
                ragStatus: data.ragStatus,
            },
        })
    })

    return NextResponse.json({ id, ...data, headroom: result?.headroom ?? null })
}
