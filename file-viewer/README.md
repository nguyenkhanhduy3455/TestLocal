# Local File Viewer

Web app chạy local: nhập đường dẫn một thư mục trên PC/macOS → xem danh sách file trong thư mục đó → xem nội dung file ngay trên trình duyệt.

Không có dependency nào — chỉ cần Node.js >= 18, **không cần `npm install`**.

## Chạy

```bash
cd file-viewer
node server.js          # hoặc: npm start
```

Mở http://127.0.0.1:5173

Đổi cổng: `PORT=8080 node server.js`

## Tính năng

- **Nhập đường dẫn**: gõ đường dẫn tuyệt đối (`/Users/ban/Documents`), hỗ trợ `~`, tự bỏ dấu nháy và dấu `\ ` khi copy từ Finder/Terminal. Gõ nhầm đường dẫn file thì app mở thư mục cha và chọn sẵn file đó.
- **Duyệt thư mục**: click vào folder để vào, breadcrumb để nhảy nhanh, nút `↑ Lên`, `Home`, `⟳`. Ô lọc theo tên file, checkbox hiện/ẩn file ẩn (`.`). Đường dẫn cuối cùng được nhớ lại cho lần mở sau.
- **Xem file dạng text (giống Notepad++)**: cột số dòng cố định bên trái, font monospace, không tự xuống dòng (có toggle *Xuống dòng*). Áp dụng cho `.txt .csv .log .md .xml .yml .sql .js .ts …` và mọi đuôi lạ khác.
- **JSON**: tự động format đẹp (indent 2) + tô màu key/string/number/boolean/null. Tab `Đẹp` / `Thô` để xem bản gốc. JSON hỏng thì báo lỗi parse và hiển thị nội dung gốc.
- **Ảnh** (`.png .jpg .gif .webp .svg …`): xem trực tiếp.
- **File nhị phân**: phát hiện tự động, hiển thị hex dump; vẫn có nút "Xem dạng text" nếu muốn.
- **Bảng mã**: `Tự động` thử UTF-8 trước, không hợp lệ thì fallback Shift_JIS (hữu ích với CSV/TXT tiếng Nhật), có thể chọn tay UTF-8 / Shift_JIS / EUC-JP / Windows-1252.
- **Tìm trong file**: `Ctrl/Cmd + F`, Enter / Shift+Enter để nhảy giữa các kết quả.
- **So sánh** (nút `⇄ So sánh` trên thanh trên cùng): xem mục riêng bên dưới.
- **Copy** toàn bộ nội dung, **Tải** file về máy.
- Phím `↑` `↓` chuyển nhanh giữa các file trong danh sách. Kéo thanh dọc để đổi độ rộng sidebar.

## So sánh file / thư mục

Bấm `⇄ So sánh` (hoặc `Esc` để đóng). Nhập hai đường dẫn **cùng loại**:

- **Hai file** → diff theo dòng, hai cột cạnh nhau, có số dòng mỗi bên. Dòng khác
  nhau tô vàng, dòng chỉ có bên trái tô đỏ, chỉ có bên phải tô xanh.
- **Hai thư mục** → bảng trạng thái từng file (đệ quy): `Giống` / `Khác` /
  `Chỉ bên trái` / `Chỉ bên phải`. Bấm vào một dòng có đủ hai bên là mở luôn diff
  của cặp file đó.

### Hai kết luận, đọc riêng

Đây là điểm quan trọng nhất khi so bản xuất của WinForm với bản web:

| Kết luận | Nghĩa |
| --- | --- |
| ✅ Giống nhau từng byte | hai file y hệt nhau |
| 🟡 Nội dung giống nhau, chỉ khác cách lưu | decode ra chữ giống nhau, nhưng khác **bảng mã** (Shift_JIS ↔ UTF-8) và/hoặc khác **xuống dòng** (CRLF ↔ LF) |
| ❌ Nội dung khác nhau | dữ liệu thật sự lệch |

File tiếng Nhật do WinForm xuất thường là **Shift_JIS**. Để bảng mã ở `Tự động`
là đọc đúng; muốn chốt cứng thì chọn `Shift_JIS`. Bảng mã áp cho **cả hai bên**.

Gộp hai kết luận này làm một sẽ báo "khác nhau" cho một khác biệt vô hại và đẩy
người đọc đi dò tay lại từ đầu — nên chúng được tách bạch.

### Thuật toán

Diff dùng **LCS** khi mỗi bên ≤ 3000 dòng (bắt được chèn/xoá dòng). Dài hơn thì
rơi về so **theo vị trí dòng** — kém thông minh hơn nhưng không treo máy; kết quả
ghi rõ đang dùng kiểu nào. So thư mục dừng ở 5000 mục mỗi bên.

## Giới hạn (cố ý, để trình duyệt không treo)

| Giới hạn | Giá trị |
| --- | --- |
| Đọc mặc định | 2 MB đầu file (có nút *Tải thêm*) |
| Đọc tối đa | 8 MB |
| Hiển thị tối đa | 100.000 dòng |
| Highlight tìm kiếm tối đa | 5.000 kết quả |

## Bảo mật

App **cố ý** đọc mọi đường dẫn người dùng nhập — đó chính là tính năng. Vì vậy server chỉ bind vào `127.0.0.1`, không nhận kết nối từ máy khác, và chỉ chấp nhận request `GET`. Đừng expose nó ra ngoài mạng (không đổi `HOST`, không đặt sau reverse proxy public).

## API

| Endpoint | Mô tả |
| --- | --- |
| `GET /api/home` | home dir, cwd, platform |
| `GET /api/list?path=` | danh sách entry trong thư mục (folder xếp trước, sort tự nhiên) |
| `GET /api/file?path=&encoding=&full=1&force=1` | nội dung file đã decode + metadata |
| `GET /api/raw?path=` | stream nguyên bản (dùng cho ảnh) |
| `GET /api/download?path=` | tải file về |
| `GET /api/compare?left=&right=&encoding=` | so hai file (diff dòng) hoặc hai thư mục (bảng trạng thái) |
