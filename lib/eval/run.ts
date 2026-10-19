import type { CitedCovenant } from '@/lib/extraction/extract'
import { evalCompanies, type EvalCompany } from './companies'
import { nameTokens, scoreCompany, summarise, direction, type CompanyScore, type EvalSummary } from './score'

// Runs extraction over the eval set's agreements and scores it. Loading and
// extraction are passed in so tests can run the whole flow with fakes.

export type AgreementRun = {
    url: string
    extracted: number
    promptChars: number
    error?: string
}

export type CompanyRun = CompanyScore & {
    ticker: string
    agreements: AgreementRun[]
}

export type ExtractionEvalOptions = {
    tickers?: string[]
    loadText: (url: string) => Promise<string>
    extract: (text: string) => Promise<{ covenants: CitedCovenant[], promptChars: number }>
    companies?: EvalCompany[]
    onCompany?: (run: CompanyRun) => void
}

export function selectCompanies(companies: EvalCompany[], tickers: string[] = []) {
    if (tickers.length === 0) return companies
    return tickers.map((t) => {
        const company = companies.find((c) => c.ticker.toUpperCase() === t.toUpperCase())
        if (!company) throw new Error(`Unknown ticker ${t}. Eval set: ${companies.map((c) => c.ticker).join(', ')}`)
        return company
    })
}

// Merges covenants from several agreements of one company: one per name (after
// dropping filler words) and direction, preferring a verified quote, then the
// earliest agreement.
export function mergeCovenants(lists: CitedCovenant[][]): CitedCovenant[] {
    const byKey = new Map<string, CitedCovenant>()
    for (const c of lists.flat()) {
        const key = [...nameTokens(c.name)].sort().join(' ') + '|' + direction(c.operator)
        const current = byKey.get(key)
        if (!current || (!current.verified && c.verified)) byKey.set(key, c)
    }
    return [...byKey.values()]
}

export async function runExtractionEval(options: ExtractionEvalOptions): Promise<{ companies: CompanyRun[], summary: EvalSummary }> {
    const selected = selectCompanies(options.companies ?? evalCompanies, options.tickers)
    const runs: CompanyRun[] = []
    for (const company of selected) {
        const agreements: AgreementRun[] = []
        const lists: CitedCovenant[][] = []
        for (const url of company.agreements) {
            // One failing agreement shouldn't stop a batch run; it is recorded instead.
            try {
                const { covenants, promptChars } = await options.extract(await options.loadText(url))
                lists.push(covenants)
                agreements.push({ url, extracted: covenants.length, promptChars })
            } catch (err) {
                agreements.push({ url, extracted: 0, promptChars: 0, error: err instanceof Error ? err.message : String(err) })
            }
        }
        const run = { ticker: company.ticker, agreements, ...scoreCompany(company.covenants, mergeCovenants(lists)) }
        runs.push(run)
        options.onCompany?.(run)
    }
    return { companies: runs, summary: summarise(runs) }
}

// .cache/eval/extraction-<timestamp>-<model>.json, safe as a Windows file name.
export function reportPath(model: string, date: Date) {
    const stamp = date.toISOString().replace(/[:.]/g, '-')
    const safeModel = model.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'model'
    return `.cache/eval/extraction-${stamp}-${safeModel}.json`
}
