import 'dotenv/config'
import { loadAgreementText } from '../lib/agreements/text'
import { extractCovenants } from '../lib/extraction/extract'
import { saveExtraction } from '../lib/extraction/store'
import { prisma } from '../lib/prisma'

// Usage: npm run extract:facility -- <facilityId> <agreementUrl>
// Requires LLM_BASE_URL, LLM_MODEL (and LLM_API_KEY for hosted models) plus SEC_USER_AGENT.
// Extracts covenants from the agreement and saves them as a run waiting for review.

async function main() {
    const [facilityId, url] = process.argv.slice(2)
    if (!facilityId || !url) throw new Error('Usage: npm run extract:facility -- <facilityId> <agreementUrl>')
    const missing = ['LLM_BASE_URL', 'LLM_MODEL'].filter((name) => !process.env[name])
    if (missing.length > 0) throw new Error(`${missing.join(' and ')} must be set to run extraction (see .env)`)

    const facility = await prisma.facility.findUnique({ where: { id: facilityId }, select: { name: true } })
    if (!facility) throw new Error(`Facility ${facilityId} not found`)

    console.log(`Facility: ${facility.name}`)
    console.log(`Agreement: ${url}`)
    const { text, pageStarts } = await loadAgreementText(url)
    const { covenants, promptChars } = await extractCovenants(text)
    const run = await saveExtraction(prisma, {
        facilityId,
        sourceUrl: url,
        model: process.env.LLM_MODEL!,
        promptChars,
        covenants,
        pageStarts,
    })
    console.log(`Saved run ${run.id} with ${run.items.length} covenant(s) for review:`)
    for (const item of run.items) {
        const flags = [item.verified ? '' : 'QUOTE NOT FOUND', item.directionConflict ? 'CHECK DIRECTION' : ''].filter(Boolean).join(', ')
        console.log(`  ${item.name} ${item.operator} ${item.limit}${item.page ? ` (page ${item.page})` : ''}${flags ? ` - ${flags}` : ''}`)
    }
}

main()
    .catch((err) => {
        console.error(err instanceof Error ? err.message : err)
        process.exitCode = 1
    })
    .finally(() => prisma.$disconnect())
