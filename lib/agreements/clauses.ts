import { pageAt } from './text'

// Splits agreement text (from htmlToText) into sentences and enumerated
// clauses, keeping offsets into the same text so any match can be expanded
// to its full sentence and cited with a page number.

export type Span = { start: number, end: number }
export type Clause = Span & { label: string }
export type Citation = Span & { page: number, sentence: Span, excerpt: string }

// Words that end with a period without ending the sentence. Compared lowercased,
// without the trailing period.
const ABBREVIATIONS = new Set([
    'sec', 'secs', 'no', 'nos', 'inc', 'co', 'corp', 'ltd', 'cf', 'al', 'art', 'para', 'cl', 'p', 'pp',
    'mr', 'mrs', 'ms', 'dr', 'st', 'jr', 'sr', 'vs', 'v', 'approx', 'dept', 'est', 'fig', 'ex', 'exh',
])

// Sentence end: . ! or ? (plus closing quotes/parens), then whitespace and a
// capital letter, a quote, or an opening paren or bracket.
const SENTENCE_END = /[.!?][”’"')\]]*(?=\s+[A-Z“‘"'([])/g
const BLANK_LINE = /\n[ \t]*\n/g
// A line starting with "(b) " ends the paragraph before it unless that line
// leads into it (";", ":", ",", "and", "or"), e.g. after a ratio table whose
// last row has no period.
const LINE_BEFORE_MARKER = /\n(?=\((?:[a-z]{1,2}|[ivxlc]{1,6}|[A-Z]{1,2}|\d{1,2})\)\s)/g
// (also a line that is only a marker: "(b)" then "(i) ...")
const CONTINUES = /(?:[;:,]|\b(?:and|or)|(?:^|\n)\([a-zA-Z0-9]{1,6}\))\s*$/
// Abbreviations with inner periods: "U.S", "L.P", "N.A", "i.e", "e.g".
const DOTTED = /^(?:[A-Za-z]\.)+[A-Za-z]$/
// A sentence that is only a label so far: "1.", "(a).", "Section 7.", "ARTICLE VII."
const LABEL_ONLY = /^(?:(?:section|article|sec\.?|clause|item)\s+)?[\dA-Za-z.()]{1,8}$/i

export function splitSentences(text: string, { start = 0, end = text.length }: Partial<Span> = {}): Span[] {
    // offset -> whether the break is certain or needs checking.
    const breaks = new Map<number, boolean>()
    const slice = text.slice(start, end)
    for (const m of slice.matchAll(SENTENCE_END)) breaks.set(start + m.index + m[0].length, false)
    for (const m of slice.matchAll(BLANK_LINE)) breaks.set(start + m.index, true)
    for (const m of slice.matchAll(LINE_BEFORE_MARKER)) {
        if (!CONTINUES.test(slice.slice(Math.max(0, m.index - 10), m.index))) breaks.set(start + m.index, true)
    }

    const sentences: Span[] = []
    let from = start
    for (const at of [...breaks.keys()].sort((a, b) => a - b)) {
        const sentence = trim(text, from, at)
        if (sentence.end <= sentence.start) continue
        if (!breaks.get(at) && !endsSentence(text, sentence)) continue
        sentences.push(sentence)
        from = at
    }
    const last = trim(text, from, end)
    if (last.end > last.start) sentences.push(last)
    return sentences
}

// Whether the period (or ! ?) closing this candidate sentence really ends it.
function endsSentence(text: string, sentence: Span) {
    const candidate = text.slice(sentence.start, sentence.end).replace(/[”’"')\]]+$/, '')
    if (!candidate.endsWith('.')) return true
    if (LABEL_ONLY.test(candidate.replace(/\s+/g, ' '))) return false
    const word = /(\S+)\.$/.exec(candidate)?.[1].replace(/^[“‘"'([]+/, '') ?? ''
    if (ABBREVIATIONS.has(word.toLowerCase())) return false
    if (DOTTED.test(word)) return false
    // Numbering, not a ratio: "10.3.1.", or "1." after a colon or at a line start.
    if (/^\d+(?:\.\d+){2,}$/.test(word)) return false
    if (/(?:^|[:;\n])\s*\d+(?:\.\d+)?\.$/.test(candidate)) return false
    return true
}

// Enumerated clauses inside a sentence: "(a)", "(ii)", "(A)", "(1)" where they
// start the sentence or a line, or follow ";" or ":" (optionally "; and" / "; or").
// A marker glued to a reference ("Section 7.11(a)") or mid-sentence ("clause (a)
// above") is not a boundary. Each clause runs to the next marker or the sentence end.
const CLAUSE_MARKER = /\((?:[a-z]{1,2}|[ivxlc]{1,6}|[A-Z]{1,2}|[IVXLC]{1,6}|\d{1,2})\)/g
const BOUNDARY_BEFORE = /(?:^|\n|[;:]\s*(?:and\/or|and|or)?)\s*$/

export function splitClauses(text: string, sentence: Span): Clause[] {
    const body = text.slice(sentence.start, sentence.end)
    const markers: { label: string, start: number }[] = []
    for (const m of body.matchAll(CLAUSE_MARKER)) {
        // A short look-back is enough; it starts at the sentence start when the marker is near it.
        if (BOUNDARY_BEFORE.test(body.slice(Math.max(0, m.index - 20), m.index))) {
            markers.push({ label: m[0], start: sentence.start + m.index })
        }
    }
    return markers.map((m, i) => {
        const span = trim(text, m.start, markers[i + 1]?.start ?? sentence.end)
        return { label: m.label, ...span }
    })
}

// The sentence containing offset. An offset in the whitespace between two
// sentences belongs to the one before it; undefined outside all sentences.
export function sentenceAt(sentences: Span[], offset: number): Span | undefined {
    let lo = 0
    let hi = sentences.length - 1
    if (hi < 0 || offset < sentences[0].start) return undefined
    while (lo < hi) {
        const mid = (lo + hi + 1) >> 1
        if (sentences[mid].start <= offset) lo = mid
        else hi = mid - 1
    }
    const found = sentences[lo]
    if (lo === sentences.length - 1 && offset >= found.end) return undefined
    return found
}

// Turns any offsets into a display-ready citation: the physical page, the
// sentence(s) the range falls in and their text with whitespace collapsed.
export function cite(text: string, pageStarts: number[], sentences: Span[], range: Span): Citation {
    const first = sentenceAt(sentences, range.start)
    const last = sentenceAt(sentences, Math.max(range.start, range.end - 1))
    const sentence = {
        start: Math.min(first?.start ?? range.start, range.start),
        end: Math.max(last?.end ?? range.end, range.end),
    }
    return {
        start: range.start,
        end: range.end,
        page: pageAt(range.start, pageStarts),
        sentence,
        excerpt: text.slice(sentence.start, sentence.end).replace(/\s+/g, ' ').trim(),
    }
}

function trim(text: string, start: number, end: number): Span {
    while (start < end && /\s/.test(text[start])) start++
    while (end > start && /\s/.test(text[end - 1])) end--
    return { start, end }
}
