import { getCompanyFacts } from '@/lib/edgar/client'
import { financialsAt, type CompanyFacts, type FinancialKey, type Financials } from '@/lib/xbrl/facts'

const items: { key: FinancialKey, label: string, kind: string }[] = [
    { key: 'revenue', label: 'Revenue', kind: 'TTM' },
    { key: 'netIncome', label: 'Net income', kind: 'TTM' },
    { key: 'interestExpense', label: 'Interest expense', kind: 'TTM' },
    { key: 'incomeTax', label: 'Income taxes', kind: 'TTM' },
    { key: 'depreciationAmortization', label: 'Depreciation & amortization', kind: 'TTM' },
    { key: 'totalDebt', label: 'Total debt', kind: 'at period end' },
    { key: 'cash', label: 'Cash', kind: 'at period end' },
]

const methods: Record<string, string> = {
    'direct': '12-month fact',
    'ytd-bridge': 'fiscal year + YTD − prior YTD',
    'instant': 'balance at period end',
    'sum': 'sum of debt concepts',
}

function formatUsd(value: number): string {
    const millions = value / 1e6
    return `${millions < 0 ? '−' : ''}$${Math.abs(millions).toLocaleString('en-US', { maximumFractionDigits: 1, minimumFractionDigits: 1 })}M`
}

async function loadFinancials(cik: string, periodEnd: string): Promise<Financials | null> {
    try {
        return financialsAt((await getCompanyFacts(cik)) as CompanyFacts, periodEnd)
    } catch (error) {
        console.error(`XBRL fetch failed for CIK ${cik}`, error)
        return null
    }
}

// Figures as reported in XBRL at the covenant period end, with the concept
// and method behind each one.
export default async function XbrlFigures({ cik, periodEnd }: { cik: string, periodEnd: string }) {
    const financials = await loadFinancials(cik, periodEnd)
    if (!financials) return <p className="text-sm text-destructive">Couldn&apos;t load filings from EDGAR.</p>

    return (
        <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                    <tr>
                        <th className="px-3 py-2">Item</th>
                        <th className="px-3 py-2 text-right">As reported</th>
                        <th className="px-3 py-2">XBRL concept</th>
                        <th className="px-3 py-2">Method</th>
                        <th className="px-3 py-2">Filings</th>
                    </tr>
                </thead>
                <tbody>
                    {items.map(({ key, label, kind }) => {
                        const found = financials.values[key]
                        return (
                            <tr key={key} className="border-t">
                                <td className="px-3 py-2">{label} <span className="text-xs text-muted-foreground">({kind})</span></td>
                                {found ? (
                                    <>
                                        <td className="px-3 py-2 text-right font-mono">{formatUsd(found.value)}</td>
                                        <td className="px-3 py-2 font-mono text-xs">{found.concept}</td>
                                        <td className="px-3 py-2 text-xs">{methods[found.method]}</td>
                                        <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                                            {[...new Set(found.sources.map((s) => s.accn))].join(', ')}
                                        </td>
                                    </>
                                ) : (
                                    <td colSpan={4} className="px-3 py-2 text-muted-foreground">Not found in XBRL for this period</td>
                                )}
                            </tr>
                        )
                    })}
                </tbody>
            </table>
        </div>
    )
}
