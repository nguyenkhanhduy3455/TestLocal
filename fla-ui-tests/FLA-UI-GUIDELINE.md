# FLA-UI-GUIDELINE — luật viết & chạy test cho app WinForm

Gom về một chỗ mọi luật liên quan tới `fla-ui-tests/`, trước nay nằm rải ở
[`PROBE-GUIDELINE.md`](./PROBE-GUIDELINE.md), [`README.md`](./README.md),
[`../README.md`](../README.md) mục 6, và các README của từng luồng trong
`src/OchaCom.FlaUiTests/Tests/*/`.

Đánh số **F1–F24** để không lẫn với Rule 1–23 của bên Playwright
(`../web-tenant-tests/GUIDELINE.md`). Luật bên đó nói về trình duyệt; luật ở đây nói về
UIAutomation, Win32 và một app desktop chạy trên máy khác.

> **Ba luật bao trùm, đọc lại mỗi khi định "thử một phát xem sao":**
>
> **F1** — chưa biết app hành xử ra sao thì **chụp ảnh → đọc ảnh → rồi mới viết assert**.
> **F2** — mọi vòng chờ phải có **deadline NGẮN**; hết giờ thì **chụp ảnh, đọc, rồi mới chạy lại**.
> **F3** — nguồn chân lý là **WinForm**, và mỗi assert phải dẫn được `file:dòng`.

---

## Mục lục

| # | Luật | Nhóm |
|---|---|---|
| F1 | Probe trước, assert sau | Cách làm việc |
| F2 | Timeout NGẮN — hết giờ thì chụp ảnh, phân tích, rồi mới chạy lại | Cách làm việc |
| F3 | Assert bám WinForm, dẫn `file:dòng` | Cách làm việc |
| F4 | Đổi MỘT thứ mỗi lượt chạy | Cách làm việc |
| F5 | Phiên SSH ở session 0 — phải đi qua Scheduled Task | Chạy từ xa |
| F6 | Poll ngắn, đừng để một lệnh chờ 15 phút | Chạy từ xa |
| F7 | Trần 15 phút của wrapper — thiết kế quanh nó, chạy từng lô | Chạy từ xa |
| F8 | Đừng trigger khi lượt trước chưa `END`; dọn tiến trình treo trước khi build | Chạy từ xa |
| F9 | Log console hỏng tiếng Nhật — đọc `.trx` | Chạy từ xa |
| F10 | UIA chỉ phơi ra dòng ĐANG NHÌN THẤY | Lưới |
| F11 | Dòng tiêu đề lọt vào danh sách dữ liệu | Lưới |
| F12 | Mốc phải nằm NGOÀI lưới | Lưới |
| F13 | Gõ phím, đừng `SetValue` | Bàn phím |
| F14 | ESC trên lưới 処置 = 戻る, không phải huỷ sửa ô | Bàn phím |
| F15 | Phím F rơi vào NHẦM FORM khi có dialog chồng lên | Bàn phím |
| F16 | Nhãn nút MessageBox theo NGÔN NGỮ WINDOWS | Hộp thoại |
| F17 | Bắt hộp thoại bằng Win32, đừng chỉ tin UIA | Hộp thoại |
| F18 | Bấm nút hộp thoại bằng `PostMessage`, đừng bằng `InvokePattern` | Hộp thoại |
| F19 | Hộp thoại lạ chắn màn hình thì assert đổ oan cho app | Hộp thoại |
| F20 | Ghi DB nằm sau cờ RIÊNG của luồng; chụp — in ra — trả lại | Dữ liệu |
| F21 | Đường ghi lúc NHẬP đọc bộ nhớ phiên chạy — seed thẳng DB là vô hiệu | Dữ liệu |
| F22 | Dọn hai tầng, và tầng thứ hai phải có hàng rào | Dữ liệu |
| F23 | Locator sửa ở `testsettings`, không sửa code | Cấu trúc |
| F24 | `run.killOnSuccess` giết app giữa fixture | Cấu trúc |

---

## Cách làm việc

### F1 — Probe trước, assert sau

Chưa biết app thật hành xử ra sao thì **chụp màn hình → đọc ảnh → biết đang ở trạng thái
nào, cần bấm gì → RỒI mới ghi kết quả thành testcase.** KHÔNG viết assert theo phỏng đoán
rồi chạy cả fixture để xem nó đỏ ở đâu.

