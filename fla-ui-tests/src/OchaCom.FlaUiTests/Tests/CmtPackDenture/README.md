# CmtPackDenture — 摘要コメントパック 歯管-有床義歯

Luồng này trả lời **một câu**, và câu đó quyết định bản port `ListCascadeCmtAutosHandler`:

> Khi nhập 歯管 (116/7), pack 「有床義歯に係る口腔管理のみ」 hiện hay ẩn —
> **欠損病名** và **現存歯**, cái nào thắng?

Nguồn yêu cầu: `userapp/fla-ui-todo-inp-legacy-sync-20260921.md` §C1, §C2, §C3.
Nguồn chân lý: `userapp/src_20260921/OCHACOM/INP/Lib/CmtAuto.cs:190-236`.

```
grdRegi — Enter ở ô 回                    (frm203002.cs:5733-5738)
  └─ ModMain.Chk_CmtAuto
       └─ CmtAuto.prgCmtAuto              (CmtAuto.cs:54)
            case "歯管-有床義歯":          (CmtAuto.cs:190)
              ① dis_cd[] của DÒNG ĐANG ĐỨNG có dis_kbn ∈ {51,52,55,56,57,58,59}?
                    → pack_detail_dsp_flg = true, BREAK          ← 欠損病名 THẮNG
              ② không → flg = true; getPlaqueTeeth(1900-01-01, ngày)
                    nếu trả != null và có bui[j] != 0 → flg = false   ← 現存歯 tắt pack
```

Logic này **chỉ có 2 bước**. Bản cũ (web trên `demo1`) có thêm một danh sách cứng
`{100 Ｃ, 101 Ｐul, 102 Ｐer, 111 Ｐerico, 112 Ｃ4, 158 Ｃ3処置歯}` — bản 2026-09-07 **bỏ hẳn**.
Hai hệ quả người dùng thấy ngay, và đó là §C2 + §C3.

---

## 1. ⚠️ HAI DB — đọc trước khi tin bất cứ số đo nào

Trên máy Mac có **hai instance SQL Server**, và **tên container bị chéo so với cổng**:

| cổng | container Docker | `@@SERVERNAME` | ai dùng |
|---:|---|---|---|
| **1433** | `OCHASQLEXPRESS` | `0aaf45f5931c` | — (bản nhỏ, KHÔNG phải DB của app) |
| **1434** | `ochacom_sql2022` | `OCHASQLEXPRESS` | **`MENU.exe`** — theo `C:\NEW_SIM2000\Ocha.xml` |

Nguồn chân lý cho câu hỏi 「app đọc DB nào」 là `<DbConnectString>` trong
`C:\NEW_SIM2000\Ocha.xml`. **Đừng suy từ tên container** — nó nói ngược.

Hai DB **khác nhau ở đúng chỗ luồng này đo**:

| | 1433 | 1434 (app) |
|---|---|---|
| pack 歯管-有床義歯 | `B000-4`, **1 候補** | **`B000-4-1`, 2 候補** |
| `B000-4` là gì | chính pack này | pack **khác hẳn**: 紹介元保険医療機関名 (type 90) |
| số 候補 ⇒ hành vi | frm203018 **tự đóng** | frm203018 **đứng lại chờ chọn** |
| bệnh nhân 10 | có, 21 dòng | **không có dòng nào** |

> 🔥 **Đã trả giá 2026-09-21.** Lượt probe đầu chạy với `db.connectionString` trỏ 1433:
> lưới 診療入力 **rỗng trơn** (ảnh `luoi-truoc.png`) vì bệnh nhân 10 không tồn tại trong DB
> mà app đọc. Toàn bộ bảng tra master dựng ở bước trước đó — pack `B000-4`, 1 候補, 「tự
> đóng nên phải đo bằng dòng lưới」 — **sai từ gốc**. Một lệnh
> `Get-Content C:\NEW_SIM2000\Ocha.xml | Select-String DbConnectString` trả lời được điều
> đó trong 1 giây.

`TCD_1` khoá lại đúng cái bẫy này: nó đỏ nếu số 候補 khác với cái bộ ca đang giả định.

