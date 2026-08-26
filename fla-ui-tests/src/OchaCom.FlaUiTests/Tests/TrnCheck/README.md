# TrnCheck — 診療チェック của 診療入力 (nửa WinForm)

Bộ đối chiếu cho **engine 診療チェック** (`COMMON/Lib/Check.cs`, ~11k dòng). Đây là
nửa WinForm của hai spec Playwright:

| Spec web | Đo cái gì |
|---|---|
| [`trn-chk-sweep.spec.ts`](../../../../../web-tenant-tests/tests/trn-chk-sweep.spec.ts) | 一括 (F3) — 5 luật **月次** chạy một lần mỗi 処置月 |
| [`single-check-w00100.spec.ts`](../../../../../web-tenant-tests/tests/single-check-w00100.spec.ts) | 行単位 — `SingleChk` → MessageBox **W00100** |

Bên kia đo **bản web**, bên này đo **chính WinForm** — tức là đo cái "đáp án" mà bản
web phải khớp.

---

## 1. Hai cửa, một engine

```
frm203002.cs:4679   F3  ─┐
frm203002.cs:7706   F9  ─┼─→ TrnChk(con)                (:5158)
frm203002.cs:7760   F8  ─┘      └→ Check.getCheckAnswer  (Check.cs:~1180-1301)
                                    └→ grdChek + lbChk 「N件」 + PnlChek.Visible = !Visible

frm203002.cs:5678   chốt ô 回数     ─┐
frm203002.cs:8802   danh sách 薬剤  ─┤
frm203002.cs:9051   パック          ─┼─→ new SingleChk(…, curRow, cntRow)   (SingleChk.cs:26)
frm203002.cs:9532   ガイド (1 lần!) ─┤      └→ Check.getCheckAnswerSingle    (Check.cs:1322-1467)
frm203002.cs:9993   薬剤選択        ─┘           └→ MsgDialog.ShowWarningMsg("W00100", info)
                                                     MỘT hộp thoại cho MỖI phần tử — KHÔNG gộp trùng
```

Hai điểm dễ port sai, và là lý do bộ này tồn tại:

1. **`Chk_Buidis_Cmn` bắn thì `return` NGAY** (Check.cs:1246) — 4 luật 月次 phía sau bị
   bỏ. Port thiếu chỗ này thì người dùng thấy thừa cảnh báo.
2. **`Chkrol999_Cmn` ở F3/F8 chạy MỘT LẦN cho cả tháng** (:1269), khác hẳn đường 行単位
   nơi nó chạy mỗi dòng sau cổng `165 && trt_sb ∈ {0,1}` (:1441). Port nhầm thành
   per-row thì một tháng có N dòng スケーリング sẽ ra N cảnh báo giống hệt nhau.

---

## 2. Đo được gì trên WinForm

Khác với bản web (đọc JSON của `POST /tenant/treatment/check`), WinForm không có
request nào để soi. Nhưng nó phơi ra **ba mốc đọc thẳng được**, và đó là đủ:

| Mốc | Control | Nguồn |
|---|---|---|
| Số lỗi | `lbChk` — chuỗi `"N件"` | frm203002.cs:5219 |
| Nội dung từng lỗi | `grdChek`, một cột, dòng cuối `----- 以上 -----` | frm203002.cs:5210-5215 |
| Không có lỗi nào | MessageBox `I00100` (panel **không** mở) | frm203002.cs:5225 |
| Số cảnh báo 行単位 | số MessageBox `W00100` phải bấm OK | SingleChk.cs:43-46 |

> **Luôn mốc vào `lbChk`, đừng mốc vào số dòng đọc được từ `grdChek`.** UIA của
> `DataGridView` chỉ dựng phần tử cho dòng ĐANG NHÌN THẤY (PROBE-GUIDELINE 3.1) và
> panel chỉ cao 43px. `lbChk` là một `Label` nằm NGOÀI lưới nên miễn nhiễm với cuộn.

---

## 3. Bảng tương ứng từng testcase