Vòng "sửa assert → chạy cả fixture → đợi → đọc thông điệp lỗi → đoán tiếp" tốn **~3 phút**
và trả lời được đúng **một** câu hỏi. Buổi 2026-08-25 mất 6 vòng như vậy — **cả sáu đều
nhìn ảnh là ra**, và ảnh thì `UiTestBase.TearDown` đã tự chụp sẵn từ đầu.

Vòng làm việc đúng:

```
1. Có artifact cũ chưa?   → MỞ RA XEM TRƯỚC, đừng chạy lại.
2. Chưa có / chưa đủ      → chạy PROBE (không assert), một lần dò NHIỀU bước.
3. Đọc ảnh + cây UIA      → chốt hành vi thật.
4. BIẾT CHẮC rồi          → mới viết assert.
```

Nguyên tắc của một probe: mang `[Explicit]`, chụp ảnh **sau mỗi bước** (không chỉ một ảnh
cuối), **không bao giờ ném** (bắt hết ngoại lệ, ghi lại rồi đi tiếp), in các dòng
`=== KQ-n ===` cho từng câu hỏi. Khuôn mẫu: `Tests/KarteAutoCalc/KarteAutoCalcTests.Tc0`,
`Tests/InpP23Parity/InpP23Tests.Tc0`, `Tests/SigaToothStatus/SigaToothProbeTests`.

`_trace.log` rỗng (chỉ có dòng bắt đầu/kết thúc) là một tín hiệu: testcase chết **trước**
bước `trace.Do` đầu tiên — hỏng ở phần chuẩn bị, không phải ở thao tác đang đo.

### F2 — Timeout NGẮN. Hết giờ thì CHỤP ẢNH, PHÂN TÍCH, rồi mới chạy lại

Đây là luật đắt nhất của cả bộ: **một vòng chờ dài không cho thêm thông tin nào, nó chỉ
đổi 5 giây thành 15 phút.**

**Đặt deadline theo cái mình đang đợi, và đặt NGẮN.**

| Đang đợi gì | Deadline hợp lý |
|---|---|
| Hộp thoại bung ra sau một cú bấm | 6–10s |
| Hộp thoại mình tin là **KHÔNG** tồn tại (đang đo xem nó có không) | 5–8s — cố ý ngắn |
| Cửa sổ đóng lại | 10–15s |
| Lưới nạp xong sau khi mở màn | 20–30s |
| Cả một testcase | `[CancelAfter]` ≤ 900s, và luôn nhỏ hơn trần wrapper |

Chờ 90s một hộp thoại "đáng lẽ phải có ngay" chỉ để cuối cùng biết là nó không có — đó là
89 giây mua bằng không có gì.

**Hết giờ thì làm ĐÚNG BA việc, theo thứ tự:**

