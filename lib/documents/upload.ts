import { z } from 'zod'

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

// Allowed extensions and the content types browsers send for them.
const ALLOWED_TYPES: Record<string, string[]> = {
    pdf: ['application/pdf'],
    xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    xls: ['application/vnd.ms-excel'],
    csv: ['text/csv', 'application/vnd.ms-excel', 'text/plain'],
    docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    png: ['image/png'],
    jpg: ['image/jpeg'],
    jpeg: ['image/jpeg'],
}

export const ACCEPT_ATTRIBUTE = Object.keys(ALLOWED_TYPES).map(ext => `.${ext}`).join(',')

export const documentTypeSchema = z.enum(['FINANCIAL_STATEMENT', 'CERTIFICATE', 'WAIVER', 'OTHER']).default('OTHER')

function extension(fileName: string): string {
    const dot = fileName.lastIndexOf('.')
    return dot === -1 ? '' : fileName.slice(dot + 1).toLowerCase()
}

// Checks size, extension and the browser-sent content type. Returns an error message, or null when the file is fine.
export function validateUpload(file: { name: string; type: string; size: number }): string | null {
    if (file.size === 0) return 'File is empty'
    if (file.size > MAX_UPLOAD_BYTES) return 'File is larger than 10 MB'
    const allowed = ALLOWED_TYPES[extension(file.name)]
    if (!allowed) return 'File type not allowed. Use PDF, XLSX, XLS, CSV, DOCX, PNG or JPG'
    const contentType = file.type.split(';')[0].trim().toLowerCase()
    if (!allowed.includes(contentType)) return 'File content type does not match its extension'
    return null
}

// A filename safe to use on disk and in headers: path parts dropped, unusual characters replaced.
export function sanitiseFileName(name: string): string {
    const base = name.split(/[\\/]/).pop() ?? ''
    const cleaned = base
        .replace(/[^A-Za-z0-9._-]+/g, '_')
        .slice(-100)
        .replace(/^[._]+/, '')
    return cleaned || 'file'
}

export function storageKey(documentId: string, fileName: string): string {
    return `${documentId}-${sanitiseFileName(fileName)}`
}
