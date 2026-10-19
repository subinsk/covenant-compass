import { describe, expect, it } from 'vitest'
import { evaluate, evaluateWithTrace, formulaSchema, toText, type Defs, type Formula } from './formula'

const num = (value: number): Formula => ({ op: 'num', value })
const v = (name: string): Formula => ({ op: 'var', name })

describe('formulaSchema', () => {
    it('accepts a nested formula', () => {
        const f = { op: 'div', left: { op: 'sub', left: v('Debt'), right: v('Cash') }, right: v('EBITDA') }
        expect(formulaSchema.parse(f)).toEqual(f)
    })

    it('rejects unknown ops and malformed nodes', () => {
        expect(formulaSchema.safeParse({ op: 'pow', args: [num(1)] }).success).toBe(false)
        expect(formulaSchema.safeParse({ op: 'div', left: num(1) }).success).toBe(false)
        expect(formulaSchema.safeParse({ op: 'add', args: [] }).success).toBe(false)
        expect(formulaSchema.safeParse({ op: 'add', args: [{ op: 'var', name: '' }] }).success).toBe(false)
    })
})

describe('evaluate', () => {
    it('does arithmetic', () => {
        const env = { a: 6, b: 3 }
        expect(evaluate({ op: 'add', args: [v('a'), v('b'), num(1)] }, env)).toBe(10)
        expect(evaluate({ op: 'mul', args: [v('a'), v('b')] }, env)).toBe(18)
        expect(evaluate({ op: 'sub', left: v('a'), right: v('b') }, env)).toBe(3)
        expect(evaluate({ op: 'div', left: v('a'), right: v('b') }, env)).toBe(2)
        expect(evaluate({ op: 'neg', arg: v('a') }, env)).toBe(-6)
        expect(evaluate({ op: 'max', args: [v('a'), v('b')] }, env)).toBe(6)
        expect(evaluate({ op: 'min', args: [v('a'), v('b')] }, env)).toBe(3)
    })

    it('caps an add-back at a percentage of EBITDA', () => {
        const capped: Formula = { op: 'cap', arg: v('Synergies'), max: { op: 'mul', args: [num(0.1), v('EBITDA')] } }
        expect(evaluate(capped, { Synergies: 25, EBITDA: 200 })).toBe(20)
        expect(evaluate(capped, { Synergies: 15, EBITDA: 200 })).toBe(15)
    })

    it('resolves nested definitions and records each step', () => {
        const defs: Defs = {
            'Net Debt': { op: 'sub', left: v('Total Debt'), right: v('Cash') },
            'EBITDA': { op: 'add', args: [v('Net Income'), v('Interest')] },
            'Net Leverage': { op: 'div', left: v('Net Debt'), right: v('EBITDA') },
        }
        const trace = evaluateWithTrace(v('Net Leverage'), { 'Total Debt': 500, 'Cash': 100, 'Net Income': 60, 'Interest': 40 }, defs)
        expect(trace).toEqual({
            value: 4,
            steps: [
                { name: 'Net Debt', value: 400 },
                { name: 'EBITDA', value: 100 },
                { name: 'Net Leverage', value: 4 },
            ],
            missing: [],
        })
    })

    it('prefers a reported input over the definition', () => {
        const defs: Defs = { EBITDA: { op: 'add', args: [v('Net Income'), v('Interest')] } }
        expect(evaluate({ op: 'div', left: v('Debt'), right: v('EBITDA') }, { Debt: 300, EBITDA: 100 }, defs)).toBe(3)
    })

    it('evaluates a shared definition once', () => {
        const defs: Defs = { EBITDA: { op: 'add', args: [v('a'), v('b')] } }
        const trace = evaluateWithTrace({ op: 'add', args: [v('EBITDA'), v('EBITDA')] }, { a: 1, b: 2 }, defs)
        expect(trace.value).toBe(6)
        expect(trace.steps).toEqual([{ name: 'EBITDA', value: 3 }])
    })

    it('lists every missing input instead of throwing', () => {
        const defs: Defs = {
            EBITDA: { op: 'add', args: [v('Net Income'), v('Interest'), v('Taxes')] },
            Leverage: { op: 'div', left: v('Debt'), right: v('EBITDA') },
        }
        const trace = evaluateWithTrace(v('Leverage'), { Interest: 10 }, defs)
        expect(trace.value).toBeNull()
        expect(trace.missing).toEqual(['Debt', 'Net Income', 'Taxes'])
    })

    it('throws from evaluate when inputs are missing', () => {
        expect(() => evaluate({ op: 'sub', left: v('x'), right: v('y') }, {})).toThrow('Missing inputs: x, y')
    })

    it('names the cycle in circular definitions', () => {
        const defs: Defs = {
            A: { op: 'add', args: [v('B'), num(1)] },
            B: { op: 'mul', args: [v('C'), num(2)] },
            C: { op: 'neg', arg: v('B') },
        }
        expect(() => evaluate(v('A'), {}, defs)).toThrow('Circular definition: B -> C -> B')
    })

    it('throws on division by zero', () => {
        expect(() => evaluate({ op: 'div', left: v('Debt'), right: v('EBITDA') }, { Debt: 100, EBITDA: 0 }))
            .toThrow('Division by zero: EBITDA is 0')
    })
})

describe('toText', () => {
    it('adds parentheses only where needed', () => {
        const netLeverage: Formula = {
            op: 'div',
            left: { op: 'sub', left: v('Consolidated Total Debt'), right: v('Cash') },
            right: v('Consolidated EBITDA'),
        }
        expect(toText(netLeverage)).toBe('(Consolidated Total Debt - Cash) / Consolidated EBITDA')
        expect(toText({ op: 'add', args: [v('a'), { op: 'mul', args: [v('b'), num(2)] }] })).toBe('a + b * 2')
        expect(toText({ op: 'sub', left: v('a'), right: { op: 'sub', left: v('b'), right: v('c') } })).toBe('a - (b - c)')
        expect(toText({ op: 'div', left: v('a'), right: { op: 'mul', args: [v('b'), v('c')] } })).toBe('a / (b * c)')
        expect(toText({ op: 'neg', arg: { op: 'add', args: [v('a'), v('b')] } })).toBe('-(a + b)')
    })

    it('writes max, min and cap as functions', () => {
        expect(toText({ op: 'max', args: [v('a'), num(0)] })).toBe('max(a, 0)')
        expect(toText({ op: 'cap', arg: v('Synergies'), max: { op: 'mul', args: [num(0.1), v('EBITDA')] } }))
            .toBe('min(Synergies, 0.1 * EBITDA)')
    })
})
