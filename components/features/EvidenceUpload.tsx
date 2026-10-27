'use client'

import { useRef, useState } from 'react'
import { CheckCircle2, Download, Loader2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/core'
import { ACCEPT_ATTRIBUTE, MAX_UPLOAD_BYTES } from '@/lib/documents/upload'

export type EvidenceDocument = { id: string; fileName: string; uploadedAt: string }

type Status = { kind: 'idle' } | { kind: 'uploading' } | { kind: 'done' } | { kind: 'error'; message: string }

// Upload button and document list for one obligation in the borrower portal.
export function EvidenceUpload({ occurrenceId, documents: initial }: { occurrenceId: string; documents: EvidenceDocument[] }) {
    const inputRef = useRef<HTMLInputElement>(null)
    const [documents, setDocuments] = useState(initial)
    const [status, setStatus] = useState<Status>({ kind: 'idle' })

    async function upload(file: File) {
        if (file.size > MAX_UPLOAD_BYTES) {
            setStatus({ kind: 'error', message: 'File is larger than 10 MB' })
            return
        }
        setStatus({ kind: 'uploading' })
        const body = new FormData()
        body.append('file', file)
        try {
            const res = await fetch(`/api/occurrences/${occurrenceId}/documents`, { method: 'POST', body })
            const json = await res.json().catch(() => null)
            if (!res.ok) {
                setStatus({ kind: 'error', message: json?.error ?? 'Upload failed' })
                return
            }
            setDocuments(docs => [...docs, { id: json.id, fileName: json.fileName, uploadedAt: json.uploadedAt }])
            setStatus({ kind: 'done' })
        } catch {
            setStatus({ kind: 'error', message: 'Upload failed. Check your connection and try again.' })
        }
    }

    return (
        <div className="flex flex-col items-end gap-2 text-sm">
            <input
                ref={inputRef}
                type="file"
                accept={ACCEPT_ATTRIBUTE}
                className="hidden"
                onChange={e => {
                    const file = e.target.files?.[0]
                    e.target.value = ''
                    if (file) upload(file)
                }}
            />
            <Button size="sm" disabled={status.kind === 'uploading'} onClick={() => inputRef.current?.click()}>
                {status.kind === 'uploading'
                    ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    : <Upload className="w-4 h-4 mr-2" />}
                {status.kind === 'uploading' ? 'Uploading…' : 'Upload Evidence'}
            </Button>
            {status.kind === 'done' && (
                <p className="flex items-center text-green-700">
                    <CheckCircle2 className="w-4 h-4 mr-1" />
                    Submitted for review
                </p>
            )}
            {status.kind === 'error' && <p className="text-red-600" role="alert">{status.message}</p>}
            {documents.length > 0 && (
                <ul className="space-y-1">
                    {documents.map(doc => (
                        <li key={doc.id}>
                            <a href={`/api/documents/${doc.id}`} className="inline-flex items-center text-blue-700 hover:underline">
                                <Download className="w-3 h-3 mr-1" />
                                {doc.fileName}
                            </a>
                            <span className="ml-2 text-muted-foreground">{new Date(doc.uploadedAt).toLocaleDateString()}</span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    )
}
