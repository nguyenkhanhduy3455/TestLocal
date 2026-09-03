# MenInput — 面入力 (`frm203035`)

Nửa **WinForm** của `../../../../../web-tenant-tests/tests/men-input-dialog.spec.ts`.
Bên kia đo bản web vừa port; bên này đo **chính WinForm** — tức là đo cái "đáp án" mà
bản web phải khớp.

Chạy: `.\run-input-tooth-surfaces.ps1` · dò lại hành vi: `.\run-input-tooth-surfaces.ps1 -Diagnostics`

> **Đọc [`../../../../PROBE-GUIDELINE.md`](../../../../PROBE-GUIDELINE.md) trước khi sửa.**
> Mọi con số trong file này là **đo được**, không suy đoán — nguồn đo ghi ở mục 3.

---

## 1. Luồng này lái cái gì

```
ô 点 ở コードモード, gõ 326, Enter
   → frm203016 処置選択                          (frm203002.cs, grdRegi_TextBox_PreviewKeyDown)
   → double-click 枝番 có mst_trt.men = 1
   → frmTrtSel_Let_Trt_Data  (frm203016.cs:1565-1585)
        if (vieTrtSel[i]["men"] == "1" && ModCommon.pInpOpt[6] == 1)
            showDialog(ID203035)   ← MODAL, LỒNG BÊN TRONG 処置選択
   → frm203035 面入力
        phím 8/4/5/6/2 bật/tắt 上/左/中央/右/下   (formBase_KeyDown, :196-229)
        F9 / End / Escape → fixProc               (BaseDialog2.cs:172-201)
        F10 → btnF10_Click                        (:158-164)
```

`fixProc` (`frm203035.cs:427-485`) ghi chuỗi 面 vào **hai** cột của dòng lưới:

```csharp
_dtRegiData[ 2] = _dtRegiData[ 2] + " " + strMen;   // 療法・処置 — cột NHÌN THẤY
_dtRegiData[72] = _dtRegiData[72] + " " + strMen;   // FREEWD    — cột ẨN
```

## 2. Không ghi DB

Luồng này **không bấm F9 登録**. Cột 72 đọc thẳng từ lưới sau khi bật cột ẩn bằng cửa hậu
có sẵn của app (`HighNeedsFlow.RevealHiddenColumns` → click nhãn 患者番号 rồi double-click
nhãn 氏名, `frm203002.cs:2645-2718`).

Đây là chỗ **rẻ hơn hẳn bản Playwright**: bên đó phải bấm 登録 rồi query `trn_trn.freewd`
(TC-M8, nằm sau cờ `TEST_ALLOW_SAVE` vì bulk-save ghi lại TOÀN BỘ 処置行 của tháng). Ở đây
không cần cờ nào, không đụng DB.

Lưới có bị bẩn (một dòng bị gõ đè) nhưng chỉ trong **bộ nhớ của phiên app** — không lưu.

## 3. Đo thật — bệnh nhân 10 / 2026-08-03, ngày 2026-09-03

Nguồn: `MenInputProbeTests.Tc0` (`-Diagnostics`) + query chỉ đọc vào SIM2000.

| Đo cái gì | Kết quả |
|---|---|
| `INPCONFIG.MENINPUT_FLG` | **1** ⇒ cổng MỞ |
| Master áp dụng | `MST_TRT266` — **26** dòng `men=1`, **0** dòng `men=2` |
| Mã có cả hai phía | 250, 251, 254, 256, 258, **326**, 342 |
| Cặp A/B đang dùng | `326-2` 光ＣＲ充(単純) `men=1` · `326-0` 充填１(複雑) `men=0` |
| Cột ẩn của `grdRegi` | **81** cột; `8=BUI1` … `39=BUI32`, `51=BuiDispFlag`, `72=FREEWD` |
| Dòng test mang 部位 | `BUI4..BUI8 = 1` (右上5…右上1) ⇒ **slot đầu 3, 部位数 5** |
| ⇒ nhánh `chkBui` | `idx <= 4` → 上**B** 左**D** 中央**O** 右**M** 下**P** — **y hệt bản web** |
| `lblBui` | `U+E092` (gaiji 右上5); sang răng kế đổi thành `U+E098` |
| `算定回数 ÷ 部位数` | `1 ÷ 5 = 0` ⇒ **mỗi răng hỏi đúng 1 lần, hộp thoại hỏi 5 lượt** |
| Phím 5 / 4 | `lblNumCenter` / `lblNumLeft` đổi nền `RGB(255,255,255)` → `RGB(211,211,211)` |
| Sau F9 確定 | cột 2 = `光重合型CR充填(単純) <U+E092 OD>` · cột 72 = `<U+E092 OD>` |
| ESC ở răng thứ hai | nối tiếp `<U+E098 O>` — glyph đúng của **răng kế**, không phải răng cũ |
| Sau F10 戻り | cột 2 giữ `<OD> <O>` · cột 72 **VỀ RỖNG** — hai cột LỆCH nhau |

