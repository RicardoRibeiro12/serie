// Local API for development with the settings this fork runs in production: password sign-in on,
// the first profile becomes the admin. Data lives in ./data (git-ignored).
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const DATA_DIR = join(root, 'data')
mkdirSync(DATA_DIR, { recursive: true })
spawn(process.execPath, ['server.js'], {
  cwd: join(root, 'api'), stdio: 'inherit',
  env: { ...process.env, PORT: '3000', DATA_DIR, ORIGIN: 'http://localhost:8080', RP_ID: 'localhost', PASSWORD_LOGIN: '1', FIRST_USER_ADMIN: '1' }
}).on('exit', code => process.exit(code ?? 0))