---

## 2. Các ca

| ca | fixture | mở app? | seed? | đo gì |
|---|---|---|---|---|
| `TCD_0` | `CmtPackDentureMasterTests` | không | không | 116/7 kích hoạt **đúng 1** pack, và đó là `B000-4-1` |
| `TCD_1` | ″ | không | không | pack có **>1 候補** ⇒ frm203018 đứng lại (xem §1) |
| `TCD_2` | ″ | không | không | 候補 mang đúng chuỗi 「有床義歯に係る口腔管理のみ」 |
| `TCD_3` | ″ | không | không | §C1 — cả `dis_kbn` 51..60 đều có 病名 thật ⇒ câu hỏi đo được |
| `TCD_4` | ″ | không | không | các `dis_cd` ca UI gõ có đúng `dis_kbn` mong đợi |
| `TCD_5` | ″ | không | không | bệnh nhân test **chưa** có 歯周病検査 đủ tư cách |
| `TCD_10` | `CmtPackDentureNoExamTests` | có | không | tiền đề: 0 dòng 歯周病検査 |
| `TCD_11` | ″ | có | không | **§C3** — 病名 Ｃ, không 検査 ⇒ pack **HIỆN** (đảo so với bản cũ) |
| `TCD_12` | ″ | có | không | 病名 MT (`dis_kbn` 51), không 検査 ⇒ pack **HIỆN** (bước 1) |
| `TCD_20` | `CmtPackDenturePlaqueTests` | có | **có** | **ĐỐI CHỨNG** — 病名 Ｃ + 現存歯 ⇒ pack **ẨN**; khẳng định seed đã ăn |
| `TCD_21` | ″ | có | **có** | **§C2** — 欠損病名 51 + 現存歯 ⇒ pack vẫn **HIỆN** (cú đảo ngược) |
| `TCD_22` | ″ | có | **có** | **§C1** — `dis_kbn` 53 ⇒ pack **ẨN** |
| `TCD_23` | ″ | có | **có** | **§C1** — `dis_kbn` 54 ⇒ pack **ẨN** |
| `TCD_24` | ″ | có | **có** | **§C1** — `dis_kbn` 60 ⇒ pack **ẨN** |
| `TcDP0` | `CmtPackDentureProbeTests` | có | không | probe `[Explicit]`, **không assert** |

**Cặp `TCD_21` (HIỆN) / `TCD_22..24` (ẨN) trên CÙNG một phiên** chính là bằng chứng cho §C1:
nếu WinForm coi 53/54/60 là 欠損 thì cả bốn phải cho cùng kết quả. `TCD_20` chạy **trước**
làm đối chứng — không có nó thì 「ẩn」 còn có thể do seed trượt (F20: seed đổi nhiều cột thì
cần seed ĐỐI CHỨNG).

### Chạy theo lô

```powershell
.\run-cmt-pack-denture.ps1                       # 1. 6 ca DB, ~0.3 giây, KHÔNG mở app — TRƯỚC TIÊN
.\run-cmt-pack-denture.ps1 -Probe                # 2. PROBE — nhìn app trước (F1)
.\run-cmt-pack-denture.ps1 -NoExam -Case TCD_11  # 3. §C3   (~2 phút/ca)
.\run-cmt-pack-denture.ps1 -NoExam -Case TCD_12
.\run-cmt-pack-denture.ps1 -Plaque -Case TCD_20  # 4. ĐỐI CHỨNG — chạy TRƯỚC 21..24
.\run-cmt-pack-denture.ps1 -Plaque -Case TCD_21  # 5. §C2
.\run-cmt-pack-denture.ps1 -Plaque -Case TCD_22  # 6. §C1
.\run-cmt-pack-denture.ps1 -Plaque -Case TCD_23
.\run-cmt-pack-denture.ps1 -Plaque -Case TCD_24
```

⚠️ **Đợi dòng `runner-task END` trong `logs\runner.log`, đừng ngủ một khoảng cố định** — copy
`.trx` sớm là copy phải kết quả của **lượt trước**.

