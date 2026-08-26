# HighNeedsFreewd — 歯科診療困難者加算 và ô ẩn `freewd`

Đo **đáp án WinForm** cho câu hỏi 「著しく歯科診療が困難な患者に対する加算を算定しますか？」
và cho chuỗi mà câu trả lời kéo theo: hộp thoại → `grdRegi[72]` → `TRNTRN.FREEWD` →
lượt `getTensu` sau.

Bên kia của cặp parity: [`../../../../../web-tenant-tests/tests/auto-santei-high-needs-freewd.spec.ts`](../../../../../web-tenant-tests/tests/auto-santei-high-needs-freewd.spec.ts).

```powershell
.\run-high-needs-freewd.ps1 -Diagnostics          # PROBE — chạy cái này trước
.\run-high-needs-freewd.ps1 -Case NotAsked        # nhóm A, không cần cờ gì
.\run-high-needs-freewd.ps1 -AllowDisFlgPatch -Case Asked   # nhóm B
```

---

## 1. WinForm có HAI cửa hỏi, điều kiện KHÁC NHAU

Cùng một câu chữ, cùng ghi vào `hFG1[72]`, nhưng hai chỗ và **điều kiện lệch nhau thật —
đừng gộp làm một**:

| | `modSave.cs:3450` — 自動算定 | `frm203016.cs:1093-1118` — 処置選択 (`IregCodChk`) |
|---|---|---|
| Mã bẫy | **chỉ 105** | **105 và 508** |
| Lọc 枝番 | không | 105/{0,1,2,3,6,7} · 508/{0,1,6} — đúng 9 tổ hợp của `CommonChk.cs:1224-1234` |
| Đọc `dis_flg` | một lần cho cả lượt (`:3041`) | theo 処置日 **của chính dòng** (`dt.Rows[idx][78]`) |
| Vị trí trong bộ pick | nhánh `else` của `kv.index == 0` ⇒ pick đầu bộ không bao giờ hỏi | không liên quan |
| Hỏi lúc nào | trong vòng đẩy pick | **SAU** khi dòng đã được ghi (`:1629`) |
| Vào từ đâu | tự chạy / Enter ở cột 日 dòng cuối | gõ mã ở ô 点, hoặc chọn ở tab 個別 (`modKobetu.cs:341`) |

Bộ này đo **cửa 処置選択** — cửa duy nhất tới được từ giao diện với dữ liệu test hiện có
(lý do ở mục 4).

---

## 2. Vì sao phải vá `insurance.dis_flg`

Câu hỏi chỉ bung ra khi `dis_flg == 3` — so **BẰNG**, không phải `>=`. Đo trên chính
`SIM2000` mà máy test trỏ tới (2026-08-26):

| `dis_flg` | dòng | bệnh nhân |
|---|---:|---:|
| 0 | 21.756 | 16.322 |
| 1 | 3 | 2 |
| 2 | 25 | 14 |
| **3** | **0** | **0** |

Không có bệnh nhân nào ⇒ chạy trên dữ liệu thật thì nhánh này **không bao giờ tới
được**. Đúng tình trạng bên bản web, và cách xử lý lấy y bên đó (`TEST_ALLOW_DIS_FLG_PATCH`):
vá tạm rồi trả lại trong `[OneTimeTearDown]`.

**Hai điều dễ sai khi vá:**

1. **Vá TRƯỚC khi app mở.** `CommonInp.getCommonPatInfo` nạp `_patInfoList` ở màn CHỌN
   BỆNH NHÂN (`frm203001.cs:739`); từ đó `getPatInfo()` chỉ đọc lại mảng trong RAM
   (`CommonInp.cs:160-172`). UPDATE lúc `frm203002` đã mở thì app không thấy, và
   testcase đỏ với thông điệp 「WinForm không hỏi」 — đổ oan cho app. Vì thế việc vá nằm
   ở `UiTestBase.PrepareDataBeforeApp()`, chạy trước cả `OchaApp.LaunchOrAttach`.
2. **Vá HẾT mọi 枝番.** App đọc 枝番 còn hiệu lực tại 診療日 (`modPat.GetValidSubCode2`);
   vá trúng cái app không đọc là đỏ oan. Bên Playwright đã dính đúng bẫy này (bệnh nhân
   1 có 5 枝番, vá trúng 枝番 hiệu lực năm 2020).

