import { NextResponse } from 'next/server'
import { z } from 'zod'

export function invalidInput(error: z.ZodError) {
    return NextResponse.json({ error: 'Invalid input', issues: z.flattenError(error) }, { status: 400 })
}

// Query params as a plain object, dropping empty values so `?status=` means "no filter".
export function queryParams(url: string): Record<string, string> {
    const params: Record<string, string> = {}
    for (const [key, value] of new URL(url).searchParams) {
        if (value !== '') params[key] = value
    }
    return params
}