1. **Chụp/lấy ảnh ngay tại thời điểm treo.** `TestTrace` đã chụp sau mỗi bước; `TearDown`
   chụp thêm một ảnh toàn màn hình + đổ cây UIA khi đỏ. Đang treo giữa chừng thì kéo ảnh
   mới nhất trong `artifacts\screenshots\<tên test>\` về xem.
2. **ĐỌC ảnh, đừng đọc mỗi log.** Ảnh nói ngay: đang có hộp thoại chắn? đang ở form nào?
   nút thật tên gì? Thông điệp timeout thì hầu như luôn **đổ oan cho app**.
3. **Sửa đúng chỗ vừa nhìn thấy, rồi mới chạy lại.** Chạy lại y nguyên để "xem có phải
   chập chờn không" là đốt thêm một lượt để biết đúng thứ mình đã biết.

Và **đừng ngồi đợi hết trần**: thấy log đứng yên quá lâu so với nhịp bình thường của bước
đó thì kill lượt chạy (`Stop-Process -Name MENU,dotnet,testhost*`), lấy ảnh, phân tích.
Wrapper cắt lúc 15 phút, nhưng không ai bắt phải chờ tới đó.

> 🔥 **Đã trả giá 2026-09-08, hai lượt liền:**
>
> · `TcGAP12` — app ném `Invalid column name 'NKon4'`, hộp thoại Continue/Quit chồng lên
> 処置選択 vẫn đang mở. Testcase đi tiếp vào F9, cú bấm rơi vào nút 「F9 確定」 của **chính
> 処置選択**, rồi đợi hộp 「保存しますか」 suốt **90s** trước khi ném `TimeoutException`. Ảnh
> chụp sẵn ở bước ngay trước đó cho thấy trọn vẹn cả hai cửa sổ — **nhìn một cái là ra**.
>
> · `TcGAP13` — treo **vô hạn** ở cú bấm hộp 「病名が選択されていません」 (xem F18). Log dừng
> đúng ở dòng 「→ tra loi はい」 rồi im tới khi wrapper cắt, nhìn y như app không phản hồi.
> Ảnh màn hình cho thấy app hoàn toàn khoẻ, hộp thoại vẫn mở, nút thật là **OK/Cancel**.

### F3 — Assert bám WinForm, và dẫn được `file:dòng`

Hành vi đúng là hành vi của **WinForm** (`userapp/src/OCHACOM`), không phải của code web.
Đo được rồi thì assert **con số/hành vi thật**, và trong thông điệp assert phải dẫn nguồn
(`modSave.cs:770-808`, `frm203016.cs:1047`…) — người đọc log sau này cần biết "đúng" là
đúng theo cái gì.

Thông điệp assert nên nói luôn **đỏ ở đây nghĩa là gì**: "harness hỏng, sửa trước" khác hẳn
"app thiếu chức năng", và nhầm hai thứ đó là nguồn gốc của mọi lần đổ oan.

Khi WinForm có bug thật và ta cố ý port theo, **ghi rõ vào assert** kèm số hiệu hồ sơ
(`inp-p0-open-issues.md` ISSUE-…), kèm câu 「⛔ đừng sửa assert này」. Không có dòng đó thì
người sau sẽ "sửa" nó cho hợp trực giác.

### F4 — Đổi MỘT thứ mỗi lượt chạy

Một lượt chạy không chứng minh gì. Đổi hai thứ rồi xanh thì không biết thứ nào đã cứu.

---

## Chạy từ xa (Mac → máy Windows)

Máy Windows có app: Tailscale `100.86.177.68`, alias SSH `ochacom-win`, repo ở
`C:\TCG\TestLocal`.

### F5 — Phiên SSH ở session 0, desktop thật ở session khác

Chạy `dotnet test` thẳng qua SSH thì UIAutomation **không thấy desktop** — phím/chuột rơi
vào hư không, ảnh chụp ra màn hình đen. Phải đi qua Scheduled Task `FlaUI-Tests-Run`
(`LogonType: Interactive`).

```powershell
# schtasks KHONG truyen duoc tham so -> ghi lenh vao file roi kich hoat
Set-Content logs\command.txt "run-change-tooth-status.ps1 -AllowSave -Case TcGAP10"
schtasks /run /tn "FlaUI-Tests-Run"
```

Wrapper là `runner-task.ps1` (untracked, không commit). Đầu mỗi lượt nó in `SessionId`,
`qwinsta console` và một ảnh desktop vào `logs\` — kiểm ba dòng đó trước khi tin bất cứ
kết quả nào.

Điều kiện của máy: **màn hình thật đang mở** (khoá màn hình / RDP thu nhỏ ⇒ hỏng), và
**không đụng chuột/bàn phím** trong lúc chạy.

### F6 — Poll ngắn, đừng để một lệnh chờ 15 phút

Đừng chạy một lệnh chờ đồng bộ suốt lượt test. Poll `logs\runner.log` / `_trace.log` theo
nhịp ngắn — vừa biết đang tới bước nào, vừa bắt được lúc nó đứng yên (F2).

Và **đừng đọc stdout bằng pipeline**: `MENU.exe` do test mở **kế thừa handle stdout**, nên
`… | ForEach-Object` sẽ chờ EOF mãi mãi — task treo ở `Running` dù test đã Passed từ lâu.
Không chữa được bằng "kill app sau khi chạy xong": bước kill nằm sau pipeline, mà pipeline
đang đợi chính cái app đó → deadlock. Cách đúng: `Start-Process … -RedirectStandardOutput`
+ `WaitForExit(timeout)`.

### F7 — Trần 15 phút của wrapper là giới hạn CỨNG

Một vòng 「Insert → 部位選択 → 病名選択 → gõ mã → 処置選択」 tốn **2–3 phút** trên máy thật;
thêm F9 登録 thì mỗi lần ~35s và mở lại màn hình ~20s. Vì thế:

- mỗi testcase **tối đa hai vòng giao diện**;
- luôn chạy bằng `-Case` / `-Filter`, **không bao giờ chạy cả fixture một lượt**;
- fixture dài thì chia lô, ghi sẵn danh sách lô vào README của luồng.

> 🔥 **2026-09-03:** một probe gộp 4 vòng đã vượt trần. Wrapper **không kịp ghi cả dòng
> `TIMEOUT`/`END`**, `MENU.exe` + 4 tiến trình `dotnet` ở lại, máy Windows phải khởi động
> lại.

### F8 — Đừng trigger khi lượt trước chưa `END`; dọn tiến trình treo trước khi build

`schtasks /run` khi task đang chạy chỉ in `INFO: … is currently running` rồi **không làm
gì** — kiểm dòng cuối `logs\runner.log` trước.

Và sau khi kill một lượt treo, `dotnet`/`testhost` còn sống sẽ **giữ file DLL**:

```
error MSB3021: Unable to copy file … because it is being used by another process.
```

Dọn trước rồi mới build: `Get-Process dotnet,testhost*,MENU | Stop-Process -Force`.

### F9 — Log console hỏng tiếng Nhật, đọc `.trx`

PowerShell giải mã stdout của tiến trình con theo **console codepage**, không phải UTF-8,
nên 「診療入力」 ra 「診療�E劁E」 và **không khôi phục được**. Kết quả đọc từ
`TestResults\*.trx` (UTF-8 chuẩn) thì sạch. Cùng lý do: đừng assert trên chuỗi lấy từ
stdout đã méo — đọc thẳng từ app hoặc từ DB.

---

## Lưới `DataGridView`

### F10 — UIA chỉ phơi ra dòng ĐANG NHÌN THẤY

Với `DataGridView`, cầu MSAA→UIA **không** dựng phần tử cho dòng ngoài khung nhìn. Hệ quả:
mọi mốc dựa trên *tập dòng đọc được* đều trôi theo vị trí cuộn. Đã thử và hỏng **cả ba**:
so hai lượt chụp theo chỉ số; đếm tổng số dòng; đếm số dòng cùng tên.

### F11 — Dòng tiêu đề lọt vào danh sách dữ liệu

Cây UIA thật của `grdRegi`:

```
Table id="grdRegi"
  Unknown  name="Top Row"      ← dòng tiêu đề, kiểu Unknown
    Header name="日" …          ← Header, KHÔNG phải HeaderItem
  Unknown  name="Row 1"
    DataItem name="日 Row 1" …  ← DataItem, KHÔNG phải Cell
