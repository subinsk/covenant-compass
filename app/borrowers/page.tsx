import Link from 'next/link'
import { redirect } from 'next/navigation'
import { formatDistanceToNow } from 'date-fns'
import { Building2, ChevronRight, Mail, SearchX } from 'lucide-react'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth/session'
import { borrowerScope, facilityScope, isLender } from '@/lib/auth/access'
import { Card, CardContent } from '@/components/ui/core'
import { FacilitySearch } from '@/components/features/FacilitySearch'
import { NewBorrowerButton } from '@/components/features/NewBorrowerModal'

export default async function BorrowersPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
    const session = await getSession()
    if (!session) redirect('/login')
    if (!isLender(session)) redirect('/portal')

    const rawQ = (await searchParams).q
    const q = (Array.isArray(rawQ) ? rawQ[0] : rawQ ?? '').trim().slice(0, 100)
    const scope = borrowerScope(session)
    const where: Prisma.OrganizationWhereInput = q
        ? {
            AND: [scope, {
                OR: (['name', 'legalName', 'industry', 'country', 'contactName', 'contactEmail'] as const)
                    .map(field => ({ [field]: { contains: q, mode: 'insensitive' } })),
            }],
        }
        : scope

    const [borrowers, total, facilityCounts, activeCounts] = await Promise.all([
        prisma.organization.findMany({ where, orderBy: { name: 'asc' } }),
        prisma.organization.count({ where: scope }),
        // Facilities per borrower, counting only this lender's facilities.
        prisma.facility.groupBy({ by: ['borrowerOrgId'], where: facilityScope(session), _count: true }),
        prisma.facility.groupBy({ by: ['borrowerOrgId'], where: { ...facilityScope(session), status: 'ACTIVE' }, _count: true }),
    ])
    const facilities = new Map(facilityCounts.map(g => [g.borrowerOrgId, g._count]))
    const active = new Map(activeCounts.map(g => [g.borrowerOrgId, g._count]))

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between animate-fade-up">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Borrowers</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        {total} {total === 1 ? 'borrower' : 'borrowers'}{q && <> · {borrowers.length} matching &ldquo;{q}&rdquo;</>}
                    </p>
                </div>
                <NewBorrowerButton />
            </div>

            <div className="animate-fade-up" style={{ animationDelay: '60ms' }}>
                <FacilitySearch placeholder="Search name, industry, country or contact" label="Search borrowers" />
            </div>

            <Card className="overflow-hidden animate-fade-up" style={{ animationDelay: '120ms' }}>
                <CardContent className="p-0">
                    {borrowers.length === 0 ? (
                        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                            <div className="rounded-full bg-muted p-3 text-muted-foreground">
                                {q ? <SearchX className="h-6 w-6" /> : <Building2 className="h-6 w-6" />}
                            </div>
                            <p className="text-sm text-muted-foreground">{q ? 'No borrowers match that search.' : 'No borrowers yet. Add one to start a facility.'}</p>
                            {q && <Link href="/borrowers" className="text-sm font-medium text-primary hover:underline">Clear search</Link>}
                        </div>
                    ) : (
                        <table className="w-full text-left text-sm">
                            <thead className="border-b bg-muted/50">
                                <tr className="text-muted-foreground">
                                    <th className="h-11 px-4 font-medium">Borrower</th>
                                    <th className="hidden h-11 px-4 font-medium lg:table-cell">Industry</th>
                                    <th className="hidden h-11 px-4 font-medium md:table-cell">Country</th>
                                    <th className="hidden h-11 px-4 font-medium lg:table-cell">Primary contact</th>
                                    <th className="h-11 px-4 text-center font-medium">Facilities</th>
                                    <th className="hidden h-11 px-4 font-medium xl:table-cell">Added</th>
                                    <th className="w-10" />
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {borrowers.map((b, i) => {
                                    const count = facilities.get(b.id) ?? 0
                                    return (
                                        <tr
                                            key={b.id}
                                            className="group relative transition-colors hover:bg-accent/60 animate-fade-in"
                                            style={{ animationDelay: `${160 + i * 30}ms` }}
                                        >
                                            <td className="w-full max-w-0 px-4 py-3">
                                                <div className="flex items-center gap-3">
                                                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-sm font-semibold text-violet-700 transition-transform group-hover:scale-105">
                                                        {b.name.charAt(0).toUpperCase()}
                                                    </div>
                                                    <div className="min-w-0">
                                                        {/* Opens this borrower's facilities; the link stretches over the row */}
                                                        <Link
                                                            href={`/facilities?q=${encodeURIComponent(b.name)}`}
                                                            className="block truncate font-medium transition-colors group-hover:text-primary after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring"
                                                        >
                                                            {b.name}
                                                        </Link>
                                                        <p className="truncate text-xs text-muted-foreground">{b.legalName || b.registrationNumber || '—'}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="hidden whitespace-nowrap px-4 py-3 lg:table-cell">{b.industry || <span className="text-muted-foreground">—</span>}</td>
                                            <td className="hidden whitespace-nowrap px-4 py-3 md:table-cell">{b.country || <span className="text-muted-foreground">—</span>}</td>
                                            <td className="hidden px-4 py-3 lg:table-cell">
                                                {b.contactName || b.contactEmail ? (
                                                    <div className="min-w-0">
                                                        <p className="truncate">{b.contactName || '—'}</p>
                                                        {b.contactEmail && (
                                                            <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                                                                <Mail className="h-3 w-3 shrink-0" />{b.contactEmail}
                                                            </p>
                                                        )}
                                                    </div>
                                                ) : <span className="text-muted-foreground">—</span>}
                                            </td>
                                            <td className="px-4 py-3 text-center tabular-nums">
                                                <span className="font-medium">{count}</span>
                                                {count > 0 && <p className="text-xs text-muted-foreground">{active.get(b.id) ?? 0} active</p>}
                                            </td>
                                            <td className="hidden whitespace-nowrap px-4 py-3 text-muted-foreground xl:table-cell" title={b.createdAt.toLocaleString()}>
                                                {formatDistanceToNow(b.createdAt, { addSuffix: true })}
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
                </CardContent>
            </Card>
        </div>
    )
}
