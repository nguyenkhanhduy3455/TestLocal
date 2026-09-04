# PerioKensaOrder — 検査順 (`ModCommon.pInpOpt[36]`)

Nửa WinForm của [`../../../../../web-tenant-tests/tests/perio-kensa-order.spec.ts`](../../../../../web-tenant-tests/tests/perio-kensa-order.spec.ts).

Đo **hướng quét con trỏ** của hai màn 歯周基本検査 (`frm203028`) và 歯周精密検査
(`frm203029`) khi 検査順 đặt 左上から / 右上から.

```powershell
.\run-move-perio-exam-cursor.ps1 -Diagnostics       # PROBE trước — luôn luôn
.\run-move-perio-exam-cursor.ps1                    # nhóm khớp nhánh máy đang chạy
.\run-move-perio-exam-cursor.ps1 -AllowSettingChange
```

---

## 1. Bảng tương ứng với spec Playwright

| WinForm | Spec web | Đo cái gì |
|---|---|---|
| `TcREAD` | `TC-READ` | combo 「基本･精密検査」 có đủ 左上/右上 (`mst_cod` cd_type 68) |
| `Tc1` | `TC-1` | **右上から** 基本: con trỏ vào răng còn tồn tại ĐẦU TIÊN quét `0→31`, Enter đi tới (đối chứng) |
| `Tc2` | `TC-2` | **左上から** 基本: con trỏ vào răng còn tồn tại đầu tiên quét `15→0`, Enter đi NGƯỢC |
| `Tc4` | `TC-4` | **左上から** 基本: hết vòng ⇒ sang hàng 動揺度 (`idx + 100`) |
| `Tc5` | `TC-5` | **右上から** 精密 6点法: điểm 口蓋 **đầu** (`t*3`) của răng đầu tiên (đối chứng) |
| `Tc6` | `TC-6` | **左上から** 精密 6点法: điểm 口蓋 **cuối** (`t*3+2`) của răng đầu tiên |
| `Tc7` | `TC-7` | **左上から** 精密 6点法: `口蓋 2→1→0 → 頬側 idx+2 → 2→1→0 → răng kế` |
| `Tc7b` | `TC-7b` | **左上から** 精密 4点法: điểm giữa ⇒ 頬側 điểm **cuối** |
| `Tc8` | `TC-8` | ←/→ **KHÔNG** đổi theo 検査順 (đối chứng) |

Spec web không có `TC-3` — số nhảy là cố ý, giữ nguyên để hai bên tra chéo được.

---

## 2. Nguồn WinForm (mọi assert bám vào đây)

| Chỗ | Nội dung |
|---|---|
| `modCommon.cs:595-597` | `pInpOpt[36] = XmlControl.OchaXml.InpInfo.KensaOrder` — cd_val của `mst_cod` cd_type 68: **1 = 左上から, 2 = 右上から** |
| `frm203028.cs:471-484` | `tyToothInf[].next = i+1` / `.prev = i-1`, khép vòng `31 ↔ 0` |
| `frm203028.cs:488-512` | フォーカス設定 — 左上 quét 上顎 `15→0` **trước**, 上顎 trống mới quét 下顎 `31→16`; 右上 quét thẳng `0→31` |
| `frm203028.cs:610-657` | `getMoveIndex` — 左上 dùng `.prev`, hết vòng khi về **15**; 右上 dùng `.next`, hết vòng khi về **0**. Hết vòng ⇒ `idx + 100` |
| `frm203028.cs:184-199` | Enter: `idx >= 100` ⇒ EPP → `_txtDouyo[idx-100]`, 動揺度 → `_txtEpp[idx-100]` |
| `frm203028.cs:660-724` | `getMoveIndexArrow` — **không có nhánh `pInpOpt[36]` nào**; mép cung `15 ↔ 31`, `16 ↔ 0` |
| `frm203029.cs:100-156` | Cùng luật quét, rồi focus điểm 口蓋: 4点法 `t*3+1`; 6点法 右上 `t*3+0`, **左上 `t*3+2`** |
| `frm203029.cs:667-716` | `txtKou_KeyPress` — 6点法 左上 `2→1→0→頬側 idx+2`; 右上 `0→1→2→頬側 idx-2`; 4点法 左上 `giữa → 頬側 idx+1` |
| `frm203029.cs:472-530` | `txtHoho_KeyPress` — 左上 `idx%3 != 0 → idx-1`; 右上 `idx%3 != 2 → idx+1` |
| `frm203029.cs:826-834` | 4点法 khoá ／ hai điểm 口蓋 **ngoài cùng** (`t*3`, `t*3+2`) — mốc để đo chế độ từ giao diện |
| `frm203003.cs:113-118`, `:252`, `:270-273` | F9 登録 → `setItemToXmlData()` → `setOchaXml()` + **`ModCommon.pGetInpOpt()`** |

