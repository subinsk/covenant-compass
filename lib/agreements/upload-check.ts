// Checks an uploaded agreement's name and size before it is read. No imports, so the upload
// form can use it too without pulling the PDF and Word readers into the browser bundle;
// the limits come from lib/agreements/upload.ts (passed down as props on the client).

export type UploadLimits = { maxBytes: number, extensions: readonly string[] }

export function fileExtension(fileName: string): string {
    const dot = fileName.lastIndexOf('.')
    return dot === -1 ? '' : fileName.slice(dot).toLowerCase()
}

export function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, '')} MB`
}

// Returns the error and HTTP status, or null when the file is fine.
export function agreementFileError(
    file: { name: string, size: number },
    limits: UploadLimits,
): { error: string, status: 400 | 413 } | null {
    if (file.size > limits.maxBytes) return { error: `File is larger than ${formatBytes(limits.maxBytes)}`, status: 413 }
    if (file.size === 0) return { error: 'File is empty', status: 400 }
    if (!limits.extensions.includes(fileExtension(file.name))) {
        return { error: 'File type not supported. Use PDF, Word (.docx), HTML or plain text', status: 400 }
    }
    return null
}
