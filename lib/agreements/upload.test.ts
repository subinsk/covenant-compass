import { readFileSync } from 'node:fs'
import path from 'node:path'
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { findSections } from './sections'
import { pageAt } from './text'
import {
    MAX_UPLOAD_BYTES, UnreadableDocumentError, fileExtension, pdfPagesToText, plainTextToPages, readAgreementFile, toLines,
    type PdfItem,
} from './upload'

const encode = (s: string) => new TextEncoder().encode(s)

// One text item per line, 12pt text from x=72 to x=540, lines 14pt apart from the top.
function page(lines: (string | { text: string, x?: number, right?: number, gap?: number })[]): PdfItem[] {
    let y = 720
    return lines.map((line) => {
        const { text, x = 72, right = 540, gap = 1 } = typeof line === 'string' ? { text: line } : line
        y -= 14 * gap
        return { str: text, x, y, width: right - x, height: 12 }
    })
}

describe('toLines', () => {
    it('joins items on the same baseline left to right, spacing words but not quote marks', () => {
        const items: PdfItem[] = [
            { str: '” means all laws', x: 106, y: 700, width: 80, height: 11 },
            { str: '“', x: 30, y: 700, width: 5, height: 11 },
            { str: 'Environmental Laws', x: 35, y: 700.4, width: 71, height: 11 },
            { str: 'next line', x: 30, y: 687, width: 40, height: 11 },
        ]
        expect(toLines(items).map((l) => l.text)).toEqual(['“Environmental Laws” means all laws', 'next line'])
    })

    it('adds a space between items separated by a gap', () => {
        const items: PdfItem[] = [
            { str: 'Section', x: 72, y: 700, width: 40, height: 12 },
            { str: '7.11', x: 116, y: 700, width: 20, height: 12 },
        ]
        expect(toLines(items)[0].text).toBe('Section 7.11')
    })
})

describe('pdfPagesToText', () => {
    it('joins wrapped lines into one paragraph and starts a new one after a short last line', () => {
        const { text } = pdfPagesToText([page([
            'The Borrower shall not permit the Leverage Ratio as of the last day of any fiscal',
            { text: 'quarter to exceed 3.50 to 1.00.', right: 250 },
            'Each Lender agrees to fund its share of each Loan on the date requested by the',
            { text: 'Borrower.', right: 120 },
        ])])
        expect(text).toBe([
            'The Borrower shall not permit the Leverage Ratio as of the last day of any fiscal quarter to exceed 3.50 to 1.00.',
            'Each Lender agrees to fund its share of each Loan on the date requested by the Borrower.',
        ].join('\n'))
    })

    it('does not treat a wrapped line starting with a section number as a heading', () => {
        const { text } = pdfPagesToText([page([
            'Indebtedness repaid on such date as provided in Section',
            { text: '7.11 hereof and any related transactions.', right: 300 },
        ])])
        expect(text).toBe('Indebtedness repaid on such date as provided in Section 7.11 hereof and any related transactions.')
        expect(findSections(text)).toEqual([])
    })

    it('starts headings, list items and definitions on their own lines after a clause ends', () => {
        const { text } = pdfPagesToText([page([
            'The financial covenants are set out below and apply at all times:',
            'Section 7.11 Financial Covenants. The Borrower shall not permit the Leverage Ratio to',
            'exceed the levels below; and',
            '(b) the Interest Coverage Ratio to be less than 3.00 to 1.00 at any time when tested.',
            '“Leverage Ratio” means the ratio of Consolidated Total Debt to Consolidated EBITDA for',
            { text: 'the period.', right: 140 },
        ])])
        expect(text.split('\n')).toEqual([
            'The financial covenants are set out below and apply at all times:',
            'Section 7.11 Financial Covenants. The Borrower shall not permit the Leverage Ratio to exceed the levels below; and',
            '(b) the Interest Coverage Ratio to be less than 3.00 to 1.00 at any time when tested.',
            '“Leverage Ratio” means the ratio of Consolidated Total Debt to Consolidated EBITDA for the period.',
        ])
    })

    it('splits paragraphs on extra vertical space', () => {
        const { text } = pdfPagesToText([page([
            'The Borrower shall maintain insurance with financially sound and reputable insurers in',
            'such amounts and covering such risks as are usually carried by companies engaged in',
            'similar businesses and owning similar properties in the same general areas as those in',
            'which the Borrower operates',
            { text: 'NEGATIVE COVENANTS', gap: 2 },
        ])])
        expect(text.split('\n')).toHaveLength(2)
        expect(text.split('\n')[1]).toBe('NEGATIVE COVENANTS')
    })

    it('keeps hyphens but drops the space when a word wraps after one', () => {
        const { text } = pdfPagesToText([page([
            'The obligations are full recourse and non-',
            { text: 'recourse to the Lenders only.', right: 250 },
        ])])
        expect(text).toBe('The obligations are full recourse and non-recourse to the Lenders only.')
    })

    it('drops page numbers, continues paragraphs across pages and records every page start', () => {
        const pages = [
            page(['-1-', 'The Borrower shall deliver its financial statements within ninety days after the end', '1']),
            page([]),
            page([{ text: 'of each fiscal year.', right: 180 }, 'Page 3']),
        ]
        const { text, pageStarts } = pdfPagesToText(pages)
        expect(text).toBe('The Borrower shall deliver its financial statements within ninety days after the end of each fiscal year.')
        expect(pageStarts).toHaveLength(3)
        expect(pageAt(text.indexOf('of each fiscal year'), pageStarts)).toBe(3)
        expect(pageAt(0, pageStarts)).toBe(1)
    })

    it('drops a running header repeated on most pages', () => {
        const bodies = ['Loans may be prepaid.', 'Fees are payable quarterly.', 'Notices go to the Agent.', 'This Agreement is governed by New York law.']
        const full = 'Each paragraph on these pages ends well before the right margin, unlike this line'
        const pages = bodies.map((body, i) => page(['Execution Version', ...(i === 0 ? [full] : []), { text: body, right: 300 }]))
        expect(pdfPagesToText(pages).text).toBe([`${full} ${bodies[0]}`, ...bodies.slice(1)].join('\n'))
    })
})

