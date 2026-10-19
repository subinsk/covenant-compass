// Finds the parts of an agreement's text (from htmlToText) that matter for
// covenant testing: the definitions, the financial covenant sections and the
// negative covenants. Offsets index into the same text, so they can be cited.

import { buildDefinitionGraph, countTerms, dependencies } from './graph'

export type SectionKind = 'definitions' | 'financial-covenants' | 'negative-covenants' | 'other'

export type Section = {
    kind: SectionKind
    heading: string
    start: number
    end: number
}

export type Definition = {
    term: string
    start: number
    end: number
}

export type RelevantPart = {
    kind: 'covenant' | 'definition'
    label: string
    start: number
    end: number
}

// "ARTICLE VII", "Article I.", "ARTICLE 6 NEGATIVE COVENANTS"
const ARTICLE_LINE = /^ARTICLE\s+([IVXLC]+|\d{1,2})\b\.?\s*(.*)$/i
// "SECTION 7.11 Financial Covenants.", "Section 1.01 Defined Terms. As used ...", "7.11 Financial Covenants."
const SECTION_LINE = /^(?:SECTION\s+|Section\s+|\u00a7\s*)?(\d{1,2}\.\d{1,2}[A-Z]?)\.?(?:\s+(.*))?$/
// Table-of-contents entries end with a page number ("Financial Covenants 110").
const TRAILING_PAGE_NUMBER = /\s\d{1,3}$/
const BARE_NUMBER = /^\d{1,3}$/

const FINANCIAL_COVENANT_TITLE = /financial covenant|financial test|(?:leverage|coverage|fixed charges?|debt service|net worth|liquidity)(?: ratio)?\b.*(?:ratio|covenant|test)|^(?:maximum|minimum) .*(?:ratio|ebitda|liquidity|net worth)/i
const DEFINITIONS_TITLE = /\bdefinitions\b|^defined terms\b/i
const NEGATIVE_COVENANTS_TITLE = /negative covenants/i

// Fallback for filings without usable line breaks (image-based exhibits carry
// their text as one run per page): "10.3 Financial Covenants. As long as ..."
const INLINE_FINANCIAL_COVENANTS = /(?<=^|\s)(?:SECTION\s+|Section\s+)?(\d{1,2}\.\d{1,2})\.?\s+(Financial Covenants?)\.\s/g
const INLINE_SECTION = /\s(?:SECTION\s+|Section\s+)?(\d{1,2}\.\d{1,2})\.?\s+[A-Z][^.\n]{2,80}\.\s|\sSECTION\s+\d{1,2}\.\s/g
const MAX_INLINE_SECTION = 20_000

// titleEnd: offset just past the heading's title, where its body starts.
type Heading = { level: 'article' | 'section', heading: string, title: string, start: number, titleEnd: number }

export function findSections(text: string): Section[] {
    const headings = dropEmpty(findHeadings(text), text)
    const sections: Section[] = headings.map((h, i) => {
        // An article runs to the next article; a section to the next heading of either level.
        const next = headings.slice(i + 1).find((n) => h.level === 'section' || n.level === 'article')
        return { kind: classify(h.title), heading: h.heading, start: h.start, end: next ? next.start : text.length }
    })
    if (!sections.some((s) => s.kind === 'financial-covenants')) sections.push(...inlineFinancialCovenants(text))
    return sections.sort((a, b) => a.start - b.start)
}

