'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, Badge, Button } from '@/components/ui/core'
import { Plus } from 'lucide-react'
import { AddCovenantModal } from './AddCovenantModal'
import type { Prisma } from '@prisma/client'

type FacilityWithDetails = Prisma.FacilityGetPayload<{
    include: { lender: true; borrower: true; covenants: true; occurrences: { include: { covenant: true } } }
}>

export default function FacilityDetailView({ facility }: { facility: FacilityWithDetails }) {
    const [activeTab, setActiveTab] = useState('overview')
    const [isaddModalOpen, setIsAddModalOpen] = useState(false)

    const tabs = [
        { id: 'overview', label: 'Overview' },
        { id: 'covenants', label: 'Covenants' },
        { id: 'schedule', label: 'Schedule' },
    ]

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2">
                        <h1 className="text-2xl font-bold">{facility.name}</h1>
                        <Badge variant={facility.status === 'ACTIVE' ? 'success' : 'secondary'}>{facility.status}</Badge>
                    </div>
                    <p className="text-muted-foreground">{facility.lender.name} → {facility.borrower.name}</p>
                </div>
                <div className="flex gap-2">
                    <Button onClick={() => setIsAddModalOpen(true)}>
                        <Plus className="w-4 h-4 mr-2" />
                        Add Covenant
                    </Button>
                </div>
            </div>

            {/* Tabs Navigation */}
            <div className="border-b">
                <div className="flex gap-6">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${activeTab === tab.id
                                    ? 'border-primary text-primary'
                                    : 'border-transparent text-muted-foreground hover:text-foreground'
                                }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Tab Content */}
            <div className="min-h-[400px]">
                {activeTab === 'overview' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <Card>
                            <CardHeader><CardTitle>Financials</CardTitle></CardHeader>
                            <CardContent className="space-y-4">
                                <div className="flex justify-between border-b pb-2">
                                    <span className="text-muted-foreground">Total Commitment</span>
                                    <span className="font-medium">
                                        {new Intl.NumberFormat('en-US', { style: 'currency', currency: facility.currency }).format(Number(facility.totalCommitment))}
                                    </span>
                                </div>
                                <div className="flex justify-between border-b pb-2">
                                    <span className="text-muted-foreground">Reference</span>
                                    <span className="font-medium">{facility.facilityReference}</span>
                                </div>
                                <div className="flex justify-between border-b pb-2">
                                    <span className="text-muted-foreground">Maturity Date</span>
                                    <span className="font-medium">{new Date(facility.endDate).toLocaleDateString()}</span>
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader><CardTitle>Compliance Health</CardTitle></CardHeader>
                            <CardContent>
                                <div className="flex items-center gap-4">
                                    <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold text-xl">
                                        98%
                                    </div>
                                    <div>
                                        <p className="font-medium">On Track</p>
                                        <p className="text-sm text-muted-foreground">No major breaches detected.</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                )}

                {activeTab === 'covenants' && (
                    <Card>
                        <CardContent className="p-0">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-muted/50">
                                    <tr>
                                        <th className="p-4 font-medium">Title</th>
                                        <th className="p-4 font-medium">Type</th>
                                        <th className="p-4 font-medium">Frequency</th>
                                        <th className="p-4 font-medium">Next Due</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {facility.covenants.length === 0 ? (
                                        <tr>
                                            <td colSpan={4} className="p-8 text-center text-muted-foreground">
                                                No covenants defined. Click &quot;Add Covenant&quot; to start.
                                            </td>
                                        </tr>
                                    ) : (
                                        facility.covenants.map((cov) => (
                                            <tr key={cov.id}>
                                                <td className="p-4 font-medium">{cov.title}</td>
                                                <td className="p-4"><Badge variant="outline">{cov.type}</Badge></td>
                                                <td className="p-4 capitalize">{cov.frequency.toLowerCase()}</td>
                                                <td className="p-4 text-muted-foreground">--</td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </CardContent>
                    </Card>
                )}

                {activeTab === 'schedule' && (
                    <Card>
                        <CardHeader><CardTitle>Obligations Calendar</CardTitle></CardHeader>
                        <CardContent className="p-0">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-muted/50">
                                    <tr>
                                        <th className="p-4 font-medium">Due Date</th>
                                        <th className="p-4 font-medium">Item</th>
                                        <th className="p-4 font-medium">Status</th>
                                        <th className="p-4 font-medium">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {facility.occurrences.length === 0 ? (
                                        <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">No schedule generated yet.</td></tr>
                                    ) : (
                                        facility.occurrences.map((occ) => (
                                            <tr key={occ.id}>
                                                <td className="p-4">{new Date(occ.dueDate).toLocaleDateString()}</td>
                                                <td className="p-4">
                                                    <span className="font-medium">{occ.covenant.title}</span>
                                                    <div className="text-xs text-muted-foreground">{new Date(occ.periodStartDate ?? 0).toLocaleDateString()} - {new Date(occ.periodEndDate ?? 0).toLocaleDateString()}</div>
                                                </td>
                                                <td className="p-4">
                                                    <Badge variant={occ.status === 'COMPLETED' ? 'success' : occ.status === 'OVERDUE' ? 'destructive' : 'secondary'}>
                                                        {occ.status}
                                                    </Badge>
                                                </td>
                                                <td className="p-4">
                                                    <Button size="sm" variant="ghost">Details</Button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </CardContent>
                    </Card>
                )}
            </div>

            <AddCovenantModal
                isOpen={isaddModalOpen}
                onClose={() => setIsAddModalOpen(false)}
                facilityId={facility.id}
            />
        </div>
    )
}
