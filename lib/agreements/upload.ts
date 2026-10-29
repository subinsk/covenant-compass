import { htmlToPages, PAGE_NUMBER_LINE, type AgreementText } from './text'

// Turns an uploaded agreement file into the same text shape htmlToPages gives
// for EDGAR exhibits (one line per paragraph, pageStarts per physical page), so
// the section finder and extraction work the same way on uploads.

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024

export const ACCEPTED_EXTENSIONS = ['.pdf', '.docx', '.html', '.htm', '.txt'] as const

export class UnreadableDocumentError extends Error {}

// Fewer characters than this per page on average means there's no real text layer.
const MIN_CHARS_PER_PAGE = 20

export function fileExtension(fileName: string): string {
    const dot = fileName.lastIndexOf('.')
    return dot < 0 ? '' : fileName.slice(dot).toLowerCase()
}

export async function readAgreementFile(bytes: Uint8Array, fileName: string): Promise<AgreementText> {
    const ext = fileExtension(fileName)
    if (!(ACCEPTED_EXTENSIONS as readonly string[]).includes(ext)) {
        throw new UnreadableDocumentError(`Unsupported file type. Upload a ${ACCEPTED_EXTENSIONS.join(', ')} file.`)
    }
    if (bytes.byteLength === 0) throw new UnreadableDocumentError('The file is empty.')
    if (bytes.byteLength > MAX_UPLOAD_BYTES) {
        throw new UnreadableDocumentError(`The file is larger than ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`)
    }

    const result = ext === '.pdf' ? await readPdf(bytes)
        : ext === '.docx' ? await readDocx(bytes)
            : ext === '.txt' ? plainTextToPages(new TextDecoder().decode(bytes))
                : htmlToPages(new TextDecoder().decode(bytes))

    if (result.text.trim().length === 0) throw new UnreadableDocumentError('No text could be read from the file.')
    return result
}

async function readDocx(bytes: Uint8Array): Promise<AgreementText> {
    const mammoth = await import('mammoth')
    try {
        const { value } = await mammoth.convertToHtml({ buffer: Buffer.from(bytes) })
        return htmlToPages(value)
    } catch {
        throw new UnreadableDocumentError('The Word document could not be read. Check that it is a .docx file and not password protected.')
    }
}

async function readPdf(bytes: Uint8Array): Promise<AgreementText> {
    const { getDocumentProxy } = await import('unpdf')
    let pages: PdfItem[][]
    try {
        // pdf.js may detach the buffer it's given, so pass a copy.
        const pdf = await getDocumentProxy(new Uint8Array(bytes))
        pages = []
        for (let n = 1; n <= pdf.numPages; n++) {
            const content = await (await pdf.getPage(n)).getTextContent()
            pages.push(content.items.flatMap((item) => 'str' in item && item.str.trim() !== ''
                ? [{ str: item.str, x: item.transform[4], y: item.transform[5], width: item.width, height: item.height || Math.abs(item.transform[3]) }]
                : []))
        }
    } catch (err) {
        const name = err instanceof Error ? err.name : ''
        throw new UnreadableDocumentError(name === 'PasswordException'
            ? 'The PDF is password protected. Upload an unlocked copy.'
            : 'The PDF could not be read. It may be damaged.')
    }

    const chars = pages.reduce((n, items) => n + items.reduce((m, i) => m + i.str.trim().length, 0), 0)
    if (chars < MIN_CHARS_PER_PAGE * Math.max(1, pages.length)) {
        throw new UnreadableDocumentError('The PDF has no selectable text. It looks like a scanned image; upload a text-based PDF or the Word file instead.')
    }
    return pdfPagesToText(pages)
}

// ---- PDF text items -> paragraphs ----

export type PdfItem = { str: string, x: number, y: number, width: number, height: number }

type Line = { text: string, x: number, right: number, y: number, height: number }