| Web TC | FlaUI | Trạng thái |
|---|---|---|
| `trn-chk-sweep` TC-BASE | `TrnCheckSweepTests.TcBase` | ✅ **xanh trên máy thật** 2026-08-26 15:56 |
| — (web: `treatment-table-handler` TC-11) | `TrnCheckSweepTests.TcToggle` | ✅ **xanh trên máy thật** 2026-08-26 15:57 |
| `trn-chk-sweep` TC-ROL999 | — | ⏳ chưa viết — cần chèn 3 dòng スケーリング + 回数, xem mục 5 |
| `trn-chk-sweep` TC-BUIDIS | — | ⏳ chưa viết — cần một tháng KHÔNG có 病名 nào |
| `single-check` parity 1 | — | ❌ **không đo được ở tầng UI** — xem mục 4 |
| `single-check` parity 2 | — | ⏳ chưa viết — đường ガイド (F4) |
| `single-check` parity 3 | — | ⏳ đang đo bằng `Tc3_ProbeW00100` (cặp 医学管理料 113-0 + 598-3) |
| `single-check` parity 4/5 | — | ⏳ cần seed master 108-14/16 (ghi vào bảng master dùng chung) |
| `single-check` parity 6 | — | ⏳ chưa viết — sửa ô 回数 |

---

## 4. Cái KHÔNG đo được ở tầng UI WinForm (và vì sao)

**`single-check` parity 1 — 「định vị bằng (vị trí dòng, số dòng)」.** Bên web, testcase
đọc body của request để xem FE gửi `rowIndex`/`rowCount` hay `(trtCd, trtSb, day)`.
WinForm không có request: `SingleChk` **nhận thẳng** `curRow`/`cntRow` làm tham số
hàm (SingleChk.cs:26) nên chuyện "định vị bằng vị trí dòng" là **tính chất của chữ
ký hàm**, không phải hành vi quan sát được. Đo lại nó ở tầng UI là đo chính source.

Cái WinForm chứng minh được thay vào đó là **hệ quả** của cách định vị đó, và nó nằm
ở `TcCountEdit` (parity 6): sửa ô 回数 của MỘT dòng cụ thể thì cảnh báo phải nói về
ĐÚNG dòng ấy — trong khi cách định vị `(trtCd, trtSb, day)` của bản BE
(`CheckRulesService.cs:139` lấy **match cuối cùng**) sẽ chấm sang dòng khác khi tháng
có hai dòng cùng mã.

Cùng lý do với `AccountingTargetDayTests` không có TC-DATE-1.

---

## 5. Trạng thái — đã đo được gì trên máy thật

### PROBE 1 · 2026-08-26 15:42 · bệnh nhân 10, ngày 2026-08-03 · `Test Run Successful`

| | Kết quả |
|---|---|
| KQ-1 | Trước khi bấm F3, `PnlChek`/`grdChek`/`lbChk` **không có trong cây UIA**. Đúng như thiết kế: control WinForms đang `Visible = false` thì không có window handle nên cầu MSAA→UIA không dựng phần tử. ⇒ `PanelVisible()` trả false vì **vắng mặt**, không phải vì "thấy nhưng đang ẩn". |
| KQ-2 | F3 mở panel thật. `lbChk = 3件`. Không có I00100. |
| KQ-3 | ⚠️ **Đọc trúng dòng, trật ô** — 4 dòng (3 lỗi + `----- 以上 -----`) nhưng nội dung đọc ra là `Row 0`…`Row 3`. → PROBE 2 Tc1 đã tìm ra nguyên nhân, xem dưới. |
| KQ-4 | **Mốc SẠCH** — dữ liệu nền chưa bắn câu 月次 nào. Bệnh nhân/ngày này dùng được cho TC-BASE. (3 lỗi nền là 「08/25 100-0 歯科初診料…診療開始日(08/03)と異なります」 và 「歯科疾患管理料が算定可能です」 — cả hai đều là luật **từng dòng**, không phải 月次.) |
| KQ-5 | F3 lần hai **đóng** panel. Khớp frm203002.cs:4681. |
| KQ-6 | PGDN cuộn được lưới lỗi (đọc đủ 4 dòng). |
| KQ-7 | ⚠️ **Chèn 165 hụt** — 処置選択 không mở, `合計` không đổi, không hộp thoại nào. Ảnh `03x_04-sau-khi-chen-165.png` cho thấy cửa sổ trước mặt là **Microsoft Edge mở `Desktop\1.pdf`** ⇒ phím/chuột rơi vào Edge. Nội dung PDF là 「歯と口の健康のために」 = văn bản do chính app xuất từ nút 「指導文書」 ở đáy lưới ⇒ nghi một cú `LeftClickPhysical` đi lạc toạ độ. → PROBE 2 Tc2. |
| KQ-8/9 | Không đo được (phụ thuộc KQ-7). |

**Bài học đã đưa vào code:** trước mỗi cú click chuột vật lý phải hỏi *"cửa sổ trước
mặt có phải app không"*. Lượt chạy đầu mất 3/9 câu chỉ vì không ai hỏi, và thông điệp
lỗi lại nói 「処置選択 không mở」 — nghe như app sai. Đây là PROBE-GUIDELINE 3.4 nhưng ở
mức **cửa sổ**: không phải hộp thoại chắn, mà là app mất foreground.

