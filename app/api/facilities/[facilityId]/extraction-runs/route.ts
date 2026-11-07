import { after, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth/session'
import { canAccessFacility, isLender } from '@/lib/auth/access'
import { recordAudit } from '@/lib/audit/record'
import { ACCEPTED_EXTENSIONS, MAX_UPLOAD_BYTES, readAgreementFile } from '@/lib/agreements/upload'
import { agreementFileError, formatBytes } from '@/lib/agreements/upload-check'
import { extractCovenants } from '@/lib/extraction/extract'
import { extractionConfigError, runExtraction } from '@/lib/extraction/import'
import { completeRun, failRun, findActiveRun, RUN_IN_PROGRESS_ERROR, setRunStage } from '@/lib/extraction/store'
import { INACTIVE_FACILITY_ERROR } from '@/lib/extraction/runs'
import { storageKey } from '@/lib/documents/upload'
import { saveFile } from '@/lib/storage/files'

// Seconds the platform keeps the function alive, including the extraction run after the response.
export const maxDuration = 300

// Room for the multipart boundaries and headers around the file.
const FORM_OVERHEAD_BYTES = 64 * 1024

// POST /api/facilities/[facilityId]/extraction-runs  multipart form: file
// Starts extracting covenants from an uploaded agreement. Returns the RUNNING run (202);
// the file is read and the covenants extracted after the response is sent. 409 if the facility
// already has a run in progress.
export async function POST(request: Request, { params }: { params: Promise<{ facilityId: string }> }) {
    const { facilityId } = await params
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!isLender(session)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

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

    // Refuse an oversized body before buffering it.
    const contentLength = Number(request.headers.get('content-length') ?? 0)
    if (contentLength > MAX_UPLOAD_BYTES + FORM_OVERHEAD_BYTES) {
        return NextResponse.json({ error: `File is larger than ${formatBytes(MAX_UPLOAD_BYTES)}` }, { status: 413 })
    }

    const form = await request.formData().catch(() => null)
    const file = form?.get('file')
    if (!(file instanceof File)) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
    const fileError = agreementFileError(file, { maxBytes: MAX_UPLOAD_BYTES, extensions: ACCEPTED_EXTENSIONS })
    if (fileError) return NextResponse.json({ error: fileError.error }, { status: fileError.status })

    const configError = extractionConfigError(process.env, 'upload')
    if (configError) return NextResponse.json({ error: configError }, { status: 400 })

    const bytes = new Uint8Array(await file.arrayBuffer())
    const fileName = file.name

    // Keep the agreement, so reviewers can check the extracted quotes against it.
    const runId = crypto.randomUUID()
    const fileKey = storageKey(runId, fileName)
    try {
        await saveFile(fileKey, bytes)
    } catch (e) {
        console.error('Saving the agreement failed', e)
        return NextResponse.json({ error: "Couldn't store the file. Try again." }, { status: 500 })
    }

    const run = await prisma.extractionRun.create({
        data: {
            id: runId,
            facilityId,
            sourceName: fileName,
            fileKey,
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
        details: { kind: 'extraction', fileName, size: file.size },
    })

    // Runs after the response is sent, like the EDGAR import. after() keeps the function alive
    // until it finishes (up to maxDuration); a run cut off by a timeout or restart is failed later as stale.
    after(() => runExtraction(run.id, fileName, {
        load: () => readAgreementFile(bytes, fileName),
        extract: (text) => extractCovenants(text),
        complete: (runId, result) => completeRun(prisma, runId, result),
        fail: (runId, error) => failRun(prisma, runId, error),
        onStage: (runId, stage) => setRunStage(prisma, runId, stage),
    }))

    return NextResponse.json(run, { status: 202 })
}
