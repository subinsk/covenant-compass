import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth/session'
import { complianceScore } from '@/lib/portal/compliance'
import { Card, CardContent, Button } from '@/components/ui/core'
import { Upload } from 'lucide-react'

export default async function BorrowerPortal() {
    const session = await getSession()
    if (!session) redirect('/login')
    if (session.role !== 'BORROWER_USER') redirect('/')

    const [org, occurrences] = await Promise.all([
        prisma.organization.findUnique({ where: { id: session.orgId }, select: { name: true } }),
        prisma.covenantOccurrence.findMany({
            where: { facility: { borrowerOrgId: session.orgId } },
            orderBy: { dueDate: 'asc' },
            include: { covenant: true },
        }),
    ])

    const score = complianceScore(occurrences.map(o => o.status))
    const actionItems = occurrences.filter(o => o.status === 'PENDING' || o.status === 'OVERDUE')

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between bg-blue-900 text-white p-6 rounded-lg shadow-md">
                <div>
                    <h1 className="text-2xl font-bold">Borrower Portal</h1>
                    <p className="text-blue-100">{org?.name ?? 'Unknown organization'}</p>
                </div>
                <div className="text-right">
                    <p className="text-sm opacity-80">Compliance Score</p>
                    <p className="text-3xl font-bold">{score === null ? '—' : `${score}%`}</p>
                </div>
            </div>

            <h2 className="text-xl font-semibold">Your Action Items</h2>

            <div className="space-y-4">
                {actionItems.length === 0 && (
                    <p className="text-muted-foreground">No open obligations.</p>
                )}
                {actionItems.map(item => (
                    <Card key={item.id}>
                        <CardContent className="p-6 flex items-center justify-between">
                            <div>
                                <p className="text-sm text-muted-foreground uppercase tracking-wider">{item.covenant.type}</p>
                                <h3 className="text-lg font-medium">{item.covenant.title}</h3>
                                <p className="text-sm text-muted-foreground">
                                    Due: {new Date(item.dueDate).toLocaleDateString()}
                                    {item.status === 'OVERDUE' && <span className="ml-2 text-red-600 font-medium">Overdue</span>}
                                </p>
                            </div>
                            <div className="flex items-center gap-3">
                                <Button size="sm">
                                    <Upload className="w-4 h-4 mr-2" />
                                    Upload Evidence
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    )
}
