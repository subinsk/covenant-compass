import type { AgreementText } from './text'

// Turns an uploaded agreement file into the same text shape htmlToPages gives
// for EDGAR exhibits (one line per paragraph, pageStarts per physical page), so
// the section finder and extraction work the same way on uploads.

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024

export const ACCEPTED_EXTENSIONS = ['.pdf', '.docx', '.html', '.htm', '.txt'] as const

export class UnreadableDocumentError extends Error {}

export async function readAgreementFile(_bytes: Uint8Array, _fileName: string): Promise<AgreementText> {
    throw new Error('not implemented')
}