```

`WinFormsGrid.Headers()` tìm `HeaderItem` nên trả **rỗng**, và 「Top Row」 bị đếm nhầm thành
dòng dữ liệu. Lưới 個別 `hfgKobetu` cũng vậy — `SearchByCode(...)[0]` trả về **dòng tiêu
đề**, click vào đó không chèn gì. Tự lọc dòng tiêu đề trong helper của luồng mình
(`Tests/TreatmentGrid/TreatmentGridOps.Headers`), và chọn dòng theo **giá trị ô** chứ không
theo chỉ số.

### F12 — Mốc phải nằm NGOÀI lưới

Mốc vào thứ không trôi theo cuộn: `lbAllPoint` (合計点数), `lbDays`, hoặc **hỏi thẳng DB**.
Chèn một 処置 59 点 thì 合計 phải tăng đúng 59; cuộn kiểu gì cũng không ảnh hưởng.

Hỏi DB còn tránh được một cái bẫy nữa: sau một thao tác **chưa lưu**, lưới đang vẽ trạng
thái **trong bộ nhớ**, không phải trạng thái DB. Kết luận 「dòng đã mất khỏi DB」 từ cái lưới
đó là đỏ oan (đã vấp ở `TcGAP6`, 2026-09-03).

---

## Bàn phím & tiêu điểm

### F13 — Gõ phím, đừng `SetValue`

`ValuePattern.SetValue` nhét thẳng giá trị vào control mà **không sinh** `KeyDown`/
`KeyPress` — trong khi logic của `frm203002` treo đúng ở đó (`txtKobeSearchCode_KeyDown`
chuyển focus khi Enter, `CustomTextBox` lọc ký tự).

Cùng họ: nút tự vẽ (`GradientButton`) và các pane của menu chính không có `InvokePattern` —
phải **click chuột thật** (`Uia.MouseClick`), `Uia.Click` sẽ "thành công" mà chẳng có gì
xảy ra.

Và một số ô chỉ chốt giá trị khi **rời tiêu điểm**: 診療日 chỉ cập nhật `SelDate` ở
`CustomDate_Leave` — gõ xong phải dời focus rồi mới đọc.

### F14 — ESC trên lưới 処置 = 戻る, không phải huỷ sửa ô

`GradientDataGridView.ProcessDialogKey` trả `false` khi `RegularOperationEnterKeyDisable =
true` (`GradientDataGridView.cs:645-668`) ⇒ ESC **không** được lưới xử lý, nó rơi xuống form
thành 戻る và bung 「処置データは、変更されています。保存しますか？」. Dùng ESC để "dọn dẹp
editor" là tự đóng màn hình.

### F15 — Phím F rơi vào NHẦM FORM

`F9`, `F10`, `End`… gửi bằng phím sẽ tới **form đang giữ tiêu điểm**, mà đó chưa chắc là
form mình nhắm: 処置選択 / 病名選択 / một hộp thoại lỗi đều có nút F-số của riêng chúng.
Cách chắc: **bấm thẳng nút của form cần nhắm** (`btnF9` của `frm203002`), và trước khi bấm
thì kiểm không còn cửa sổ nào chồng lên.

> Đã trả giá 2026-09-08 (`TcGAP12`): 処置選択 còn mở dưới hộp thoại lỗi, cú F9 rơi vào
> 「F9 確定」 của picker, rồi chờ 「保存しますか」 90s. Gác đúng: thấy có hộp thoại lạ/ném thì
> **DỪNG HẲN**, `DismissAll`, đừng đi tiếp — và đừng gác bằng cờ `Committed`, vì cú ném xảy
> ra SAU khi picker đã nhận double-click nên cờ đó vẫn về `true`.

---

## Hộp thoại

### F16 — Nhãn nút theo NGÔN NGỮ WINDOWS, không theo ngôn ngữ app

App tiếng Nhật, nhưng `MessageBox` là của Windows: trên máy test nút hiện ra là
**`Yes` / `No` / `OK` / `Cancel`**, không phải はい/いいえ. Luôn truyền **đủ bộ đồng nghĩa
của CHÍNH nhánh mình muốn**:

```csharp
string[] wanted = accept ? ["はい", "Yes", "OK"] : ["いいえ", "No", "Cancel"];
```

⚠️ **Đừng để `OK` làm fallback chung cho cả hai nhánh** — trả lời 「いいえ」 mà bấm trúng OK
là đáp **ngược ý**, và không có dấu hiệu gì cả. (Lỗi thật, sửa 2026-09-08 ở
`SigaToothFlow.ConfirmDiseaseDialog`.)

Và **nút MẶC ĐỊNH** thì UIA không phơi ra — nhưng Win32 giao con trỏ cho nó, nên đọc
`FocusedElement()` **ngay khi hộp thoại vừa mở** là biết. Đo được: 既存会計 → `No`
(Button2), 会計データ修正 → `Yes` (Button1) — hai hộp ngược nhau có chủ ý.

### F17 — Bắt hộp thoại bằng Win32, đừng chỉ tin UIA

`Dialogs.Open` (đường UIA) **có lúc mù hẳn**. Dùng `MsgBoxWin32.All(processId)` — nó
`EnumWindows` theo lớp `#32770`, thấy được cả hộp thoại shell. Luôn **ghi lại nguyên văn**
hộp thoại gặp phải vào trace, kể cả khi đã dẹp được nó.

