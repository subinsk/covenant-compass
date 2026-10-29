import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth/session'
import { canAccessFacility, isLender } from '@/lib/auth/access'
import { recordAudit } from '@/lib/audit/record'
import { loadAgreementText } from '@/lib/agreements/text'
import { extractCovenants } from '@/lib/extraction/extract'
import { extractionConfigError, importAgreementSchema, runExtraction } from '@/lib/extraction/import'
import { completeRun, failRun, setRunStage } from '@/lib/extraction/store'
import { invalidInput } from '@/lib/validation/http'

// POST /api/extraction-runs  { facilityId, url }
// Starts extracting covenants from an EDGAR agreement. Returns the RUNNING run (202);
// the covenants appear in the review queue once the run is DONE.
export async function POST(request: Request) {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!isLender(session)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const parsed = importAgreementSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return invalidInput(parsed.error)
    const { facilityId, url } = parsed.data

    const facility = await prisma.facility.findUnique({
        where: { id: facilityId },
        select: { lenderOrgId: true, borrowerOrgId: true },
    })
    if (!facility || !canAccessFacility(session, facility)) {
        return NextResponse.json({ error: 'Facility not found' }, { status: 404 })
    }

    const configError = extractionConfigError(process.env, 'edgar')
    if (configError) return NextResponse.json({ error: configError }, { status: 400 })

    const run = await prisma.extractionRun.create({
        data: {
            facilityId,
            sourceUrl: url,
            model: process.env.LLM_MODEL!,
            promptChars: 0,
            status: 'RUNNING',
            stage: 'READING',
            createdByUserId: session.userId,
        },
    })
    await recordAudit(prisma, {
        entityType: 'FACILITY',
        entityId: facilityId,
        action: 'CREATE',
        userId: session.userId,
        details: { kind: 'extraction', url },
    })

    // Runs in this server process after the response is sent (not awaited). That works for a
    // single long-lived server; a hosted deployment needs a job queue for this, since the
    // process may stop once the response is sent and a restart leaves the run RUNNING.
    void runExtraction(run.id, url, {
        load: loadAgreementText,
        extract: (text) => extractCovenants(text),
        complete: (runId, result) => completeRun(prisma, runId, result),
        fail: (runId, error) => failRun(prisma, runId, error),
        onStage: (runId, stage) => setRunStage(prisma, runId, stage),
    })

    return NextResponse.json(run, { status: 202 })
}
