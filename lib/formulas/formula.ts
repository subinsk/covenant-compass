import { z } from 'zod'

// A small JSON formula format for defined terms like "Consolidated EBITDA" or
// "Total Leverage Ratio". Variables name either a reported input value or
// another defined term, so definitions can build on each other.

export type Formula =
    | { op: 'num', value: number }
    | { op: 'var', name: string }
    | { op: 'add' | 'mul' | 'max' | 'min', args: Formula[] }
    | { op: 'sub' | 'div', left: Formula, right: Formula }
    | { op: 'neg', arg: Formula }
    // min(arg, max): caps like "not to exceed 10% of Consolidated EBITDA".
    | { op: 'cap', arg: Formula, max: Formula }

export const formulaSchema: z.ZodType<Formula> = z.lazy(() =>
    z.discriminatedUnion('op', [
        z.object({ op: z.literal('num'), value: z.number() }),
        z.object({ op: z.literal('var'), name: z.string().min(1) }),
        z.object({ op: z.enum(['add', 'mul', 'max', 'min']), args: z.array(formulaSchema).min(1) }),
        z.object({ op: z.enum(['sub', 'div']), left: formulaSchema, right: formulaSchema }),
        z.object({ op: z.literal('neg'), arg: formulaSchema }),
        z.object({ op: z.literal('cap'), arg: formulaSchema, max: formulaSchema }),
    ]),
)

export type Env = Record<string, number>
export type Defs = Record<string, Formula>

export type Trace = {
    // null when any input is missing.
    value: number | null
    // Each defined term used, in the order it was resolved.
    steps: { name: string, value: number }[]
    // Every input with no value and no definition, in order of first use.
    missing: string[]
}

// Evaluates the formula, resolving each variable from `env` first and then
// from `defs`. Missing inputs don't throw: they are all collected so the
// caller can ask for them. Cycles and division by zero do throw.
export function evaluateWithTrace(formula: Formula, env: Env, defs: Defs = {}): Trace {
    const steps: Trace['steps'] = []
    const missing: string[] = []
    const resolved = new Map<string, number | null>()
    const stack: string[] = []

    function resolve(name: string): number | null {
        if (Object.hasOwn(env, name)) return env[name]
        if (!Object.hasOwn(defs, name)) {
            if (!missing.includes(name)) missing.push(name)
            return null
        }
        if (resolved.has(name)) return resolved.get(name)!
        if (stack.includes(name)) {
            const cycle = [...stack.slice(stack.indexOf(name)), name]
            throw new Error(`Circular definition: ${cycle.join(' -> ')}`)
        }
        stack.push(name)
        const value = walk(defs[name])
        stack.pop()
        resolved.set(name, value)
        if (value !== null) steps.push({ name, value })
        return value
    }

    // Evaluates every argument, even after one is missing, so all gaps are found.
    function all(formulas: Formula[]): number[] | null {
        const values = formulas.map(walk)
        return values.some((v) => v === null) ? null : values as number[]
    }

    function walk(f: Formula): number | null {
        switch (f.op) {
            case 'num': return f.value
            case 'var': return resolve(f.name)
            case 'neg': {
                const v = walk(f.arg)
                return v === null ? null : -v
            }
            case 'add': return applyOrNull(all(f.args), (vs) => vs.reduce((a, b) => a + b, 0))
            case 'mul': return applyOrNull(all(f.args), (vs) => vs.reduce((a, b) => a * b, 1))
            case 'max': return applyOrNull(all(f.args), (vs) => Math.max(...vs))
            case 'min': return applyOrNull(all(f.args), (vs) => Math.min(...vs))
            case 'cap': return applyOrNull(all([f.arg, f.max]), ([a, m]) => Math.min(a, m))
            case 'sub': return applyOrNull(all([f.left, f.right]), ([a, b]) => a - b)
            case 'div': return applyOrNull(all([f.left, f.right]), ([a, b]) => {
                if (b === 0) throw new Error(`Division by zero: ${toText(f.right)} is 0`)
                return a / b
            })
        }
    }

    const value = walk(formula)
    return { value: missing.length ? null : value, steps, missing }
}

function applyOrNull(values: number[] | null, fn: (values: number[]) => number) {
    return values === null ? null : fn(values)
}

// Like evaluateWithTrace, but throws if any input is missing.
export function evaluate(formula: Formula, env: Env, defs: Defs = {}): number {
    const { value, missing } = evaluateWithTrace(formula, env, defs)
    if (value === null) throw new Error(`Missing inputs: ${missing.join(', ')}`)
    return value
}

const precedence: Record<Formula['op'], number> = {
    add: 1, sub: 1, mul: 2, div: 2, neg: 3, num: 4, var: 4, max: 4, min: 4, cap: 4,
}

// Readable infix text, e.g. "(Consolidated Total Debt - Cash) / Consolidated EBITDA".
export function toText(formula: Formula): string {
    // Wraps a child in parentheses when it binds looser than its parent needs.
    const wrap = (f: Formula, min: number) => {
        const text = toText(f)
        return precedence[f.op] < min ? `(${text})` : text
    }
    switch (formula.op) {
        case 'num': return String(formula.value)
        case 'var': return formula.name
        case 'neg': return `-${wrap(formula.arg, 3)}`
        case 'add': return formula.args.map((a) => wrap(a, 1)).join(' + ')
        case 'mul': return formula.args.map((a) => wrap(a, 2)).join(' * ')
        case 'sub': return `${wrap(formula.left, 1)} - ${wrap(formula.right, 2)}`
        case 'div': return `${wrap(formula.left, 2)} / ${wrap(formula.right, 3)}`
        case 'max':
        case 'min': return `${formula.op}(${formula.args.map(toText).join(', ')})`
        case 'cap': return `min(${toText(formula.arg)}, ${toText(formula.max)})`
    }
}
