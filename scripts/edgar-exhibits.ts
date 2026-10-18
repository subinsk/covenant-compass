import 'dotenv/config'
import { findExhibits } from '../lib/edgar/exhibits'

// Usage: npm run edgar:exhibits -- <cik>   (requires SEC_USER_AGENT)

async function main() {
    const cik = process.argv[2]
    if (!cik) {
        console.error('Usage: npx tsx scripts/edgar-exhibits.ts <cik>')
        process.exit(1)
    }
    const exhibits = await findExhibits(cik)
    for (const e of exhibits) console.log(`${e.filingDate} ${e.form} ${e.url}`)
    console.log(`${exhibits.length} exhibit(s) found`)
}

main().catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
})