// Starts of lines that open a new paragraph when the previous line ended a
// sentence or clause: article and section headings, numbered sections, list
// markers and defined terms.
const PARAGRAPH_START = /^(?:ARTICLE\s|SECTION\s|Section\s+\d|§\s*\d|\d{1,2}\.\d{1,2}[A-Z]?\.?\s|\d{1,2}\.\s+[A-Z]|\((?:[a-z]{1,2}|[ivxlc]{1,6}|\d{1,2}|[A-Z])\)\s|[“"][^“”"]{1,100}[”"]\s*(?:means|shall|has|have|:|,|\()|[A-Z][A-Z\s]{3,}$)/
const CLAUSE_END = /(?:[.:;!?)”"]|\band|\bor)$/

export function pdfPagesToText(pages: PdfItem[][]): AgreementText {
    const pageLines = removeRunningLines(pages.map(toLines)).map(stripPageNumbers)
    const all = pageLines.flat()
    const left = mode(all.map((l) => Math.round(l.x)))
    const right = percentile(all.map((l) => l.right), 0.9)
    const lineGap = median(pageLines.flatMap((lines) => lines.slice(1).map((l, i) => (lines[i].y - l.y) / Math.max(l.height, 1))).filter((g) => g > 0))

    let text = ''
    const pageStarts: number[] = []
    let prev: Line | null = null
    for (const lines of pageLines) {
        // Blank pages still get an entry so page numbers match the PDF's.
        if (lines.length === 0) {
            pageStarts.push(text.length)
            continue
        }
        lines.forEach((line, i) => {
            const startsPage = i === 0
            if (prev === null) {
                // First text in the document.
            } else if (startsNewParagraph(prev, line, { left, right, lineGap, acrossPage: startsPage })) {
                text += '\n'
            } else {
                text += /\w-$/.test(prev.text) && /^[a-z]/.test(line.text) ? '' : ' '
            }
            if (startsPage) pageStarts.push(text.length)
            text += line.text
            prev = line
        })
    }
    if (pageStarts.length === 0) pageStarts.push(0)
    pageStarts[0] = 0
    return { text, pageStarts }
}

function startsNewParagraph(prev: Line, line: Line, page: { left: number, right: number, lineGap: number, acrossPage: boolean }): boolean {
    const h = Math.max(prev.height, line.height, 1)
    const endsClause = CLAUSE_END.test(prev.text)
    if (PARAGRAPH_START.test(line.text) && endsClause) return true
    // A line that stops well short of the right margin ends its paragraph.
    if (prev.right < page.right - Math.max(3 * h, 0.1 * (page.right - page.left))) return true
    if (page.acrossPage) return false
    // More space than a normal line break, or an indent deeper than the line above.
    const gap = (prev.y - line.y) / h
    if (page.lineGap > 0 && gap > page.lineGap * 1.45) return true
    if (line.x > prev.x + 1.5 * h && endsClause) return true
    return false
}

// Groups a page's items into lines, top to bottom, joining items left to right.
export function toLines(items: PdfItem[]): Line[] {
    const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x)
    const lines: PdfItem[][] = []
    for (const item of sorted) {
        const line = lines[lines.length - 1]
        if (line && Math.abs(line[0].y - item.y) <= Math.max(line[0].height, item.height, 1) * 0.4) line.push(item)
        else lines.push([item])
    }
    return lines.map((line) => {
        line.sort((a, b) => a.x - b.x)
        let text = ''
        let end = -Infinity
        for (const item of line) {
            const gap = item.x - end
            const needsSpace = text !== '' && !/\s$/.test(text) && !/^\s/.test(item.str)
                && gap > Math.max(item.height, 1) * 0.15 && !/[“(\[$]$/.test(text) && !/^[”),.;:%\]]/.test(item.str)
            text += (needsSpace ? ' ' : '') + item.str
            end = Math.max(end, item.x + item.width)
        }
        return {
            text: text.replace(/[  -   　\t]/g, ' ').replace(/\s+/g, ' ').trim(),
            x: line[0].x,
            right: end,
            y: line[0].y,
            height: Math.max(...line.map((i) => i.height)),
        }
    }).filter((l) => l.text !== '')
}

// Drops page numbers at the top or bottom of a page (a printed "-19-" and a
// viewer's "60" can both be there).
function stripPageNumbers(lines: Line[]): Line[] {
    const out = [...lines]
    while (out.length > 0 && PAGE_NUMBER_LINE.test(out[out.length - 1].text)) out.pop()
    while (out.length > 0 && PAGE_NUMBER_LINE.test(out[0].text)) out.shift()
    return out
}

// Drops running headers and footers: a first or last line that repeats (digits
// aside) on at least half the pages.
function removeRunningLines(pages: Line[][]): Line[][] {
    if (pages.length < 4) return pages
    const key = (l: Line) => l.text.replace(/\d+/g, '#').toLowerCase()
    const counts = new Map<string, number>()
    for (const lines of pages) {
        for (const l of new Set([lines[0], lines[lines.length - 1]].filter(Boolean))) counts.set(key(l), (counts.get(key(l)) ?? 0) + 1)
    }
    const running = new Set([...counts].filter(([k, n]) => n >= pages.length / 2 && k.replace(/[#\W]/g, '').length > 0).map(([k]) => k))
    return pages.map((lines) => lines.filter((l, i) => !((i === 0 || i === lines.length - 1) && running.has(key(l)))))
}

// ---- plain text ----

// Pages split on form feeds. Blank-line separated paragraphs are joined into
// one line each; otherwise every line is taken as a paragraph.
export function plainTextToPages(raw: string): AgreementText {
    const pages = raw.replace(/\r\n?/g, '\n').split('\f')
    const blankSeparated = /\n[ \t]*\n/.test(raw)
    let text = ''
    const pageStarts: number[] = []
    for (const page of pages) {
        const paragraphs = (blankSeparated ? page.split(/\n[ \t]*\n/) : page.split('\n'))
            .map((p) => p.replace(/\s+/g, ' ').trim())
            .filter((p) => p !== '')
        if (paragraphs.length > 0 && PAGE_NUMBER_LINE.test(paragraphs[paragraphs.length - 1])) paragraphs.pop()
        if (paragraphs.length > 0 && PAGE_NUMBER_LINE.test(paragraphs[0])) paragraphs.shift()
        if (paragraphs.length === 0) continue
        if (text) text += '\n'
        pageStarts.push(text.length)
        text += paragraphs.join('\n')
    }
    if (pageStarts.length === 0) pageStarts.push(0)
    return { text, pageStarts }
}

// ---- small stats helpers ----

function median(values: number[]): number {
    return percentile(values, 0.5)
}

function percentile(values: number[], p: number): number {
    if (values.length === 0) return 0
    const sorted = [...values].sort((a, b) => a - b)
    return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]
}

function mode(values: number[]): number {
    const counts = new Map<number, number>()
    for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
    let best = 0
    let bestCount = -1
    for (const [v, n] of counts) if (n > bestCount) { best = v; bestCount = n }
    return best
}
