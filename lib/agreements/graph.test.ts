import { describe, expect, it } from 'vitest'
import { buildDefinitionGraph, countTerms, dependencies, findCycles, formulaTree } from './graph'
import { findDefinitions } from './sections'

const definitions = [
    '“Consolidated EBITDA” means Consolidated Net Income plus Consolidated Interest Expense plus Consolidated Interest Expense.',
    '“Consolidated Interest Expense” means all interest on Indebtedness.',
    '“Consolidated Net Income” means the Net Income of the Borrower, excluding net income of any Unrestricted Subsidiary.',
    '“Net Income” means net income determined in accordance with GAAP.',
    '“Indebtedness” means all obligations for borrowed money.',
    '“Borrower” means Acme.',
    '“Leverage Ratio” means Consolidated Total Debt divided by Consolidated EBITDA.',
    '“Consolidated Total Debt” means all Indebtedness of the Borrower.',
    '“Unrestricted Subsidiary” means any Subsidiary designated as such.',
    '“Subsidiary” means any Person controlled by the Borrower, other than an Unrestricted Subsidiary.',
].join('\n')

const graph = buildDefinitionGraph(definitions, findDefinitions(definitions))
const refs = (term: string) => graph.get(term)?.refs

describe('buildDefinitionGraph', () => {
    it('finds the other defined terms each definition mentions, most-mentioned first', () => {
        expect(refs('Consolidated EBITDA')).toEqual(['Consolidated Interest Expense', 'Consolidated Net Income'])
        expect(refs('Leverage Ratio')).toEqual(['Consolidated Total Debt', 'Consolidated EBITDA'])
        expect(refs('Borrower')).toEqual([])
    })

    it('matches the longest term first', () => {
        // "Consolidated Net Income" is not also "Net Income"; "Unrestricted Subsidiary" is not "Subsidiary".
        expect(refs('Consolidated EBITDA')).not.toContain('Net Income')
        expect(refs('Consolidated Net Income')).toEqual(['Net Income', 'Borrower', 'Unrestricted Subsidiary'])
    })

    it('is case-sensitive and ignores the term itself', () => {
        // "net income" in lower case is not a reference to "Net Income".
        expect(refs('Net Income')).toEqual([])
        expect(refs('Subsidiary')).toEqual(['Borrower', 'Unrestricted Subsidiary'])
    })

    it('does not treat lower-case defined terms as references', () => {
        const text = '“from” means from and including. “Test Period” means the period from the Closing Date.'
        const small = buildDefinitionGraph(text, findDefinitions(text))
        expect([...small.keys()]).toEqual(['from', 'Test Period'])
        expect(small.get('Test Period')!.refs).toEqual([])
    })

    it('keeps the definition offsets', () => {
        const node = graph.get('Borrower')!
        expect(definitions.slice(node.start, node.end)).toBe('“Borrower” means Acme.')
    })
})

describe('countTerms', () => {
    it('counts whole-word mentions, allowing a plural', () => {
        const counts = countTerms('The Loans and each Loan, but not Loaner or loan.', ['Loan'])
        expect(counts.get('Loan')).toBe(2)
    })
})

describe('dependencies', () => {
    it('lists transitive dependencies breadth-first with their depth', () => {
        expect(dependencies(graph, 'Leverage Ratio')).toEqual([
            { term: 'Consolidated Total Debt', depth: 1 },
            { term: 'Consolidated EBITDA', depth: 1 },
            { term: 'Indebtedness', depth: 2 },
            { term: 'Borrower', depth: 2 },
            { term: 'Consolidated Interest Expense', depth: 2 },
            { term: 'Consolidated Net Income', depth: 2 },
            { term: 'Net Income', depth: 3 },
            { term: 'Unrestricted Subsidiary', depth: 3 },
            { term: 'Subsidiary', depth: 4 },
        ])
    })

    it('stops at maxDepth and accepts several roots', () => {
        expect(dependencies(graph, 'Leverage Ratio', { maxDepth: 1 }).map((d) => d.term)).toEqual(['Consolidated Total Debt', 'Consolidated EBITDA'])
        expect(dependencies(graph, ['Net Income', 'Consolidated Total Debt'])).toEqual([
            { term: 'Indebtedness', depth: 1 },
            { term: 'Borrower', depth: 1 },
        ])
    })

    it('is cycle-safe and returns nothing for an unknown term', () => {
        expect(dependencies(graph, 'Subsidiary').map((d) => d.term)).toEqual(['Borrower', 'Unrestricted Subsidiary'])
        expect(dependencies(graph, 'Nope')).toEqual([])
    })
})

describe('findCycles', () => {
    it('reports circular definitions once each', () => {
        expect(findCycles(graph)).toEqual([['Subsidiary', 'Unrestricted Subsidiary']])
    })

    it('finds longer loops and none in an acyclic graph', () => {
        const text = '“A” means B. “B” means C. “C” means A. “D” means A.'
        expect(findCycles(buildDefinitionGraph(text, findDefinitions(text)))).toEqual([['A', 'B', 'C']])
        const acyclic = '“A” means B. “B” means C. “C” means cash.'
        expect(findCycles(buildDefinitionGraph(acyclic, findDefinitions(acyclic)))).toEqual([])
    })
})

describe('formulaTree', () => {
    it('nests references and marks a repeated ancestor as a cycle', () => {
        expect(formulaTree(graph, 'Consolidated Net Income')).toEqual({
            term: 'Consolidated Net Income',
            refs: [
                { term: 'Net Income', refs: [] },
                { term: 'Borrower', refs: [] },
                {
                    term: 'Unrestricted Subsidiary',
                    refs: [{ term: 'Subsidiary', refs: [{ term: 'Borrower', refs: [] }, { term: 'Unrestricted Subsidiary', cycle: true }] }],
                },
            ],
        })
    })

    it('marks nodes cut off at maxDepth', () => {
        expect(formulaTree(graph, 'Leverage Ratio', 1)).toEqual({
            term: 'Leverage Ratio',
            refs: [
                { term: 'Consolidated Total Debt', refs: [], truncated: true },
                { term: 'Consolidated EBITDA', refs: [], truncated: true },
            ],
        })
    })
})
