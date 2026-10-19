import 'dotenv/config'
import { loadAgreementText } from '../lib/agreements/text'

// Usage: npm run agreement:text -- <exhibit-url>   (requires SEC_USER_AGENT)

async function main() {
    const url = process.argv[2]
    if (!url) {
        console.error('Usage: npx tsx scripts/agreement-text.ts <exhibit-url>')
        process.exit(1)
    }
    const { text, pageStarts } = await loadAgreementText(url)
    console.log(`length: ${text.length} chars`)
    console.log(`pages: ${pageStarts.length}`)
    console.log('---')
    console.log(text.slice(0, 500))
}

main().catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
})
