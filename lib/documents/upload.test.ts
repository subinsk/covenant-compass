import { describe, expect, it } from 'vitest'
import { MAX_UPLOAD_BYTES, documentTypeSchema, sanitiseFileName, storageKey, validateUpload } from './upload'

describe('validateUpload', () => {
    it('accepts allowed files', () => {
        expect(validateUpload({ name: 'q3.pdf', type: 'application/pdf', size: 1000 })).toBeNull()
        expect(validateUpload({ name: 'Cert.JPG', type: 'image/jpeg', size: 1000 })).toBeNull()
        expect(validateUpload({ name: 'data.csv', type: 'text/csv; charset=utf-8', size: 10 })).toBeNull()
        expect(validateUpload({
            name: 'model.xlsx',
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            size: MAX_UPLOAD_BYTES,
        })).toBeNull()
    })

    it('rejects disallowed extensions', () => {
        expect(validateUpload({ name: 'setup.exe', type: 'application/pdf', size: 10 })).toMatch(/not allowed/)
        expect(validateUpload({ name: 'noextension', type: 'application/pdf', size: 10 })).toMatch(/not allowed/)
    })

    it('rejects a content type that does not match the extension', () => {
        expect(validateUpload({ name: 'q3.pdf', type: 'application/x-msdownload', size: 10 })).toMatch(/does not match/)
        expect(validateUpload({ name: 'q3.pdf', type: '', size: 10 })).toMatch(/does not match/)
    })

    it('rejects empty and oversized files', () => {
        expect(validateUpload({ name: 'q3.pdf', type: 'application/pdf', size: 0 })).toMatch(/empty/)
        expect(validateUpload({ name: 'q3.pdf', type: 'application/pdf', size: MAX_UPLOAD_BYTES + 1 })).toMatch(/10 MB/)
    })
})

describe('sanitiseFileName', () => {
    it('keeps simple names', () => {
        expect(sanitiseFileName('Q3-2026_financials.pdf')).toBe('Q3-2026_financials.pdf')
    })

    it('drops directory parts', () => {
        expect(sanitiseFileName('../../etc/passwd')).toBe('passwd')
        expect(sanitiseFileName('C:\\Users\\bob\\report.pdf')).toBe('report.pdf')
    })

    it('replaces unusual characters and leading dots', () => {
        expect(sanitiseFileName('my report (final)?.pdf')).toBe('my_report_final_.pdf')
        expect(sanitiseFileName('.hidden.pdf')).toBe('hidden.pdf')
    })

    it('falls back when nothing usable is left', () => {
        expect(sanitiseFileName('...')).toBe('file')
        expect(sanitiseFileName('')).toBe('file')
    })

    it('limits length but keeps the extension', () => {
        const name = sanitiseFileName(`${'a'.repeat(300)}.pdf`)
        expect(name).toHaveLength(100)
        expect(name.endsWith('.pdf')).toBe(true)
    })
})

describe('storageKey', () => {
    it('prefixes the sanitised name with the document id', () => {
        expect(storageKey('abc-123', 'my file.pdf')).toBe('abc-123-my_file.pdf')
    })
})

describe('documentTypeSchema', () => {
    it('defaults to OTHER and rejects unknown types', () => {
        expect(documentTypeSchema.parse(undefined)).toBe('OTHER')
        expect(documentTypeSchema.parse('CERTIFICATE')).toBe('CERTIFICATE')
        expect(documentTypeSchema.safeParse('MALWARE').success).toBe(false)
    })
})
