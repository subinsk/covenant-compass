import { mkdir, readFile as fsReadFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

// Uploaded files live on local disk under `uploads/` at the repo root. Callers only
// pass storage keys produced by the app (never user input), so a blob store can
// replace these two functions later without touching the routes.
const UPLOAD_DIR = path.join(process.cwd(), 'uploads')

function keyPath(key: string): string {
    if (key !== path.basename(key) || key.startsWith('.')) throw new Error(`Invalid storage key: ${key}`)
    return path.join(UPLOAD_DIR, key)
}

export async function saveFile(key: string, data: Uint8Array): Promise<void> {
    await mkdir(UPLOAD_DIR, { recursive: true })
    await writeFile(keyPath(key), data)
}

export async function readFile(key: string): Promise<Buffer> {
    return fsReadFile(keyPath(key))
}