⚠️ Và điều kiện chờ phải là 「**dòng CUỐI** của `runner.log` là `runner-task END`」, không phải
「trong vài dòng cuối **có** `END`」. `schtasks /run` trả về NGAY, lượt mới mất vài giây mới ghi
được dòng `START` — vòng chờ kiểu `Tail 5 | grep END` vì thế thấy ngay `END` của **lượt trước**
và thoát tức thì. Đã vấp thật 2026-09-21: đọc phải `.trx` của lượt trước, tưởng bản vá không ăn.

---

## 3. Phép đo

Pack có **2 候補** nên `frm203018` đứng lại. Luồng đọc **hai mốc độc lập**, và assert trên
cả hai:

| mốc | là gì |
|---|---|
| `PackAsked` | frm203018 bung ra **và** có dòng 「有床義歯に係る口腔管理のみ」 |
| `CommentLanded` | sau khi chọn 番号 1, dòng comment rơi xuống lưới (点 = 0, ô 療法・処置 mang chuỗi ấy) |

Hai mốc phải **đồng ý**. Lệch nhau ⇒ `MocLechNhau` bật, log in ra một dòng cảnh báo, và
**phải đọc ảnh trước khi kết luận** — thường là lượt chạy đứt giữa chừng chứ không phải app.

### 病名 đi tới dòng 歯管 bằng đường nào — và vì sao KHÔNG đi qua 病名選択

`CmtAuto.cs:196` đọc `dis_cd[]` của **dòng đang đứng**, mà mảng đó do `ModMain.AutoBui` chép
xuống từ **đúng một dòng ngay trên** (modMain.cs:139-156), **ngay lúc nhập**.

**Trong `TRNTRN` không có dòng 部位病名行 riêng** — 部位/病名 nằm trên **chính từng dòng 処置**
(`DIS_CD1..10`, `BUI1..32`, `DSP_BUI`, `DSP_DIS`); cái 「部位病名行」 nhìn thấy trên lưới chỉ là
cách **vẽ** khi 部位/病名 đổi giữa hai dòng liên tiếp. Nên luồng này **seed một dòng mang 病名**
(`211/0` 口腔内外科後処置 — đã kiểm: không kích hoạt pack nào) rồi gõ 歯管 vào dòng ngay dưới.

```
disp 9200  211/0  「TESTDIS100」  DIS_CD1 = 100, BUI[1] = 1     ← dòng MANG 病名
disp 9201  211/0  「TESTDIS393」  …                             ← dòng kế (chỗ Insert)
…
disp 920N  211/0  「TESTTAIL」    DIS_CD1 = 0                   ← chốt đuôi
```

`InsertBlankRow` chèn **TẠI** vị trí dòng mốc và đẩy dòng đó xuống ⇒ chèn tại dòng **kế** thì
dòng trống nằm đúng giữa, tức **ngay dưới** dòng mang 病名. Vì thế mới cần dòng chốt đuôi.

> 🔥 **Vì sao không đi qua 病名選択 — đã trả giá 5 lượt chạy 2026-09-21.**
> Chọn xong 病名, app chuyển panel phải sang tab 「ガイド」 và **cướp tiêu điểm bàn phím** vào ô
> 選択番号 của tab ấy (`txtGuid1Sel`). Click vào ô 点 của lưới **không** giành lại được, nên cả
> chuỗi 「gõ 116 → Enter」 rơi vào ô đó, và Enter = chọn dòng ガイド số 116 ⇒ app mở
> 「ガイド処置選択」 (`frm203002.cs:6543` — **chỗ duy nhất** mở `ID203017`). Log chỉ nói
> 「処置選択 KHÔNG mở」/「KHONG thay dong 116/枝番 = 7」, tức **đổ oan cho app**. Ảnh
> `11x_khong-mo-duoc-処置選択.png` cho thấy 「選択 No. **[116]**」 ở góc dưới phải.
> Chuyển tab sang 病検 **không** cứu được; huỷ hộp bằng 戻る cũng không, vì app còn
> `txtGuid1Sel.Focus()` ngay sau khi huỷ (`frm203002.cs:6547`).