### F18 — Bấm nút bằng `PostMessage`, đừng bằng `InvokePattern`

`Uia.Click` gọi `IUIAutomationInvokePattern::Invoke` — **đồng bộ**. Với một `MessageBox`
modal nằm **trong** một form modal (vd 病名選択), cú gọi đó có thể **không bao giờ trả về**:
luồng test đứng ngay tại dòng click, nên **mọi deadline bên dưới đều vô dụng**.

`MsgBoxWin32.ClickButton(hwnd, captions)` dùng `PostMessage(BM_CLICK)` ⇒ **trả về ngay**,
không phụ thuộc app đang bận gì. Lấy `hwnd` từ `window.Properties.NativeWindowHandle`.
Bấm không trúng thì in `MsgBoxWin32.ButtonCaptions(hwnd)` ra trace — đó chính là câu trả
lời cho "nút thật tên gì".

> Đã treo thật 2026-09-08 (`TcGAP13`): log dừng đúng ở dòng 「→ tra loi はい」 rồi im tới khi
> wrapper cắt. App hoàn toàn khoẻ; nó chỉ đang đợi ai đó bấm nút.

### F19 — Hộp thoại lạ chắn màn hình thì assert đổ oan cho app

`NuisanceDialogWatcher` chỉ tự bấm cho những câu khai trong `run.nuisanceDialogs`. Câu khác
thì nằm lại, và ô "đang giữ con trỏ" đọc ra sẽ là **tên nút** (`Yes`/`No`/`OK`) chứ không
phải tên ô. Thấy focus ra `Yes`/`No`/`OK` ⇒ **có hộp thoại**, không phải lưới sai.

