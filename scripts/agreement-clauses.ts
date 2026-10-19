import 'dotenv/config'
import { splitClauses, splitSentences } from '../lib/agreements/clauses'
import { findSections } from '../lib/agreements/sections'
import { loadAgreementText } from '../lib/agreements/text'
import { evalCompanies } from '../lib/eval/companies'

// Usage: npm run agreement:clauses -- [TICKER ...]   (requires SEC_USER_AGENT)
// Splits the financial covenant sections of each company's first agreement
// into sentences and prints counts plus a few samples to judge split quality.

async function main() {
    const tickers = process.argv.slice(2).map((t) => t.toUpperCase())
    const companies = evalCompanies.filter((c) => tickers.length === 0 || tickers.includes(c.ticker))
    for (const company of companies) {
        const url = company.agreements[0]
        if (!url) continue
        const { text } = await loadAgreementText(url)
        const sections = findSections(text).filter((s) => s.kind === 'financial-covenants')
        const sentences = sections.flatMap((s) => splitSentences(text, s))
        const clauses = sentences.flatMap((s) => splitClauses(text, s))
        console.log(`\n== ${company.ticker}: ${sections.length} covenant sections, ${sentences.length} sentences, ${clauses.length} clauses`)
        const step = Math.max(1, Math.floor(sentences.length / 3))
        for (const s of [0, step, 2 * step].map((i) => sentences[i]).filter(Boolean)) {
            const excerpt = text.slice(s.start, s.end).replace(/\s+/g, ' ')
            console.log(`- [${s.start}-${s.end}] ${excerpt.length > 400 ? `${excerpt.slice(0, 400)}...` : excerpt}`)
        }
    }
}

main().catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
})
