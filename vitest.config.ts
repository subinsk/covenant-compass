import { configDefaults, defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
    resolve: {
        alias: { '@': path.resolve(__dirname, '.') },
    },
    test: {
        environment: 'node',
        // Integration tests need a database; they run with `npm run test:int`.
        exclude: [...configDefaults.exclude, '**/*.int.test.ts'],
    },
})
