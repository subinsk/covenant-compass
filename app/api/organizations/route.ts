import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth/jwt'
import { cookies } from 'next/headers'

export async function GET(request: Request) {
    const cookieStore = await cookies()
    const token = cookieStore.get('token')?.value
    const userPayload = await verifyToken(token || '') as any

    if (!userPayload) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Allow getting orgs usage for dropdowns
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type')

    const where: any = {}
    if (type) where.type = type

    const orgs = await prisma.organization.findMany({
        where,
        orderBy: { name: 'asc' }
    })

    return NextResponse.json({ organizations: orgs })
}
