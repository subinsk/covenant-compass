'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { format } from 'date-fns'
import {
    AlertTriangle, CalendarClock, CalendarRange, ChevronRight, ClipboardList, Coins, FileText, Gauge, ListChecks, Plus, X,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, Badge, Button, cn } from '@/components/ui/core'
import { Combobox } from '@/components/ui/Combobox'
import { Pager } from '@/components/ui/Pager'
import { AddCovenantModal } from './AddCovenantModal'
import { OccurrenceDetails } from './OccurrenceDetails'
import type { Prisma } from '@prisma/client'
import { formatPeriod } from '@/lib/format/period'
import type { occurrenceDocumentsSelect } from '@/lib/occurrences/documents'
import { nextDueByCovenant } from '@/lib/occurrences/next-due'
import { onTimeRate } from '@/lib/dashboard/metrics'
import {
    SCHEDULE_STATUSES, dueLabel, filterSchedule, openObligations, statusCounts, termProgress, type ScheduleFilter,
} from '@/lib/facilities/detail'

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

const SCHEDULE_PAGE_SIZE = 15

const STATUS_BADGE = { PENDING: 'secondary', OVERDUE: 'destructive', COMPLETED: 'success', WAIVED: 'warning' } as const
const STATUS_LABEL = { ALL: 'All', PENDING: 'Pending', OVERDUE: 'Overdue', COMPLETED: 'Completed', WAIVED: 'Waived' } as const
const STATUS_BAR = { COMPLETED: 'bg-emerald-500', PENDING: 'bg-slate-300', OVERDUE: 'bg-red-500', WAIVED: 'bg-amber-400' } as const
const RAG_DOT = { GREEN: 'bg-emerald-500', AMBER: 'bg-amber-500', RED: 'bg-red-500' } as const
const TYPE_STYLE = {
    FINANCIAL: 'bg-blue-500/10 text-blue-700',
    REPORTING: 'bg-violet-500/10 text-violet-700',
    GENERAL: 'bg-slate-500/10 text-slate-700',
    ESG: 'bg-emerald-500/10 text-emerald-700',
} as const
const IMPORTANCE_STYLE = { HIGH: 'text-red-600', MEDIUM: 'text-amber-600', LOW: 'text-muted-foreground' } as const
const DUE_TONE = { overdue: 'text-red-600', soon: 'text-amber-600', later: 'text-muted-foreground' } as const

const titleCase = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ')
const fmtDate = (d: Date | string) => format(new Date(d), 'd MMM yyyy')

