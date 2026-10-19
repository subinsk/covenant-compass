import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth/session'
import { organizationScope } from '@/lib/auth/access'
import { Prisma } from '@prisma/client'
import { invalidInput, queryParams } from '@/lib/validation/http'
import { organizationQuerySchema } from '@/lib/validation/organization'

export async function GET(request: Request) {
    const session = await getSession()

    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Allow getting orgs usage for dropdowns
    const query = organizationQuerySchema.safeParse(queryParams(request.url))
    if (!query.success) return invalidInput(query.error)

    // Scope first; an optional ?type= narrows within it.
    const where: Prisma.OrganizationWhereInput = organizationScope(session)
    if (query.data.type) where.type = query.data.type

    const orgs = await prisma.organization.findMany({
        where,
        orderBy: { name: 'asc' }
    })

    return NextResponse.json({ organizations: orgs })
}