⚠️ **`RegiRow` là ẢNH CHỤP, không phải con trỏ sống.** Dùng lại một `RegiRow` sau khi lưới vẽ
lại là click vào **toạ độ cũ** (F10) — và ở màn này toạ độ cũ có thể rơi ra panel phải. Mọi
bước đều đọc lại `Snapshot(200)` ngay trước khi click.

### Vế 現存歯 thì ngược lại — seed là đúng

`getPlaqueTeeth` (CmtAuto.cs:1978-2035) đọc `ModSave.trtDataList`, nạp **một lần** lúc mở
診療入力 từ 1900-01-01 tới ngày đang xem (frm203004.cs:855). Đó là **trạng thái xuất phát**,
không phải thứ đang đo ⇒ seed **TRƯỚC KHI APP MỞ** là đúng và là cách duy nhất (F20).

Dòng seed phải thoả **cả ba**, thiếu một là hàm trả `null` và ca đo kết luận **ngược**:

1. `trt_cd/trt_sb` ∈ `kvPlaqueTest` (CmtAuto.cs:1981-2021) — luồng dùng **121/4** Ｐ精検;
2. một trong `dis_cd1..10` là **103 (Ｐ)** hoặc **104 (単Ｇ)** — hard-code ở CmtAuto.cs:2025;
3. ít nhất một `bui` khác 0, **và răng đó không bị `SIGA` đánh 欠損** — `UpdMissingTooth`
   (CmtAuto.cs:2048-2100) xoá trắng mọi ô `se<n> = 4` **trước** vòng 「có 現存歯 không」.

⇒ `CmtPackDentureUiTestBase` đọc `SIGA` trước khi app mở và chọn ô 部位 đầu tiên **không**
bị 欠損. Hard-code ô 部位 là tự dựng ra ca đối lập mà không có dấu hiệu gì.

---

## 4. Ghi DB

Chỉ `CmtPackDenturePlaqueTests` ghi, và chỉ **một** dòng 歯周病検査. Ba hàng rào (F20):

| | |
|---|---|
| cờ riêng | `cmtPackDenture.allowSeed`, **mặc định tắt** ⇒ fixture tự `Ignore` **trước khi mở app** |
| dải `disp_no` | **9200..9299**, `DELETE` chặn cứng trong dải — tách khỏi 9100..9199 của `CmtPackExitFlg` và khỏi dòng 再初診 cố định ở `disp_no = 9001` |
| chụp / in / trả lại | nguyên trạng in ra stdout **trước** khi seed; teardown xoá rồi **đếm lại** |

**Không ca nào bấm F9 登録.** Dòng do testcase gõ chỉ nằm trong lưới đang mở và biến mất khi
`runner-task.ps1` kill `MENU.exe`.

Kiểm sau mỗi buổi — phải ra **0**:

```sql
SELECT COUNT(*) FROM TRNTRN WHERE DISP_NO BETWEEN 9200 AND 9299
```

> ⚠️ Dọn tay thì **đừng bấm 「はい」** ở 「処置データは、変更されています。保存しますか？」 —
> `modSave.SaveData` xoá sạch rồi chèn lại toàn bộ 処置行 của tháng.

---

## 5. Đo được trên máy thật

<!-- Điền sau MỖI lượt chạy: ngày, bệnh nhân, 診療月, số đo nguyên văn. -->
<!-- Để trống là lần sau đo lại từ đầu. -->

### 2026-09-21 · `CmtPackDentureMasterTests` · SIM2000 **cổng 1434** · 6/6 xanh

| | |
|---|---|
| pack | `B000-4-1` [20260601..99999999] type 1 「歯管-有床義歯」 |
| 処置 kích hoạt | **116/7** 歯管 90点 — đúng **1** pack |
| 候補 | **2** — seq 1 `com_cd 820101879` 「有床義歯に係る口腔管理のみ」; seq 2 `810000001` 「※上記に該当しない場合、[F10戻る]ﾎﾞﾀﾝを押下してください」 |
| `dis_kbn` 51..60 | **đủ cả 10**, gồm 53 (2 病名), 54 (5), 60 (1) ⇒ §C1 đo được |
| bệnh nhân | **9** — 64 dòng lịch sử, **0** dòng 歯周病検査 đủ tư cách, 5 răng chưa 欠損 (ô 1, 16, 17, 18, 32) |
| 診療月 | 2026-08 (có 8 dòng ở ngày 11, trong đó đã sẵn một dòng 116/7) |

