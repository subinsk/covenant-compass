import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth/session'
import { OrgType, Prisma } from '@prisma/client'

export async function GET(request: Request) {
    const session = await getSession()

    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Allow getting orgs usage for dropdowns
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type')

    const where: Prisma.OrganizationWhereInput = {}
    if (type) where.type = type as OrgType

    const orgs = await prisma.organization.findMany({
        where,
        orderBy: { name: 'asc' }
    })

    return NextResponse.json({ organizations: orgs })
}
