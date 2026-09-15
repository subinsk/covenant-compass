import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth/jwt'
import { cookies } from 'next/headers'

// GET /api/facilities/[facilityId]/occurrences
export async function GET(request: Request, { params }: { params: Promise<{ facilityId: string }> }) {
    const { facilityId } = await params
    const cookieStore = await cookies()
    const token = cookieStore.get('token')?.value
    const userPayload = await verifyToken(token || '') as any

    if (!userPayload) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const ragStatus = searchParams.get('ragStatus')

    const where: any = { facilityId }
    if (status) where.status = status
    if (ragStatus) where.ragStatus = ragStatus

    const occurrences = await prisma.covenantOccurrence.findMany({
        where,
        include: {
            covenant: true
        },
        orderBy: { dueDate: 'asc' }
    })

    return NextResponse.json({ occurrences })
}
