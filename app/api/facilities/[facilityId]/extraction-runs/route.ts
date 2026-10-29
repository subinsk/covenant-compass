import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth/session'
import { canAccessFacility, isLender } from '@/lib/auth/access'
import { recordAudit } from '@/lib/audit/record'
import { ACCEPTED_EXTENSIONS, MAX_UPLOAD_BYTES, readAgreementFile } from '@/lib/agreements/upload'
import { agreementFileError, formatBytes } from '@/lib/agreements/upload-check'
import { extractCovenants } from '@/lib/extraction/extract'
import { extractionConfigError, runExtraction } from '@/lib/extraction/import'
import { completeRun, failRun, setRunStage } from '@/lib/extraction/store'

// Room for the multipart boundaries and headers around the file.
const FORM_OVERHEAD_BYTES = 64 * 1024

// POST /api/facilities/[facilityId]/extraction-runs  multipart form: file
// Starts extracting covenants from an uploaded agreement. Returns the RUNNING run (202);
// the file is read and the covenants extracted after the response is sent.
export async function POST(request: Request, { params }: { params: Promise<{ facilityId: string }> }) {
    const { facilityId } = await params
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!isLender(session)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const facility = await prisma.facility.findUnique({
        where: { id: facilityId },
        select: { lenderOrgId: true, borrowerOrgId: true },
    })
    if (!facility || !canAccessFacility(session, facility)) {
        return NextResponse.json({ error: 'Facility not found' }, { status: 404 })
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

    const run = await prisma.extractionRun.create({
        data: {
            facilityId,
            sourceName: fileName,
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

    // Not awaited: runs in this server process after the response is sent, like the EDGAR import
    // (see app/api/extraction-runs/route.ts for the hosting caveat).
    void runExtraction(run.id, fileName, {
        load: () => readAgreementFile(bytes, fileName),
        extract: (text) => extractCovenants(text),
        complete: (runId, result) => completeRun(prisma, runId, result),
        fail: (runId, error) => failRun(prisma, runId, error),
        onStage: (runId, stage) => setRunStage(prisma, runId, stage),
    })

    return NextResponse.json(run, { status: 202 })
}
