import { describe, expect, it } from 'vitest'
import { ACCEPTED_EXTENSIONS, MAX_UPLOAD_BYTES } from './upload'
import { agreementFileError, fileExtension, formatBytes } from './upload-check'

const limits = { maxBytes: MAX_UPLOAD_BYTES, extensions: ACCEPTED_EXTENSIONS }

describe('fileExtension', () => {
    it('returns the lower-case extension with its dot', () => {
        expect(fileExtension('Credit Agreement.PDF')).toBe('.pdf')
        expect(fileExtension('a.b.docx')).toBe('.docx')
        expect(fileExtension('README')).toBe('')
    })
})

describe('formatBytes', () => {
    it('uses B, KB or MB', () => {
        expect(formatBytes(500)).toBe('500 B')
        expect(formatBytes(2048)).toBe('2 KB')
        expect(formatBytes(20 * 1024 * 1024)).toBe('20 MB')
        expect(formatBytes(1.5 * 1024 * 1024)).toBe('1.5 MB')
    })
})

describe('agreementFileError', () => {
    it('accepts every supported type', () => {
        for (const name of ['a.pdf', 'a.docx', 'a.html', 'a.htm', 'a.txt', 'A.PDF']) {
            expect(agreementFileError({ name, size: 100 }, limits)).toBeNull()
        }
    })

    it('accepts a file of exactly the maximum size', () => {
        expect(agreementFileError({ name: 'a.pdf', size: MAX_UPLOAD_BYTES }, limits)).toBeNull()
    })

    it('rejects files over the maximum size with 413', () => {
        expect(agreementFileError({ name: 'a.pdf', size: MAX_UPLOAD_BYTES + 1 }, limits))
            .toEqual({ error: 'File is larger than 20 MB', status: 413 })
    })

    it('rejects empty files', () => {
        expect(agreementFileError({ name: 'a.pdf', size: 0 }, limits)).toEqual({ error: 'File is empty', status: 400 })
    })

    it('rejects other types', () => {
        for (const name of ['a.doc', 'a.xlsx', 'a.pdf.exe', 'pdf', '']) {
            expect(agreementFileError({ name, size: 100 }, limits)?.status).toBe(400)
        }
    })
})