`MST_TRT266` (bản hiệu lực từ 2026-06-01): **1697/1697 dòng `ACTIVE_FLG = 1`** — không dòng
nào khác 1. Xem §6.

### 2026-09-21 · `TcDP0` PROBE · bệnh nhân 9 · 診療月 2026-08 · cổng 1434

Probe **không assert**, nhưng nó trả lời bốn câu mà đoán sai là viết cả fixture theo hướng sai.

**① `frm203018` bung ra thật, và phép đo chạy thông suốt.** Nguyên văn:

```
#1 frm203018 「摘要選択(歯管-有床義歯に係る口腔管理のみを行った場合)」
   hướng dẫn 「歯管-有床義歯に係る口腔管理のみを行った場合、選択してください。」
   dòng[番号1:有床義歯に係る口腔管理のみ /
        番号2:※上記に該当しない場合、[F10戻る]ボタンを押下してください]  → chọn 番号 1
+ [78] 11 | 歯科疾患管理料             | 90 | 1
+ [79] 11 | 有床義歯に係る口腔管理のみ |  0 | 1     ← dòng comment, 点 = 0
```

Hai mốc `PackAsked` / `CommentLanded` **đồng ý**. ⚠️ Lượt này 病名 chọn **trượt** (xem ③) nên
nó đo 「không có 病名 + không có 歯周病検査 ⇒ pack HIỆN」, chứ chưa phải §C1.

**② 選択 病名 欠損 thì app tự mở `ガイド処置選択`.** Sau khi chọn MT (393), app bung một hộp
`#32770` 「ガイド処置選択」 chứa 咬合調整 / 補綴前処置 / 義歯連合印象 / 咬合採得… —
`SigaToothFlow.Picker()` **nhận nhầm nó là 処置選択**, không thấy 116/7, rồi cả lượt kẹt
(「KHONG thay dong 116/枝番 = 7」). Nó là hộp **gợi ý**, huỷ bằng `F10 戻る` không ảnh hưởng
phép đo ⇒ `CmtPackDentureUiTestBase.DismissDialogsTitled(trace, "ガイド")` chạy TRƯỚC khi gõ mã.

**③ Danh sách mặc định của `frm902007` là bộ ĐÃ HỌC, không phải cả master.** Đo được **59
dòng** trong khi `MST_DIS992` có **402 病名**, và `dis_cd 369` (Brダツリ, `dis_kbn` 53)
**không** có trong đó ⇒ `PickDisease` trả false, app bung
「病名が選択されていませんが、よろしいですか?」, dòng lưới KHÔNG mang 病名 — **ca đo đi tiếp và
lặng lẽ đổi sang đo 「không có 病名」**. Đây là kiểu xanh-sai nguy hiểm nhất của luồng.

Chữa: bấm nút nhóm ở đáy hộp thoại trước khi chọn (`SetBuiOnRow(beforePick:)`).
Bảng tra từ `MstDis.cs:245-268`:

| nút | `dis_kbn` |
|---|---|
| `F1 硬組織疾患` | 1, 2, 3, 4, 5, 9 |
| `F2 歯周疾患` | 11, 12, 13, 14, 19 |
| `F3 外科関連` | 21..30 |
| `F4 ダツリ・ハソン` | 41, 42, 43 |
| **`F5 欠損補綴`** | **51..60** ← trọn dải của luồng này |
| `F6 補助病名` | `dis_cd` 254..299 hoặc `dis_kbn = 80` |
| `F9 全て表示` | cả master |

⚠️ `F5 欠損補綴` lấy **51..60**, tức **KHÁC** bộ 7 của `CmtAuto.cs:206-220` (51,52,55..59) và
khác `ChkDisMissingTheeth` (51..59) — đúng ba nơi ba bộ như ghi chú gốc nói. Nút lọc **không**
phải nguồn chân lý cho 「thế nào là 欠損」.

