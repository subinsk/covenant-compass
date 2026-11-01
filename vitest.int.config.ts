import { configDefaults, defineConfig } from 'vitest/config'
import path from 'node:path'

// Integration tests against a real Postgres at DATABASE_URL_TEST. Without it they are skipped.
// Load .env here so DATABASE_URL_TEST is seen before the DATABASE_URL override below is decided;
// otherwise Prisma loads it later and the tests would run against DATABASE_URL.
try {
    process.loadEnvFile('.env')
} catch {
    // No .env file (e.g. CI, where the variables are set directly).
}

export default defineConfig({
    resolve: {
        alias: { '@': path.resolve(__dirname, '.') },
    },
    test: {
        environment: 'node',
        include: ['**/*.int.test.ts'],
        exclude: [...configDefaults.exclude, '**/.*/**'],
        globalSetup: ['./test/integration/global-setup.ts'],
        env: process.env.DATABASE_URL_TEST ? { DATABASE_URL: process.env.DATABASE_URL_TEST } : {},
        fileParallelism: false,
    },
})
