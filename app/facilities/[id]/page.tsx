import { prisma } from '@/lib/prisma'
import FacilityDetailView from '@/components/features/FacilityDetailView'
import { occurrenceDocumentsSelect } from '@/lib/occurrences/documents'
import { notFound, redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { canAccessFacility, isLender } from '@/lib/auth/access'
import { ACCEPTED_EXTENSIONS, MAX_UPLOAD_BYTES } from '@/lib/agreements/upload'
import { agreementRunsWhere, type AgreementRunView } from '@/lib/extraction/runs'

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
    const canManage = isLender(session)

    // Agreement uploads and their covenants waiting for review; only lenders review them.
    const now = new Date()
    const runRows = canManage
        ? await prisma.extractionRun.findMany({
            where: agreementRunsWhere(facility.id, now),
            orderBy: { createdAt: 'desc' },
            select: {
                id: true, status: true, stage: true, error: true, sourceName: true, sourceUrl: true, createdAt: true,
                _count: { select: { items: true } },
                items: {
                    where: { status: 'PENDING' },
                    orderBy: { citationStart: 'asc' },
                    select: { id: true, name: true, metric: true, operator: true, limit: true, page: true, verified: true, quote: true },
                },
            },
        })
        : []
    const agreementRuns: AgreementRunView[] = runRows.map(run => ({
        id: run.id,
        status: run.status,
        stage: run.stage,
        error: run.error,
        sourceName: run.sourceName ?? run.sourceUrl?.split('/').pop() ?? null,
        itemCount: run._count.items,
        createdAt: run.createdAt.toISOString(),
        items: run.items,
    }))

    // Formatted here: Node and browsers can disagree on compact number output,
    // which would break hydration if the client formatted it again.
    const money = (compact: boolean) => new Intl.NumberFormat('en-US', {
        style: 'currency', currency: facility.currency, maximumFractionDigits: compact ? 1 : 0, notation: compact ? 'compact' : 'standard',
    }).format(Number(facility.totalCommitment))

    return <FacilityDetailView
        facility={{ ...facility, totalCommitment: facility.totalCommitment.toString() }}
        initialTab={tab}
        canManage={canManage}
        now={now.toISOString()}
        commitment={{ compact: money(true), full: money(false) }}
        agreementRuns={agreementRuns}
        uploadLimits={{ maxBytes: MAX_UPLOAD_BYTES, extensions: [...ACCEPTED_EXTENSIONS] }}
    />
}
