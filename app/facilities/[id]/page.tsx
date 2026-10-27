import { prisma } from '@/lib/prisma'
import FacilityDetailView from '@/components/features/FacilityDetailView'
import { notFound, redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { canAccessFacility } from '@/lib/auth/access'

export default async function FacilityPage({ params, searchParams }: {
    params: Promise<{ id: string }>
    searchParams: Promise<{ tab?: string }>
}) {
    const { id } = await params
    const { tab } = await searchParams
    const session = await getSession()
    if (!session) redirect('/login')

    const facility = await prisma.facility.findUnique({
        where: { id },
        include: {
            lender: true,
            borrower: true,
            covenants: {
                orderBy: { createdAt: 'desc' }
            },
            occurrences: {
                include: { covenant: true },
                orderBy: { dueDate: 'asc' }
            }
        }
    })

    if (!facility || !canAccessFacility(session, facility)) return notFound()

    return <FacilityDetailView facility={{ ...facility, totalCommitment: facility.totalCommitment.toString() }} initialTab={tab} />
}