Hệ quả của (1): **hai fixture tách rời**. Không thể vừa chạy nhánh `dis_flg` thật vừa
nhánh `dis_flg = 3` trong cùng một lần mở app.

---

## 3. Đọc được `freewd` mà KHÔNG ghi DB

Cột 72 là cột ẩn (`RegiCol.hideStart = 5`, `frm203002.cs:161` — mọi cột ≥ 5 đều
`Visible = false`). Nhưng app có sẵn **cửa hậu**:

```
customLabel1_Click        (click nhãn 患者番号)   → mbolHideClickFlg = !mbolHideClickFlg
customLabel3_DoubleClick  (double-click nhãn 氏名)
    if (mbolHideClickFlg == false) mbolHideRowFlg = false;   ← dòng CHỐT
    ChangeGridColmunsHide();     → Visible = mbolHideRowFlg, rồi LẬT cờ ở cuối
```

Sau khi form khởi tạo, `ChangeGridColmunsHide()` đã chạy một lần (`frm203002.cs:475`)
nên `mbolHideRowFlg` đang là **true**. Double-click ngay mà chưa click nhãn 患者番号 thì
dòng CHỐT ép nó về `false` và cột vẫn ẩn — double-click bao nhiêu lần cũng vô ích.
**Phải click nhãn 患者番号 trước.**

Đo thật 2026-08-26: một dòng lưới từ **5 ô → 81 ô**, và `FREEWD` nằm đúng **ô 72**,
khớp hằng số `RegiCol.FREEWD = 72` (`frm203002.cs:188`) và khớp thứ tự SELECT của
`getInpTrntrnData` (`InpDBAccess.cs:73`).

Nhờ vậy luồng này **không bấm F9 登録** và **không ghi gì xuống DB** — giữ đúng nguyên
tắc của `TreatmentEntryScreen`. Cờ `highNeeds.allowSave` có sẵn nhưng chưa testcase nào
cần tới.

> **Ô trống đọc ra chuỗi `(null)`, không phải chuỗi rỗng.** `Uia.ValueOf` thử
> ValuePattern rồi LegacyIAccessible.Value, cả hai rỗng thì rơi xuống `NameOf`. Coi
> `(null)` là "có giá trị" thì mọi khẳng định 「freewd trống」 đều đỏ oan — xem
> `HighNeedsFlow.IsFreewdEmpty`.

---

## 4. Đối chiếu số hiệu TC với spec Playwright

Bảng này để **chạy song song hai bên rồi so**, không phải để khẳng định bên kia làm gì.
Bộ này là bên **đo đáp án**: testcase đỏ nghĩa là bản port lệch, không phải test viết sai.

| WinForm | Nội dung | Bên kia |
|---|---|---|
| **N1** | Cửa hậu bật cột ẩn chạy được; `FREEWD` ở đúng ô 72 | — (chỉ WinForm mới có cột ẩn) |
| **N2** | `dis_flg ≠ 3` + chèn 105: **KHÔNG hỏi**, dòng vẫn được chèn, `freewd` trống | H-1 |
| **A1** | `dis_flg = 3` + 105-0: **hỏi**, đúng nguyên văn, caption 「特別対応加算」, 2 nút | H-3 (phần nội dung) |
| **A2** | 「はい」 → `freewd` 「1」 lên **đúng** dòng đó, không lem sang dòng khác | I-1 |
| **A3** | 「いいえ」 → dòng **vẫn còn**, `freewd` trống (≠ vắng dòng) | I-2 |
| **A4** | 枝番 ngoài whitelist (105-4) **không** được hỏi dù `dis_flg = 3` | nhóm J |
| **A5** | Mã **508** (歯訪) **cũng** được hỏi và cũng ghi `freewd` | nhóm J |

A4/A5 chỉ tồn tại ở cửa `IregCodChk` — cửa 自動算定 không lọc 枝番 và không đụng 508
(`modSave.cs:3450` chỉ so `Key == 105`).

### Testcase bên kia không có đối ứng ở đây

