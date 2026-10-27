import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth/session'
import { canAccessFacility } from '@/lib/auth/access'
import { sanitiseFileName } from '@/lib/documents/upload'
import { readFile } from '@/lib/storage/files'

// GET /api/documents/[id]  downloads an uploaded file. The storage key comes from the DB record.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const document = await prisma.document.findUnique({
        where: { id },
        select: { fileName: true, fileUrl: true, facility: { select: { lenderOrgId: true, borrowerOrgId: true } } },
    })
    if (!document || !canAccessFacility(session, document.facility)) {
        return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    const data = await readFile(document.fileUrl).catch(() => null)
    if (!data) return NextResponse.json({ error: 'File missing from storage' }, { status: 404 })

    return new Response(new Uint8Array(data), {
        headers: {
            'Content-Type': 'application/octet-stream',
            'Content-Disposition': `attachment; filename="${sanitiseFileName(document.fileName)}"`,
            'Content-Length': String(data.length),
            'X-Content-Type-Options': 'nosniff',
        },
    })
}
