'use client'

import { useRef, useState } from 'react'
import { Button, cn } from '@/components/ui/core'
import { useOverlay } from '@/components/ui/useOverlay'
import { Loader2, Wand2, Check, FileUp, FileText, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import {
    buildCovenantRequestBody, COVENANT_TYPE_LABELS, DEFAULT_COVENANT_TYPE, DEFAULT_FREQUENCY, FREQUENCY_LABELS,
    saveErrorMessage, type CovenantFormData,
} from '@/lib/covenants/new-covenant'
import { agreementFileError, formatBytes, type UploadLimits } from '@/lib/agreements/upload-check'
import { startedRunView, type AgreementRunView } from '@/lib/extraction/runs'

const inputTabs = [
    { id: 'paste', label: 'Paste clause' },
    { id: 'upload', label: 'Upload agreement' },
] as const

export function AddCovenantModal({ onClose, facilityId, uploadLimits, onUploadStarted }: {
    onClose: () => void
    facilityId: string
    uploadLimits: UploadLimits
    onUploadStarted: (run: AgreementRunView) => void
}) {
    const router = useRouter()
    const [step, setStep] = useState<'input' | 'review'>('input')
    const [inputTab, setInputTab] = useState<'paste' | 'upload'>('paste')
    const [clauseText, setClauseText] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [formData, setFormData] = useState<CovenantFormData>({})
    const [message, setMessage] = useState<string | null>(null)

    const backdrop = useOverlay(onClose)

    const handleParse = async () => {
        if (!clauseText) return
        setIsLoading(true)
        setMessage(null)
        try {
            const res = await fetch('/api/ai/parse-covenant', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clauseText })
            })
            if (!res.ok) throw new Error(`Parse failed (${res.status})`)
            const suggestion = await res.json()
            setFormData({ ...suggestion, title: suggestion.suggestedTitle })
            setStep('review')
        } catch (e) {
            console.error(e)
            setFormData({ type: DEFAULT_COVENANT_TYPE, frequency: DEFAULT_FREQUENCY })
            setMessage("Couldn't analyse the clause. Fill in the details below.")
            setStep('review')
        } finally {
            setIsLoading(false)
        }
    }

    const body = buildCovenantRequestBody(formData)

    const handleSave = async () => {
        setIsLoading(true)
        setMessage(null)
        try {
            const res = await fetch(`/api/facilities/${facilityId}/covenants`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            })
            if (res.ok) {
                router.refresh()
                onClose()
                setStep('input')
                setClauseText('')
                setFormData({})
            } else {
                setMessage(saveErrorMessage(res.status, await res.json().catch(() => null)))
            }
        } catch (e) {
            console.error(e)
            setMessage('Could not reach the server. Try again.')
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div {...backdrop} className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-contain bg-black/50 p-4 backdrop-blur-sm animate-fade-in sm:items-center">
            <div role="dialog" aria-modal="true" className="bg-background w-full max-w-lg rounded-lg shadow-lg border p-6 space-y-6 animate-fade-up">
                <div className="flex justify-between items-center">
                    <h2 className="text-lg font-semibold">
                        {step === 'input' ? 'Add New Covenant' : 'Review & Save'}
                    </h2>
                    <button onClick={onClose} className="text-muted-foreground hover:text-foreground">✕</button>
                </div>

                {step === 'input' && (
                    <div className="flex gap-1 rounded-md bg-muted p-1" role="tablist">
                        {inputTabs.map(tab => (
                            <button
                                key={tab.id}
                                type="button"
                                role="tab"
                                aria-selected={inputTab === tab.id}
                                onClick={() => setInputTab(tab.id)}
                                className={cn(
                                    'flex-1 rounded px-3 py-1.5 text-sm font-medium transition-colors',
                                    inputTab === tab.id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                                )}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                )}

                {step === 'input' && inputTab === 'upload' ? (
                    <UploadAgreement
                        facilityId={facilityId}
                        limits={uploadLimits}
                        onCancel={onClose}
                        onStarted={(run) => {
                            onUploadStarted(run)
                            onClose()
                        }}
                    />
                ) : step === 'input' ? (
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Paste Covenant Clause from Document</label>
                            <textarea
                                className="w-full min-h-[150px] p-3 rounded-md border bg-transparent text-sm focus:ring-2 focus:ring-primary focus:outline-none"
                                placeholder="e.g., The Borrower shall maintain a Leverage Ratio not exceeding 4.00:1.00..."
                                value={clauseText}
                                onChange={e => setClauseText(e.target.value)}
                            />
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button variant="ghost" onClick={onClose}>Cancel</Button>
                            <Button onClick={handleParse} disabled={!clauseText || isLoading}>
                                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4 mr-2" />}
                                {isLoading ? 'Analyzing...' : 'AI Extract'}
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="bg-primary/5 p-3 rounded-md border border-primary/20 flex items-start gap-3">
                            <Wand2 className="w-5 h-5 text-primary mt-0.5" />
                            <div className="text-sm">
                                <p className="font-semibold text-primary">AI Suggestion</p>
                                <p className="text-muted-foreground">Review the extracted details below before saving.</p>
                                {formData.source && (
                                    <p className="text-xs text-muted-foreground mt-1">
                                        {formData.source === 'llm' ? 'Suggested by the language model.' : 'Suggested by keyword rules.'}
                                    </p>
                                )}
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <label className="text-xs font-medium text-muted-foreground">Title</label>
                                <input
                                    className="w-full p-2 rounded-md border text-sm"
                                    value={formData.title || ''}
                                    onChange={e => setFormData({ ...formData, title: e.target.value })}
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-medium text-muted-foreground">Type</label>
                                <select
                                    className="w-full p-2 rounded-md border text-sm bg-background"
                                    value={body.type}
                                    onChange={e => setFormData({ ...formData, type: e.target.value })}
                                >
                                    {Object.entries(COVENANT_TYPE_LABELS).map(([value, label]) => (
                                        <option key={value} value={value}>{label}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-medium text-muted-foreground">Frequency</label>
                                <select
                                    className="w-full p-2 rounded-md border text-sm bg-background"
                                    value={body.frequency}
                                    onChange={e => setFormData({ ...formData, frequency: e.target.value })}
                                >
                                    {Object.entries(FREQUENCY_LABELS).map(([value, label]) => (
                                        <option key={value} value={value}>{label}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-medium text-muted-foreground">Due Rule</label>
                                <input
                                    className="w-full p-2 rounded-md border text-sm"
                                    value={formData.dueRule || ''}
                                    onChange={e => setFormData({ ...formData, dueRule: e.target.value })}
                                />
                            </div>
                        </div>

                        {body.type === 'FINANCIAL' && (
                            <div className="space-y-1">
                                <label className="text-xs font-medium text-muted-foreground">Formula & Threshold</label>
                                <div className="flex gap-2">
                                    <input
                                        className="w-2/3 p-2 rounded-md border text-sm"
                                        placeholder="Formula"
                                        value={formData.metricFormula || ''}
                                        onChange={e => setFormData({ ...formData, metricFormula: e.target.value })}
                                    />
                                    <input
                                        className="w-1/3 p-2 rounded-md border text-sm"
                                        placeholder="<= 4.0"
                                        value={formData.thresholdCondition || ''}
                                        onChange={e => setFormData({ ...formData, thresholdCondition: e.target.value })}
                                    />
                                </div>
                            </div>
                        )}

                        {message && (
                            <p role="alert" className="text-sm text-destructive">{message}</p>
                        )}

                        <div className="flex justify-end gap-2 pt-2">
                            <Button variant="ghost" onClick={() => setStep('input')}>Back</Button>
                            <Button onClick={handleSave} disabled={isLoading || !body.title}>
                                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
                                Save Covenant
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}

// Uploads a whole agreement. Extraction runs on the server in the background, so the modal
// closes as soon as the server accepts the file and the facility page shows the progress.
function UploadAgreement({ facilityId, limits, onCancel, onStarted }: {
    facilityId: string
    limits: UploadLimits
    onCancel: () => void
    onStarted: (run: AgreementRunView) => void
}) {
    const inputRef = useRef<HTMLInputElement>(null)
    const [file, setFile] = useState<File | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [dragging, setDragging] = useState(false)
    const [busy, setBusy] = useState(false)

    const choose = (chosen: File | undefined) => {
        if (!chosen) return
        const problem = agreementFileError(chosen, limits)
        setFile(problem ? null : chosen)
        setError(problem?.error ?? null)
    }

    const submit = async () => {
        if (!file) return
        setBusy(true)
        setError(null)
        try {
            const form = new FormData()
            form.append('file', file)
            const res = await fetch(`/api/facilities/${facilityId}/extraction-runs`, { method: 'POST', body: form })
            if (res.status === 202) {
                onStarted(startedRunView(await res.json()))
                return
            }
            const body = await res.json().catch(() => null)
            setError(typeof body?.error === 'string' ? body.error : `Upload failed (${res.status})`)
        } catch (e) {
            console.error(e)
            setError('Could not reach the server. Try again.')
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
                Finds the financial covenants in a credit agreement: ratio tests such as leverage or interest coverage.
                It runs in the background, so you can keep working. Review each covenant found before it is added.
            </p>

            <input
                ref={inputRef}
                type="file"
                accept={limits.extensions.join(',')}
                className="hidden"
                onChange={e => {
                    choose(e.target.files?.[0])
                    e.target.value = ''
                }}
            />
            <button
                type="button"
                onClick={() => inputRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={e => {
                    e.preventDefault()
                    setDragging(false)
                    choose(e.dataTransfer.files[0])
                }}
                className={cn(
                    'flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors',
                    dragging ? 'border-primary bg-primary/5' : 'border-input hover:border-primary/50 hover:bg-accent/50'
                )}
            >
                <FileUp className={cn('h-8 w-8 transition-colors', dragging ? 'text-primary' : 'text-muted-foreground')} />
                <span className="text-sm font-medium">Drop the agreement here, or click to choose a file</span>
                <span className="text-xs text-muted-foreground">PDF, Word (.docx), HTML or plain text, up to {formatBytes(limits.maxBytes)}</span>
            </button>

            {file && (
                <div className="flex items-center gap-3 rounded-md border px-3 py-2 animate-pop-in">
                    <FileText className="h-5 w-5 shrink-0 text-primary" />
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{file.name}</p>
                        <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
                    </div>
                    <button
                        type="button"
                        onClick={() => setFile(null)}
                        className="text-muted-foreground hover:text-foreground"
                        aria-label="Remove file"
                        disabled={busy}
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>
            )}

            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

            <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={onCancel}>Cancel</Button>
                <Button onClick={submit} disabled={!file || busy}>
                    {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Wand2 className="w-4 h-4 mr-2" />}
                    {busy ? 'Uploading...' : 'Extract covenants'}
                </Button>
            </div>
        </div>
    )
}
