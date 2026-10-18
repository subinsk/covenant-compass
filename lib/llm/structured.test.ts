import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { chat } from './client'
import { chatJson } from './structured'

vi.mock('./client', () => ({ chat: vi.fn() }))
const chatMock = vi.mocked(chat)

const schema = z.object({ name: z.string(), threshold: z.number() })
const messages = [{ role: 'user' as const, content: 'extract' }]

describe('chatJson', () => {
    beforeEach(() => {
        chatMock.mockReset()
    })

    it('returns parsed data on the first valid reply', async () => {
        chatMock.mockResolvedValueOnce('{"name":"DSCR","threshold":1.25}')

        await expect(chatJson(schema, messages)).resolves.toEqual({ name: 'DSCR', threshold: 1.25 })
        expect(chatMock).toHaveBeenCalledTimes(1)
        expect(chatMock.mock.calls[0][1]).toMatchObject({ json: true })
    })

    it('retries with error feedback after an invalid reply', async () => {
        chatMock
            .mockResolvedValueOnce('{"name":"DSCR","threshold":"high"}')
            .mockResolvedValueOnce('{"name":"DSCR","threshold":1.25}')

        await expect(chatJson(schema, messages)).resolves.toEqual({ name: 'DSCR', threshold: 1.25 })
        expect(chatMock).toHaveBeenCalledTimes(2)
        const retryMessages = chatMock.mock.calls[1][0]
        expect(retryMessages).toHaveLength(3)
        expect(retryMessages[1]).toEqual({ role: 'assistant', content: '{"name":"DSCR","threshold":"high"}' })
        expect(retryMessages[2].role).toBe('user')
        expect(retryMessages[2].content).toContain('threshold')
    })

    it('throws after retries + 1 attempts', async () => {
        chatMock.mockResolvedValue('not json')

        await expect(chatJson(schema, messages, { retries: 2 })).rejects.toThrow(/after 3 attempts: Invalid JSON/)
        expect(chatMock).toHaveBeenCalledTimes(3)
    })

    it('parses JSON wrapped in code fences', async () => {
        chatMock.mockResolvedValueOnce('```json\n{"name":"DSCR","threshold":1.25}\n```')

        await expect(chatJson(schema, messages)).resolves.toEqual({ name: 'DSCR', threshold: 1.25 })
    })
})
