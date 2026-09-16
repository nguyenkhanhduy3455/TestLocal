# winform-dialog-catalog.tsv

Bảng tra mọi hộp thoại app WinForm có thể hiện. Sinh bằng
`TestLocal/tools/winform-dialog-catalog.py` (ghép call-site trong `src/OCHACOM/**`
với 140 row `MSGTBL` đọc từ SQL Server `SIM2000`).

## Cột

| Cột | Nghĩa |
|---|---|
| `kind` | `msgtbl` (qua MsgDialog+MSGTBL) · `free` (ShowFreeMsg) · `msgbox` (MsgBox thô) |
| `text` | **Câu app thực sự hiện**, đã render `{0}` |
| `icon` | ✕ đỏ / ⚠ vàng / ⓘ xanh / ？ hỏi / `？ hỏi + ⚠ vàng` / không icon |
| `buttons` | Bộ nút. Nhãn theo NGÔN NGỮ WINDOWS của máy (OK/Cancel, không phải はい/いいえ) |
| `default` | `ButtonN (khai rõ)` khi chỗ gọi truyền `MessageBoxDefaultButton`; không thì `Button1 (ngầm)` |
| `screen` `method` `file` `line` | Chỗ gọi |
| `func` `code` `para` | Hàm, mã MSGTBL, tham số |

## Hai điều phải nhớ khi dùng

1. **Icon do CHỖ GỌI quyết định, không do mã.** Cùng một mã đỏ ở màn này, vàng ở màn
   khác — `E00002` ở `frm203002.cs:2205` đi qua `ShowWarningMsg` nên ra ⚠ vàng.
2. **`code` rỗng nghĩa là CỐ Ý**: `Show*Msg("", "câu…")` — getMsg không tra được row nào
   nên tham số trở thành cả câu (MsgDialog.cs:207). Không phải chỗ hỏng.

## Độ tin cậy

12 hộp thoại đã **đo thật** trên `ochacom-win` (ảnh chụp + phân loại icon theo màu) so
với bảng này → **12/12 khớp**.
