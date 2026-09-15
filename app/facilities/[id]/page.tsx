import { prisma } from '@/lib/prisma'
import FacilityDetailView from '@/components/features/FacilityDetailView'
import { notFound } from 'next/navigation'

export default async function FacilityPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
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

    if (!facility) return notFound()

    return <FacilityDetailView facility={facility} />
}
