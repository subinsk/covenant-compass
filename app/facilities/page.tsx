import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth/session'
import { facilityScope, isLender } from '@/lib/auth/access'
import { Card, CardContent, Badge, Button } from '@/components/ui/core'
import Link from 'next/link'
import { Plus, X } from 'lucide-react'
import type { FacilityStatus } from '@prisma/client'

const STATUSES: FacilityStatus[] = ['ACTIVE', 'MATURED', 'DEFAULTED']

export default async function FacilitiesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
    const session = await getSession()
    if (!session) redirect('/login')
    if (!isLender(session)) redirect('/portal')

    const { status: statusParam } = await searchParams
    const status = STATUSES.find(s => s === statusParam)

    const facilities = await prisma.facility.findMany({
        where: { ...facilityScope(session), ...(status && { status }) },
        orderBy: { updatedAt: 'desc' },
        include: {
            lender: true,
            borrower: true,
            _count: {
                select: { covenants: true }
            }
        }
    })

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <h1 className="text-2xl font-bold tracking-tight">Facilities</h1>
                    {status && (
                        <Link
                            href="/facilities"
                            className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
                        >
                            {status}
                            <X className="w-3 h-3" />
                        </Link>
                    )}
                </div>
                <Button>
                    <Plus className="w-4 h-4 mr-2" />
                    New Facility
                </Button>
            </div>

            <Card>
                <CardContent className="p-0">
                    <div className="relative w-full overflow-auto">
                        <table className="w-full caption-bottom text-sm text-left">
                            <thead className="[&_tr]:border-b">
                                <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                                    <th className="h-12 px-4 align-middle font-medium text-muted-foreground">Name</th>
                                    <th className="h-12 px-4 align-middle font-medium text-muted-foreground">Borrower</th>
                                    <th className="h-12 px-4 align-middle font-medium text-muted-foreground">Reference</th>
                                    <th className="h-12 px-4 align-middle font-medium text-muted-foreground">Commitment</th>
                                    <th className="h-12 px-4 align-middle font-medium text-muted-foreground">Status</th>
                                    <th className="h-12 px-4 align-middle font-medium text-muted-foreground">Covenants</th>
                                    <th className="h-12 px-4 align-middle font-medium text-muted-foreground text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="[&_tr:last-child]:border-0">
                                {facilities.map((facility) => (
                                    <tr key={facility.id} className="border-b transition-colors hover:bg-muted/50">
                                        <td className="p-4 align-middle font-medium">
                                            <Link href={`/facilities/${facility.id}`} className="hover:underline">
                                                {facility.name}
                                            </Link>
                                        </td>
                                        <td className="p-4 align-middle">{facility.borrower.name}</td>
                                        <td className="p-4 align-middle text-muted-foreground">{facility.facilityReference}</td>
                                        <td className="p-4 align-middle">
                                            {new Intl.NumberFormat('en-US', { style: 'currency', currency: facility.currency }).format(Number(facility.totalCommitment))}
                                        </td>
                                        <td className="p-4 align-middle">
                                            <Badge variant={facility.status === 'ACTIVE' ? 'success' : 'secondary'}>
                                                {facility.status}
                                            </Badge>
                                        </td>
                                        <td className="p-4 align-middle">{facility._count.covenants}</td>
                                        <td className="p-4 align-middle text-right">
                                            <Link
                                                href={`/facilities/${facility.id}`}
                                                className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 hover:bg-accent hover:text-accent-foreground h-9 px-3"
                                            >
                                                View
                                            </Link>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
