// Which defined terms each definition refers to, so a covenant's ratio can be
// traced down to the definitions it is built from ("Leverage Ratio" ->
// "Consolidated EBITDA" -> "Consolidated Net Income" -> ...). Deterministic:
// a reference is a whole, case-sensitive mention of another defined term.

import type { Definition } from './sections'

export type GraphNode = { start: number, end: number, refs: string[] }
export type DefinitionGraph = Map<string, GraphNode>

export type Dependency = { term: string, depth: number }

export type FormulaTree =
    | { term: string, refs: FormulaTree[], truncated?: true }
    | { term: string, cycle: true }

// The first definition of a term wins when an agreement defines it twice.
// A definition's refs are ordered by mention count, then first mention.
// Terms that don't start with a capital or digit (the interpretive "from"
// means "from and including", or "$") are kept as nodes but never counted as
// references: they match ordinary words and symbols.
export function buildDefinitionGraph(text: string, definitions: Definition[]): DefinitionGraph {
    const graph: DefinitionGraph = new Map()
    for (const d of definitions) {
        if (!graph.has(d.term)) graph.set(d.term, { start: d.start, end: d.end, refs: [] })
    }
    const terms = [...graph.keys()].filter((t) => /^[A-Z0-9]/.test(t))
    for (const [term, node] of graph) {
        const counts = countTerms(text.slice(node.start, node.end), terms)
        counts.delete(term)
        node.refs = [...counts.keys()]
    }
    return graph
}

// How often each term is mentioned in source, in order of count (most first),
// then first mention. Longest term first, so "Consolidated Net Income" is not
// also counted as "Net Income"; a trailing plural "s" is allowed.
export function countTerms(source: string, terms: string[]): Map<string, number> {
    const counts = new Map<string, number>()
    if (terms.length === 0) return counts
    const alternatives = [...terms]
        .sort((a, b) => b.length - a.length)
        .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    const pattern = new RegExp(`(?<![A-Za-z])(${alternatives.join('|')})s?(?![A-Za-z])`, 'g')
    for (const m of source.matchAll(pattern)) counts.set(m[1], (counts.get(m[1]) ?? 0) + 1)
    return new Map([...counts].sort((a, b) => b[1] - a[1]))
}

// Every term the given term(s) depend on, breadth-first, each with the depth at
// which it is first reached (1 = referenced directly). Roots are not included.
export function dependencies(graph: DefinitionGraph, term: string | string[], { maxDepth = Infinity }: { maxDepth?: number } = {}): Dependency[] {
    const roots = Array.isArray(term) ? term : [term]
    const seen = new Set(roots)
    const found: Dependency[] = []
    let frontier = roots
    for (let depth = 1; depth <= maxDepth && frontier.length > 0; depth++) {
        const next: string[] = []
        for (const t of frontier) {
            for (const ref of graph.get(t)?.refs ?? []) {
                if (seen.has(ref)) continue
                seen.add(ref)
                found.push({ term: ref, depth })
                next.push(ref)
            }
        }
        frontier = next
    }
    return found
}

// Circular definitions, each as the list of terms around the loop (A -> B -> A
// is reported as ['A', 'B']). One cycle per back edge found by a depth-first
// search, so every circular group is reported, though not every loop within it.
export function findCycles(graph: DefinitionGraph): string[][] {
    const state = new Map<string, 'open' | 'done'>()
    const path: string[] = []
    const cycles = new Map<string, string[]>()

    const visit = (term: string) => {
        state.set(term, 'open')
        path.push(term)
        for (const ref of graph.get(term)?.refs ?? []) {
            if (!graph.has(ref)) continue
            if (state.get(ref) === 'open') {
                const cycle = path.slice(path.lastIndexOf(ref))
                cycles.set(rotate(cycle).join('\u0000'), rotate(cycle))
            } else if (!state.has(ref)) {
                visit(ref)
            }
        }
        path.pop()
        state.set(term, 'done')
    }
    for (const term of graph.keys()) if (!state.has(term)) visit(term)
    return [...cycles.values()]
}

// Starts a cycle at its alphabetically first term, so the same loop found from
// different entry points is reported once.
function rotate(cycle: string[]) {
    const first = cycle.indexOf([...cycle].sort()[0])
    return [...cycle.slice(first), ...cycle.slice(0, first)]
}

// The term's references as a nested tree, for display and debugging. A term
// that repeats one of its ancestors is marked as a cycle and not expanded;
// nodes at maxDepth with further references are marked truncated.
export function formulaTree(graph: DefinitionGraph, term: string, maxDepth = 4): FormulaTree {
    const build = (t: string, depth: number, ancestors: Set<string>): FormulaTree => {
        if (ancestors.has(t)) return { term: t, cycle: true }
        const refs = graph.get(t)?.refs ?? []
        if (depth >= maxDepth) return refs.length > 0 ? { term: t, refs: [], truncated: true } : { term: t, refs: [] }
        const inner = new Set(ancestors).add(t)
        return { term: t, refs: refs.map((r) => build(r, depth + 1, inner)) }
    }
    return build(term, 0, new Set())
}