---

## 3. Ba chỗ luồng này KHÁC bản Playwright (đều là khác biệt thật)

### 3.1 検査順 phải GHI THẬT, và ghi vào cấu hình MÁY

Spec web đè `GET /tenant/settings/inp` để khỏi động vào `tenant_config`. Ở WinForm không
có đường tương đương: `pInpOpt[36]` đến từ **`C:\NEW_SIM2000\Ocha.xml`**, đọc trong static
ctor của `XmlControl`. Sửa file thì phải khởi động lại app mới ăn.

Đường duy nhất đổi được **trong một phiên** là 処置入力設定 → F9 登録, vì `btnF9_Click`
gọi `pGetInpOpt()` ngay sau khi ghi. Nằm sau cờ `perioKensa.allowSettingChange`; fixture
chụp nhãn cũ ở `OneTimeSetUp` và trả lại ở `OneTimeTearDown` kể cả khi đỏ giữa chừng.

> ⚠️ **Hai trường hợp việc trả lại KHÔNG chạy được**, và cả hai đều để nguyên giá trị test
> trên `Ocha.xml` của máy:
> - `run.killOnFail` giết app ngay ở `TearDown` (chỉ khi test TỰ MỞ app — bám vào app đang
>   chạy thì `ForceKill` no-op). App chết thì không còn màn 処置入力設定 nào để bấm F9.
> - Ctrl+C giữa chừng.
>
> Cả hai đều để lại dòng cảnh báo `!! CHƯA TRẢ LẠI ĐƯỢC 検査順` trên stderr, kèm nhãn cần
> đặt lại. **Không thấy dòng `ĐÃ TRẢ LẠI 検査順` ⇒ vào 診療入力 → F11 選択 → ９ オプション
> → ２ 処置入力設定 và đặt tay.**

### 3.2 ⚠️ Combo 「基本･精密検査」 CÓ THỂ NÓI DỐI

```csharp
// frm203003.cs:200-202
if (XmlControl.OchaXml.InpInfo.KensaOrder > 0) cboKensaOrder.SelectedValue = …;
else                                           cboKensaOrder.SelectedIndex  = 0;
```

Máy chưa từng cấu hình có `KensaOrder = 0` ⇒ combo hiện **mục đầu tiên** = 「左上から」.
Nhưng `pInpOpt[36] = 0`, mà cả hai form chỉ kiểm `== 1` — nên app **thực sự chạy nhánh
右上**. Đọc combo rồi kết luận là sai.

Vì thế khi cờ TẮT, fixture **đo nhánh đang chạy** bằng chính chỗ con trỏ rơi vào lúc mở
歯周基本検査 — so với răng mà TỪNG nhánh sẽ chọn trên tập răng còn thật (không so số cứng
`txtEpp01`/`txtEpp16`, vì hai răng đó có thể không tồn tại). Cả hai giá trị đều được in
ra; lệch nhau chính là dấu hiệu của `KensaOrder = 0`.

