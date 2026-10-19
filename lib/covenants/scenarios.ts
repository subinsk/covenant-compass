// What-if scenarios: shock the inputs, re-test every covenant, and size the
// equity cure for a ratio that is in breach.

import { evaluate, type Defs, type Env, type Formula } from '@/lib/formulas/formula'
import { testCovenant, type CovenantTerms, type Operator } from './test'

export type Shock = { name: string, pct: number }

export type ScenarioCovenant = { name: string, formula: Formula, terms: CovenantTerms }

export type Outcome = { value: number, compliant: boolean, headroomPct: number }

export type ScenarioResult = {
    covenants: { name: string, baseline: Outcome, shocked: Outcome, flipsToBreach: boolean }[]
    // Names of covenants compliant at baseline but in breach after the shocks.
    newBreaches: string[]
}

// Returns a copy of env with each named value changed by pct percent
// (e.g. { name: 'Revenue', pct: -15 } multiplies Revenue by 0.85).
export function applyShocks(env: Env, shocks: Shock[]): Env {
    const shocked = { ...env }
    for (const { name, pct } of shocks) {
        if (!Object.hasOwn(shocked, name)) throw new Error(`Unknown input: ${name}`)
        shocked[name] = shocked[name] * (1 + pct / 100)
    }
    return shocked
}

function outcome(covenant: ScenarioCovenant, env: Env, defs: Defs, asOf: string): Outcome {
    const value = evaluate(covenant.formula, env, defs)
    const { compliant, headroomPct } = testCovenant(covenant.terms, value, asOf)
    return { value, compliant, headroomPct }
}

// Tests every covenant on the baseline inputs and on the shocked inputs.
// A shock can name a defined term (e.g. 'Consolidated EBITDA'): it is
// evaluated first and the shocked value overrides the definition.
export function runScenario({ covenants, env, defs = {}, asOf, shocks }: {
    covenants: ScenarioCovenant[]
    env: Env
    defs?: Defs
    asOf: string
    shocks: Shock[]
}): ScenarioResult {
    const base = { ...env }
    for (const { name } of shocks) {
        if (!Object.hasOwn(base, name) && Object.hasOwn(defs, name)) base[name] = evaluate(defs[name], env, defs)
    }
    const shockedEnv = applyShocks(base, shocks)

    const results = covenants.map((covenant) => {
        const baseline = outcome(covenant, env, defs, asOf)
        const shocked = outcome(covenant, shockedEnv, defs, asOf)
        return { name: covenant.name, baseline, shocked, flipsToBreach: baseline.compliant && !shocked.compliant }
    })
    return { covenants: results, newBreaches: results.filter((r) => r.flipsToBreach).map((r) => r.name) }
}

// The EBITDA increase that brings numerator / denominator back to the limit.
// Assumes the cure is added to EBITDA for the test period, as most credit
// agreements treat an equity cure. For a maximum (leverage-type) covenant
// EBITDA is the denominator: solve numerator / (denominator + x) = limit.
// For a minimum (coverage-type) covenant EBITDA is the numerator: solve
// (numerator + x) / denominator = limit. Returns 0 when already compliant.
// The amount reaches the limit exactly, which satisfies <= and >= but not a
// strict < or >. Cure restrictions (number of cures per year, caps, no
// consecutive quarters) are out of scope here.
export function equityCure({ numerator, denominator, limit, operator }: {
    numerator: number
    denominator: number
    limit: number
    operator: Operator
}): { ebitdaIncreaseNeeded: number } {
    if (limit <= 0) throw new Error('Limit must be positive')
    const isMax = operator === '<=' || operator === '<'
    if (isMax) return { ebitdaIncreaseNeeded: Math.max(0, numerator / limit - denominator) }
    if (denominator <= 0) throw new Error('Denominator must be positive')
    return { ebitdaIncreaseNeeded: Math.max(0, limit * denominator - numerator) }
}
