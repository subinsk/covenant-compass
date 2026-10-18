import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { chat } from './client'

function okResponse(content: string) {
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 })
}

describe('chat', () => {
    beforeEach(() => {
        vi.stubEnv('LLM_BASE_URL', 'http://localhost:11434/v1/')
        vi.stubEnv('LLM_MODEL', 'qwen3:4b')
        vi.stubEnv('LLM_API_KEY', 'test-key')
        vi.stubEnv('LLM_REASONING_EFFORT', '')
        vi.stubEnv('LLM_CACHE', '')
    })

    afterEach(() => {
        vi.unstubAllEnvs()
        vi.unstubAllGlobals()
    })

    it('posts the messages and returns the assistant content', async () => {
        const fetchMock = vi.fn().mockResolvedValue(okResponse('hello'))
        vi.stubGlobal('fetch', fetchMock)

        const result = await chat([{ role: 'user', content: 'hi' }], { temperature: 0 })

        expect(result).toBe('hello')
        const [url, init] = fetchMock.mock.calls[0]
        expect(url).toBe('http://localhost:11434/v1/chat/completions')
        expect(init.method).toBe('POST')
        expect(init.headers.Authorization).toBe('Bearer test-key')
        expect(init.headers['Content-Type']).toBe('application/json')
        expect(JSON.parse(init.body)).toEqual({
            model: 'qwen3:4b',
            messages: [{ role: 'user', content: 'hi' }],
            temperature: 0,
        })
    })

    it('sends json mode and reasoning effort when requested', async () => {
        vi.stubEnv('LLM_REASONING_EFFORT', 'low')
        const fetchMock = vi.fn().mockResolvedValue(okResponse('{}'))
        vi.stubGlobal('fetch', fetchMock)

        await chat([{ role: 'user', content: 'hi' }], { json: true })

        const body = JSON.parse(fetchMock.mock.calls[0][1].body)
        expect(body.response_format).toEqual({ type: 'json_object' })
        expect(body.reasoning_effort).toBe('low')
    })

    it('throws with status and body excerpt on non-2xx', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('rate limited', { status: 429 })))

        await expect(chat([{ role: 'user', content: 'hi' }])).rejects.toThrow('LLM request failed (429): rate limited')
    })

    it('throws when config is missing', async () => {
        vi.stubGlobal('fetch', vi.fn())
        vi.stubEnv('LLM_MODEL', '')
        await expect(chat([{ role: 'user', content: 'hi' }])).rejects.toThrow('LLM_MODEL is not set')
        vi.stubEnv('LLM_BASE_URL', '')
        await expect(chat([{ role: 'user', content: 'hi' }])).rejects.toThrow('LLM_BASE_URL is not set')
    })
})

describe('chat cache', () => {
    let dir: string

    beforeEach(async () => {
        dir = await mkdtemp(path.join(tmpdir(), 'llm-cache-'))
        vi.stubEnv('LLM_BASE_URL', 'http://localhost:11434/v1/')
        vi.stubEnv('LLM_MODEL', 'qwen3:4b')
        vi.stubEnv('LLM_CACHE', '1')
        vi.stubEnv('LLM_CACHE_DIR', dir)
    })

    afterEach(async () => {
        vi.unstubAllEnvs()
        vi.unstubAllGlobals()
        await rm(dir, { recursive: true, force: true })
    })

    it('serves identical calls from disk and misses on a different message', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(okResponse('first'))
            .mockResolvedValueOnce(okResponse('second'))
        vi.stubGlobal('fetch', fetchMock)

        expect(await chat([{ role: 'user', content: 'hi' }])).toBe('first')
        expect(await chat([{ role: 'user', content: 'hi' }])).toBe('first')
        expect(fetchMock).toHaveBeenCalledTimes(1)

        expect(await chat([{ role: 'user', content: 'bye' }])).toBe('second')
        expect(fetchMock).toHaveBeenCalledTimes(2)
    })
})
