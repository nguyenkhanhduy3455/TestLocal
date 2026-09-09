# G3 — Dựng lại dòng thuốc khi LOAD lưới

Nửa **WinForm** của điểm parity G3.

> **Trạng thái: ĐÃ CHẠY THẬT — probe 8/8 câu, assert 4/4 XANH (2026-09-09).**
> Vế web `drug-row-rebuild-on-load.spec.ts` cùng ngày: **3/3 XANH**. Chuỗi nguyên văn ba
> dòng seed **trùng khít** hai bên ⇒ không có điểm lệch parity ở G3. Số đo đầy đủ ở
> [mục 9](#9-đo-được-trên-máy-thật).

---

## 1. WinForm không hiện `dsp_trt` đã lưu cho dòng 薬剤

```
modSave.cs:2627-2637   GetTrnRs — lưới THÁNG HIỆN HÀNH
    if (isCodeRange(drug, trt_cd)) {                      ← 600–699
        drugInfStr = getDrugName(con, null, raiin_cnt, trt_cd, trt_sb,
                                 trt_cnt, trt_dt, dsp_trt, freewd, true);
        hFG1[2] = drugInfStr.combineDrugNmsStr;           ← dsp_trt BỊ BỎ QUA
        hFG1[2].Tag = drugInfStr.drugRxData;
        if (drugInfStr.drugRxData != null)
            hFG1[2].ReadOnly = true;                      ← CHỈ khi path A
    } else {
        hFG1[2] = REGIRYO_PADLEFT + dsp_trt;              ← mã khác: hiện nguyên văn
    }

modSave.cs:4961-4974   lưới QUÁ KHỨ — y hệt, nhưng ReadOnly VÔ ĐIỀU KIỆN
```

Ngay trên đoạn đó còn nguyên cái tên `#region`:

```csharp
#region "               hFG1[ 2, intRow].Value = "\t" + rsTrn["dsp_trt"];"
```

— chính là dòng code **cũ** mà phép dựng lại đã thay thế. Nó nằm đó như một dấu vết.

### Chỗ bản web lệch

`treatment-table-mapper.ts:160,234` đọc thẳng `name: dspTrt` cho **mọi** dòng. Không có
nhánh `isDrugCode` nào ở luồng load — `isDrugCode` chỉ tồn tại ở
`treatment-entry-shared.ts:426`, tức đường **NHẬP**.

| | WinForm | Web |
|---|---|---|
| Nguồn chuỗi 療法・処置 của dòng 薬剤 | **dựng lại** từ master + `freewd` | `trn_trn.dsp_trt` đã lưu |
| Ô có khoá không | **có** (path A, lưới tháng hiện hành) · **luôn có** ở lưới quá khứ | *(chưa rõ)* |
| Mã ngoài 600–699 | `dsp_trt` nguyên văn | `dsp_trt` nguyên văn — **giống nhau** |

⇒ Hai bên chỉ giống nhau **chừng nào `dsp_trt` đã lưu vẫn đúng bằng cái master dựng ra**.
Lệch xuất hiện khi:

- **master đổi** sau khi lưu (đổi tên thuốc, đổi 薬価, hết hiệu lực, đổi 用法), hoặc
- **`freewd` khác mặc định** — mà `freewd` khác mặc định chính là thứ luồng **G1**
  (薬剤使用量選択) sinh ra. Hai điểm parity này nối vào nhau: G1 tạo ra dữ liệu, G3 là
  chỗ nó được đọc lại.

---

## 2. Khác hẳn G1/G2: luồng này **không nhập gì**

G1/G2 đo **đường nhập**. G3 đo **đường LOAD**: dữ liệu phải nằm sẵn trong `TRNTRN`
**trước khi** màn hình mở, rồi ta chỉ ĐỌC.

Hệ quả về cách viết: seed phải xong trong `PrepareDataBeforeApp`, tức trước
`OchaApp.LaunchOrAttach`. Chèn sau khi 診療入力 đã mở thì `GetTrnRs` đã chạy rồi và app
không bao giờ thấy — cùng họ với bẫy **F21**, chỉ khác là thứ nạp một lần ở đây là **cả
cái lưới**. Muốn đọc lại sau khi đổi DB giữa chừng thì phải
`UiTestBase.ReopenTreatmentScreen()`.

---

## 3. ⚠️ Luồng ghi **nặng nhất** của cả bộ

Nó chèn dòng vào **`TRNTRN`** — 処置行 thật của bệnh nhân. Không có đường nào khác: thứ
đang đo là đường LOAD.

Và để phân biệt được 「hiện `dsp_trt` đã lưu」 với 「dựng lại từ master」 thì `dsp_trt` phải
được đặt **khác hẳn** cái master sẽ dựng — tức phải là một chuỗi **bịa**. Đó là toàn bộ
phép đo, và cũng là lý do không thể mượn một dòng có sẵn.

**Ba hàng rào:**

1. Cờ RIÊNG `drugRowReload.allowSeed`, mặc định **tắt** ⇒ fixture tự Ignore **trước khi
   mở app**.
2. **Chỉ CHÈN** dòng mới mang `DISP_NO` riêng (9201 / 9202) — **không bao giờ** sửa hay
   xoá dòng có sẵn. Dọn là `DELETE` đúng `DISP_NO` đó, và chạy cả **trước** khi seed
   (lượt trước chết giữa chừng thì hàng rào sẽ chặn, mà chặn xong cũng không đo được gì).
3. Chèn bằng **clone** một dòng có sẵn của chính bệnh nhân + ngày test rồi ghi đè vài cột,
   nên mọi cột NOT NULL (`PAT_BR`, `INSU_CD`, `DR_NO`, 32 cột `BUI`, 20 cột `DIS_*`…) đều
   đúng bối cảnh. Viết tay 80 cột là chỗ chắc chắn sẽ sai.

`SEQ` là IDENTITY nên không truyền; PK là `(PAT_NO, TRT_DT, DISP_NO, SEQ)`.

**KHÔNG bấm F9 登録** ⇒ không dòng nào khác bị ghi đè.

---

## 4. Bốn dòng seed — ba dòng đầu **đúng bằng** vế Playwright

`treatment-grid/drug-row-rebuild-on-load.spec.ts:214-218` seed đúng ba dòng; luồng này
seed y hệt rồi thêm một dòng **đối chứng** mà vế web chưa có.

| Vai | `DISP_NO` | Mã | `freewd` | `dsp_trt` | 点 | cặp web |
|---|---|---|---|---|---|---|
| path A, master nguyên bản | 9201 | `602/0` | *(rỗng)* | `ｽﾃｰﾙ保存文字列ZZZ1` | 771 | TC-1 |
| path A, `freewd` khác mặc định | 9202 | `602/0` | `2` | `…ZZZ2` | 772 | TC-2 |
| **path B khi LOAD** | 9203 | `694/0` 「ﾃｽﾄ読込薬PB」 | *(rỗng)* | `…ZZZ3` | 773 | TC-3 |
| **ĐỐI CHỨNG** | 9204 | `110/0` 再診 (ngoài dải 薬剤) | *(rỗng)* | `…ZZZ4` | 774 | *(chưa có)* |

- `602/0` chọn vì **có `mst_drug_rx`** (path A ⇒ nhánh khoá ô mới chạy), `cnt1 = 4`,
  `med_kbn = 21` ⇒ có hậu tố 「n日分」. Trùng `TEST_LOAD_TRT_CD` của vế web.
- **`freewd`** tính đúng công thức của vế web (spec:192): `cnt1 == "1" ? "2" : "1"` —
  phải khác 使用量 mặc định của master thì mới thấy được phép dựng lại có đọc nó không.
- **`694`** là mã **seed thêm**, clone từ `602` (nên `F2`, `grp`, 単位… giống dữ liệu
  thật) và mã mới thì đương nhiên **không** có `mst_drug_rx` ⇒ rơi thẳng path B. Kèm một
  dòng `MST_MED` cho 用法. Trùng `TEST_LOADPB_TRT_CD` của vế web.
- **Dòng đối chứng tách đôi câu hỏi:** chuỗi bịa biến mất ở dòng 薬剤 là hành vi **riêng**
  của dải 600–699, hay app không bao giờ hiện `dsp_trt`? Dòng ngoài dải phải hiện **nguyên
  văn** chuỗi bịa.

> `disp_no` hai bên **không trùng nhau** (web dùng 9001–9003 trên Postgres). Không sao:
> `disp_no` không hiện ra lưới và không testcase nào assert nó — hai bên chỉ cần cùng
> **nội dung** dòng. 点 cũng vậy: vế web để cả ba dòng `trt_pt = 40` và nhận dòng theo
> thứ tự, còn ở đây 点 là **mốc dò dòng** (mục 5.1) nên phải khác nhau.

---

## 5. Hai cái bẫy

### 5.1 Dò dòng theo **点**, không theo tên

Cái đang đo **chính là chuỗi tên**. Lấy tên làm mốc tìm dòng là vòng luẩn quẩn: không tìm
thấy thì không phân biệt được 「app dựng tên khác」 với 「dòng không có trên lưới」.
`点` do seed đặt (771–774) — những con số không đụng dòng nào khác trong ngày.

### 5.2 Đo ReadOnly bằng **hành vi**, không bằng thuộc tính

`DataGridViewCell.ReadOnly` không được cầu MSAA→UIA phơi ra thành một cờ đọc được tin cậy.
`ProbeReadOnly` đặt con trỏ vào ô rồi bấm Enter và xem editor có mở không — đúng thứ người
dùng gặp.

⛔ Mở được editor thì **đóng bằng Enter**, tuyệt đối không bằng Escape: **F14** —
`GradientDataGridView.ProcessDialogKey` trả `false` nên Escape rơi xuống form thành 戻る
và bung dirty gate 「保存しますか」.

---

## 6. Chạy

```powershell
# ⚠️ GHIM 診療日 ĐÚNG BẰNG vế Playwright — dòng seed phải nằm đúng ngày cả hai bên mở.
.\run-reload-drug-row.ps1 -Probe -Seed -TrtDate 2026-09-08                # cả fixture
.\run-reload-drug-row.ps1 -Probe -Seed -TrtDate 2026-09-08 -Case Tc0_ProbeSeededData
.\run-reload-drug-row.ps1 -Probe -Seed -TrtDate 2026-09-08 -Case Tc1_ProbeDrugRowOnLoad
.\run-reload-drug-row.ps1 -Probe -Seed -TrtDate 2026-09-08 -Case Tc2_ProbeFreeWdChangesAmount
.\run-reload-drug-row.ps1 -Probe -Seed -TrtDate 2026-09-08 -Case Tc3_ProbePathBRowOnLoad
.\run-reload-drug-row.ps1 -Probe -Seed -TrtDate 2026-09-08 -Case Tc4_ProbeNonDrugRowShowsDspTrt
```

Vế web chạy cùng ngày đó:

```bash
TEST_DB=1 TEST_TRT_DT=2026-09-08 npx playwright test \
  tests/treatment-grid/drug-row-rebuild-on-load.spec.ts
```

Vì sao **không** dùng hôm nay: vế web cố ý tránh (spec:81-93) — ba spec drug còn lại đều
gọi `deleteTreatmentRows(patNo, hôm nay)` và sẽ xoá mất dòng seed khi chạy 4 worker.
Ngày phải **cùng tháng hiện tại** (WinForm chặn thao tác sang tháng khác) và nên là ngày
**đã qua**, tránh 診療日 tương lai.

Cả fixture chỉ **một** vòng giao diện (không nhập gì, chỉ đọc lưới đã nạp sẵn) nên rẻ —
khác hẳn G1/G2.

Không bật `-Seed` ⇒ fixture tự Ignore **trước khi mở app**, kèm lý do.

**Kiểm lại trước khi đóng máy:**

```sql
SELECT COUNT(*) FROM TRNTRN     WHERE DISP_NO BETWEEN 9201 AND 9204;  -- phải là 0
SELECT COUNT(*) FROM MST_TRT266 WHERE TRT_CD = 694;                  -- phải là 0
SELECT COUNT(*) FROM MST_MED    WHERE TRT_CD = 694;                  -- phải là 0
```

Lượt chạy chết giữa chừng thì dọn tay bằng đúng câu `DELETE` tương ứng — không dòng nào bị
*sửa* nên không cần khôi phục gì.

---

## 7. Cặp Playwright

`web-tenant-tests/tests/treatment-grid/drug-row-rebuild-on-load.spec.ts` — 3 TC.

| Web | WinForm | Hỏi cùng một thứ |
|---|---|---|
| TC-1 | `Tc1_ProbeDrugRowOnLoad` (KQ-2/4/5/7) | `dsp_trt` đã lưu **không** được in ra; ô dựng lại từ master |
| TC-2 | `Tc2_ProbeFreeWdChangesAmount` (KQ-3) | hai dòng cùng mã khác `freewd` ⇒ **hai** chuỗi khác nhau |
| TC-3 | `Tc3_ProbePathBRowOnLoad` (KQ-8) | path B khi load: 処置名称 + 用法, **không** hậu tố 用量 |
| *(chưa có)* | `Tc4_ProbeNonDrugRowShowsDspTrt` (KQ-6) | dòng ngoài dải hiện **nguyên văn** `dsp_trt` |
| *(chưa có)* | KQ-4 trong Tc1/Tc3 | ô có bị **khoá** không — web chưa đo ReadOnly |

Điều cần khẳng định trước tiên là **KQ-2**: *chuỗi bịa có hiện ra không*. Nếu hoá ra
WinForm cũng hiện `dsp_trt` thì điểm parity G3 không tồn tại và phải đọc lại
`modSave.cs:2627` trước khi kết luận theo hướng nào.

---

## 8. Việc chưa phủ

- **Lưới QUÁ KHỨ** (`modSave.cs:4961-4974`) — cùng phép dựng lại nhưng `ReadOnly` **vô
  điều kiện**, tức khác lưới tháng hiện hành ở đúng một chữ. Luồng này mới chỉ đo lưới
  tháng hiện hành.
- **Dòng path B khi load** — mã 600–699 **không** có `mst_drug_rx` thì `drugRxData == null`
  ⇒ nhánh khoá ô **không** chạy ⇒ ô vẫn sửa được. Đo được nó cần seed cả master (G2) lẫn
  `TRNTRN` (G3) trong một lượt.
- **`raiin_cnt`** — `getDrugName` nhận `ModSave.getRaiinCnt(intRow)` và dùng nó để tra
  `RxUsage`; chưa đo ảnh hưởng.

---

## 9. Đo được trên máy thật

> Điền sau **mỗi** lượt chạy: ngày, bệnh nhân, 診療日, và số đo **nguyên văn**.

### 2026-09-09 — 患者 10, 診療日 **2026-08-10**, `ochacom-win`

Probe `-Probe -Seed` (4 TC, 8 câu) rồi assert `-Seed` (**4/4 XANH**, 1.8 phút).

`診療日` chọn 2026-08-10 vì bảo hiểm của bệnh nhân 10 chỉ còn hiệu lực
`2026-08-03 → 2026-08-14` (`INSURANCE`). Ngày đó vẫn là **tháng đang mở** của màn hình
nên đi qua `GetTrnRs` (`modSave.cs:2626`), đúng nhánh vế web đo — **không** phải
`GetTrnRsOld` (`:4966`, lưới quá khứ in-line, chỉ chạy khi `pInpOpt[41] == 1`).

| KQ | Đo được |
|---|---|
| KQ-1 | master `602/0` = 「ﾒｲｱｸﾄMS錠100ｍｇ４T」 · `mst_drug`「メイアクトＭＳ錠１００ｍｇ」 · `cnt1 = 4` 錠 · `usage_nm`「１日４回朝昼夕食後と就寝前　服用」 · `med_kbn = 21` · `g_cnt = 3` · `score1 = 29`. `freewd` đem thử = 「1」. Mã seed `694/0` **không** có `mst_drug_rx` ⇒ đúng path B. |
| **KQ-2** | Chuỗi bịa `ｽﾃｰﾙ保存文字列ZZZ1` **KHÔNG** hiện. Ô = 「ﾒｲｱｸﾄMS錠100mg 4T」 ⏎ 「１日４回朝昼夕食後と就寝前　服用  7日分」 ⇒ **app dựng lại, bỏ qua `dsp_trt`**. |
| **KQ-3** | `freewd` rỗng → 数量 **4** · `freewd`「1」 → 数量 **1**. Hai ô **KHÁC** nhau ⇒ `freewd` CÓ được đọc lúc dựng lại. |
| KQ-4 | path A **ReadOnly = CÓ** · path B **ReadOnly = KHÔNG** · đối chứng **KHÔNG** — đúng như `modSave.cs:2635` chỉ khoá khi `drugRxData != null`. |
| KQ-5 | 点 = 771 (đã lưu 771) · 回 = 7 (đã lưu 7) — app không tính lại. |
| **KQ-6** | Đối chứng `110/0` hiện **NGUYÊN VĂN** 「ｽﾃｰﾙ保存文字列ZZZ4」 ⇒ KQ-2 đúng là hành vi RIÊNG của dải 600–699. |
| KQ-7 | 2 dòng. Hậu tố 用量 = 「**7**日分」 — bám `trn_trn.trt_cnt` (7), **không** phải `g_cnt` của master (3). |
| **KQ-8** | path B ra **đúng 2 dòng** 「ﾃｽﾄ読込薬PB」 ⏎ 「ﾃｽﾄ用法　就寝前　服用」, **không** hậu tố 用量, **không** khoá ô. |

### Đối chiếu parity với vế web (cùng ngày 2026-09-09)

`TEST_DB=1 npx playwright test …drug-row-rebuild-on-load.spec.ts` → **3/3 XANH** (47.2s).

Chuỗi **nguyên văn** hai bên, sau khi bỏ `REGIRYO_PADLEFT` (xem ghi chú dưới):

| Dòng | WinForm | Web |
|---|---|---|
| path A, `freewd` rỗng | `ﾒｲｱｸﾄMS錠100mg 4T` ⏎ `１日４回朝昼夕食後と就寝前　服用  7日分` | **y hệt** |
| path A, `freewd`「1」 | `ﾒｲｱｸﾄMS錠100mg 1T` ⏎ `１日４回朝昼夕食後と就寝前　服用  7日分` | **y hệt** |
| path B | `ﾃｽﾄ読込薬PB` ⏎ `ﾃｽﾄ用法　就寝前　服用` | **y hệt** |

Hai DB khác nhau nhưng master lái phép dựng lại thì **trùng**: `mst_drug_rx.cnt1 = 4`,
`usage_nm`, `med_kbn = 21`, `mst_drug.dg_nm`, `unit_nm = 錠` giống nhau ở cả SQL Server
`SIM2000` lẫn Postgres `t_tenant1`. (`mst_trt.trt_nm` thì khác — 「ｶﾛﾅｰﾙ細粒20%1g」 bên
Postgres — nhưng `trt_nm` chỉ vào chuỗi ở **path B**, mà path B dùng mã seed `694` do cả
hai bên tự đặt tên giống nhau, nên không ảnh hưởng.)

⇒ **KHÔNG có điểm lệch parity nào ở G3.**

#### Một khác biệt CHƯA bên nào đo: `REGIRYO_PADLEFT`

`getDrugName` (`modSave.cs:2229`) nối `CommonInp.REGIRYO_PADLEFT` = **hai dấu cách** vào
**đầu mỗi dòng** của ô; nhánh `else` (`:2639`) cũng vậy. Nguyên văn WinForm là
`"  ﾒｲｱｸﾄMS錠100mg 4T\r\n  １日４回…"`, còn DOM bên web là
`"ﾒｲｱｸﾄMS錠100mg 4T\n１日４回…"` — **không** có hai dấu cách.

Đây là **thụt lề của cột 療法・処置**, áp cho MỌI dòng chứ không riêng dòng 薬剤, và bên
web nhiều khả năng làm bằng CSS padding. Cả hai vế đều chuẩn hoá khoảng trắng trước khi
so (`Txt.N` / `norm`) nên **không** vế nào đang canh nó. Ghi ra đây để người sau biết là
đã nhìn thấy và cố ý bỏ qua, chứ không phải sót.
