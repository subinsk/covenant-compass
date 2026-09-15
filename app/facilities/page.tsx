import { prisma } from '@/lib/prisma'
import { Card, CardContent, CardHeader, CardTitle, Badge, Button } from '@/components/ui/core'
import Link from 'next/link'
import { Plus } from 'lucide-react'

export default async function FacilitiesPage() {
    const facilities = await prisma.facility.findMany({
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
                <h1 className="text-2xl font-bold tracking-tight">Facilities</h1>
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
