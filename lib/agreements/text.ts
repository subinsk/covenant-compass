import { edgarFetch } from '@/lib/edgar/client'

// Turns an EDGAR exhibit (HTML) into plain text that downstream code can cite
// by character offsets. The conversion is deterministic: the same HTML always
// gives the same text, so stored { start, end } offsets stay valid.
//
// - one line per paragraph / table row / list item; no blank lines
// - struck-through text (deletions in conformed amendments) is dropped
// - page breaks (page-break-before/after, break-before/after) give pageStarts,
//   and a lone page-number line at the top or bottom of a page is dropped

export type AgreementText = {
    text: string
    // Offset where each physical page starts; pageStarts[0] is always 0.
    pageStarts: number[]
}

const BLOCK_TAGS = new Set([
    'address', 'article', 'blockquote', 'body', 'br', 'center', 'dd', 'div', 'dl', 'dt',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'html', 'li', 'ol', 'p', 'pre', 'section',
    'table', 'tbody', 'tfoot', 'thead', 'tr', 'ul',
])
const CELL_TAGS = new Set(['td', 'th'])
const SKIP_TAGS = new Set(['script', 'style', 'title', 'noscript'])
const STRIKE_TAGS = new Set(['strike', 's', 'del'])
const VOID_TAGS = new Set(['br', 'hr', 'img', 'meta', 'link', 'input', 'col', 'wbr'])

