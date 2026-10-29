import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth/session'
import { canAccessFacility, isLender } from '@/lib/auth/access'

// GET /api/extraction-runs/[id]  the run's progress, polled by the facility page.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!isLender(session)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const run = await prisma.extractionRun.findUnique({
        where: { id },
        select: {
            id: true,
            status: true,
            stage: true,
            error: true,
            sourceName: true,
            createdAt: true,
            facility: { select: { lenderOrgId: true, borrowerOrgId: true } },
            _count: { select: { items: true } },
        },
    })
    if (!run || !canAccessFacility(session, run.facility)) {
        return NextResponse.json({ error: 'Extraction run not found' }, { status: 404 })
    }

    return NextResponse.json({
        id: run.id,
        status: run.status,
        stage: run.stage,
        error: run.error,
        sourceName: run.sourceName,
        itemCount: run._count.items,
        createdAt: run.createdAt,
    })
}
