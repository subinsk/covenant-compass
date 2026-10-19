import { describe, expect, it } from 'vitest'
import { decodeEntities, htmlToPages, htmlToText, pageAt } from './text'

describe('decodeEntities', () => {
    it('decodes named, decimal, hex and Windows-1252 references', () => {
        expect(decodeEntities('&ldquo;EBITDA&rdquo; &amp; Lender&rsquo;s &sect;7')).toBe('“EBITDA” & Lender’s §7')
        expect(decodeEntities('&#8220;Ratio&#8221; &#x2019; &#58;')).toBe('“Ratio” ’ :')
        expect(decodeEntities('&#147;Debt&#148; &#150;')).toBe('“Debt” –')
    })

    it('leaves unknown references alone', () => {
        expect(decodeEntities('&bogus; AT&T')).toBe('&bogus; AT&T')
    })
})

describe('htmlToText', () => {
    it('strips tags, scripts, styles, head and comments', () => {
        const html = `<html><head><title>EX-10.1</title><style>p{color:red}</style></head>
            <body><!-- Field: Page --><script>var x = '<p>no</p>'</script>
            <p style="font-size:10pt">Credit <b>Agreement</b></p></body></html>`
        expect(htmlToText(html)).toBe('Credit Agreement')
    })

    it('keeps one line per block element and collapses whitespace', () => {
        const html = `<p>First
            paragraph</p><div>Second&nbsp;&nbsp; paragraph<br>after break</div>
            <h2>Heading</h2><ul><li>one</li><li>two</li></ul><p>&#160;</p><p></p>`
        expect(htmlToText(html)).toBe('First paragraph\nSecond paragraph\nafter break\nHeading\none\ntwo')
    })

    it('removes zero-width characters and soft hyphens', () => {
        expect(htmlToText('<p>Con&#8203;solidated EBIT&shy;DA&#8206;</p>')).toBe('Consolidated EBITDA')
    })

    it('puts each table row on one line', () => {
        const html = `<table><tr><td>Level</td><td>Ratio</td></tr>
            <tr><td>I</td><td>&ge; 3.00:1.00</td></tr></table>`
        expect(htmlToText(html)).toBe('Level Ratio\nI ≥ 3.00:1.00')
    })

    it('drops struck-through text (deletions in conformed amendments)', () => {
        const html = `<p>not greater than <font style="text-decoration:line-through">4.00</font><font style="text-decoration:underline double">3.75</font> to 1.00</p>
            <p>Keep <strike>old <strike>nested</strike> words</strike>new words</p>`
        expect(htmlToText(html)).toBe('not greater than 3.75 to 1.00\nKeep new words')
    })

    it('adds a space where an inline run is set apart by padding or a fixed-width box', () => {
        const html = `<div><font>(iii)</font><font style="padding-left:1.53pt">notwithstanding</font></div>
            <div><font style="display:inline-block;min-width:36pt">(a)</font><font>the Agent</font></div>`
        expect(htmlToText(html)).toBe('(iii) notwithstanding\n(a) the Agent')
    })

    it('reads only the <TEXT> part of an SGML-wrapped EDGAR document', () => {
        const html = '<DOCUMENT>\n<TYPE>EX-10.1\n<SEQUENCE>2\n<TEXT>\n<HTML><BODY><P>Body</P></BODY></HTML>\n</TEXT>\n</DOCUMENT>'
        expect(htmlToText(html)).toBe('Body')
    })

    it('is deterministic', () => {
        const html = '<p>A &amp; B</p><hr style="page-break-after:always"><p>C</p>'
        expect(htmlToPages(html)).toEqual(htmlToPages(html))
    })
})

describe('htmlToPages', () => {
    it('splits pages on page-break styles and drops lone page numbers', () => {
        const html = `<p>Cover page</p>
            <p style="page-break-before:always">&nbsp;</p><hr>
            <p>Page two text</p><p style="text-align:center">- 1 -</p>
            <hr style="page-break-after:always">
            <p>2</p><p>Page three text</p>
            <div style="break-before: page"><p>&nbsp;</p></div>`
        const { text, pageStarts } = htmlToPages(html)
        expect(text).toBe('Cover page\nPage two text\nPage three text')
        expect(pageStarts).toEqual([0, 11, 25])
        expect(text.slice(pageStarts[1], pageStarts[2])).toBe('Page two text\n')
    })

    it('returns a single page when there are no page breaks', () => {
        expect(htmlToPages('<p>Only</p>')).toEqual({ text: 'Only', pageStarts: [0] })
        expect(htmlToPages('')).toEqual({ text: '', pageStarts: [0] })
    })
})

describe('pageAt', () => {
    const pageStarts = [0, 11, 25]

    it('maps an offset to its 1-based page', () => {
        expect(pageAt(0, pageStarts)).toBe(1)
        expect(pageAt(10, pageStarts)).toBe(1)
        expect(pageAt(11, pageStarts)).toBe(2)
        expect(pageAt(24, pageStarts)).toBe(2)
        expect(pageAt(25, pageStarts)).toBe(3)
        expect(pageAt(1000, pageStarts)).toBe(3)
    })

    it('handles a single page', () => {
        expect(pageAt(5, [0])).toBe(1)
    })
})
