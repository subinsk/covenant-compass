import { prisma } from '@/lib/prisma'
import FacilityDetailView from '@/components/features/FacilityDetailView'
import { occurrenceDocumentsSelect } from '@/lib/occurrences/documents'
import { notFound, redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { canAccessFacility, isLender } from '@/lib/auth/access'

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
                include: { covenant: true, documents: occurrenceDocumentsSelect },
                orderBy: { dueDate: 'asc' }
            }
        }
    })

    if (!facility || !canAccessFacility(session, facility)) return notFound()

    // Formatted here: Node and browsers can disagree on compact number output,
    // which would break hydration if the client formatted it again.
    const money = (compact: boolean) => new Intl.NumberFormat('en-US', {
        style: 'currency', currency: facility.currency, maximumFractionDigits: compact ? 1 : 0, notation: compact ? 'compact' : 'standard',
    }).format(Number(facility.totalCommitment))

    return <FacilityDetailView
        facility={{ ...facility, totalCommitment: facility.totalCommitment.toString() }}
        initialTab={tab}
        canManage={isLender(session)}
        now={new Date().toISOString()}
        commitment={{ compact: money(true), full: money(false) }}
    />
}