### 3.3 4点法 / 6点法 KHÔNG đổi được giữa phiên

`pGetInpOpt()` chỉ nạp lại XML. `pInpOpt[32] = _inpConfigData.seimitu_mode`
(`modCommon.cs:581`), mà `_inpConfigData` được nạp **một lần** ở `getConfigDataToItem`
lúc app khởi động (`:299`) và không bao giờ nạp lại.

⇒ Một lượt chạy chỉ phủ được **một** chế độ. `Tc5/Tc6/Tc7` cần 6点法, `Tc7b` cần 4点法;
cái không khớp tự `Ignore` kèm lý do. Đổi chế độ là việc của màn 初期設定 `frm506008` rồi
khởi động lại app. Bên web cả hai chạy trong một lượt vì đó chỉ là một field JSON.

### 3.4 部位 dựng qua GIAO DIỆN, không seed DB

Spec web phải `INSERT trn_trn` một dòng `bui` toàn 1 vì Playwright không lái được 部位選択.
Ở đây `F7 全顎` của `frm902003` làm đúng việc đó **trong bộ nhớ** — và fixture không bao
giờ bấm F9 登録 của 診療入力, nên **không dòng nào rơi xuống DB**.

⚠️ **`F7 全顎` KHÔNG có nghĩa là 32 răng.** `setBui` chỉ bật răng có
`_plaqueData.bui* == 1` **và** `_sigaData.bui* != 4` (欠損歯) — `frm902003.cs:841-895`.
Đo thật 2026-09-04: **25/32**, thiếu đúng răng 0 và 15 — tức thiếu CẢ HAI mốc mà spec web
assert cứng.

Vì thế testcase ở đây **không** assert số cứng: nó đọc tập răng còn thật từ chính hộp
thoại (ô không bị khoá ／ ⟺ `tyToothInf[].flg`) rồi tính kỳ vọng theo luật — xem
`PerioNav.cs`, chỗ DUY NHẤT trong luồng có chép lại logic của app. `RequireArchRow` chỉ
`Ignore` khi dưới `MinTeeth` răng, vì ít quá thì mọi bước Enter đều rơi vào 「hết vòng」.

---

## 4. Bốn cái bẫy ghim vào code từ lúc ĐỌC SOURCE

(Bảy cái bẫy tìm ra lúc CHẠY THẬT nằm ở mục 6.)

### 4.1 Enter đi qua HAI đường, kết cục là đường thứ hai

`BaseDialog` bật `KeyPreview` (`BaseDialog.cs:139`) và `formBase_KeyDown` ánh xạ
`Keys.Enter → ProcessTabKey` (`:325-327`) **mà không đặt `e.Handled`**. Ô nhập thì xử lý
Enter ở `KeyPress`. Một lần bấm chạy cả hai:

```
WM_KEYDOWN → formBase_KeyDown → ProcessTabKey   (dời focus theo TabIndex)
WM_CHAR    → txtEpp_KeyPress  → getMoveIndex    (dời focus theo 検査順)
```

`WM_CHAR` tới sau và được gửi tới ô đang focus lúc `TranslateMessage` chạy (ô **gốc**),
nên kết cục quan sát được là đích của `getMoveIndex`. Hệ quả: **đừng đọc focus một phát** —
luôn poll (`PerioExamDialog.WaitFocus`).

### 4.2 End / Escape ở hai màn kiểm tra là 確定, không phải huỷ

`BaseDialog.cs:314-324` ánh xạ cả `End` lẫn `Escape` sang `btnF9_Click`. Ở `frm203028` /
`frm203029` thì F9 = 確定 (`fixProc`, đổ kết quả vào lưới 処置). **Đóng bằng F10 戻る.**
Cùng loại bẫy mà `ToothSelectDialog` đã ghi cho 部位選択, và cùng loại với
PROBE-GUIDELINE 3.3 (ESC trên lưới 処置 = 戻る).

