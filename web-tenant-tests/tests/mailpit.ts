/**
 * Đọc hộp thư Mailpit của môi trường dev (docker `ochacom_mailpit`).
 *
 * SMTP của app trỏ vào Mailpit nên mail không đi ra ngoài — nhờ vậy test được
 * phép kiểm nội dung mail thật thay vì chỉ tin vào cờ `emailSent` của API.
 *
 * Chỉ đọc + xoá theo địa chỉ test, KHÔNG đụng tới mail của người khác.
 *
 * Đổi endpoint bằng MAILPIT_URL nếu Mailpit chạy ở máy khác.
 */
const MAILPIT_URL = process.env.MAILPIT_URL ?? 'http://localhost:8025'

export interface MailpitSummary {
    ID: string
    Subject: string
    To: { Name: string; Address: string }[]
    Created: string
}

export interface MailpitMessage extends MailpitSummary {
    Text: string
    HTML: string
}

/** Mailpit có sống không — dùng để skip kèm lý do thay vì fail mù. */
export async function mailpitUp(): Promise<boolean> {
    try {
        const res = await fetch(`${MAILPIT_URL}/api/v1/messages?limit=1`)
        return res.ok
    } catch {
        return false
    }
}

/**
 * Mail MỚI NHẤT gửi tới `address`, hoặc null nếu chưa có.
 *
 * Mailpit trả danh sách mới-trước, nhưng vẫn sắp lại theo `Created` cho chắc:
 * thứ tự trả về không nằm trong hợp đồng API.
 */
export async function latestMailTo(address: string): Promise<MailpitMessage | null> {
    const res = await fetch(
        `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${address}`)}&limit=50`,
    )
    if (!res.ok) return null
    const body = (await res.json()) as { messages?: MailpitSummary[] }
    const list = (body.messages ?? []).sort((a, b) => b.Created.localeCompare(a.Created))
    const newest = list[0]
    if (newest === undefined) return null

    const detail = await fetch(`${MAILPIT_URL}/api/v1/message/${newest.ID}`)
    if (!detail.ok) return null
    return (await detail.json()) as MailpitMessage
}

/**
 * Chờ tới khi có mail gửi tới `address` thoả `accept`.
 *
 * KHÔNG dùng mốc thời gian để phân biệt mail cũ/mới: `Created` do Mailpit đóng
 * dấu bằng đồng hồ của container, lệch với đồng hồ máy chạy test là mail hợp lệ
 * bị coi như cũ và test chờ vô ích. Thay vào đó hộp thư được dọn ở đầu mỗi lần
 * chạy, còn trường hợp cần phân biệt hai mail liên tiếp (再送) thì so bằng token.
 *
 * Poll là đúng bản chất ở đây chứ không phải "ngủ cho chắc" (GUIDELINE Rule 7
 * cấm sleep để chờ APP sẵn sàng — đây là chờ một hệ thống NGOÀI, không có
 * locator nào để `expect` bám vào).
 */
export async function waitForMailTo(
    address: string,
    opts: { accept?: (mail: MailpitMessage) => boolean; timeoutMs?: number } = {},
): Promise<MailpitMessage | null> {
    const { accept, timeoutMs = 20000 } = opts
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
        const mail = await latestMailTo(address)
        if (mail && (accept === undefined || accept(mail))) return mail
        await new Promise((r) => setTimeout(r, 500))
    }
    return null
}

/** Link kích hoạt trong thân mail, hoặc null nếu mail không có. */
export function extractActivateLink(mail: MailpitMessage): string | null {
    return /https?:\/\/\S*\/activate-login\?token=[^\s"'<>]+/.exec(mail.Text ?? '')?.[0] ?? null
}

/** `?token=` của link kích hoạt. */
export function extractActivateToken(mail: MailpitMessage): string | null {
    const link = extractActivateLink(mail)
    return link ? new URL(link).searchParams.get('token') : null
}

/** Xoá mọi mail gửi tới `address` — chỉ dọn hộp thư của chính test. */
export async function purgeMailTo(address: string): Promise<number> {
    const res = await fetch(
        `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${address}`)}&limit=200`,
    )
    if (!res.ok) return 0
    const body = (await res.json()) as { messages?: MailpitSummary[] }
    const ids = (body.messages ?? []).map((m) => m.ID)
    if (ids.length === 0) return 0

    await fetch(`${MAILPIT_URL}/api/v1/messages`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ IDs: ids }),
    })
    return ids.length
}
