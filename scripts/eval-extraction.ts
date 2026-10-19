import 'dotenv/config'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { loadAgreementText } from '../lib/agreements/text'
import { reportPath, runExtractionEval, type CompanyRun } from '../lib/eval/run'
import { extractCovenants } from '../lib/extraction/extract'

// Usage: npm run eval:extraction [-- <ticker> ...]
// Requires LLM_BASE_URL, LLM_MODEL (and LLM_API_KEY for hosted models) plus SEC_USER_AGENT.
// Extracts covenants for each eval company, scores them against the eval set
// and writes a JSON report to .cache/eval/.

function mark(ok: boolean) {
    return ok ? 'yes' : '-'
}

function printCompany(run: CompanyRun) {
    console.log(`\n${run.ticker}`)
    for (const a of run.agreements) {
        console.log(`  ${a.error ? `ERROR ${a.error}` : `${a.extracted} extracted, prompt ${a.promptChars} chars`}: ${a.url}`)
    }
    const rows = run.covenants.map((c) => [
        `${c.expected.name} ${c.expected.operator} ${c.expected.limit}`,
        c.extracted ? `${c.extracted.name} ${c.extracted.operator} ${c.extracted.limit}` : '(not found)',
        mark(c.limitCorrect), mark(c.operatorExact), mark(c.cited), mark(c.limitInQuote),
    ])
    const header = ['expected', 'extracted', 'limit', 'op', 'cited', 'inQuote']
    const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)))
    for (const row of [header, ...rows]) console.log('  ' + row.map((cell, i) => cell.padEnd(widths[i])).join('  '))
    for (const x of run.extra) console.log(`  extra: ${x.name} ${x.operator} ${x.limit}`)
}

function pct(r: number | null) {
    return r === null ? 'n/a' : `${(r * 100).toFixed(1)}%`
}

async function main() {
    const missing = ['LLM_BASE_URL', 'LLM_MODEL', 'SEC_USER_AGENT'].filter((name) => !process.env[name])
    if (missing.length > 0) throw new Error(`${missing.join(', ')} must be set to run the extraction eval (see .env)`)
    const model = process.env.LLM_MODEL!

    const { companies, summary } = await runExtractionEval({
        tickers: process.argv.slice(2),
        loadText: async (url) => (await loadAgreementText(url)).text,
        extract: (text) => extractCovenants(text),
        onCompany: printCompany,
    })

    console.log(`\nSummary (${summary.companies} companies, model ${model})`)
    console.log(`  recall            ${summary.found}/${summary.expected} ${pct(summary.recall)}`)
    console.log(`  limit accuracy    ${summary.limitCorrect}/${summary.found} ${pct(summary.limitAccuracy)}`)
    console.log(`  operator (dir)    ${summary.operatorCorrect}/${summary.found} ${pct(summary.operatorAccuracy)}`)
    console.log(`  operator (exact)  ${summary.operatorExact}/${summary.found} ${pct(summary.operatorExactRate)}`)
    console.log(`  cited             ${summary.cited}/${summary.found} ${pct(summary.citationRate)}`)
    console.log(`  limit in quote    ${summary.limitInQuote}/${summary.found} ${pct(summary.limitInQuoteRate)}`)
    console.log(`  extras            ${summary.extras}`)

    const file = reportPath(model, new Date())
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, JSON.stringify({ model, baseUrl: process.env.LLM_BASE_URL, summary, companies }, null, 2))
    console.log(`\nReport: ${file}`)
}

main().catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
})
