import { after, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth/session'
import { canAccessFacility, isLender } from '@/lib/auth/access'
import { recordAudit } from '@/lib/audit/record'
import { loadAgreementText } from '@/lib/agreements/text'
import { extractCovenants } from '@/lib/extraction/extract'
import { extractionConfigError, importAgreementSchema, runExtraction } from '@/lib/extraction/import'
import { completeRun, failRun, findActiveRun, RUN_IN_PROGRESS_ERROR, setRunStage } from '@/lib/extraction/store'
import { INACTIVE_FACILITY_ERROR } from '@/lib/extraction/runs'
import { invalidInput } from '@/lib/validation/http'

// Seconds the platform keeps the function alive, including the extraction run after the response.
export const maxDuration = 300

// POST /api/extraction-runs  { facilityId, url }
// Starts extracting covenants from an EDGAR agreement. Returns the RUNNING run (202);
// the covenants appear in the review queue once the run is DONE. 409 if the facility already
// has a run in progress.
export async function POST(request: Request) {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!isLender(session)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const parsed = importAgreementSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return invalidInput(parsed.error)
    const { facilityId, url } = parsed.data

    const facility = await prisma.facility.findUnique({
        where: { id: facilityId },
        select: { lenderOrgId: true, borrowerOrgId: true, status: true },
    })
    if (!facility || !canAccessFacility(session, facility)) {
        return NextResponse.json({ error: 'Facility not found' }, { status: 404 })
    }
    if (facility.status !== 'ACTIVE') {
        return NextResponse.json({ error: INACTIVE_FACILITY_ERROR }, { status: 400 })
    }
    if (await findActiveRun(prisma, facilityId, new Date())) {
        return NextResponse.json({ error: RUN_IN_PROGRESS_ERROR }, { status: 409 })
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

    // Runs after the response is sent. after() keeps the function alive until it finishes
    // (up to maxDuration); a run cut off by a timeout or restart is failed later as stale.
    after(() => runExtraction(run.id, url, {
        load: loadAgreementText,
        extract: (text) => extractCovenants(text),
        complete: (runId, result) => completeRun(prisma, runId, result),
        fail: (runId, error) => failRun(prisma, runId, error),
        onStage: (runId, stage) => setRunStage(prisma, runId, stage),
    }))

    return NextResponse.json(run, { status: 202 })
}
