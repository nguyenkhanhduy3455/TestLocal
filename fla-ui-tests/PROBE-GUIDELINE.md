# Dò hành vi trước, viết assert sau

Cách làm việc bắt buộc khi viết test UI cho app WinForm (`fla-ui-tests`), chốt ngày
**2026-08-25** sau một buổi làm sai cách và mất khoảng một giờ vì nó.

> **Luật:** khi chưa biết app thật hành xử ra sao thì **CHỤP MÀN HÌNH → ĐỌC ẢNH →
> biết đang ở trạng thái nào, cần bấm gì → RỒI mới ghi kết quả thành testcase.**
>
> KHÔNG viết assert theo phỏng đoán rồi chạy cả fixture để xem nó đỏ ở đâu.

---

## 1. Vì sao

Một vòng “sửa assert → chạy cả fixture → đợi → đọc thông điệp lỗi → đoán tiếp” tốn
**~3 phút**, và trả lời được đúng **một** câu hỏi. Buổi 2026-08-25 mất 6 vòng như vậy
cho luồng `Tests/TreatmentGrid`, trong đó:

| Vòng | Kết luận rút ra | Đáng lẽ mất bao lâu |
|---|---|---|
| 1 | `Headers()` trả rỗng | 1 lần đọc cây UIA |
| 2 | Dòng cuối lưới là 日計行, không phải dòng trống | 1 tấm ảnh |
| 3 | Click nhầm dòng tiêu đề của lưới 個別 | 1 tấm ảnh |
| 4 | `FirstDifference` so nhầm vì lưới cuộn | 1 tấm ảnh |
| 5 | Đếm theo tên cũng sai vì lưới cuộn | 1 tấm ảnh |
| 6 | Hộp thoại 「保存しますか？」 đang chắn lưới | 1 tấm ảnh |

**Cả sáu đều nhìn ảnh là ra.** Và ảnh thì `UiTestBase.TearDown` đã tự chụp sẵn từ
đầu — chỉ là không ai mở ra xem.

Điều nguy hiểm hơn tốc độ: thông điệp lỗi của assert **đổ oan cho WinForm**. Vòng 6
báo 「Tab đã dời con trỏ 「Yes」 → 「No」」 nghe như WinForm sai, trong khi sự thật là Tab
chưa bao giờ tới được lưới vì có hộp thoại chắn. Đọc log mà không xem ảnh thì đi sửa
đúng chỗ không hỏng.

---

## 2. Vòng làm việc đúng

```
1. Có artifact cũ chưa?   → MỞ RA XEM TRƯỚC, đừng chạy lại.
2. Chưa có / chưa đủ      → chạy PROBE (không assert), một lần dò NHIỀU bước.
3. Đọc ảnh + cây UIA      → chốt hành vi thật.
4. BIẾT CHẮC rồi          → mới viết assert.
```

### Bước 1 — luôn xem artifact đã có

Sau **mỗi** testcase (xanh lẫn đỏ) framework đã chụp toàn màn hình; testcase đỏ còn
được đổ thêm cây UIA:

```
bin\Debug\net8.0-windows\artifacts\screenshots\
    02_Tc2_..._Failed_111928.png        ← ảnh toàn màn hình lúc lỗi
    02_Tc2_..._Failed_111929.uia.txt    ← cây UIA lúc lỗi
    Tc2_.../ _trace.log                 ← nhật ký + ảnh TỪNG BƯỚC (TestTrace)
```

`_trace.log` rỗng (chỉ có dòng bắt đầu/kết thúc) là một tín hiệu: testcase chết
**trước** bước `trace.Do` đầu tiên — tức là hỏng ở phần chuẩn bị, không phải ở thao
tác đang đo.

### Bước 2 — probe, không assert

Fixture probe mang `[Explicit]` (không chạy trong lần chạy đủ), đi từng bước, **không
bao giờ ném**, và in ra đủ để biết hỏng ở đâu — khuôn mẫu có sẵn ở
`Tests/KarteAutoCalc/KarteAutoCalcTests.Tc0` và `Tests/InpP23Parity/InpP23Tests.Tc0`.

Nguyên tắc của một probe:
- chụp ảnh **sau mỗi bước**, không chỉ một ảnh cuối;
- bắt hết ngoại lệ, ghi lại rồi đi tiếp — một lần chạy phải ra đủ bức tranh;
- in các dòng `=== KQ-n ===` cho từng câu hỏi, runner tự lọc ra file;
- giữ app mở (`app.attachIfRunning = true`) để lượt sau bỏ được ~30s khởi động.

### Bước 3 — chỉ assert cái đã đo

Đo được rồi thì assert **con số/hành vi thật**, và trong thông điệp assert phải dẫn
nguồn WinForm (`file:dòng`) — người đọc log sau này cần biết “đúng” là đúng theo cái
gì.

---

## 3. Bảy cái bẫy đã trả giá (đừng vấp lại)

### 3.1 UIA chỉ phơi ra dòng ĐANG NHÌN THẤY

Với `DataGridView`, cầu MSAA→UIA **không** dựng phần tử cho dòng ngoài khung nhìn.
Hệ quả: mọi mốc dựa trên *tập dòng đọc được* đều trôi theo vị trí cuộn.

Đã thử và hỏng **cả ba**:
- so hai lượt chụp theo chỉ số → “khác nhau” ngay từ index 0;
- đếm tổng số dòng → đổi theo vị trí cuộn, không theo dữ liệu;
- đếm số dòng cùng tên → dòng mới hiện ra thì dòng cũ trôi khỏi khung nhìn, tổng đứng yên.