## 4. Bốn điểm phải biết (đã trả giá)

### 4.1 「Đang chọn」 CHỈ đọc được bằng màu nền — phải đo pixel

UIA **không** phơi ra `Control.BackColor`, mà 面入力 báo trạng thái chọn chỉ bằng nó:
`chgBkColor` đặt `lblMen*` + `lblNum*` thành `LightGray` khi chọn, `White` khi không
(`frm203035.cs:596-627`). Vì thế có `Infrastructure/PixelProbe.cs`: chụp rect của nhãn rồi
lấy **màu chiếm đa số** (lấy đúng pixel tâm là trúng nét chữ).

Đo được sạch: `RGB(255,255,255)` ↔ `RGB(211,211,211)`, cách nhau 44 mỗi kênh.

Bên web cùng câu hỏi này đo bằng thuộc tính SVG `fill="#d4d4d4"`.

### 4.2 処置選択 **VẪN MỞ** phía sau 面入力 — `showDialog` modal lồng nhau

`frm203016` gọi `showDialog(ID203035)` ngay **giữa** `frmTrtSel_Let_Trt_Data` (:1573), nên
nó chưa đóng chừng nào 面入力 còn đó.

Hệ quả: **không dùng lại được `HighNeedsFlow.CommitPick`** — hàm đó coi 「chốt xong」 là
「picker đã đóng」, nên ở luồng này nó luôn kết luận 「chốt hụt」 rồi bắn cú click đường lui
vào đúng vùng mà 面入力 đang che. `MenInputFlow.CommitPick` chờ **一 trong hai**: 面入力 bung
ra, HOẶC picker đóng.

Hệ quả thứ hai: cầu MSAA→UIA dựng 面入力 thành **con** của 処置選択, nên
`Dialogs.TextOf(処置選択)` gom cả chữ của 面入力 — đọc ra một cửa sổ có 18 nút, tức hợp của
hai cửa sổ. Cùng cái bẫy `HighNeedsFlow.MessageBoxes` đã ghi.

### 4.3 Lưới hiện `cct_nm`, master ghi `trt_nm` — hai chuỗi KHÁC HẲN nhau

Đỏ thật 2026-09-03: bám dòng theo `trt_nm` của master (`光ＣＲ充(単純)`) trong khi lưới hiện
`光重合型CR充填(単純)` ⇒ `RequireRowNamed` không thấy dòng nào. Tên hiển thị là `cct_nm` hay
`trt_nm` tuỳ `ModCommon.pCultTrt`.

**Cách đúng:** lấy tên từ ô 名称 của chính `dgvView` (`MenInputFlow.PickResult.GridName`) —
đó đúng là chuỗi sẽ đáp xuống cột 2.

Và bám dòng theo **TÊN**, không theo chỉ số: UIA chỉ dựng phần tử cho dòng đang nhìn thấy,
mà chèn xong app lại cuộn — cùng một dòng đọc ra chỉ số 12 rồi 11 giữa hai lượt quét.

### 4.4 ESC ở đây là 確定, KHÔNG phải huỷ

`BaseDialog2.formBase_KeyDown` map **cả `End` lẫn `Escape`** sang `btnF9_Click`
(`BaseDialog2.cs:172-201`). Muốn bỏ ngang phải **F10 戻り**. Dùng ESC để "dọn dẹp" là vô tình
確定 thêm một token.

## 5. Hai điểm LỆCH với bản web (ghi lại, đừng "sửa" bên nào)

| | WinForm (đo được) | Bản web |
|---|---|---|
| **Con trỏ lúc mở** | nằm ở **`btnF9`**. `initProc` không gọi `.Focus()` nào; `tthSn` có TabIndex 0 nhưng không giữ con trỏ | `DraggableDialog` kéo focus vào thân hộp thoại |
| **処置選択 lúc 面入力 mở** | **còn mở** phía sau (modal lồng) | đóng trước rồi mới mở 面入力 |

