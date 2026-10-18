import type { z } from 'zod'
import { chat, type ChatMessage } from './client'

// Small local models often wrap JSON in ```json fences despite JSON mode.
export function stripFences(text: string) {
    const match = text.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
    return match ? match[1] : text.trim()
}

function check<T>(schema: z.ZodType<T>, raw: string): { ok: true, data: T } | { ok: false, error: string } {
    let parsed: unknown
    try {
        parsed = JSON.parse(stripFences(raw))
    } catch (err) {
        return { ok: false, error: `Invalid JSON: ${(err as Error).message}` }
    }
    const result = schema.safeParse(parsed)
    if (result.success) return { ok: true, data: result.data }
    return { ok: false, error: result.error.message }
}

// Calls the LLM in JSON mode and validates the reply with `schema`.
// On failure, feeds the bad output and the error back and asks for corrected JSON.
export async function chatJson<T>(
    schema: z.ZodType<T>,
    messages: ChatMessage[],
    { retries = 2, temperature }: { retries?: number, temperature?: number } = {},
): Promise<T> {
    const history = [...messages]
    let lastError = ''
    for (let attempt = 0; attempt <= retries; attempt++) {
        const raw = await chat(history, { json: true, temperature })
        const result = check(schema, raw)
        if (result.ok) return result.data
        lastError = result.error
        history.push(
            { role: 'assistant', content: raw },
            {
                role: 'user',
                content: `Your reply was not valid. Error:\n${lastError}\nReply again with only the corrected JSON.`,
            },
        )
    }
    throw new Error(`LLM output failed validation after ${retries + 1} attempts: ${lastError}`)
}