**Cách đúng:** mốc vào thứ **nằm ngoài lưới** — `lbAllPoint` (合計点数), `lbDays`.
Chèn một 処置 59 点 thì 合計 phải tăng đúng 59; cuộn kiểu gì cũng không ảnh hưởng.

### 3.2 Dòng tiêu đề của lưới lọt vào danh sách dữ liệu

Cây UIA thật của `grdRegi` (đo 2026-08-25):

```
Table id="grdRegi"
  Unknown  name="Top Row"      ← dòng tiêu đề, kiểu Unknown
    Header name="日" …          ← Header, KHÔNG phải HeaderItem
  Unknown  name="Row 1"
    DataItem name="日 Row 1" …  ← DataItem, KHÔNG phải Cell
```

`WinFormsGrid.Headers()` tìm `HeaderItem` nên trả **rỗng**, và 「Top Row」 bị đếm nhầm
thành dòng dữ liệu (báo 17 dòng trong khi lưới có 16). Lưới 個別 `hfgKobetu` cũng vậy
— `SearchByCode(...)[0]` trả về **dòng tiêu đề**, click vào đó không chèn gì.

**Cách đúng:** tự lọc dòng tiêu đề trong helper của luồng mình (xem
`Tests/TreatmentGrid/TreatmentGridOps.Headers`), và chọn dòng theo **giá trị ô ｺｰﾄﾞ**
chứ không theo chỉ số.

### 3.3 ESC trên lưới 処置 = 戻る, KHÔNG phải huỷ sửa ô

`GradientDataGridView.ProcessDialogKey` trả `false` khi
`RegularOperationEnterKeyDisable = true` (`GradientDataGridView.cs:645-668`, cờ đặt ở
`frm203002.Designer.cs:1116`) ⇒ ESC **không** được lưới xử lý, nó rơi xuống form
thành 戻る và bung 「処置データは、変更されています。保存しますか？」.

Dùng ESC để “dọn dẹp editor” là tự đóng màn hình, và mọi testcase sau đó thao tác vào
hộp thoại chứ không vào lưới.

### 3.4 Hộp thoại lạ chắn lưới thì assert đổ oan cho app

`NuisanceDialogWatcher` chỉ tự bấm 「いいえ」 cho những câu khai trong
`run.nuisanceDialogs`. Câu nào khác thì nằm lại, và ô “đang giữ con trỏ” đọc ra sẽ là
**tên nút** (`Yes` / `No`) chứ không phải tên ô.

Thấy focus ra `Yes`/`No`/`OK` ⇒ **có hộp thoại**, không phải lưới sai. Trước mỗi
testcase bàn phím nên dẹp và **ghi lại nguyên văn** hộp thoại gặp phải.

### 3.5 App còn sống thì lượt chạy từ xa treo vĩnh viễn

`MENU.exe` do test mở **kế thừa handle stdout**. Đọc stdout bằng pipeline
(`… | ForEach-Object`) thì pipeline chờ EOF, mà EOF chỉ tới khi mọi tiến trình giữ
handle đó đóng lại — kể cả app. Task treo ở `Running` dù test đã Passed từ lâu.

Và **không** chữa được bằng “kill app sau khi chạy xong”: bước kill nằm sau pipeline,
mà pipeline đang đợi chính cái app đó → deadlock.

**Cách đúng:** `Start-Process … -RedirectStandardOutput` + `WaitForExit(timeout)` —
chỉ đợi tiến trình con trực tiếp, cháu chắt sống hay chết không liên quan. Và mọi
vòng chờ phải có **deadline**, không `until` vô hạn.

### 3.6 `run.killOnSuccess` giết app giữa fixture

Cờ này nằm trong `[TearDown]` nên kill app sau **MỖI** testcase xanh — testcase thứ
hai trong fixture mất luôn cửa sổ và đỏ với 「không thấy control grdRegi」. Chỉ bật khi
fixture có đúng một testcase.

### 3.7 Log console hỏng tiếng Nhật — đọc `.trx`

PowerShell giải mã stdout của tiến trình con theo **console codepage**, không phải
UTF-8, nên 「診療入力」 ra 「診療�E劁E」 và **không khôi phục được**. Kết quả đọc từ
`TestResults\*.trx` (UTF-8 chuẩn) thì sạch.

---

## 4. Chạy từ xa (máy Mac → máy Windows)

Máy Windows có app: Tailscale `100.86.177.68`, alias SSH `ochacom-win`, repo ở
`C:\TCG\TestLocal`.

**Bẫy lớn nhất:** phiên SSH chạy ở **session 0**, desktop thật là **session 3**. Chạy
`dotnet test` thẳng qua SSH thì UIAutomation không thấy desktop — phím/chuột rơi vào
hư không, ảnh chụp ra màn hình đen. Phải đi qua Scheduled Task `FlaUI-Tests-Run`
(`LogonType: Interactive`).

```powershell
# ghi lệnh rồi kích hoạt (schtasks KHÔNG truyền được tham số)
Set-Content logs\command.txt "run-edit-treatment-rows.ps1 -Diagnostics"
schtasks /run /tn "FlaUI-Tests-Run"
```

Wrapper là `runner-task.ps1` (untracked, không commit). Kết quả đọc ở
`TestResults\treatment-grid.trx`; ảnh + cây UIA ở `artifacts\screenshots\`.

Kéo artifact về Mac bằng `scp`. Đường dẫn có `\` và tiền tố số dễ làm `scp` hiểu sai
— copy sang một tên đơn giản trên Windows trước rồi mới `scp` là chắc nhất.
