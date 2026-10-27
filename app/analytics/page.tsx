import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { isLender } from '@/lib/auth/access'
import { evalCompanies } from '@/lib/eval/companies'
import { overviewRows } from '@/lib/analytics/covenants'
import CovenantTable from './CovenantTable'

export default async function AnalyticsPage() {
    const session = await getSession()
    if (!session) redirect('/login')
    if (!isLender(session)) redirect('/portal')

    const rows = overviewRows(evalCompanies)
    const breaches = rows.filter((r) => r.result?.compliant === false)

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Ratio analytics</h1>
                <p className="text-sm text-muted-foreground">
                    Maintenance covenants disclosed in the latest 10-Q of {evalCompanies.length} public borrowers, tightest headroom first.
                    {' '}{breaches.length === 0 ? 'No disclosed breaches.' : `${breaches.length} in breach: ${breaches.map((r) => r.ticker).join(', ')}.`}
                </p>
            </div>
            <CovenantTable rows={rows} />
            <p className="text-xs text-muted-foreground">
                EBITDA cushion: how far covenant EBITDA can fall, with debt unchanged, before a leverage covenant breaches (1 − actual / limit).
            </p>
        </div>
    )
}
