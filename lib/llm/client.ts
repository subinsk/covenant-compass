// Minimal client for OpenAI-compatible chat completions (Ollama locally, Groq in production).

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
    })

    if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`LLM request failed (${res.status}): ${text.slice(0, 200)}`)
    }

    const data = await res.json()
    const content = data?.choices?.[0]?.message?.content
    if (typeof content !== 'string') throw new Error('LLM response has no message content')
    return content
}
