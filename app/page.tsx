import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth/session'
import { facilityScope, isLender } from '@/lib/auth/access'
import { Card, CardContent, CardHeader, CardTitle, Badge, cn } from '@/components/ui/core'
import { AlertCircle, ArrowRight, CheckCircle, ChevronRight, Clock, FileStack, History, ShieldCheck } from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'
import { obligationWhere } from '@/lib/dashboard/filters'

// Server Component for Dashboard
export default async function Dashboard() {
  const session = await getSession()
  if (!session) redirect('/login')
  if (!isLender(session)) redirect('/portal')

  const scope = facilityScope(session)
  const now = new Date()

  const totalFacilities = await prisma.facility.count({ where: { ...scope, status: 'ACTIVE' } })

  const upcomingOccurrences = await prisma.covenantOccurrence.count({ where: obligationWhere('upcoming', scope, now) })
  const overdueOccurrences = await prisma.covenantOccurrence.count({ where: obligationWhere('overdue', scope, now) })

  // On-time rate: completed share of closed obligations
  const completed = await prisma.covenantOccurrence.count({ where: { facility: scope, status: 'COMPLETED' } })
  const totalClosed = await prisma.covenantOccurrence.count({ where: obligationWhere('closed', scope, now) })
  const onTimeRate = totalClosed > 0 ? Math.round((completed / totalClosed) * 100) : 100

  // High Risk Facilities (Any with RED status occurrences)
  const highRiskFacilities = await prisma.facility.findMany({
    where: {
      ...scope,
      occurrences: {
        some: { ragStatus: 'RED' }
      }
    },
    include: {
      occurrences: { where: { ragStatus: 'RED' } }
    },
    take: 5
  })

  // Recent Activity
  const recentActivity = await prisma.covenantOccurrence.findMany({
    where: { facility: scope },
    orderBy: { updatedAt: 'desc' },
    take: 5,
    include: { facility: true, covenant: true }
  })

  return (
    <div className="space-y-8">
      {/* Page intro */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between animate-fade-up">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{format(now, 'EEEE, d MMMM yyyy')}</p>
          <h1 className="text-2xl font-bold tracking-tight mt-1">Portfolio overview</h1>
        </div>
        <Link
          href="/calendar"
          className="group inline-flex items-center gap-2 self-start rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 hover:shadow-md active:scale-[0.98] sm:self-auto"
        >
          Open calendar
          <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard index={0} title="Active Facilities" value={totalFacilities} href="/facilities?status=ACTIVE" icon={<FileStack className="w-5 h-5" />} tone="blue" />
        <KpiCard index={1} title="Upcoming (30 days)" value={upcomingOccurrences} href="/obligations?filter=upcoming" icon={<Clock className="w-5 h-5" />} tone="amber" />
        <KpiCard index={2} title="Overdue Obligations" value={overdueOccurrences} href="/obligations?filter=overdue" icon={<AlertCircle className="w-5 h-5" />} tone="red" pulse={overdueOccurrences > 0} />
        <KpiCard index={3} title="On-Time Completion" value={`${onTimeRate}%`} href="/obligations?filter=closed" icon={<CheckCircle className="w-5 h-5" />} tone="emerald">
          <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full origin-left rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600 animate-grow-x"
              style={{ width: `${onTimeRate}%`, animationDelay: '400ms' }}
            />
          </div>
        </KpiCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* High Risk List */}
        <Card className="animate-fade-up transition-shadow hover:shadow-md" style={{ animationDelay: '300ms' }}>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <span className="relative flex h-2.5 w-2.5">
                {highRiskFacilities.length > 0 && (
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                )}
                <span className={cn('relative inline-flex h-2.5 w-2.5 rounded-full', highRiskFacilities.length > 0 ? 'bg-red-500' : 'bg-emerald-500')} />
              </span>
              Needs Attention
            </CardTitle>
            <span className="text-xs text-muted-foreground">High risk</span>
          </CardHeader>
          <CardContent>
            {highRiskFacilities.length === 0 ? (
              <EmptyState icon={<ShieldCheck className="w-6 h-6" />} text="No facilities currently at high risk." />
            ) : (
              <ul className="-mx-2 space-y-1">
                {highRiskFacilities.map((f, i) => (
                  <li key={f.id} className="animate-fade-up" style={{ animationDelay: `${400 + i * 60}ms` }}>
                    <Link
                      href={`/facilities/${f.id}?tab=schedule`}
                      className="group flex items-center gap-3 rounded-md px-2 py-2.5 transition-colors hover:bg-accent"
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-500/10 text-sm font-semibold text-red-600">
                        {f.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium transition-colors group-hover:text-primary">{f.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{f.facilityReference}</p>
                      </div>
                      <Badge variant="destructive">{f.occurrences.length} Red Flags</Badge>
                      <ChevronRight className="w-4 h-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Recent Activity List */}
        <Card className="animate-fade-up transition-shadow hover:shadow-md" style={{ animationDelay: '360ms' }}>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="w-4 h-4 text-muted-foreground" />
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentActivity.length === 0 ? (
              <EmptyState icon={<History className="w-6 h-6" />} text="No activity yet." />
            ) : (
              <ol className="relative space-y-5 border-l border-border pl-5 ml-1.5">
                {recentActivity.map((act, i) => (
                  <li key={act.id} className="relative animate-fade-up" style={{ animationDelay: `${460 + i * 60}ms` }}>
                    <span className={cn('absolute -left-[26px] top-3 h-2.5 w-2.5 rounded-full ring-4 ring-card', STATUS_DOT[act.status])} />
                    <Link
                      href={`/facilities/${act.facilityId}?tab=schedule`}
                      className="group -mx-2 flex items-start justify-between gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-accent"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium transition-colors group-hover:text-primary">{act.covenant.title}</p>
                        <p className="truncate text-xs text-muted-foreground">{act.facility.name}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <Badge variant={STATUS_BADGE[act.status]}>{act.status}</Badge>
                        <p className="mt-1 text-[11px] text-muted-foreground" title={act.updatedAt.toLocaleString()}>
                          {formatDistanceToNow(act.updatedAt, { addSuffix: true })}
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

const STATUS_BADGE = {
  PENDING: 'secondary',
  COMPLETED: 'success',
  OVERDUE: 'destructive',
  WAIVED: 'warning',
} as const

const STATUS_DOT = {
  PENDING: 'bg-slate-400',
  COMPLETED: 'bg-emerald-500',
  OVERDUE: 'bg-red-500',
  WAIVED: 'bg-amber-500',
}

const TONES = {
  blue: { icon: 'bg-blue-500/10 text-blue-600', glow: 'bg-blue-500/10' },
  amber: { icon: 'bg-amber-500/10 text-amber-600', glow: 'bg-amber-500/10' },
  red: { icon: 'bg-red-500/10 text-red-600', glow: 'bg-red-500/10' },
  emerald: { icon: 'bg-emerald-500/10 text-emerald-600', glow: 'bg-emerald-500/10' },
}

function KpiCard({ index, title, value, icon, tone, href, pulse, children }: {
  index: number
  title: string
  value: string | number
  icon: React.ReactNode
  tone: keyof typeof TONES
  href?: string
  pulse?: boolean
  children?: React.ReactNode
}) {
  const card = (
    <Card
      className="group relative h-full overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-lg animate-fade-up"
      style={{ animationDelay: `${80 + index * 70}ms` }}
    >
      {/* Soft corner glow that grows on hover */}
      <div className={cn('pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full blur-2xl transition-transform duration-500 group-hover:scale-150', TONES[tone].glow)} />
      <CardContent className="relative p-6">
        <div className="flex items-start justify-between">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <div className={cn('relative rounded-lg p-2 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3', TONES[tone].icon)}>
            {icon}
            {pulse && (
              <span className="absolute -right-0.5 -top-0.5 flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
              </span>
            )}
          </div>
        </div>
        <p className="mt-2 text-3xl font-bold tracking-tight tabular-nums">{value}</p>
        {children}
      </CardContent>
    </Card>
  )

  if (!href) return card
  return (
    <Link href={href} className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
      {card}
    </Link>
  )
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
      <div className="rounded-full bg-emerald-500/10 p-3 text-emerald-600">{icon}</div>
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  )
}
