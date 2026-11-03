import { expect, type Page, type Response } from '@playwright/test'

import type { SigaSnapshot } from './db'

/**
 * 歯式 mà PHIÊN 診療入力 đang thấy — bản ghi `siga` + bản nháp chưa lưu.
 *
 * Từ commit app 2b505dffa (2026-09-23) các endpoint `POST /tenant/siga/tooth-status-change`,
 * `extraction-revert`, `p-mode-missing`, `missing-designation` chỉ TÍNH: nhận bản nháp
 * `toothStatus`, trả bản nháp mới, KHÔNG ghi gì xuống `siga` cho tới F9. WinForm ghi ngay
 * (SigaChg / DelExtRec / Chk_PModeKesson); web cố ý không — xem doc của `ToothStatusOverlay`
 * (apps/api/src/Ochacom.Application/Sigas/Results/ToothStatusOverlay.cs).
 *
 * ⇒ Soi DB trước F9 luôn ra giá trị CŨ. Muốn đo "WinForm đã ghi gì vào lúc này" thì đọc
 * `GET /tenant/siga?toothStatus=<bản nháp>` — đúng read mà 部位選択 / 診療チェック dùng.
 *
 * `res` là response của lần gọi endpoint tính toán GẦN NHẤT: bản nháp của nó đã gồm mọi
 * thay đổi trước đó (draft in → draft out), và request của nó mang sẵn Authorization.
 */
export async function readSessionSiga(page: Page, patNo: number, res: Response): Promise<SigaSnapshot> {
    expect(res.status(), `POST ${new URL(res.url()).pathname} phải thành công`).toBeLessThan(400)
    const body = (await res.json()) as { data?: { toothStatus?: string } | null }
    const toothStatus = body.data?.toothStatus ?? ''
    const authorization = res.request().headers()['authorization']
    expect(authorization, 'request tính 歯式 không mang Authorization').toBeTruthy()

    const get = await page.request.get('/api/tenant/siga', {
        params: { patNo: String(patNo), toothStatus },
        headers: { Authorization: authorization! },
    })
    expect(get.status(), `GET /tenant/siga?toothStatus=${toothStatus} trả ${get.status()}`).toBe(200)
    const data = ((await get.json()) as { data: { se: number[]; sn: number[] } }).data
    return { se: data.se.map(Number), sn: data.sn.map(Number) }
}
