import 'dotenv/config'
import { findSections, relevantText } from '../lib/agreements/sections'
import { loadAgreementText } from '../lib/agreements/text'
import { evalCompanies } from '../lib/eval/companies'

// Usage: npm run agreement:sections -- [exhibit-url ...]   (requires SEC_USER_AGENT)
// Without URLs, runs over every agreement in the eval set.

async function main() {
    const urls = process.argv.length > 2
        ? process.argv.slice(2).map((url) => ({ label: url, url }))
        : evalCompanies.flatMap((c) => c.agreements.map((url, i) => ({ label: `${c.ticker}#${i + 1}`, url })))

    console.log(['agreement', 'covenant sections', 'definitions', 'chars before', 'chars after'].join('\t'))
    for (const { label, url } of urls) {
        const { text } = await loadAgreementText(url)
        const covenants = findSections(text).filter((s) => s.kind === 'financial-covenants')
        const relevant = relevantText(text)
        console.log([label, covenants.map((s) => s.heading.slice(0, 40)).join(' | ') || '-', relevant.definitionsFound, text.length, relevant.text.length].join('\t'))
    }
}

main().catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
})