Trường hợp riêng đáng nhớ: hộp .NET 「Unhandled exception has occurred」 có nút
**Continue / Quit** — không khớp bất kỳ bộ はい/いいえ/OK nào, nên mọi vòng "dẹp hộp thoại"
thông thường sẽ **quay vô hạn**. `SigaToothFlow` nay bắt `CrashDialogFragment`, bấm
`Continue` và **dừng vòng lặp ngay**.

---

## Dữ liệu & DB

### F20 — Ghi DB nằm sau cờ RIÊNG của luồng; chụp — in ra — trả lại

Mỗi luồng có cờ riêng, **không dùng chung** `parity.allowSave`: hai luồng ghi vào những
bảng khác hẳn nhau về mức rủi ro (`TRNTRN`/`ACC_DAT` là 処置行 và sổ tiền; `SIGA`/`KON` là
歯式). Mặc định **tắt** ⇒ fixture tự `Ignore` **trước khi mở app**.

Bắt buộc ba việc: **chụp** nguyên trạng, **IN RA STDOUT** (bị Ctrl+C giữa chừng thì còn
dựng lại bằng tay), **trả lại** ở `OneTimeTearDown`.

⚠️ Chụp nguyên trạng phải **trước** khi đặt mốc. Chụp sau là chụp phải chính cái mốc mình
vừa ghi đè, và teardown sẽ "khôi phục" về mốc chứ không về nguyên trạng (đã mất dữ liệu
thật của bệnh nhân test một lần, 2026-09-03).

⚠️ Mốc mà app giữ **trong bộ nhớ** (`pSiga_old`, `pKon_old`) chỉ nạp **một lần lúc mở màn**.
Muốn đặt mốc thì phải ghi **TRƯỚC KHI APP MỞ** — `UiTestBase.PrepareDataBeforeApp` sinh ra
đúng cho việc đó. Ghi sau khi màn hình đã mở thì app không bao giờ thấy.

Và seed đổi nhiều cột thì **cần seed ĐỐI CHỨNG** — không có nó thì quan sát không thành
kết luận.

### F21 — Đường ghi lúc NHẬP đọc bộ nhớ phiên chạy, seed thẳng DB là vô hiệu

Nhiều đường ghi của WinForm chạy **ngay lúc nhập**, và chúng đọc trạng thái **trong bộ nhớ**
(`ModCommon.pbui`, `ModCommon.pHoumon`…), nạp từ dòng đang có con trỏ. Dòng seed thẳng vào
DB **không bao giờ đi qua** `IregCodChk`, nên cả nhánh đó biến mất.

⇒ Muốn đo đường nhập thì phải **đi trọn đường giao diện**: Insert → 部位選択 → 病名選択 →
gõ mã → 処置選択. Đây là chỗ **khác** bản Playwright (bên đó seed DB được, vì bản web suy
mọi thứ từ dữ liệu) — và cũng là chỗ chính spec bên kia từng vấp và đỏ oan.

Ngược lại, đường **F9** thì dựng lại từ **tập 処置 đã lưu**, nên muốn chứng minh "F9 có ghi
thật" phải **xoá dấu vết của đường nhập sau lưng app** (ghi thẳng DB) rồi mới bấm F9 — nếu
không, giá trị đúng sau F9 có hai cách giải thích và testcase không phân biệt được.

### F22 — Dọn hai tầng, tầng thứ hai phải có hàng rào