### 4.3 ☠ F1 ở hai màn kiểm tra là 「ﾃﾞﾌｫﾙﾄ設定」

Nó bung `Q00002` rồi `setDefalut()` — **ghi `kihon_def` / `seimitu_def`**. F1 chỉ được gửi
vào `frm203011` (nơi F1 = 「基本検査」), không bao giờ vào `frm203028`/`frm203029`.

### 4.4 Đơn vị của chỉ số ĐỔI theo hàng

```
txtEpp{t+1:D2}   txtDouyo{t+1:D2}   txtBop{t+1:D2}    t = SỐ RĂNG  0..31
txtHoho{p+1:D2}  txtKou{p+1:D2}                       p = ĐIỂM ĐO  0..95  (p = t*3 + k)
```

左上8 (răng 15) là `txtEpp16`, nhưng điểm 口蓋 ngoài cùng của chính răng đó là `txtKou48`.
Đây đúng là mục BẪY 1 của spec web, chỉ khác chỗ ở: bên đó là `data-perio-cell`, bên này
là AutomationId (`GetControl.cs:80-100`).

---

## 5. Cấu trúc thư mục

```
PerioExamDialog.cs            tên control + đọc ô đang giữ con trỏ + gửi phím (F10 để đóng)
PerioKensaOrderFlow.cs        đổi 検査順 · dựng 部位病名行 全顎 · F6 → frm203011 → F1/F2
PerioKensaTestBase.cs         nền: đo nhánh đang chạy, khôi phục Ocha.xml, RequireXxx
PerioKensaOrderProbeTests.cs  PROBE [Explicit] — 9 câu hỏi, KHÔNG assert
PerioKensaOrderTests.cs       TcREAD, Tc1, Tc2, Tc4, Tc5, Tc6, Tc7, Tc7b, Tc8
```

Dùng lại (không chép) từ nơi khác — theo quy ước README mục 8b:

- `Infrastructure/ToothSelectDialog` — 部位選択 (`F7 全顎`, `End 確定`, `F12 戻る`).
- `Tests/SigaToothStatus/SigaToothFlow` — chặng 病名選択 (`PickDisease` /
  `ConfirmDiseaseDialog`) và `DismissAll`. Đây là driver **duy nhất đã chạy thật** cho
  chuỗi đó.
- `Tests/KarteAutoCalc/KarteAutoCalcMenu` — F11 選択 →「９ オプション」→ mục con. Nó tìm
  `btnF11` theo **bề rộng**; `Uia.ByIdOrName` ở `frm203002` mất 10-20s mỗi lần vì lưới có
  hàng nghìn dòng.
- `Tests/TreatmentGrid/TreatmentGridOps` — chọn dòng lưới, kiểm rect trước khi click.

---

## 6. Đã chạy thật — kết quả đo được (2026-09-04, bệnh nhân 10, 診療月 2026-08)

Máy test: `Ocha.xml` `<KensaOrder>2</KensaOrder>` = 右上から, `pInpOpt[32]` = **4点法**.
Bộ răng sau `F7 全顎`: **25/32** — thiếu 0, 3, 4, 5, 15, 16, 31.

| TC | Kết quả | Đo được |
|---|---|---|
| `TcREAD` | ✅ Passed | combo có đủ 「左上から」/「右上から」 |
| `Tc1` 右上 基本 | ✅ Passed | xuất phát răng **1**; Enter → 2 → **6** (nhảy đúng 3,4,5 vắng) |
| `Tc2` 左上 基本 | ✅ Passed | đổi 右上→左上 OK; xuất phát răng **14**; Enter → 13 → 12 |
| `Tc4` 左上 hết vòng | ✅ Passed | đi trọn 25 răng → `txtDouyo15` = 動揺度 răng 14 (`idx+100`) |
| `Tc5` 右上 精密 | ⬜ NotExecuted | hết trần 15 phút của wrapper |
| `Tc6`/`Tc7` 左上 精密 6点法 | ❌ | `COMException: Catastrophic failure` — UIA sập, KHÔNG phải app sai |
| `Tc7b` 左上 精密 4点法 | ❌ | kéo theo: sau đó `grdRegi` không đọc được nữa |
| `Tc8` mũi tên | ❌ | như trên |

