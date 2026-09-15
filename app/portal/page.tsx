import { prisma } from '@/lib/prisma'
import { Card, CardContent, CardHeader, CardTitle, Badge, Button } from '@/components/ui/core'
import { CheckCircle, Upload } from 'lucide-react'

// A placeholder for the specific "Borrower Portal" view
// In a real app, this would be protected by role='BORROWER'
export default async function BorrowerPortal() {

    // Mock data fetching as if logged in as a borrower
    // For demo, we just fetch a few active items
    const myObligations = await prisma.covenantOccurrence.findMany({
        take: 5,
        orderBy: { dueDate: 'asc' },
        include: { covenant: true, facility: true }
    })

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between bg-blue-900 text-white p-6 rounded-lg shadow-md">
                <div>
                    <h1 className="text-2xl font-bold">Borrower Portal</h1>
                    <p className="text-blue-100">Acme Industries Config</p>
                </div>
                <div className="text-right">
                    <p className="text-sm opacity-80">Compliance Score</p>
                    <p className="text-3xl font-bold">100%</p>
                </div>
            </div>

            <h2 className="text-xl font-semibold">Your Action Items</h2>

            <div className="space-y-4">
                {myObligations.map(item => (
                    <Card key={item.id}>
                        <CardContent className="p-6 flex items-center justify-between">
                            <div>
                                <p className="text-sm text-muted-foreground uppercase tracking-wider">{item.covenant.type}</p>
                                <h3 className="text-lg font-medium">{item.covenant.title}</h3>
                                <p className="text-sm text-muted-foreground">Due: {new Date(item.dueDate).toLocaleDateString()}</p>
                            </div>
                            <div className="flex items-center gap-3">
                                {item.status === 'COMPLETED' ? (
                                    <Badge variant="success"><CheckCircle className="w-3 h-3 mr-1" /> Submitted</Badge>
                                ) : (
                                    <Button size="sm">
                                        <Upload className="w-4 h-4 mr-2" />
                                        Upload Evidence
                                    </Button>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    )
}
