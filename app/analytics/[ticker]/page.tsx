import { Suspense } from 'react'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { isLender } from '@/lib/auth/access'
import { evalCompanies } from '@/lib/eval/companies'
import { analyseCovenant, maintenanceCovenants, sortByHeadroom } from '@/lib/analytics/covenants'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/core'
import CovenantTable from '../CovenantTable'
import WhatIf from './WhatIf'
import XbrlFigures from './XbrlFigures'

export default async function CompanyAnalyticsPage({ params }: { params: Promise<{ ticker: string }> }) {
    const session = await getSession()
    if (!session) redirect('/login')
    if (!isLender(session)) redirect('/portal')

    const { ticker } = await params
    const company = evalCompanies.find((c) => c.ticker.toLowerCase() === ticker.toLowerCase())
    if (!company) notFound()

    const covenants = maintenanceCovenants(company)
    const rows = sortByHeadroom(covenants.map((c) => analyseCovenant(c, company.periodEnd)))

    return (
        <div className="space-y-6">
            <div className="space-y-1">
                <Link href="/analytics" className="text-sm text-muted-foreground hover:underline">← Analytics</Link>
                <h1 className="text-2xl font-bold tracking-tight">{company.name} <span className="text-muted-foreground">({company.ticker})</span></h1>
                <p className="text-sm text-muted-foreground">
                    Covenants disclosed for the period ended {company.periodEnd} ·{' '}
                    <a href={company.source} target="_blank" rel="noreferrer" className="hover:underline">10-Q</a>
                    {company.agreements.length > 0 && <> · <a href={company.agreements[0]} target="_blank" rel="noreferrer" className="hover:underline">credit agreement</a></>}
                </p>
            </div>

            <CovenantTable rows={rows} />

            <Card>
                <CardHeader><CardTitle className="text-base">What if EBITDA changes?</CardTitle></CardHeader>
                <CardContent>
                    <WhatIf covenants={covenants.map(({ name, operator, limit, actual }) => ({ name, operator, limit, actual }))} asOf={company.periodEnd} />
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Financials as reported (XBRL, {company.periodEnd})</CardTitle>
                    <p className="text-sm text-muted-foreground">
                        GAAP figures from the company&apos;s XBRL filings, trailing twelve months for income items. Covenant EBITDA includes
                        add-backs defined in the credit agreement that aren&apos;t in XBRL, so these won&apos;t reproduce the covenant ratios exactly.
                    </p>
                </CardHeader>
                <CardContent>
                    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading filings from EDGAR…</p>}>
                        <XbrlFigures cik={company.cik} periodEnd={company.periodEnd} />
                    </Suspense>
                </CardContent>
            </Card>
        </div>
    )
}
