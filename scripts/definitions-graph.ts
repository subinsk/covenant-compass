import 'dotenv/config'
import { buildDefinitionGraph, findCycles, formulaTree, type FormulaTree } from '../lib/agreements/graph'
import { definitionsSection, findDefinitions, findSections } from '../lib/agreements/sections'
import { loadAgreementText } from '../lib/agreements/text'

// Usage: npm run definitions:graph -- <exhibit-url> [term] [depth]   (requires SEC_USER_AGENT)
// Prints the definitions a term is built from, then the graph's size and any
// circular definitions. The term defaults to "Consolidated EBITDA", or else the
// most-referenced term.

async function main() {
    const [url, termArg, depthArg] = process.argv.slice(2)
    if (!url) {
        console.error('Usage: npx tsx scripts/definitions-graph.ts <exhibit-url> [term] [depth]')
        process.exit(1)
    }
    const { text } = await loadAgreementText(url)
    const graph = buildDefinitionGraph(text, findDefinitions(text, definitionsSection(findSections(text))))

    const referencedBy = new Map<string, number>()
    for (const node of graph.values()) for (const ref of node.refs) referencedBy.set(ref, (referencedBy.get(ref) ?? 0) + 1)
    const mostReferenced = [...referencedBy].sort((a, b) => b[1] - a[1])[0]?.[0]
    const term = termArg || (graph.has('Consolidated EBITDA') ? 'Consolidated EBITDA' : mostReferenced)

    if (term) {
        if (!graph.has(term)) console.log(`(not defined: ${term})`)
        printTree(formulaTree(graph, term, depthArg ? parseInt(depthArg, 10) : 4))
    }

    const cycles = findCycles(graph)
    const edges = [...graph.values()].reduce((n, node) => n + node.refs.length, 0)
    console.log('---')
    console.log(`terms: ${graph.size}`)
    console.log(`edges: ${edges}`)
    console.log(`cycles: ${cycles.length}`)
    for (const cycle of cycles) console.log(`  ${[...cycle, cycle[0]].join(' -> ')}`)
}

function printTree(node: FormulaTree, indent = '') {
    const mark = 'cycle' in node ? ' (cycle)' : node.truncated ? ' ...' : ''
    console.log(`${indent}${node.term}${mark}`)
    if ('refs' in node) for (const ref of node.refs) printTree(ref, `${indent}  `)
}

main().catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
})
