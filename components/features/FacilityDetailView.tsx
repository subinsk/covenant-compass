'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, Badge, Button } from '@/components/ui/core'
import { Plus } from 'lucide-react'
import { AddCovenantModal } from './AddCovenantModal'
import { OccurrenceDetails } from './OccurrenceDetails'
import type { Prisma } from '@prisma/client'
import { formatPeriod } from '@/lib/format/period'
import type { occurrenceDocumentsSelect } from '@/lib/occurrences/documents'
import { nextDueByCovenant, type NextDue } from '@/lib/occurrences/next-due'
import { onTimeRate } from '@/lib/dashboard/metrics'

type FacilityWithDetails = Prisma.FacilityGetPayload<{
    include: {
        lender: true; borrower: true; covenants: true
        occurrences: { include: { covenant: true; documents: typeof occurrenceDocumentsSelect } }
    }
}>

// Prisma's Decimal can't cross from a server component to a client one, so the
// page passes totalCommitment as a string.
export type FacilityView = Omit<FacilityWithDetails, 'totalCommitment'> & { totalCommitment: string }

const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'covenants', label: 'Covenants' },
    { id: 'schedule', label: 'Schedule' },
]

function NextDueCell({ next }: { next?: NextDue }) {
    if (!next) return <span className="text-muted-foreground">—</span>
    return (
        <span className={next.overdue ? 'text-red-600 font-medium' : ''}>
            {next.dueDate.toLocaleDateString()}
            {next.overdue && ' (overdue)'}
        </span>
    )
}

export default function FacilityDetailView({ facility, initialTab, canManage }: {
    facility: FacilityView
    initialTab?: string
    canManage: boolean
}) {
    const [activeTab, setActiveTab] = useState(tabs.some(t => t.id === initialTab) ? initialTab! : 'overview')
    const [isaddModalOpen, setIsAddModalOpen] = useState(false)
    // Look the occurrence up by id so the panel shows fresh data after router.refresh().
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const selected = facility.occurrences.find(o => o.id === selectedId)
    const health = onTimeRate(facility.occurrences)
    const nextDue = nextDueByCovenant(facility.occurrences)

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
                                    <div className={`w-16 h-16 rounded-full flex items-center justify-center font-bold text-xl ${health.rate === null
                                            ? 'bg-muted text-muted-foreground'
                                            : health.rate >= 90 ? 'bg-emerald-100 text-emerald-600'
                                                : health.rate >= 70 ? 'bg-amber-100 text-amber-600' : 'bg-red-100 text-red-600'
                                        }`}>
                                        {health.rate === null ? '—' : `${health.rate}%`}
                                    </div>
                                    <div>
                                        <p className="font-medium">On-time rate</p>
                                        <p className="text-sm text-muted-foreground">
                                            {health.onTime} of {health.completed + health.overdue} on time
                                            ({health.completed} completed, {health.overdue} overdue; waivers excluded)
                                        </p>
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
                                                <td className="p-4"><NextDueCell next={nextDue.get(cov.id)} /></td>
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
                                                    <div className="text-xs text-muted-foreground">{formatPeriod(occ.periodStartDate, occ.periodEndDate)}</div>
                                                </td>
                                                <td className="p-4">
                                                    <Badge variant={occ.status === 'COMPLETED' ? 'success' : occ.status === 'OVERDUE' ? 'destructive' : 'secondary'}>
                                                        {occ.status}
                                                    </Badge>
                                                </td>
                                                <td className="p-4">
                                                    <Button size="sm" variant="ghost" onClick={() => setSelectedId(occ.id)}>Details</Button>
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

            {selected && (
                <OccurrenceDetails occurrence={selected} canManage={canManage} onClose={() => setSelectedId(null)} />
            )}

            <AddCovenantModal
                isOpen={isaddModalOpen}
                onClose={() => setIsAddModalOpen(false)}
                facilityId={facility.id}
            />
        </div>
    )
}