function findHeadings(text: string): Heading[] {
    const lines = splitLines(text)
    const headings: Heading[] = []
    let articleNumber: number | null = null
    for (let i = 0; i < lines.length; i++) {
        const { line, start } = lines[i]
        const article = ARTICLE_LINE.exec(line)
        const section = article ? null : SECTION_LINE.exec(line)
        if (!article && !section) continue

        let rest = ((article ? article[2] : section?.[2]) ?? '').trim()
        let heading = line
        let titleLine = { line, start }
        const next = lines[i + 1]?.line ?? ''
        // Title on its own line: "ARTICLE VI" / "NEGATIVE COVENANTS" or "1.01" / "Defined Terms 1".
        if (!rest && next && next.length <= 100 && !ARTICLE_LINE.test(next) && !SECTION_LINE.test(next) && !BARE_NUMBER.test(next)) {
            rest = next
            heading = `${line} ${next}`
            titleLine = lines[i + 1]
        }
        const isToc = TRAILING_PAGE_NUMBER.test(rest) || BARE_NUMBER.test(next) || /\.{4,}/.test(rest)
        if (isToc) continue

        const title = sectionTitle(rest)
        const number = article ? article[1] : section![1]
        if (section) {
            const [major, minor] = number.split('.').map((n) => parseInt(n, 10))
            // Not a heading: body text or table cells that start with a number
            // ("6.11 as required ...", "1.00 Eurodollar Reserve Percentage").
            if (!/^[A-Z[]/.test(title) || minor === 0) continue
            // Inside "ARTICLE VII", sections are numbered 7.xx.
            if (articleNumber !== null && major !== articleNumber) continue
        } else {
            articleNumber = romanOrInt(number)
        }
        headings.push({
            level: article ? 'article' : 'section',
            heading: heading.length > 120 ? `${heading.slice(0, 117)}...` : heading,
            title,
            start,
            // The title is the start of rest, which ends its line.
            titleEnd: titleLine.start + titleLine.line.lastIndexOf(rest) + title.length,
        })
    }
    return headings
}

// Table-of-contents entries that slipped through (no page number) have no body:
// a section followed directly by the next heading, or an article none of whose
// sections has a body.
function dropEmpty(headings: Heading[], text: string): Heading[] {
    const sectionsKept = headings.filter((h, i) => {
        if (h.level === 'article') return true
        const end = headings[i + 1]?.start ?? text.length
        const body = text.slice(h.titleEnd, end).replace(/[\s.]+/g, '')
        return body.length >= 40
    })
    return sectionsKept.filter((h, i) => {
        if (h.level === 'section') return true
        const nextArticle = sectionsKept.slice(i + 1).find((n) => n.level === 'article')
        const end = nextArticle?.start ?? text.length
        const hasSection = sectionsKept.some((s) => s.level === 'section' && s.start > h.start && s.start < end)
        return hasSection || end - h.start > 2000
    })
}

function inlineFinancialCovenants(text: string): Section[] {
    const found: Section[] = []
    for (const m of text.matchAll(INLINE_FINANCIAL_COVENANTS)) {
        const start = m.index
        const number = m[1]
        let end = Math.min(text.length, start + MAX_INLINE_SECTION)
        INLINE_SECTION.lastIndex = start + m[0].length
        for (let n = INLINE_SECTION.exec(text); n && n.index < end; n = INLINE_SECTION.exec(text)) {
            // Skip the same number repeated and ratios such as "1.00. SECTION 11".
            if (n[1] !== number && !n[1]?.endsWith('.00')) {
                end = n.index + 1
                break
            }
            INLINE_SECTION.lastIndex = n.index + 1
        }
        found.push({ kind: 'financial-covenants', heading: `${number} ${m[2]}`, start, end })
    }
    return found
}

function romanOrInt(s: string): number {
    if (/^\d+$/.test(s)) return parseInt(s, 10)
    const values: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100 }
    const digits = s.toUpperCase().split('').map((c) => values[c])
    return digits.reduce((sum, v, i) => sum + (v < (digits[i + 1] ?? 0) ? -v : v), 0)
}

// "Defined Terms. As used in this Agreement ..." -> "Defined Terms"
function sectionTitle(rest: string) {
    const m = /^(.{1,100}?)\.(?:\s|$)/.exec(rest)
    return (m ? m[1] : rest.slice(0, 100)).trim()
}

function classify(title: string): SectionKind {
    if (FINANCIAL_COVENANT_TITLE.test(title)) return 'financial-covenants'
    if (NEGATIVE_COVENANTS_TITLE.test(title)) return 'negative-covenants'
    if (DEFINITIONS_TITLE.test(title)) return 'definitions'
    return 'other'
}

// The definitions to search: the longest definitions article or section (an
// exhibit can carry a short "Definitions" section in an attached form too).
export function definitionsSection(sections: Section[]): Section | undefined {
    return sections
        .filter((s) => s.kind === 'definitions')
        .sort((a, b) => (b.end - b.start) - (a.end - a.start))[0]
}