const PAGE = '\f'
const PAGE_BREAK_STYLE = /(?:page-)?break-(?:before|after)\s*:\s*(?:always|page)/i
const INLINE_GAP_STYLE = /(?:padding|margin)-left\s*:\s*(?:0*\.0*[1-9]|0*[1-9])|display\s*:\s*inline-block/i
const LINE_THROUGH_STYLE = /text-decoration[^;"']*line-through/i
export const PAGE_NUMBER_LINE = /^[-\u2013\u2014\s]*(?:page\s+)?(?:\d{1,4}|[ivxlc]{1,7}|[a-z]-\d{1,4})[-\u2013\u2014\s]*$/i

export function htmlToText(html: string): string {
    return htmlToPages(html).text
}

export function htmlToPages(html: string): AgreementText {
    const raw = flatten(stripSgmlWrapper(html))
    const pages = raw.split(PAGE).map(pageLines).filter((lines) => lines.length > 0)

    let text = ''
    const pageStarts: number[] = []
    for (const lines of pages) {
        if (text) text += '\n'
        pageStarts.push(text.length)
        text += lines.join('\n')
    }
    if (pageStarts.length === 0) pageStarts.push(0)
    return { text, pageStarts }
}

export async function loadAgreementText(url: string): Promise<AgreementText & { url: string }> {
    return { url, ...htmlToPages(await edgarFetch(url)) }
}

// 1-based physical page number containing offset (not the printed page label).
export function pageAt(offset: number, pageStarts: number[]): number {
    let lo = 0
    let hi = pageStarts.length - 1
    while (lo < hi) {
        const mid = (lo + hi + 1) >> 1
        if (pageStarts[mid] <= offset) lo = mid
        else hi = mid - 1
    }
    return lo + 1
}

// Full-submission files wrap the document in <DOCUMENT><TYPE>...<TEXT>...</TEXT>.
function stripSgmlWrapper(html: string) {
    const start = html.search(/<TEXT>/i)
    if (start === -1) return html
    const end = html.search(/<\/TEXT>/i)
    return html.slice(start + 6, end > start ? end : undefined)
}

// Walks the tags once and emits text with '\n' for block boundaries and '\f'
// for page breaks. Whitespace inside text runs collapses as in a browser.
function flatten(html: string) {
    const out: string[] = []
    let skipUntil: string | null = null
    let strike: { tag: string, depth: number } | null = null
    const inlineGaps: boolean[] = []

    for (const m of html.matchAll(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<!?\/?([a-zA-Z][a-zA-Z0-9]*)([^>]*)>|[^<]+|</g)) {
        const token = m[0]
        const name = m[1]?.toLowerCase()

        if (!name) {
            if (token.startsWith('<!') || skipUntil || strike) continue
            out.push(decodeEntities(token.replace(/[ \t\r\n]+/g, ' ')).replace(/[\n\f]/g, ' '))
            continue
        }

        const closing = token[1] === '/'
        const attrs = m[2] ?? ''
        if (token[1] === '!') continue

        if (skipUntil) {
            if (closing && name === skipUntil) skipUntil = null
            continue
        }
        if (strike) {
            if (name === strike.tag && !VOID_TAGS.has(name) && !attrs.endsWith('/')) {
                strike.depth += closing ? -1 : 1
                if (strike.depth === 0) strike = null
            }
            continue
        }
        if (!closing && SKIP_TAGS.has(name)) {
            skipUntil = name
            continue
        }

        if (!closing && PAGE_BREAK_STYLE.test(attrs)) out.push(PAGE)
        if (BLOCK_TAGS.has(name)) {
            out.push('\n')
        } else if (CELL_TAGS.has(name)) {
            out.push(' ')
        } else if (!VOID_TAGS.has(name)) {
            // Inline runs set apart by padding or a fixed-width box instead of a space,
            // e.g. <font style="display:inline-block;min-width:36pt">(a)</font>the ...
            if (closing) {
                if (inlineGaps.pop()) out.push(' ')
            } else {
                const gap = INLINE_GAP_STYLE.test(attrs)
                if (gap) out.push(' ')
                inlineGaps.push(gap)
            }
        }

        if (!closing && !VOID_TAGS.has(name) && (STRIKE_TAGS.has(name) || LINE_THROUGH_STYLE.test(attrs))) {
            strike = { tag: name, depth: 1 }
        }
    }
    return out.join('')
}

function pageLines(page: string) {
    const lines = page
        .replace(/[\u00ad\u200b-\u200d\u200e\u200f\u2060\ufeff]/g, '')
        .replace(/[\u00a0\u2000-\u200a\u202f\u205f\u3000\t\r\v]/g, ' ')
        .split('\n')
        .map((line) => line.replace(/ {2,}/g, ' ').trim())
        .filter(Boolean)
    if (lines.length > 0 && PAGE_NUMBER_LINE.test(lines[lines.length - 1])) lines.pop()
    if (lines.length > 0 && PAGE_NUMBER_LINE.test(lines[0])) lines.shift()
    return lines
}

const NAMED_ENTITIES: Record<string, string> = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0',
    ldquo: '\u201c', rdquo: '\u201d', lsquo: '\u2018', rsquo: '\u2019',
    ndash: '\u2013', mdash: '\u2014', hellip: '\u2026', bull: '\u2022', middot: '\u00b7',
    sect: '\u00a7', para: '\u00b6', copy: '\u00a9', reg: '\u00ae', trade: '\u2122',
    ge: '\u2265', le: '\u2264', times: '\u00d7', deg: '\u00b0', plusmn: '\u00b1',
    frac12: '\u00bd', frac14: '\u00bc', frac34: '\u00be', pound: '\u00a3', euro: '\u20ac', yen: '\u00a5',
    shy: '\u00ad', lrm: '\u200e', rlm: '\u200f', zwsp: '\u200b', ensp: '\u2002', emsp: '\u2003', thinsp: '\u2009',
    eacute: '\u00e9', egrave: '\u00e8', ecirc: '\u00ea', agrave: '\u00e0', aacute: '\u00e1',
    oacute: '\u00f3', uuml: '\u00fc', ouml: '\u00f6', Ouml: '\u00d6', auml: '\u00e4', ccedil: '\u00e7', ntilde: '\u00f1',
}

// Numeric references 128-159 are Windows-1252 code points in older filings (&#147; for \u201c).
const CP1252: Record<number, number> = {
    128: 0x20ac, 130: 0x201a, 131: 0x0192, 132: 0x201e, 133: 0x2026, 134: 0x2020, 135: 0x2021,
    136: 0x02c6, 137: 0x2030, 138: 0x0160, 139: 0x2039, 140: 0x0152, 142: 0x017d, 145: 0x2018,
    146: 0x2019, 147: 0x201c, 148: 0x201d, 149: 0x2022, 150: 0x2013, 151: 0x2014, 152: 0x02dc,
    153: 0x2122, 154: 0x0161, 155: 0x203a, 156: 0x0153, 158: 0x017e, 159: 0x0178,
}

export function decodeEntities(s: string): string {
    return s.replace(/&(#\d+|#x[0-9a-f]+|[a-z][a-z0-9]*);/gi, (whole, ref: string) => {
        if (ref[0] !== '#') return NAMED_ENTITIES[ref] ?? NAMED_ENTITIES[ref.toLowerCase()] ?? whole
        let code = ref[1] === 'x' || ref[1] === 'X' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10)
        code = CP1252[code] ?? code
        if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return whole
        return String.fromCodePoint(code)
    })
}