**④ `カルテ記載選択` bung ra SAU cascade** (nút `F1 部位, F9 確定, F10 戻る`). Không ảnh hưởng số
đo của lượt đang chạy, nhưng để nguyên thì lượt sau **không mở được 部位選択** ⇒ cũng dẹp bằng
`戻る`.

### 2026-09-21 · `TCD_11` (§C3) · bệnh nhân 9 · 診療月 2026-08 · cổng 1434 · **XANH**

Tiền đề: bệnh nhân **0** dòng 歯周病検査 đủ tư cách; dòng mang 病名 `Ｃ (100, dis_kbn 1)`.

```
処置選択 mở đúng: [0] 116/7 「歯科疾患管理料」 90点  … 18 dòng
#1 #32770 「お茶コン」 08/11 116-7 歯科疾患管理料を算定していますが、
                      当月の算定限度(1回)を超えています。      → いいえ/No/OK
#2 frm203018 「摘要選択(歯管-有床義歯に係る口腔管理のみを行った場合)」
     番号1: 有床義歯に係る口腔管理のみ
     番号2: ※上記に該当しない場合、[F10戻る]ボタンを押下してください   → chọn 番号 1
+ [79] 11 | 有床義歯に係る口腔管理のみ | 0 | 1

=== KQ === 病名 100 · pack HIỆN (hộp thoại hỏi = True, comment rơi xuống lưới = True)
```

⇒ **§C3 xác nhận trên máy thật**: không có 歯周病検査 + 病名 Ｃ ⇒ pack **HIỆN**. Đây là cú
**đảo ngược** so với logic cũ (danh sách cứng `{100, 101, 102, 111, 112, 158}` ẩn pack).

ℹ️ Hộp 「当月の算定限度(1回)を超えています」 bung ra vì bệnh nhân 9 **đã có sẵn** một dòng
116/7 ở 2026-08-11. Nó không chặn cascade; trả lời いいえ xong `prgCmtAuto` vẫn chạy tiếp.

### 2026-09-21 · dữ liệu THẬT đã lưu của bệnh nhân 9 (2026-06-02) — số đo phụ

`TRNTRN` còn giữ nguyên một lượt nhập thật, và nó nói cùng một điều:

| disp | 処置 | 病名 | ghi chú |
|---:|---|---|---|
| 16 | `116/7` 歯科疾患管理料 90点 | `DIS_CD1 = 103` (Ｐ, **dis_kbn 11** — KHÔNG phải 欠損) | dòng kích hoạt |
| 17 | `6/0` 0点 | ″ | **「有床義歯に係る口腔管理のみ」** |

⇒ 病名 ngoài nhóm 欠損 + bệnh nhân không có 歯周病検査 đủ tư cách ⇒ pack đã HIỆN. Khớp
`TCD_11`.

---

## 6. §C2 — ĐÃ ĐO ĐƯỢC: 欠損病名 THẮNG 現存歯

### 2026-09-22 · bệnh nhân **4** · 診療月 2026-06 · cổng 1434 · app build 2026-09-21

Bệnh nhân 4 **tự nhiên** thoả tiền đề 「còn 現存歯」 — không seed vế này:
`SIGA` có **32/32 răng = 0** (không răng nào 欠損), và 4 dòng 歯周病検査 THẬT mang 病名 Ｐ(103):
`167/3`, `121/7`, `121/4`, `135/3`.

| 病名 | `dis_kbn` | pack | khớp source? |
|---|---|---|---|
| MT (393) | **51 欠損** | **HIỆN** | ✅ bước 1 bật cờ rồi `break`, khối 現存歯 không chạy |
| Ｃ (100) | 1 | **ẨN** | ✅ bước 1 không khớp → bước 2 gặp 現存歯 → tắt |

⇒ **§C2 xác nhận**: 欠損病名 **thắng** 現存歯 (`CmtAuto.cs:206-220`). Bản port 2 bước của
`ListCascadeCmtAutosHandler` là **đúng**. Ca Ｃ ẨN chứng minh nhánh 現存歯 vẫn hoạt động, nên
「HIỆN」 của MT không phải do nhánh đó chết.