describe('plainTextToPages', () => {
    it('joins blank-line separated paragraphs and splits pages on form feeds', () => {
        const { text, pageStarts } = plainTextToPages('ARTICLE VII\n\nThe Borrower shall\nnot permit it.\n\n12\f7.11 Financial Covenants.\r\n')
        expect(text).toBe('ARTICLE VII\nThe Borrower shall not permit it.\n7.11 Financial Covenants.')
        expect(pageStarts).toEqual([0, text.indexOf('7.11')])
    })

    it('takes each line as a paragraph when there are no blank lines', () => {
        expect(plainTextToPages('Line one.\nLine two.').text).toBe('Line one.\nLine two.')
    })
})

describe('readAgreementFile', () => {
    it('reads a PDF into paragraphs the section finder understands', async () => {
        const bytes = new Uint8Array(readFileSync(path.join(__dirname, '../../test/fixtures/agreement-sample.pdf')))
        const { text, pageStarts } = await readAgreementFile(bytes, 'Credit Agreement.PDF')
        expect(pageStarts).toHaveLength(2)
        expect(text).toContain('“Leverage Ratio” means, as of any date of determination, the ratio of')
        expect(text).toContain('Section 7.11 hereof')
        const financial = findSections(text).filter((s) => s.kind === 'financial-covenants')
        expect(financial.map((s) => s.heading)).toEqual([expect.stringMatching(/^Section 7\.11 Financial Covenants\./)])
        expect(pageAt(financial[0].start, pageStarts)).toBe(2)
    })

    it('reads HTML and text files', async () => {
        expect((await readAgreementFile(encode('<p>One.</p><p>Two.</p>'), 'a.htm')).text).toBe('One.\nTwo.')
        expect((await readAgreementFile(encode('One.\nTwo.'), 'a.txt')).text).toBe('One.\nTwo.')
    })

    it('reads a Word document', async () => {
        const zip = new JSZip()
        zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
        zip.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
        zip.file('word/document.xml', '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'
            + '<w:p><w:r><w:t>Section 7.11 Financial Covenants.</w:t></w:r></w:p>'
            + '<w:p><w:r><w:t xml:space="preserve">The Leverage Ratio shall not exceed </w:t></w:r><w:r><w:t>3.50 to 1.00.</w:t></w:r></w:p>'
            + '</w:body></w:document>')
        const bytes = new Uint8Array(await zip.generateAsync({ type: 'uint8array' }))
        const { text } = await readAgreementFile(bytes, 'agreement.docx')
        expect(text).toBe('Section 7.11 Financial Covenants.\nThe Leverage Ratio shall not exceed 3.50 to 1.00.')
    })

    it('rejects unsupported, empty, oversized, broken and image-only files', async () => {
        await expect(readAgreementFile(encode('x'), 'scan.png')).rejects.toThrow(UnreadableDocumentError)
        await expect(readAgreementFile(new Uint8Array(), 'a.pdf')).rejects.toThrow('The file is empty.')
        await expect(readAgreementFile(new Uint8Array(MAX_UPLOAD_BYTES + 1), 'a.pdf')).rejects.toThrow(/larger than 20 MB/)
        await expect(readAgreementFile(encode('not a pdf at all'), 'a.pdf')).rejects.toThrow(UnreadableDocumentError)
        await expect(readAgreementFile(encode('not a zip'), 'a.docx')).rejects.toThrow(UnreadableDocumentError)
    })

    it('finds the extension case-insensitively', () => {
        expect(fileExtension('Credit Agreement.Final.PDF')).toBe('.pdf')
        expect(fileExtension('README')).toBe('')
    })
})
