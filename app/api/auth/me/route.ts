import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth/session'

export async function GET() {
    const session = await getSession()

    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
        where: { id: session.userId },
        include: { organization: true }
    })

    if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    return NextResponse.json({
        user: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            organization: user.organization
        }
    })
}