// Matches the start of a definition: "Consolidated EBITDA" means / "Lender" shall have the meaning /
// "Capital Lease Obligations" of any Person means / "Debt Ratio" as of any date of determination means /
// "Class": (a) ...
const DEFINITION_START = /(^|\s)[\u201c"]([^\u201c\u201d"\n]{1,100})[\u201d"](?=\s*:|,?\s+(?:[^\u201c\u201d"\n.;]{0,80}?\s)?(?:means|shall mean|mean|has the meaning|shall have the meaning|have the meaning)\b)/g

// Every defined term in the section (or the whole text when there is no
// definitions section, as in short amendments). A definition runs until the
// next one starts or the section ends.
export function findDefinitions(text: string, section?: Pick<Section, 'start' | 'end'>): Definition[] {
    const start = section?.start ?? 0
    const end = section?.end ?? text.length
    const slice = text.slice(start, end)
    const found: { term: string, start: number }[] = []
    for (const m of slice.matchAll(DEFINITION_START)) {
        found.push({ term: m[2].trim(), start: start + m.index + m[1].length })
    }
    return found.map((d, i) => ({ ...d, end: trimEnd(text, d.start, found[i + 1]?.start ?? end) }))
}

// Assembles the financial covenant sections plus the definitions they need, so
// a 500K+ character agreement shrinks to what an extraction prompt needs.
// Definitions the covenants mention come first, then (through the definitions
// graph) the definitions those mention, e.g. "Leverage Ratio" -> "Consolidated
// EBITDA". depth counts these levels; by default deeper chains (what
// "Consolidated EBITDA" itself refers to) are not followed.
export function relevantText(text: string, { maxChars = 60_000, depth = 2 }: { maxChars?: number, depth?: number } = {}) {
    const sections = findSections(text)
    const covenantRanges = mergeRanges(sections.filter((s) => s.kind === 'financial-covenants'))
    const definitions = uniqueByTerm(findDefinitions(text, definitionsSection(sections)))

    const parts: RelevantPart[] = covenantRanges.map((r) => ({ kind: 'covenant', label: r.heading, start: r.start, end: r.end }))
    let size = parts.reduce((n, p) => n + p.end - p.start + 2, -2)
    const included = new Set<string>()

    // Added in priority order (most-mentioned first), so trimming to maxChars
    // drops the least used.
    const add = (term: string, d: Pick<Definition, 'start' | 'end'>) => {
        if (included.has(term) || size + 2 + d.end - d.start > maxChars) return false
        parts.push({ kind: 'definition', label: term, start: d.start, end: d.end })
        included.add(term)
        size += 2 + d.end - d.start
        return true
    }

    if (parts.length > 0 && depth > 0) {
        const graph = buildDefinitionGraph(text, definitions)
        const covenantText = parts.map((p) => text.slice(p.start, p.end)).join('\n')
        const direct = [...countTerms(covenantText, [...graph.keys()]).keys()].filter((term) => add(term, graph.get(term)!))
        for (const dep of dependencies(graph, direct, { maxDepth: depth - 1 })) add(dep.term, graph.get(dep.term)!)
    }

    const ordered = [
        ...parts.filter((p) => p.kind === 'covenant'),
        ...parts.filter((p) => p.kind === 'definition').sort((a, b) => a.start - b.start),
    ]
    return {
        text: ordered.map((p) => text.slice(p.start, p.end)).join('\n\n'),
        parts: ordered,
        covenantFound: covenantRanges.length > 0,
        definitionsFound: definitions.length,
    }
}

function splitLines(text: string) {
    const lines: { line: string, start: number }[] = []
    let start = 0
    for (const line of text.split('\n')) {
        lines.push({ line, start })
        start += line.length + 1
    }
    return lines
}

function mergeRanges(sections: Section[]) {
    const sorted = [...sections].sort((a, b) => a.start - b.start)
    const merged: Section[] = []
    for (const s of sorted) {
        const last = merged[merged.length - 1]
        if (last && s.start <= last.end) last.end = Math.max(last.end, s.end)
        else merged.push({ ...s })
    }
    return merged
}

function uniqueByTerm(definitions: Definition[]) {
    const seen = new Set<string>()
    return definitions.filter((d) => !seen.has(d.term) && seen.add(d.term))
}

function trimEnd(text: string, start: number, end: number) {
    while (end > start && /\s/.test(text[end - 1])) end--
    return end
}