| | Vì sao không dựng |
|---|---|
| **H-2** `dis_flg = 3` nhưng bộ pick không có 105 | Là tính chất của 自動算定; ở cửa 処置選択 thì hiển nhiên (chỉ `case 105`/`case 508` mới hỏi) — A4 phủ ý này chặt hơn |
| **H-4** không có 特２ → chỉ hỏi một câu | Câu 特２ do 自動算定 sinh ra lúc dựng bộ pick, không tồn tại ở cửa 処置選択 |
| **H-5** nhánh 再診 | nt |
| **H-6** 「はい」 không đổi dòng nào trên lưới | A2 kiểm chặt hơn: đọc thẳng `freewd` từng dòng thay vì so danh sách tên |
| **I-3** 特２ thay pick rồi 困難者 trúng dòng mới | Việc thay pick nằm trong 自動算定 |
| **I-4** F9 gửi `freewd` xuống | Bên này đọc thẳng ô 72 nên không cần lưu; muốn phủ cả đường xuống DB thì bật `highNeeds.allowSave` (chưa testcase nào dùng) |

> **Một khác biệt cần biết trước khi so:** WinForm hỏi **SAU** khi đã ghi dòng
> (`IregCodChk` chạy ở cuối `frmTrtSel_Let_Trt_Data`, `frm203016.cs:1629`). Câu hỏi này
> không có nút huỷ, nên thứ tự dòng xuất hiện là khác biệt duy nhất nhìn thấy được.
> Vì vậy N2 khẳng định 「không hỏi vẫn phải chèn dòng」 chứ không khẳng định gì về **thời
> điểm** dòng hiện ra.

### Nhánh 自動算定 — CỐ Ý không dựng testcase

`modSave.AutoSantei` chỉ có một call site (`frm203002.cs:5345`) và cần bốn điều kiện
cùng đúng: Enter + con trỏ ở cột 0 + dòng CUỐI + ngày khác dòng trên
(`:5241`/`:5260`/`:5288`/`:5296`). Nhưng trước đó nó còn **thoát sớm với `-2` khi ngày
đang xét đã có 処置行** (`modSave.cs:2917-2951`) — mà bệnh nhân test luôn có sẵn dòng ở
`patient.trtDate` (đó chính là lý do ngày đó được chọn). Probe Tc0 ngày 2026-08-26 xác
nhận: kích bằng tay không ra câu hỏi nào.

Dựng testcase cho nhánh không tới được chỉ đẻ ra một test đỏ vĩnh viễn. Muốn phủ nhánh
này thì cần bệnh nhân **không** có 処置 trong ngày test và đã quá 1 tháng kể từ 最終診療日
— tiền đề khác, nên là fixture khác.

Cái đang đo **không phải nhánh phụ**: cùng câu chữ, cùng ghi `grdRegi[72]`, cùng chảy
xuống `TRNTRN.FREEWD` qua `modSave.cs:2073`. Khác duy nhất là chỗ châm ngòi.

---

## 5. Cái bẫy đã suýt làm testcase XANH SAI

`run.nuisanceDialogs` trong `testsettings.json` mặc định chứa:

```json
"nuisanceDialogs": [ "を算定しますか？", "加算を算定しますか" ]
```

Tức watcher nền **tự bấm 「いいえ」 đúng câu hỏi mà luồng này đang đo**. Để nguyên thì
testcase không đỏ mà **xanh sai**: nó không phân biệt được 「app không hỏi」 với 「app có
hỏi nhưng đã bị trả lời mất」.

Vì thế cả hai fixture đều `protected override string[] NuisanceDialogPatterns => [];`
và tự dẹp hộp thoại bằng `HighNeedsFlow.DismissAll()` ở chỗ nào cần.

---

## 6. Gồm những file gì

| File | Việc |
|---|---|
| `HighNeedsFlow.cs` | Thao tác UI: コードモード, 処置選択, chốt pick, bật cột ẩn, đọc ô 72, trả lời hộp thoại |
| `HighNeedsDb.cs` | Đọc `dis_flg`, **vá + khôi phục** `dis_flg`, đọc `TRNTRN.FREEWD`. Tách khỏi `Data/OchaDb.cs` vì lớp đó tuyên bố CHỈ ĐỌC |
| `HighNeedsProbeTests.cs` | `[Explicit]` PROBE — đo, không assert, không bao giờ ném |
| `HighNeedsNotAskedTests.cs` | Nhóm A — `dis_flg` thật, không cần cờ |
| `HighNeedsAskedTests.cs` | Nhóm B — vá `dis_flg = 3`, cần `highNeeds.allowDisFlgPatch` |
