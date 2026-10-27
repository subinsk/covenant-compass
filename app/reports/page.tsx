import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth/session'
import { facilityScope, isLender } from '@/lib/auth/access'
import { obligationWhere } from '@/lib/dashboard/filters'
import { Card, CardContent, CardHeader, CardTitle, Badge } from '@/components/ui/core'
import { Download } from 'lucide-react'

export default async function ReportsPage() {
    const session = await getSession()
    if (!session) redirect('/login')
    if (!isLender(session)) redirect('/portal')

    const scope = facilityScope(session)
    const [occurrences, comingDue] = await Promise.all([
        prisma.covenantOccurrence.findMany({
            where: { facility: scope },
            orderBy: { dueDate: 'asc' },
            include: {
                facility: {
                    include: { borrower: true }
                },
                covenant: true
            }
        }),
        prisma.covenantOccurrence.count({ where: obligationWhere('upcoming', scope, new Date()) }),
    ])

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold tracking-tight">Compliance Reports</h1>
                <a
                    href="/api/reports/export"
                    download
                    className="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                    <Download className="w-4 h-4 mr-2" />
                    Export CSV
                </a>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Total Obligations</CardTitle></CardHeader>
                    <CardContent><div className="text-2xl font-bold">{occurrences.length}</div></CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Overdue / Breached</CardTitle></CardHeader>
                    <CardContent><div className="text-2xl font-bold text-destructive">{occurrences.filter(o => o.status === 'OVERDUE').length}</div></CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Coming Due (30d)</CardTitle></CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-amber-500">{comingDue}</div>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Master Compliance Schedule</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="relative w-full overflow-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-muted/50 [&_tr]:border-b">
                                <tr>
                                    <th className="p-4 font-medium">Due Date</th>
                                    <th className="p-4 font-medium">Facility / Borrower</th>
                                    <th className="p-4 font-medium">Covenant Title</th>
                                    <th className="p-4 font-medium">Type</th>
                                    <th className="p-4 font-medium">Frequency</th>
                                    <th className="p-4 font-medium">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {occurrences.map((item) => (
                                    <tr key={item.id} className="hover:bg-muted/50 transition-colors">
                                        <td className="p-4">{new Date(item.dueDate).toLocaleDateString()}</td>
                                        <td className="p-4">
                                            <div className="font-medium">{item.facility.name}</div>
                                            <div className="text-xs text-muted-foreground">{item.facility.borrower.name}</div>
                                        </td>
                                        <td className="p-4">{item.covenant.title}</td>
                                        <td className="p-4">{item.covenant.type}</td>
                                        <td className="p-4 capitalize">{item.covenant.frequency.toLowerCase()}</td>
                                        <td className="p-4">
                                            <Badge variant={item.ragStatus === 'RED' ? 'destructive' : item.ragStatus === 'AMBER' ? 'warning' : item.ragStatus === 'GREEN' ? 'success' : 'outline'}>
                                                {item.ragStatus}
                                            </Badge>
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