---

## 7. 🔥 HAI NGUYÊN NHÂN LÀM SAI SỐ ĐO — đọc trước khi sửa bất cứ ca nào

Trước khi ra được bảng trên, luồng này cho **năm số đo sai liên tiếp**, cái nào cũng 「chạy
trơn tru」 và cho ra con số trông hợp lý. Hai nguyên nhân:

### 7.1 App build cũ hơn source

`MENU.exe` là bản **2026-07-31**, còn `CmtAuto.cs` mang thay đổi **2026-09-07** — đúng cái §C
hỏi. Phải build lại mới đo được:

```powershell
& "C:\Windows\Microsoft.NET\Framework\v3.5\MSBuild.exe" `
    C:\ochacom-branches\src\OCHACOM\OCHACOM.sln /p:Configuration=Debug /p:Platform=x86
```

Bộ nhị phân cũ sao lưu ở `C:\ochacom-branches\_bin-backup-20260921` (INP.dll cũ 1364480 byte,
mới 1373696 byte — so `Length` là phân biệt được ngay).

**Kiểm trước mỗi buổi đo:** `LastWriteTime` của `MENU.exe`/`INP.dll` phải **mới hơn** file
`.cs` mà ca đo đang dựa vào.

### 7.2 ⭐ `prgCmtAuto` đọc 病名 ở VỊ TRÍ CON TRỎ, không phải dòng vừa gõ

`frm203002.cs:9900-9906` đọc `dis_cd[]` từ `hFG1[i+40, CurrentCellAddress.Y]` — mà Enter ở ô
回 **đã dời con trỏ xuống DÒNG KẾ**.

Với người dùng thật điều này vô hại: dòng kế là dòng **trống** mới, và `ModMain.AutoBui` vừa
chép cùng 部位/病名 xuống đó, nên đọc dòng nào cũng ra cùng 病名. Nhưng nếu dòng kế **đã có
nội dung** thì `AutoBui` KHÔNG chép (chỉ chép khi trống hoàn toàn ở cột 8..49,
modMain.cs:139-156) ⇒ `dis_cd` về 0.

Cả năm số đo sai đều giải thích được bằng đúng câu đó:

| bố trí lưới | dòng ngay dưới 歯管 | 病名 app THẬT SỰ đọc | pack |
|---|---|---|---|
| nhiều carrier, nhắm Ｃ | carrier MT(51) | **MT** | HIỆN ✗ |
| nhiều carrier, nhắm MT | carrier Brダツリ(53) | **Brダツリ** | ẨN ✗ |
| một carrier MT, đuôi `TESTTAIL` | `TESTTAIL` (đã có nội dung) | **không có** | ẨN ✗ |
| một carrier Ｃ, đuôi `TESTTAIL` | ″ | **không có** | ẨN ✗ |
| **một carrier + HAI dòng trống** | dòng trống (AutoBui chép) | **đúng 病名** | ✅ |

⇒ **Luật của luồng:** chèn **HAI** dòng trống — một để gõ 歯管, một để con trỏ rơi vào và
`AutoBui` chép 病名 xuống. Và **mỗi lượt chỉ seed ĐÚNG MỘT 病名**
(`cmtPackDenture.disCd`): lệch một dòng khi đó chỉ có thể ra 「病名 đó」 hoặc 「không có
病名」, không bao giờ ra một 病名 KHÁC.

### 7.3 Ba hàng rào bắt buộc

Không có chúng thì luồng cho **xanh sai** — 「không có 病名」 và 「có 病名 Ｃ」 cho cùng kết quả
ở nhiều ca, nên ca đối chứng KHÔNG phát hiện được:

| hàng rào | bắt lỗi gì |
|---|---|
| 部位病名行 mang đúng 病名 có trên lưới | seed thiếu `DSP_BUI` (xem §3) |
| dòng 歯管 vừa gõ nằm dưới 部位病名行 **đúng 病名** | chèn dòng sai chỗ |
| `PackAsked` và `CommentLanded` **đồng ý** | lượt chạy đứt giữa chừng |