Tầng 1: xoá theo mã 処置 mình seed. Tầng 2: xoá mọi dòng **không có trong ảnh chụp đầu
lượt** — cần vì một lượt nhập 抜歯 làm app **tự chèn thêm** dòng 麻酔 và 部位病名行, những
thứ đó ở lại sau F9 và dồn dần cho tới khi lưới dài ra và `InsertBlankRow` bắt đầu hụt
(`TcGAP3` từng đỏ vì HARNESS chứ không vì app).

Ảnh chụp phải khoá theo `ngày|disp_no|trt_cd|trt_sb`, **không theo `seq`**: F9 xoá sạch rồi
chèn lại nên mọi `seq` đều mới, còn `disp_no` thì WinForm giữ nguyên cho dòng cũ.

Hàng rào của tầng 2: chỉ chạy khi tháng test **không có sẵn** dòng mang các mã đem thử
trước lượt chạy (`sigaTooth.allowRowCleanup`).

> SQL Server của app chạy trong container **`OCHASQLEXPRESS` trên chính máy Mac** — tắt nó
> là mọi test FlaUI chết ngay ở `ProbeError()`.

---

## Cấu trúc & cấu hình

### F23 — Locator sửa ở `testsettings`, không sửa code

Bộ test bám control theo **AutomationId** (WinForms lấy từ `Control.Name`). Lệch thì chạy
`-Diagnostics` để đổ cây UIA thật ra `artifacts\*.txt`, rồi sửa mục `locators` trong
`testsettings.json`.

Ô `DataGridView`: giá trị nằm ở `LegacyIAccessible.Value`, còn `Name` của ô là chuỗi mô tả
có kèm **tên cột** — bản đổ in ra cả hai để so.

⚠️ Hàm đọc UI hay **làm phẳng chuỗi**; assert "nguyên văn" trên bản đã phẳng là **xanh
giả**. Cần nguyên văn thì đọc nguyên văn.

### F24 — `run.killOnSuccess` giết app giữa fixture

Cờ này nằm trong `[TearDown]` nên kill app sau **MỖI** testcase xanh — testcase thứ hai
trong fixture mất luôn cửa sổ và đỏ với 「không thấy control grdRegi」. Chỉ bật khi fixture
có đúng một testcase.

Liên quan: `app.attachIfRunning = true` giúp lượt sau bỏ được ~30s khởi động, nhưng nếu còn
`MENU.exe` cũ **đang ở trạng thái lệch** thì lượt sau bám vào đúng cái đó ⇒ đỏ rất khó đoán.
`runner-task.ps1` vì thế kill `MENU.exe` **cả trước lẫn sau** mỗi lượt.

---

## Quy ước đặt tên & tổ chức

- Một luồng có tiền đề riêng / rủi ro riêng thì để trong **thư mục con của `Tests/`** cùng
  helper của chính nó, kèm **README** và **runner riêng** — đọc thư mục là biết luồng gồm
  những gì và chạy bằng cách nào.
- Runner đặt tên theo **việc mà WinForm làm**: `run-<động từ>-<đối tượng>.ps1`
  (`run-change-tooth-status.ps1`), không phải theo tên thư mục test.
- Cặp parity đặt **cùng tên thư mục** với bên `web-tenant-tests/tests/`, và mỗi testcase ghi
  rõ nó ứng với `TC-…` nào bên kia (bảng tương ứng ở đầu file fixture).
- README của mỗi luồng có mục **「Đo được trên máy thật」** — điền sau **mỗi** lượt chạy, kèm
  ngày, bệnh nhân, 診療月 và số đo nguyên văn. Đó là bộ nhớ của luồng; để trống là lần sau
  đo lại từ đầu.
- Gộp spec **theo dialog**, không theo màn hình — gom folder không thay được việc gộp file.

---

## Trước khi giao

1. Fixture chạy được **theo lô** trong trần 15 phút, và README ghi sẵn danh sách lô.
2. Mọi vòng chờ có deadline **ngắn** (F2), và không vòng nào chờ hộp thoại "đáng lẽ không
   có" quá 8s.
3. Mọi cú bấm nút hộp thoại đi qua Win32 (F18), truyền đủ bộ đồng nghĩa của đúng nhánh (F16).
4. Mọi assert dẫn được `file:dòng` của WinForm, và nói rõ **đỏ ở đây nghĩa là gì** (F3).
5. Luồng có ghi DB: cờ riêng mặc định tắt, chụp/in/trả lại đủ ba bước (F20), dọn hai tầng
   có hàng rào (F22).
6. Số đo mới đã điền vào README của luồng.
