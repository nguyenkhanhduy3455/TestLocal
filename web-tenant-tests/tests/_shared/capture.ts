import fs from 'node:fs'
import path from 'node:path'

import { type Locator, type Page } from '@playwright/test'

/**
 * Ảnh chụp UI vừa sửa, để người review soi bằng mắt — không thay assert.
 * Ghi vào `capture-results/ui-fixes/<YYYY-MM-DD>/<name>.png` (thư mục gitignore).
 */
const DIR = path.resolve(
    __dirname,
    '../../capture-results/ui-fixes',
    new Date().toISOString().slice(0, 10),
)

export async function captureFixedUi(target: Page | Locator, name: string): Promise<void> {
    fs.mkdirSync(DIR, { recursive: true })
    const file = path.join(DIR, `${name}.png`)
    await target.screenshot({ path: file })
    console.log(`UI capture: ${file}`)
}
