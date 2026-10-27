import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth/session'
import { canAccessFacility } from '@/lib/auth/access'
import { recordAudit } from '@/lib/audit/record'
import { documentTypeSchema, storageKey, validateUpload } from '@/lib/documents/upload'
import { saveFile } from '@/lib/storage/files'
import { invalidInput } from '@/lib/validation/http'

// POST /api/occurrences/[id]/documents  multipart form: file, documentType?
// Attaches evidence to an obligation. It does not change the obligation's status.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const occurrence = await prisma.covenantOccurrence.findUnique({
        where: { id },
        select: { id: true, facilityId: true, facility: { select: { lenderOrgId: true, borrowerOrgId: true } } },
    })
    if (!occurrence || !canAccessFacility(session, occurrence.facility)) {
        return NextResponse.json({ error: 'Obligation not found' }, { status: 404 })
    }

    const form = await request.formData().catch(() => null)
    const file = form?.get('file')
    if (!(file instanceof File)) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
    const fileError = validateUpload(file)
    if (fileError) return NextResponse.json({ error: fileError }, { status: 400 })

    const documentType = documentTypeSchema.safeParse(form?.get('documentType') ?? undefined)
    if (!documentType.success) return invalidInput(documentType.error)

    const documentId = randomUUID()
    const key = storageKey(documentId, file.name)
    const data = new Uint8Array(await file.arrayBuffer())

    // The file is written inside the transaction, so a failed write leaves no Document row behind.
    const document = await prisma.$transaction(async (tx) => {
        const created = await tx.document.create({
            data: {
                id: documentId,
                facilityId: occurrence.facilityId,
                covenantOccurrenceId: occurrence.id,
                uploadedByUserId: session.userId,
                fileName: file.name,
                fileUrl: key,
                documentType: documentType.data,
            },
        })
        await saveFile(key, data)
        await recordAudit(tx, {
            entityType: 'DOCUMENT',
            entityId: created.id,
            action: 'UPLOAD_DOCUMENT',
            userId: session.userId,
            details: { occurrenceId: occurrence.id, fileName: file.name, size: file.size },
        })
        return created
    })

    return NextResponse.json(document, { status: 201 })
}