export default function FacilityDetailView({ facility, initialTab, canManage, now: nowIso, commitment }: {
    facility: FacilityView
    initialTab?: string
    canManage: boolean
    // Server time, so relative labels render the same on server and client.
    now: string
    commitment: { compact: string; full: string }
}) {
    const now = new Date(nowIso)
    const [activeTab, setActiveTab] = useState(tabs.some(t => t.id === initialTab) ? initialTab! : 'overview')
    const [isAddModalOpen, setIsAddModalOpen] = useState(false)
    // Look the occurrence up by id so the panel shows fresh data after router.refresh().
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const [filter, setFilter] = useState<ScheduleFilter>({ status: 'ALL', covenantId: null })
    const [page, setPage] = useState(1)

    const selected = facility.occurrences.find(o => o.id === selectedId)
    const health = onTimeRate(facility.occurrences)
    const nextDue = nextDueByCovenant(facility.occurrences)
    const open = openObligations(facility.occurrences)
    const overdueCount = open.filter(o => o.status === 'OVERDUE').length
    const allCounts = statusCounts(facility.occurrences, null)
    const counts = statusCounts(facility.occurrences, filter.covenantId)
    const scheduled = filterSchedule(facility.occurrences, filter)
    const totalPages = Math.max(1, Math.ceil(scheduled.length / SCHEDULE_PAGE_SIZE))
    const currentPage = Math.min(page, totalPages)
    const pageItems = scheduled.slice((currentPage - 1) * SCHEDULE_PAGE_SIZE, currentPage * SCHEDULE_PAGE_SIZE)
    const progress = termProgress(facility.startDate, facility.endDate, now)

    const selectTab = (id: string) => {
        setActiveTab(id)
        // Keep the tab in the URL so reloads and shared links land on it.
        window.history.replaceState(null, '', `?tab=${id}`)
    }
    const updateFilter = (change: Partial<ScheduleFilter>) => {
        setFilter(f => ({ ...f, ...change }))
        setPage(1)
    }
    const openSchedule = (change: Partial<ScheduleFilter>) => {
        updateFilter({ status: 'ALL', covenantId: null, ...change })
        selectTab('schedule')
    }

    const tabCount: Record<string, number | undefined> = { covenants: facility.covenants.length, schedule: facility.occurrences.length }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="space-y-4 animate-fade-up">
                <nav className="flex items-center gap-1 text-sm text-muted-foreground" aria-label="Breadcrumb">
                    <Link href="/facilities" className="transition-colors hover:text-foreground">Facilities</Link>
                    <ChevronRight className="h-3.5 w-3.5" />
                    <span className="truncate text-foreground">{facility.name}</span>
                </nav>
                <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
                    <div className="flex items-center gap-4">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-lg font-bold text-primary">
                            {facility.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <h1 className="text-2xl font-bold tracking-tight">{facility.name}</h1>
                                <Badge variant={facility.status === 'ACTIVE' ? 'success' : facility.status === 'DEFAULTED' ? 'destructive' : 'secondary'}>
                                    {titleCase(facility.status)}
                                </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">
                                {facility.lender.name} → {facility.borrower.name} · {facility.facilityReference}
                            </p>
                        </div>
                    </div>
                    {canManage && (
                        <Button onClick={() => setIsAddModalOpen(true)} className="shadow-sm transition-all hover:shadow-md active:scale-[0.98]">
                            <Plus className="mr-2 h-4 w-4" />
                            Add Covenant
                        </Button>
                    )}
                </div>
            </div>

            {/* KPI strip */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <Stat index={0} icon={<Coins className="h-4 w-4" />} label="Commitment" value={commitment.compact} hint={commitment.full} />
                <Stat
                    index={1}
                    icon={<ListChecks className="h-4 w-4" />}
                    label="Covenants"
                    value={facility.covenants.filter(c => c.active).length}
                    hint={`${facility.covenants.length} in total`}
                    onClick={() => selectTab('covenants')}
                />
                <Stat
                    index={2}
                    icon={<Gauge className="h-4 w-4" />}
                    label="On-time rate"
                    value={health.rate === null ? '—' : `${health.rate}%`}
                    hint={`${health.onTime} of ${health.completed + health.overdue} on time`}
                    tone={health.rate === null ? undefined : health.rate >= 90 ? 'good' : health.rate >= 70 ? 'warn' : 'bad'}
                />
                <Stat
                    index={3}
                    icon={<AlertTriangle className="h-4 w-4" />}
                    label="Open obligations"
                    value={open.length}
                    hint={overdueCount > 0 ? `${overdueCount} overdue` : 'None overdue'}
                    tone={overdueCount > 0 ? 'bad' : 'good'}
                    onClick={() => openSchedule({ status: overdueCount > 0 ? 'OVERDUE' : 'PENDING' })}
                />
            </div>

            {/* Tabs */}
            <div className="border-b animate-fade-up" style={{ animationDelay: '200ms' }}>
                <div className="flex gap-6" role="tablist">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            role="tab"
                            aria-selected={activeTab === tab.id}
                            onClick={() => selectTab(tab.id)}
                            className={cn(
                                'relative flex items-center gap-2 pb-3 text-sm font-medium transition-colors',
                                activeTab === tab.id ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                            )}
                        >
                            {tab.label}
                            {tabCount[tab.id] !== undefined && (
                                <span className={cn('rounded-full px-1.5 text-xs tabular-nums', activeTab === tab.id ? 'bg-primary/10' : 'bg-muted')}>{tabCount[tab.id]}</span>
                            )}
                            <span className={cn(
                                'absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-primary transition-transform duration-300',
                                activeTab === tab.id ? 'scale-x-100' : 'scale-x-0'
                            )} />
                        </button>
                    ))}
                </div>
            </div>

            {/* Tab content; the key replays the entrance animation on each switch */}
            <div key={activeTab} className="min-h-[400px] animate-fade-in">
                {activeTab === 'overview' && (
                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                        <Card className="lg:col-span-2">
                            <CardHeader className="flex-row items-center justify-between space-y-0">
                                <CardTitle className="flex items-center gap-2 text-base">
                                    <CalendarClock className="h-4 w-4 text-muted-foreground" />
                                    Upcoming &amp; overdue
                                </CardTitle>
                                {open.length > 0 && (
                                    <button onClick={() => openSchedule({})} className="text-sm font-medium text-primary hover:underline">
                                        View schedule
                                    </button>
                                )}
                            </CardHeader>
                            <CardContent>
                                {open.length === 0 ? (
                                    <p className="py-8 text-center text-sm text-muted-foreground">Nothing open. Every obligation is completed or waived.</p>
                                ) : (
                                    <ul className="-mx-2 space-y-1">
                                        {open.slice(0, 6).map((occ, i) => {
                                            const due = dueLabel(occ.dueDate, occ.status, now)
                                            return (
                                                <li key={occ.id} className="animate-fade-up" style={{ animationDelay: `${i * 50}ms` }}>
                                                    <button
                                                        onClick={() => setSelectedId(occ.id)}
                                                        className="group flex w-full items-center gap-3 rounded-md px-2 py-2.5 text-left transition-colors hover:bg-accent"
                                                    >
                                                        <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', RAG_DOT[occ.ragStatus])} title={`RAG: ${occ.ragStatus}`} />
                                                        <div className="min-w-0 flex-1">
                                                            <p className="truncate text-sm font-medium transition-colors group-hover:text-primary">{occ.covenant.title}</p>
                                                            <p className="text-xs text-muted-foreground">{fmtDate(occ.dueDate)}</p>
                                                        </div>
                                                        {due && <span className={cn('shrink-0 text-xs font-medium', DUE_TONE[due.tone])}>{due.text}</span>}
                                                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                                                    </button>
                                                </li>
                                            )
                                        })}
                                    </ul>
                                )}
                            </CardContent>
                        </Card>

                        <div className="space-y-6">
                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2 text-base">
                                        <CalendarRange className="h-4 w-4 text-muted-foreground" />
                                        Term
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-3 text-sm">
                                    <div className="flex justify-between text-muted-foreground">
                                        <span>{fmtDate(facility.startDate)}</span>
                                        <span>{fmtDate(facility.endDate)}</span>
                                    </div>
                                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                                        <div className="h-full origin-left rounded-full bg-primary animate-grow-x" style={{ width: `${progress}%`, animationDelay: '200ms' }} />
                                    </div>
                                    <p className="text-muted-foreground">
                                        <span className="font-medium text-foreground">{progress}%</span> of the term elapsed
                                    </p>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2 text-base">
                                        <ClipboardList className="h-4 w-4 text-muted-foreground" />
                                        Obligations by status
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    {allCounts.ALL === 0 ? (
                                        <p className="text-sm text-muted-foreground">No obligations scheduled yet.</p>
                                    ) : (
                                        <>
                                            <div className="flex h-2 overflow-hidden rounded-full bg-muted">
                                                {SCHEDULE_STATUSES.map(s => allCounts[s] > 0 && (
                                                    <div key={s} className={cn('h-full', STATUS_BAR[s])} style={{ width: `${(allCounts[s] / allCounts.ALL) * 100}%` }} />
                                                ))}
                                            </div>
                                            <ul className="grid grid-cols-2 gap-x-4 gap-y-1">
                                                {SCHEDULE_STATUSES.map(s => (
                                                    <li key={s}>
                                                        <button
                                                            onClick={() => openSchedule({ status: s })}
                                                            className="flex w-full items-center gap-2 rounded px-1 py-1 text-sm transition-colors hover:bg-accent"
                                                        >
                                                            <span className={cn('h-2 w-2 rounded-full', STATUS_BAR[s])} />
                                                            <span className="text-muted-foreground">{STATUS_LABEL[s]}</span>
                                                            <span className="ml-auto font-medium tabular-nums">{allCounts[s]}</span>
                                                        </button>
                                                    </li>
                                                ))}
                                            </ul>
                                        </>
                                    )}
                                </CardContent>
                            </Card>

                            {facility.description && (
                                <Card>
                                    <CardHeader>
                                        <CardTitle className="flex items-center gap-2 text-base">
                                            <FileText className="h-4 w-4 text-muted-foreground" />
                                            Description
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <p className="whitespace-pre-wrap text-sm text-muted-foreground">{facility.description}</p>
                                    </CardContent>
                                </Card>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'covenants' && (
                    <Card className="overflow-hidden">
                        {facility.covenants.length === 0 ? (
                            <div className="flex flex-col items-center gap-3 py-16 text-center">
                                <div className="rounded-full bg-muted p-3 text-muted-foreground"><ListChecks className="h-6 w-6" /></div>
                                <p className="text-sm text-muted-foreground">No covenants defined yet.</p>
                                {canManage && <Button size="sm" onClick={() => setIsAddModalOpen(true)}><Plus className="mr-2 h-4 w-4" />Add Covenant</Button>}
                            </div>
                        ) : (
                            <table className="w-full text-left text-sm">
                                <thead className="border-b bg-muted/50">
                                    <tr className="text-muted-foreground">
                                        <th className="h-11 px-4 font-medium">Covenant</th>
                                        <th className="h-11 px-4 font-medium">Type</th>
                                        <th className="hidden h-11 px-4 font-medium md:table-cell">Frequency</th>
                                        <th className="hidden h-11 px-4 font-medium lg:table-cell">Importance</th>
                                        <th className="h-11 px-4 font-medium">Next due</th>
                                        <th className="w-10" />
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {facility.covenants.map((cov, i) => {
                                        const next = nextDue.get(cov.id)
                                        const due = next && dueLabel(next.dueDate, next.overdue ? 'OVERDUE' : 'PENDING', now)
                                        return (
                                            <tr
                                                key={cov.id}
                                                onClick={() => openSchedule({ covenantId: cov.id })}
                                                className="group cursor-pointer transition-colors hover:bg-accent/60 animate-fade-in"
                                                style={{ animationDelay: `${i * 30}ms` }}
                                            >
                                                <td className="w-full max-w-0 px-4 py-3">
                                                    <button
                                                        className="block max-w-full truncate text-left font-medium transition-colors group-hover:text-primary focus-visible:underline focus-visible:outline-none"
                                                        aria-label={`Show schedule for ${cov.title}`}
                                                    >
                                                        {cov.title}
                                                    </button>
                                                    <p className="truncate text-xs text-muted-foreground">
                                                        {cov.thresholdCondition || cov.description || cov.category || '—'}
                                                        {!cov.active && ' · inactive'}
                                                    </p>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className={cn('whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium', TYPE_STYLE[cov.type])}>{titleCase(cov.type)}</span>
                                                </td>
                                                <td className="hidden whitespace-nowrap px-4 py-3 md:table-cell">{titleCase(cov.frequency)}</td>
                                                <td className={cn('hidden px-4 py-3 font-medium lg:table-cell', IMPORTANCE_STYLE[cov.importance])}>{titleCase(cov.importance)}</td>
                                                <td className="whitespace-nowrap px-4 py-3">
                                                    {next ? (
                                                        <>
                                                            <p>{fmtDate(next.dueDate)}</p>
                                                            {due && <p className={cn('text-xs', DUE_TONE[due.tone])}>{due.text}</p>}
                                                        </>
                                                    ) : <span className="text-muted-foreground">—</span>}
                                                </td>
                                                <td className="px-2 py-3">
                                                    <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        )}
                    </Card>
                )}

                {activeTab === 'schedule' && (
                    <div className="space-y-4">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                            <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
                                {(['ALL', ...SCHEDULE_STATUSES] as const).map(s => (
                                    <button
                                        key={s}
                                        onClick={() => updateFilter({ status: s })}
                                        aria-pressed={filter.status === s}
                                        className={cn(
                                            'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-all active:scale-95',
                                            filter.status === s ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-muted text-muted-foreground hover:bg-accent hover:text-foreground'
                                        )}
                                    >
                                        {STATUS_LABEL[s]}
                                        <span className={cn('rounded-full px-1.5 text-xs tabular-nums', filter.status === s ? 'bg-primary-foreground/20' : 'bg-background')}>{counts[s]}</span>
                                    </button>
                                ))}
                            </div>
                            <div className="flex items-center gap-2 lg:w-80">
                                <div className="flex-1">
                                    <Combobox
                                        options={[{ value: '', label: 'All covenants' }, ...facility.covenants.map(c => ({ value: c.id, label: c.title }))]}
                                        value={filter.covenantId ?? ''}
                                        onChange={v => updateFilter({ covenantId: v || null })}
                                        searchPlaceholder="Search covenants…"
                                    />
                                </div>
                                {filter.covenantId && (
                                    <Button size="icon" variant="ghost" onClick={() => updateFilter({ covenantId: null })} aria-label="Clear covenant filter">
                                        <X className="h-4 w-4" />
                                    </Button>
                                )}
                            </div>
                        </div>

                        <Card className="overflow-hidden">
                            {pageItems.length === 0 ? (
                                <div className="flex flex-col items-center gap-2 py-16 text-center">
                                    <div className="rounded-full bg-muted p-3 text-muted-foreground"><CalendarClock className="h-6 w-6" /></div>
                                    <p className="text-sm text-muted-foreground">
                                        {facility.occurrences.length === 0 ? 'No schedule generated yet.' : 'No obligations match these filters.'}
                                    </p>
                                </div>
                            ) : (
                                <table className="w-full text-left text-sm">
                                    <thead className="border-b bg-muted/50">
                                        <tr className="text-muted-foreground">
                                            <th className="h-11 px-4 font-medium">Due date</th>
                                            <th className="h-11 px-4 font-medium">Obligation</th>
                                            <th className="h-11 px-4 font-medium">Status</th>
                                            <th className="hidden h-11 px-4 text-center font-medium md:table-cell">Evidence</th>
                                            <th className="w-10" />
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {pageItems.map((occ, i) => {
                                            const due = dueLabel(occ.dueDate, occ.status, now)
                                            return (
                                                <tr
                                                    key={occ.id}
                                                    onClick={() => setSelectedId(occ.id)}
                                                    className="group cursor-pointer transition-colors hover:bg-accent/60 animate-fade-in"
                                                    style={{ animationDelay: `${i * 25}ms` }}
                                                >
                                                    <td className="whitespace-nowrap px-4 py-3">
                                                        <p className="font-medium tabular-nums">{fmtDate(occ.dueDate)}</p>
                                                        {due && <p className={cn('text-xs', DUE_TONE[due.tone])}>{due.text}</p>}
                                                    </td>
                                                    <td className="w-full max-w-0 px-4 py-3">
                                                        <div className="flex items-center gap-2">
                                                            <span className={cn('h-2 w-2 shrink-0 rounded-full', RAG_DOT[occ.ragStatus])} title={`RAG: ${occ.ragStatus}`} />
                                                            <button
                                                                className="truncate text-left font-medium transition-colors group-hover:text-primary focus-visible:underline focus-visible:outline-none"
                                                                aria-label={`Open details for ${occ.covenant.title}, due ${fmtDate(occ.dueDate)}`}
                                                            >
                                                                {occ.covenant.title}
                                                            </button>
                                                        </div>
                                                        <p className="truncate pl-4 text-xs text-muted-foreground">{formatPeriod(occ.periodStartDate, occ.periodEndDate)}</p>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <Badge variant={STATUS_BADGE[occ.status]}>{STATUS_LABEL[occ.status]}</Badge>
                                                    </td>
                                                    <td className="hidden px-4 py-3 text-center tabular-nums text-muted-foreground md:table-cell">
                                                        {occ.documents.length || '—'}
                                                    </td>
                                                    <td className="px-2 py-3">
                                                        <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            )}
                            {scheduled.length > 0 && (
                                <div className="flex flex-col items-center gap-2 border-t px-4 py-3 sm:grid sm:grid-cols-[1fr_auto_1fr]">
                                    <p className="text-sm text-muted-foreground sm:justify-self-start">
                                        Showing <span className="font-medium text-foreground">{(currentPage - 1) * SCHEDULE_PAGE_SIZE + 1}–{Math.min(currentPage * SCHEDULE_PAGE_SIZE, scheduled.length)}</span> of <span className="font-medium text-foreground">{scheduled.length}</span>
                                    </p>
                                    <Pager page={currentPage} totalPages={totalPages} onPageChange={setPage} />
                                </div>
                            )}
                        </Card>
                    </div>
                )}
            </div>

            {/* Portalled so the page's animated wrappers can't trap the fixed overlays */}
            {selected && createPortal(
                <OccurrenceDetails occurrence={selected} canManage={canManage} onClose={() => setSelectedId(null)} />,
                document.body
            )}
            {isAddModalOpen && createPortal(
                <AddCovenantModal isOpen onClose={() => setIsAddModalOpen(false)} facilityId={facility.id} />,
                document.body
            )}
        </div>
    )
}

function Stat({ index, icon, label, value, hint, tone, onClick }: {
    index: number
    icon: React.ReactNode
    label: string
    value: React.ReactNode
    hint?: string
    tone?: 'good' | 'warn' | 'bad'
    onClick?: () => void
}) {
    const toneClass = tone === 'good' ? 'text-emerald-600' : tone === 'warn' ? 'text-amber-600' : tone === 'bad' ? 'text-red-600' : ''
    return (
        <Card
            className={cn('group transition-all duration-300 animate-fade-up', onClick && 'cursor-pointer hover:-translate-y-0.5 hover:shadow-md')}
            style={{ animationDelay: `${80 + index * 60}ms` }}
            onClick={onClick}
            role={onClick ? 'button' : undefined}
            tabIndex={onClick ? 0 : undefined}
            onKeyDown={onClick ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } } : undefined}
        >
            <CardContent className="p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span className="rounded-md bg-muted p-1.5 transition-colors group-hover:bg-primary/10 group-hover:text-primary">{icon}</span>
                    {label}
                </div>
                <p className={cn('mt-2 text-2xl font-bold tracking-tight tabular-nums', toneClass)}>{value}</p>
                {hint && <p className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</p>}
            </CardContent>
        </Card>
    )
}