### PROBE 2 Tc1 · 2026-08-26 15:48 · hình dạng thật của `grdChek`

Câu hỏi của KQ-3 chỉ mất **một lần đổ cây UIA** để trả lời — đúng như PROBE-GUIDELINE
mục 1 nói, và cũng đúng như PROBE 1 đã tiêu mất mấy phút để *không* trả lời được.

```
Unknown   name="Row 2"                        ← DÒNG
  Header   name="Row 2"          Value = ""                              ← ô SỐ THỨ TỰ
           HelpText="DataGridViewRowHeaderCell(DataGridViewHeaderCell)"
  DataItem name="Column1 Row 2"  Value = "衛生士実地指導が算定可能です。"    ← ô NỘI DUNG
           HelpText="DataGridViewTextBoxCell(DataGridViewCell)"
```

**Ô đầu tiên của dòng không phải ô nội dung** — nó là ô số thứ tự
(`grdChek.Rows[i].HeaderCell.Value`, frm203002.cs:5213) và `ValuePattern` của nó rỗng,
nên `Uia.ValueOf` rơi hết ba tầng rồi trả về `Name` = 「Row 2」. Sửa: lấy ô `DataItem`
đầu tiên thay vì ô đầu tiên (`TrnCheckFlow.ReadVisibleRows`).

Ba lỗi nền đọc được, nguyên văn:

```
1  08/25 100-0 歯科初診料を算定していますが、診療開始日(08/03)と異なります。確認してください。
2  歯科疾患管理料が算定可能です。
3  衛生士実地指導が算定可能です。
   ----- 以上 -----          ← TrnChk tự thêm, KHÔNG phải lỗi
```

Cả ba đều là luật **từng dòng**, không câu nào thuộc nhóm 月次 ⇒ mốc của TC-BASE sạch.

### PROBE 2 Tc2 · 2026-08-26 15:52 · vì sao 「chèn 165」 hụt, và đường nào chèn được

Câu trả lời hoá ra **không liên quan gì tới app** — nó là một lỗi của chính bộ test,
và là loại lỗi tệ nhất vì thông điệp của nó đổ oan cho app (PROBE-GUIDELINE 3.4, nhưng
ở mức **cửa sổ** chứ không phải hộp thoại):

```
TargetRow  = [0]  |  | (null) | (null) |          ← dòng "ma"
ô 点       = tâm (0,0)  rect {X=0,Y=0,Width=0,Height=0}
click(0,0) → góc trái trên DESKTOP; app MẤT foreground
Type("165")→ type-ahead của Explorer nhảy tới tệp bắt đầu bằng 「1」 = 1.pdf
Enter      → MỞ 1.pdf trong Microsoft Edge
→ báo lỗi đọc được: 「処置選択 không mở」   ← nghe như app sai, thật ra không phím nào tới app
```

`Uia.Center` của một phần tử rect rỗng trả `(0,0)`, và `LeftClickPhysical` bắn chuột
vào **toạ độ màn hình** chứ không vào phần tử. Đã sửa tận gốc ở
`TreatmentGridOps.FocusCell`: kiểm rect trước, rect rỗng thì **ném ngay** kèm lời giải
thích, thay vì để chỗ hỏng lộ ra ở tận bước sau. Sửa ở đó nên **mọi fixture** trong
repo được che, không riêng bộ này.

**Đường chèn dùng được: tab 個別.**

| Đường | Kết quả |
|---|---|
| tab 個別 (`InsertFromKobetu`) | ✅ `スケーリング 0 → 1 dòng` |
| コードモード (gõ mã vào ô 点) | ❌ dòng ma → click ra desktop |

Master tháng này (đo qua tab 個別) có đủ 枝番 cần dùng:

```
165-0 「スケーリング同日加算」            一般=38
165-1 「スケーリング」                    一般=72   ← đúng mã/điểm mà spec web seed
165-2 「スケーリング(2回目以降)」          一般=36
165-3 「スケーリング同日加算(2回目以降)」  一般=19
```

> ⚠️ **Mốc là SỐ DÒNG, không phải `合計点数`.** Đo được `合計 681 → 681` trong khi
> `スケーリング 0 → 1 dòng`: dòng 処置 vừa chèn chưa có 部位/回数 nên chưa cộng điểm. Mốc
> vào `合計` sẽ kết luận 「chưa chèn được gì」 trong khi đã chèn xong.

