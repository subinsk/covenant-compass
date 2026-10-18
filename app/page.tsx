import { prisma } from '@/lib/prisma'
import { Card, CardContent, CardHeader, CardTitle, Badge } from '@/components/ui/core'
import { AlertCircle, CheckCircle, Clock } from 'lucide-react'
import { addDays } from 'date-fns'

// Server Component for Dashboard
export default async function Dashboard() {
  // Fetch high-level stats
  // In a real app we'd filter by logged-in user's org. 
  // For hackathon/seed demo, we assume we show "Lender View" of everything.

  const now = new Date()

  const totalFacilities = await prisma.facility.count({ where: { status: 'ACTIVE' } })

  const upcomingOccurrences = await prisma.covenantOccurrence.count({
    where: {
      status: 'PENDING',
      dueDate: {
        gte: now,
        lte: addDays(now, 30)
      }
    }
  })

  const overdueOccurrences = await prisma.covenantOccurrence.count({
    where: {
      status: 'OVERDUE'
    }
  })

  // Calculate On-Time Rate (mock logic or simple math)
  const completed = await prisma.covenantOccurrence.count({ where: { status: 'COMPLETED' } })
  const totalClosed = await prisma.covenantOccurrence.count({ where: { status: { in: ['COMPLETED', 'OVERDUE', 'WAIVED'] } } })
  const onTimeRate = totalClosed > 0 ? Math.round((completed / totalClosed) * 100) : 100

  // High Risk Facilities (Any with RED status occurrences)
  const highRiskFacilities = await prisma.facility.findMany({
    where: {
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
    orderBy: { updatedAt: 'desc' },
    take: 5,
    include: { facility: true, covenant: true }
  })

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <KpiCard title="Active Facilities" value={totalFacilities} icon={<FileStackIcon />} color="text-blue-500" />
        <KpiCard title="Upcoming (30 days)" value={upcomingOccurrences} icon={<Clock />} color="text-amber-500" />
        <KpiCard title="Overdue Obligations" value={overdueOccurrences} icon={<AlertCircle />} color="text-red-500" />
        <KpiCard title="On-Time Completion" value={`${onTimeRate}%`} icon={<CheckCircle />} color="text-emerald-500" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* High Risk List */}
        <Card>
          <CardHeader>
            <CardTitle>Needs Attention (High Risk)</CardTitle>
          </CardHeader>
          <CardContent>
            {highRiskFacilities.length === 0 ? (
              <p className="text-muted-foreground text-sm">No facilities currently at high risk.</p>
            ) : (
              <div className="space-y-4">
                {highRiskFacilities.map(f => (
                  <div key={f.id} className="flex items-center justify-between border-b pb-2 last:border-0">
                    <div>
                      <p className="font-medium text-sm">{f.name}</p>
                      <p className="text-xs text-muted-foreground">{f.facilityReference}</p>
                    </div>
                    <Badge variant="destructive">{f.occurrences.length} Red Flags</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Activity List */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentActivity.map(act => (
                <div key={act.id} className="flex items-center justify-between border-b pb-2 last:border-0">
                  <div>
                    <p className="font-medium text-sm">{act.covenant.title}</p>
                    <p className="text-xs text-muted-foreground">{act.facility.name}</p>
                  </div>
                  <div className="text-right">
                    <Badge variant={act.status === 'COMPLETED' ? 'success' : act.status === 'OVERDUE' ? 'destructive' : 'secondary'}>
                      {act.status}
                    </Badge>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {act.updatedAt.toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function KpiCard({ title, value, icon, color }: any) {
  return (
    <Card>
      <CardContent className="p-6 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold mt-1">{value}</p>
        </div>
        <div className={`${color} p-2 bg-accent rounded-full`}>
          {icon}
        </div>
      </CardContent>
    </Card>
  )
}

function FileStackIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-file-stack"><path d="M21 7h-3a2 2 0 0 1-2-2V2" /><path d="M21 7v10a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h8z" /><path d="M5 19V5a2 2 0 0 1 2-2" /></svg>
  )
}
