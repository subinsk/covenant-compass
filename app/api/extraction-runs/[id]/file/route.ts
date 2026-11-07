import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth/session'
import { canAccessFacility, isLender } from '@/lib/auth/access'
import { sanitiseFileName } from '@/lib/documents/upload'
import { readFile } from '@/lib/storage/files'

// GET /api/extraction-runs/[id]/file  the agreement uploaded for an extraction run.
// PDFs open in the browser so a reviewer can search for a quote; other files download.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!isLender(session)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const run = await prisma.extractionRun.findUnique({
        where: { id },
        select: { sourceName: true, fileKey: true, facility: { select: { lenderOrgId: true, borrowerOrgId: true } } },
    })
    if (!run || !canAccessFacility(session, run.facility) || !run.fileKey) {
        return NextResponse.json({ error: 'Agreement not found' }, { status: 404 })
    }

    const data = await readFile(run.fileKey).catch(() => null)
    if (!data) return NextResponse.json({ error: 'File missing from storage' }, { status: 404 })

    const fileName = sanitiseFileName(run.sourceName ?? 'agreement')
    const isPdf = fileName.toLowerCase().endsWith('.pdf')
    return new Response(new Uint8Array(data), {
        headers: {
            'Content-Type': isPdf ? 'application/pdf' : 'application/octet-stream',
            'Content-Disposition': `${isPdf ? 'inline' : 'attachment'}; filename="${fileName}"`,
            'Content-Length': String(data.length),
            'X-Content-Type-Options': 'nosniff',
        },
    })
}