### Lượt chạy assert đầu tiên · 2026-08-26 15:56 · `Test Run Successful · Passed: 2`

```
Passed TcBase_PanelReadsRealEngine_AndNoMonthlyMessageYet [14 s]
Passed TcToggle_SecondF3ClosesPanel                        [22 s]
```

### PROBE 2 Tc3 · 2026-08-26 16:01 · 行単位 W00100 — và một điểm LỆCH thật

Ba lượt chèn, cả ba **đều chèn được**, và cả ba **đều bung 0 câu W00100**:

| Mã | Tên đọc từ master | Chèn | W00100 |
|---|---|---|---|
| 165-1 | スケーリング | 0 → 1 dòng | **0** |
| 113-0 | 歯科特定疾患療養管理料 | 0 → 1 dòng | **0** |
| 598-3 | 歯科疾患在宅療養管理料(歯援診2) | 0 → 1 dòng | **0** |

Giả thuyết đầu tiên — 「master tháng này thiếu mã」 — **bị loại**: KQ-L liệt kê đủ
`113-0/1/2` và 21 枝番 của `598`. Mồi có mặt, luật vẫn im.

Lý do thật nằm ở **danh sách điểm gọi `new SingleChk` trong frm203002.cs**:

| dòng | hàm bao | cửa |
|---|---|---|
| 5678 | `grdRegi_TextBox_PreviewKeyDown` | chốt ô trên **lưới** (「１処置チェック」) |
| 8802 | `frm210002_Let_Data` | danh sách 薬剤 |
| 9051 | `frmPack2_Let_Data` | **パック** |
| 9468 | `frmGuid2_Let_Data` | ガイド — **bị comment out** (trong vòng lặp) |
| 9532 | `frmGuid2_Let_Data` | ガイド — gọi **đúng 1 lần** sau vòng lặp, `intCnt` |
| 9993 | `frmMed_LetData` | 薬剤選択 |

**Không có điểm gọi nào cho `処置選択` (frm203016) lẫn tab 個別.** Nên 0 câu W00100 là
**ĐÚNG hành vi WinForm**, không phải hỏng — chốt một 処置 qua hai cửa đó thì WinForm
**không** chạy 行単位チェック.

> ⚠️ **Chỗ này ngược với chú thích của spec web.** `single-check-w00100.spec.ts` đặt
> tên testcase đầu là 「chốt 処置選択 → bắn ĐÚNG MỘT lượt SingleChk
> (frm203002.cs:9051 → (row, 1))」 và assert `settledCallCount() === 1`. Nhưng :9051 là
> `frmPack2_Let_Data` — **パック**, không phải 処置選択. Bản web gọi `runSingleCheck` khi
> chốt 処置選択 (`treatment-entry-detail.tsx:3449/3538`); WinForm thì không.
>
> ⇒ Nếu kết luận này đúng thì testcase đó **đang khoá sai chiều**: nó bắt bản web phải
> gọi 1 lượt ở chỗ mà bản gốc gọi **0 lượt**. Cần người rành nghiệp vụ xác nhận trước
> khi sửa — đây là kết quả đo + đọc source, chưa phải phán quyết.

**Muốn đo được W00100 thì phải đi cửa 回数** (:5678) hoặc cửa ガイド (:9532) — đó là
việc còn lại của `SingleChkW00100Tests`.

---

## 6. Chạy

```powershell
.\run-trn-check.ps1 -Diagnostics       # PROBE 1 — 9 câu hỏi, không assert
.\run-trn-check.ps1 -Case ProbeTree    # PROBE 2 Tc1 — đổ cây UIA của panel
.\run-trn-check.ps1 -Case ProbeInsert  # PROBE 2 Tc2 — đường chèn 165, từng bước
.\run-trn-check.ps1 -Case Sweep        # 一括  F3
.\run-trn-check.ps1 -Case Single       # 行単位 W00100
```

**KHÔNG ghi DB.** Bộ này chèn dòng 処置 vào *lưới* nhưng không bấm F9 登録; `TrnChk`
đọc `(DataTable)grdRegi.DataSource` (frm203002.cs:5184) nên không cần lưu. Đóng màn
hình mà không lưu là sạch — cùng tính chất với spec web.

> ⚠️ **Chạy từng nhóm một.** `app.attachIfRunning = true` nên nhóm thứ hai bám vào app
> mà nhóm thứ nhất đã mở, và lưới của nó đã bị chèn đầy dòng スケーリング từ lượt trước
> — mốc của TC-BASE không còn sạch. Giữa hai lượt: đóng 診療入力 **không lưu**, hoặc tắt
> hẳn `MENU.exe`.
