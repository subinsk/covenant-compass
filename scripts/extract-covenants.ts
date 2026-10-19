import 'dotenv/config'
import { loadAgreementText } from '../lib/agreements/text'
import { evalCompanies } from '../lib/eval/companies'
import { extractCovenants } from '../lib/extraction/extract'

// Usage: npm run extract:covenants -- <ticker>
// Requires LLM_BASE_URL, LLM_MODEL (and LLM_API_KEY for hosted models) plus SEC_USER_AGENT.
// Prints the extracted covenants for each of the company's agreements next to the eval set's expected limits.

async function main() {
    const ticker = process.argv[2]?.toUpperCase()
    if (!ticker) throw new Error('Usage: npm run extract:covenants -- <ticker>')
    const missing = ['LLM_BASE_URL', 'LLM_MODEL'].filter((name) => !process.env[name])
    if (missing.length > 0) throw new Error(`${missing.join(' and ')} must be set to run extraction (see .env)`)

    const company = evalCompanies.find((c) => c.ticker.toUpperCase() === ticker)
    if (!company) throw new Error(`Unknown ticker ${ticker}. Eval set: ${evalCompanies.map((c) => c.ticker).join(', ')}`)

    console.log(`${company.ticker} - ${company.name}`)
    console.log('Expected:')
    for (const c of company.covenants) console.log(`  ${c.name} ${c.operator} ${c.limit}`)

    for (const url of company.agreements) {
        console.log(`\nAgreement: ${url}`)
        const { text } = await loadAgreementText(url)
        const { covenants, promptChars } = await extractCovenants(text)
        console.log(`Prompt: ${promptChars} chars. Extracted ${covenants.length}:`)
        for (const c of covenants) {
            const flags = [c.verified ? `cited ${c.citation!.start}-${c.citation!.end}` : 'QUOTE NOT FOUND', c.limitInQuote ? '' : 'LIMIT NOT IN QUOTE']
                .filter(Boolean).join(', ')
            const steps = c.stepDowns?.length ? ` (steps: ${c.stepDowns.map((s) => `${s.limit} from ${s.from}`).join('; ')})` : ''
            console.log(`  ${c.name} [${c.metric}] ${c.operator} ${c.limit}${steps} - ${flags}`)
            console.log(`    "${c.quote.slice(0, 200)}"`)
        }
    }
}

main().catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
})
