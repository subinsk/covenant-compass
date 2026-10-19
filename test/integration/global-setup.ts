import { execSync } from 'node:child_process'

// Recreates the schema in the test database once per run. Refuses any database whose
// name doesn't end in `_test`, since `--force-reset` drops every table.
export default function setup() {
    const url = process.env.DATABASE_URL_TEST
    if (!url) return

    const dbName = new URL(url).pathname.slice(1)
    if (!dbName.endsWith('_test')) {
        throw new Error(`DATABASE_URL_TEST must point at a database ending in _test (got "${dbName}")`)
    }

    execSync('npx prisma db push --skip-generate --force-reset', {
        env: { ...process.env, DATABASE_URL: url },
        stdio: 'inherit',
    })
}
