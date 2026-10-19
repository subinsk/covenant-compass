import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { Agent } from 'undici'

// Minimal client for OpenAI-compatible chat completions (Ollama locally, Groq in production).
// Set LLM_CACHE=1 in development to cache responses on disk (LLM_CACHE_DIR, default .cache/llm).
// Node's fetch gives up waiting for response headers after 5 minutes. A local model on a CPU
// can take longer than that just to read a long prompt, so LLM_TIMEOUT_MS can raise the limit.

export type ChatMessage = {
    role: 'system' | 'user' | 'assistant'
    content: string
}

export type ChatOptions = {
    json?: boolean
    temperature?: number
}

export async function chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<string> {
    const baseUrl = process.env.LLM_BASE_URL
    const model = process.env.LLM_MODEL
    if (!baseUrl) throw new Error('LLM_BASE_URL is not set')
    if (!model) throw new Error('LLM_MODEL is not set')
    const apiKey = process.env.LLM_API_KEY || 'none'
    const reasoningEffort = process.env.LLM_REASONING_EFFORT

    const cacheFile = process.env.LLM_CACHE === '1'
        ? cachePath({ baseUrl, model, messages, json: options.json, temperature: options.temperature, reasoningEffort })
        : null
    if (cacheFile) {
        const cached = await readFile(cacheFile, 'utf8').catch(() => null)
        if (cached !== null) return JSON.parse(cached).content
    }

    const body: Record<string, unknown> = { model, messages }
    if (options.json) body.response_format = { type: 'json_object' }
    if (options.temperature !== undefined) body.temperature = options.temperature
    if (reasoningEffort) body.reasoning_effort = reasoningEffort

    const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        ...timeoutDispatcher(process.env.LLM_TIMEOUT_MS),
    } as RequestInit)

    if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`LLM request failed (${res.status}): ${text.slice(0, 200)}`)
    }

    const data = await res.json()
    const content = data?.choices?.[0]?.message?.content
    if (typeof content !== 'string') throw new Error('LLM response has no message content')

    if (cacheFile) {
        await mkdir(path.dirname(cacheFile), { recursive: true })
        await writeFile(cacheFile, JSON.stringify({ content }))
    }
    return content
}

const agents = new Map<number, Agent>()

export function timeoutDispatcher(value: string | undefined): { dispatcher?: Agent } {
    const ms = Number(value)
    if (!value || !Number.isFinite(ms) || ms <= 0) return {}
    if (!agents.has(ms)) agents.set(ms, new Agent({ headersTimeout: ms, bodyTimeout: ms }))
    return { dispatcher: agents.get(ms) }
}

function cachePath(key: unknown) {
    const hash = createHash('sha256').update(JSON.stringify(key)).digest('hex')
    return path.join(process.env.LLM_CACHE_DIR || path.join('.cache', 'llm'), `${hash}.json`)
}
