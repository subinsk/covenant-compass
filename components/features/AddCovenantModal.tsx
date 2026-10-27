'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/core'
import { Loader2, Wand2, Check } from 'lucide-react'
import { useRouter } from 'next/navigation'
import {
    buildCovenantRequestBody, COVENANT_TYPE_LABELS, DEFAULT_COVENANT_TYPE, DEFAULT_FREQUENCY, FREQUENCY_LABELS,
    saveErrorMessage, type CovenantFormData,
} from '@/lib/covenants/new-covenant'

export function AddCovenantModal({ isOpen, onClose, facilityId }: { isOpen: boolean; onClose: () => void; facilityId: string }) {
    const router = useRouter()
    const [step, setStep] = useState<'input' | 'review'>('input')
    const [clauseText, setClauseText] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [formData, setFormData] = useState<CovenantFormData>({})
    const [message, setMessage] = useState<string | null>(null)

    if (!isOpen) return null

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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
            <div className="bg-background w-full max-w-lg rounded-lg shadow-lg border p-6 space-y-6">
                <div className="flex justify-between items-center">
                    <h2 className="text-lg font-semibold">
                        {step === 'input' ? 'Add New Covenant' : 'Review & Save'}
                    </h2>
                    <button onClick={onClose} className="text-muted-foreground hover:text-foreground">✕</button>
                </div>

                {step === 'input' ? (
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
