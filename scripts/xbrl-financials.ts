import 'dotenv/config'
import { getCompanyFacts } from '../lib/edgar/client'
import { evalCompanies } from '../lib/eval/companies'
import { financialsAt, type CompanyFacts, type Financials } from '../lib/xbrl/facts'

// Usage: npm run xbrl:financials -- [TICKER ...]   (requires SEC_USER_AGENT)
// Prints the XBRL values found at each eval company's covenant test date, then a
// NAIVE comparison: simple EBITDA (net income + interest + tax + D&A) against the
// covenant ratios the company disclosed. Covenant EBITDA adds back items XBRL
// doesn't tag (pro forma acquisitions, cost savings, non-cash charges), and
// covenant debt definitions differ, so gaps are expected.

async function main() {
    const tickers = process.argv.slice(2).map((t) => t.toUpperCase())
    const companies = evalCompanies.filter((c) => tickers.length === 0 || tickers.includes(c.ticker))
    const summary: string[][] = []

    for (const company of companies) {
        const facts = (await getCompanyFacts(company.cik)) as CompanyFacts
        const financials = financialsAt(facts, company.periodEnd)
        console.log(`\n== ${company.ticker} (${company.name}) at ${company.periodEnd}`)
        for (const [key, v] of Object.entries(financials.values)) {
            const sources = v.sources.map((s) => `${s.accn} ${s.start ?? ''}..${s.end}`).join('; ')
            console.log(`  ${key.padEnd(24)} ${millions(v.value).padStart(10)}  ${v.method.padEnd(10)} ${v.concept}  [${sources}]`)
        }
        if (financials.missing.length) console.log(`  missing: ${financials.missing.join(', ')}`)

        const naive = naiveRatios(financials)
        const disclosed = (pattern: RegExp) => company.covenants
            .filter((c) => pattern.test(c.name))
            .map((c) => `${c.name} ${c.actual ?? 'n/a'}`)
            .join('; ') || '-'
        console.log(`  NAIVE simple EBITDA: ${naive.ebitda === null ? 'n/a' : millions(naive.ebitda)}`)
        console.log(`  NAIVE net debt / simple EBITDA: ${ratio(naive.leverage)}   disclosed: ${disclosed(/leverage|debt/i)}`)
        console.log(`  NAIVE simple EBITDA / interest: ${ratio(naive.coverage)}   disclosed: ${disclosed(/interest/i)}`)

        summary.push([
            company.ticker,
            company.periodEnd,
            financials.missing.join(',') || '-',
            naive.ebitda === null ? 'n/a' : millions(naive.ebitda),
            ratio(naive.leverage),
            disclosed(/leverage|debt/i),
            ratio(naive.coverage),
            disclosed(/interest/i),
        ])
    }

    console.log('\nNAIVE ratios (simple EBITDA, no covenant add-backs) vs disclosed covenant ratios')
    console.log(['ticker', 'period', 'missing', 'simple EBITDA', 'naive net lev', 'disclosed leverage', 'naive cov', 'disclosed coverage'].join('\t'))
    for (const row of summary) console.log(row.join('\t'))
}

function naiveRatios({ values }: Financials) {
    const parts = [values.netIncome, values.interestExpense, values.incomeTax, values.depreciationAmortization]
    const ebitda = parts.every((p) => p !== undefined) ? parts.reduce((sum, p) => sum + p.value, 0) : null
    const netDebt = values.totalDebt ? values.totalDebt.value - (values.cash?.value ?? 0) : null
    return {
        ebitda,
        leverage: ebitda !== null && ebitda > 0 && netDebt !== null ? netDebt / ebitda : null,
        coverage: ebitda !== null && values.interestExpense && values.interestExpense.value > 0 ? ebitda / values.interestExpense.value : null,
    }
}

function millions(value: number) {
    return `${(value / 1e6).toFixed(1)}m`
}

function ratio(value: number | null) {
    return value === null ? 'n/a' : value.toFixed(2)
}

main().catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
})