**Kết luận parity: 歯周基本検査 KHÔNG lệch** — cả hai nhánh 検査順 khớp đúng source, kể cả
trên bộ răng khuyết. Đáng chú ý: răng 15 (左上8) không tồn tại ở bệnh nhân này và WinForm
rơi đúng xuống răng 14 — thứ mà spec web assert cứng `răng 15` sẽ không bắt được.

**歯周精密検査 CHƯA đo được** cả hai nhánh.

### Hai việc phải sửa trước khi tin bộ này

1. **Khôi phục `Ocha.xml` chưa chắc chắn.** Lượt chạy bị wrapper cắt ở 15 phút (`rc=124`)
   nên `OneTimeTearDown` KHÔNG chạy và `KensaOrder` nằm lại ở `1`; phải khôi phục tay.
   Guard hiện tại (`_settingChanged && OriginalOrderLabel != ""`) im lặng khi không biết
   giá trị gốc. Cần đọc thẳng `KensaOrder` từ `Ocha.xml` làm mốc dự phòng.
2. **Quá chậm.** Riêng `Tc1` tốn 235 giây (dựng 部位 + mở/đóng dialog mỗi testcase).
   9 testcase không lọt 15 phút. Cần dùng lại 部位病名行 giữa các testcase.

### Bảy cái bẫy đã trả giá để biết (đều CHỈ lộ ra khi chạy thật)

| # | Triệu chứng | Sự thật |
|---|---|---|
| 1 | `NoClickablePointException` khi mở 部位選択 | `OpenFromGrid` thử lần lượt 12 dòng đầu; dòng 0 là tiêu đề cột, dòng 1 là tiêu đề THÁNG — rect RỖNG. Dùng `SigaToothFlow.InputRow()` |
| 2 | 「F1 không mở được frm203028 trong 20s」 trong khi ảnh cho thấy nó đang mở | `showDialog` dựng form con `TopLevel=false` ⇒ **không** phải cửa sổ top-level. Phải truyền `searchInside` |
| 3 | 「click btnF11 loi: 」 (Message RỖNG) | App **không nhận `InvokePattern`** ở bất kỳ control nào. Phải click chuột vật lý |
| 4 | Dump menu ra đúng một mục 「System」 | `AllPopups` nhận cả cửa sổ app vì mọi cửa sổ Win32 đều có MENU HỆ THỐNG. Lọc theo lớp `#32768` |
| 5 | 「frm203003 đã mở nhưng KHÔNG thấy `cboKensaOrder`」 | Combo nằm ở **`tabPage2` 「入力形態・動作1」**, dialog mở mặc định ở 「表示設定」. `TabControl` chỉ dựng control của tab ĐANG CHỌN |
| 6 | frm203003 không đóng ⇒ modal treo ⇒ mọi thao tác sau đều trượt | **Windows nuốt `VK_F10`** (nó dành riêng để kích hoạt thanh menu). Phải BẤM NÚT `btnF10` |
| 7 | ☠ **App SẬP** 「Form that is already visible cannot be displayed as a modal dialog box」 | `OpenSettings` kiểm 「đã mở chưa」 mà quên `searchInside` ⇒ luôn tưởng chưa mở ⇒ gọi `showDialog` lần hai lên `Instance` đang visible. **Lỗi của bộ test**, không phải đường người dùng đi được (frm203003 chỉ mở modal từ `IDM_InpOpt_Click`) |