Cùng ý nghĩa nghiệp vụ (phím 8/4/5/6/2 phải tới được hộp thoại, không bị màn 診療入力 nuốt),
khác cách thể hiện. `TcM3` chốt phía WinForm; bản web có `TC-M3` chốt phía kia.

Một khác biệt nữa **không phải lệch**, chỉ là dữ liệu: spec Playwright seed đúng **một** răng
nên 面入力 đóng ngay sau lần 確定 đầu; máy này có **năm** răng nên hộp thoại hỏi năm lượt.
Nhờ đó `TcM6` đo được nhánh `算定回数 ÷ 部位数` mà bản web chưa chạm tới.

## 6. Bug của WinForm được CHỐT LẠI có chủ ý

`TcM8` khoá lại: **F10 戻り trả cột 72 nhưng KHÔNG trả cột 2.** `btnF10_Click` chỉ khôi phục
`prvStrBuffFreeWord` cho cột 72 (`frm203035.cs:158-164`); cột 2 giữ nguyên mọi token đã cộng.
Sau khi 戻り thì hai cột **lệch nhau**.

Bản web đã chép y hệt (`parity-notes-men-input.md` mục 2.1: `onCancel` trả
`{ dspTrt: mutated, freewd: original }`). Ai "sửa" một trong hai bên cho sạch hơn là làm
lệch parity — testcase này để chặn đúng chuyện đó.

## 7. Bảng testcase

| | Nội dung | Playwright tương ứng | Cần DB |
|---|---|---|---|
| `TcM0` | Tiền đề: `MENINPUT_FLG = 1`, master có cặp `men=1`/`men=0` | (spec chỉ ghi chú) | ✔ |
| `TcM1` | Lưới có dòng 処置 mang 部位; `BUI1` ở cột 8, `FREEWD` ở cột 72 | TC-M1 | ✖ |
| `TcM2` | `men=1` MỞ 面入力; glyph 歯 khác rỗng, tên 処置, 5 nhãn mặt theo `chkBui`, 5 gợi ý phím | TC-M2 | ✔ |
| `TcM3` | Con trỏ ở `btnF9`, không rơi vào ô nhập nào | TC-M3 ⚠️ lệch | ✖ |
| `TcM4` | Mới mở: 0 mặt chọn. Phím 5 → 中央, phím 4 → 左, tổng đúng 2 (đo pixel) | TC-M4 (nửa đầu) | ✖ |
| `TcM5` | F9 確定 nối token `<歯OD>` vào **CẢ** cột 2 **LẪN** cột 72 | TC-M4 (nửa sau) + TC-M8 | ✖ |
| `TcM6` | `回数 ÷ 部位数 = 0` ⇒ hộp thoại ở lại hỏi răng kế, lựa chọn reset sạch | TC-M5 | ✖ |
| `TcM7` | ESC cũng là 確定 — nối thêm token `<歯O>` | TC-M6 | ✖ |
| `TcM8` | F10 戻り trả cột 72, **không** trả cột 2 (bug đã port) | (parity-notes 2.1) | ✖ |
| `TcM9` | Đối chứng âm: `men=0` KHÔNG mở 面入力 | TC-M7 | ✔ |
| `Tc0` | PROBE `[Explicit]` — đi trọn vòng, chụp từng bước, KHÔNG assert | — | ✔ |

Thiếu DB thì `TcM0` / `TcM2` / `TcM9` tự `Ignore` kèm lý do; phần còn lại vẫn chạy được nếu
đã có cặp A/B.

## 8. Chưa đo (cố ý, ngoài phạm vi)

- **`men == 2` → 部位選択 (`frm902003`)** — `frm203016.cs:1596-1613`. Master `MST_TRT266`
  **không có dòng nào** `men = 2` nên không có đường tới được từ giao diện. Bản web cũng
  chưa port (xem `parity-notes-men-input.md` mục 3).
- **ガイド (`frm203017`) / パック (`frm203014`)** — cả hai có cột ẩn `men` nhưng `setPacData`
  ghi thẳng vào `grdRegi` và **không đọc** cột đó, nên không mở 面入力.
- **`trn_trn.MEN1..MEN5`** — năm cột đó có thật trong bảng, nhưng `modSave.cs:2074-2078`
  ghi cứng `""` cho cả năm. Dữ liệu 面 nằm ở `FREEWD` + `DSP_TRT`, đúng chỗ luồng này đo.
