# MSGTBL ↔ ja-msgtbl.ts — 40 mã thông báo, đối chiếu với bảng THẬT

Trả lời đúng một câu hỏi: **mấy câu thông báo mà audit nói là sai — có sai thật không?**

```powershell
.\run-msgtbl-parity.ps1             # 1. chỉ DB, vài giây, KHÔNG mở app
.\run-msgtbl-parity.ps1 -WithUi     # 2. thêm hai ca bung hộp thoại thật
.\run-msgtbl-parity.ps1 -CallSite   # 3. TCC1/TCC2 — Q00049 + Q00039 tại call-site
.\run-msgtbl-parity.ps1 -Probe      # 4. PROBE 患者登録 + hai call-site trên
```

---

## 0. Đối chiếu với bộ Playwright

Bên `web-tenant-tests` có 4 spec `*msgtbl*` phủ 15 mã. Vế WinForm tương ứng:

| Spec Playwright | Mã | Vế WinForm | Trạng thái |
|---|---|---|---|
| `fkey-menu/msgtbl-treatment-list-parity` | Q00049, Q00039 | `MsgTblCallSiteTests` TCC1/TCC2 | ✔ **đo xong 2026-09-15, 2/2 xanh** |
| `patient-select/msgtbl-date-insurer-parity` | Q00009 ×2, Q00010, E00002 | 患者登録 `frm201001` | ⏳ có bản đồ màn hình (TCM9), cần bệnh nhân seed |
| `patient-select/msgtbl-register-f9-parity` | E00010, E00012, E00016, E00017, E00022, Q00012, Q00013, Q00014 | 患者登録 `frm201001` F9 登録 | ⏳ như trên |
| `dialogs-management/referral-letter-msgtbl-parity` | I00003, Q00002, Q00003, I00001, E00001 | 紹介状 `frm203053` (Shift+F3 từ frm203002) | ⏳ chưa probe |

**Vì sao cần vế WinForm khi đã có `MsgTblParityTests`.** Fixture đó so BẢNG (row MSGTBL ↔
literal web). Nó không trả lời được hai câu mà parity hỏng thật sự hay nằm ở đó:

1. **tình huống này bung mã NÀO** — chọn nhầm mã thì chuỗi vẫn "đúng" theo bảng mà người
   dùng vẫn đọc sai câu (đúng vụ I00002/I00003 của 紹介状);
2. **WinForm truyền THAM SỐ gì vào `{0}`** — bảng chỉ có khuôn, câu người dùng thấy là
   khuôn đã điền.

Thêm một thứ chỉ đo được ở giao diện: **nút mặc định**. UIA không phơi ra, Win32 thì có
(F16) — và với Q00049 đó là chi tiết có nghĩa.

---

## 1. Kết luận đo được (2026-09-15, chạy thật trên `ochacom-win`)

Cả 7 ca **XANH**. Hai ca giao diện đọc nguyên văn hộp thoại của WinForm:

```
TCM5 (đối chứng)  WinForm hiện      : 「個別入力のコードが間違っています。」
                  row MSGTBL render : 「個別入力のコードが間違っています。」
                  literal web       : 「個別入力のコードが間違っています。」   ← ba vế trùng khít

TCM6 (ca dương)   WinForm hiện      : 「該当データがありません。」
                  row MSGTBL        : 「該当データがありません。」            ← WinForm == DB
                  literal web       : 「該当するデータがありません。」        ← web LỆCH
                  nút của hộp       : OK
```

TCM5 khớp cả ba vế ⇒ cách đo là công bằng. Trên nền đó, TCM6 lệch là **lệch thật**: câu
người dùng thấy trên WinForm đúng bằng row MSGTBL, và bản web đang hiện câu khác.


`SIM2000.MSGTBL` — **140 row** — đối chiếu với 40 mã bản web định nghĩa:

| | Số mã |
|---|---|
| Khớp từng ký tự | **24** |
| Lệch | **16** |

Audit `audit-260911-1248-msgtbl-db-parity.html` nói 22 mã lệch. Chênh lệch 6 mã là do
commit `1e5afabb7` (nhánh `demo1`) đã sửa xong **E00013, E00021, Q00009, Q00010, I00002**,
thêm **I00003**, và gỡ **E00020**. Sáu mã đó nay nằm ở nhóm đối chứng.

**Audit đúng.** Không mã nào trong 22 là báo động giả — cột 「Cũ」 của nó trùng khít row DB
ở cả 16 mã còn lại.

### 16 mã còn lệch

| Mã | MSGTBL (DB) | web hiện tại |
|---|---|---|
| E00003 | 該当データがありません。 | 該当**する**データがありません。 |
| E00007 | データが選択されていません。 | 選択するデータがありません。 |
| E00010 | 苗字と名前の間に空白が必要です。 | 氏名は姓名を空白で区切って入力してください。 |
| E00012 | 氏名（漢字）の文字数が越えています。**全角で20文字、半角で40文字までです。** | 氏名（漢字）の桁数が長すぎます。 |
| E00016 | 年齢が**１６**歳未満で社保の本人になっています。 | 16歳未満は社保・本人で登録できません。 |
| E00017 | 年齢が**１６**歳未満で退職者の本人になっています。 | 16歳未満は退職者保険・本人で登録できません。 |
| E00018 | 保険種別が「社保、国保、社・退、国・退、後期高齢者」の場合、保険情報を選択してください。 | 保険情報が紐付いていません。保険証情報を入力してください。 |
| E00019 | 保険種別が「公・単」の場合、公費情報を選択してください。 | 公費情報が紐付いていません。公費情報を入力してください。 |
| E00022 | {0}の文字数が越えています。 | {0}の桁数が長すぎます。 |
| E00052 | 高齢者の設定に誤りがあります。 | 退職者保険では高齢者区分を指定できません。 |
| Q00004 | {0}終了してよろしいですか？ | {0}終了します。よろしいですか？ |
| Q00012 | {0}歳以上で、**保険者番号**が…ですか？**「はい」を押すと生保後期高齢者、「いいえ」を押すと後期高齢者、「キャンセル」で保留します。** | {0}歳以上で、**保険証番号**が…ですか？ |
| Q00013 | …高齢者ですか？**「はい」を押すと高齢者、「いいえ」で保留します。** | …高齢者ですか？ |
| Q00014 | 有効期限が切れています。このままでよろしいですか？ | 有効期限が過ぎています。このまま登録してよろしいですか？ |
| Q00039 | **{0}プリンタに**用紙をセットしてください。 | 用紙をセットして下さい。 |
| Q00049 | {0}の会計データを**一括**作成します。**既に入力済の会計データは全て上書きされます。**実行してよろしいですか？ | {0}の会計データを作成します。よろしいですか？ |

Ba mã đáng lo hơn phần còn lại, vì phần bị cắt mang thông tin người dùng **cần để quyết định**:

* **Q00049** — mất câu 「dữ liệu kế toán đã nhập sẽ bị ghi đè toàn bộ」. Legacy truyền
  `MessageBoxDefaultButton.Button2` cho hộp này (frm203001.cs:430), tức là chính legacy
  coi đây là thao tác nguy hiểm và để mặc định ở **Cancel**.
* **Q00012 / Q00013** — mất phần chỉ rõ mỗi nút làm gì, trong khi Q00012 là hộp **3 nút**
  (`ShowYesNoCancelMsg`, frm201001.cs:2433) và Q00013 là hộp 2 nút (:2463). Bỏ phần đó
  thì người dùng không biết 「いいえ」 nghĩa là 後期高齢者 hay là 保留.
* **Q00012** còn sai **tên trường**: DB ghi 保険者番号 (mã cơ quan bảo hiểm), web ghi
  保険証番号 (số thẻ). Comment trong legacy (frm201001.cs:2432) viết 保険証番号 — nhưng
  code ngay dưới kiểm `med.ins_no.Length == 8 && StartsWith("39")`, tức là **保険者番号**.
  Row DB đúng nghiệp vụ, **comment legacy mới là chỗ sai** — và bản web đã chép theo comment.

### Hai lỗi không phải chuyện câu chữ

* **E00007** — chuỗi web đang giữ (`選択するデータがありません。`) chính là **body của
  E00100** tại `frm201045.cs:298`, không phải row E00007. `TCM3` chứng minh bằng cách
  render E00100 với đúng tham số đó và so khớp.
* **Q00039** — row có `{0}` (tên máy in) và legacy **có** truyền (frm203046.cs:156,
  CommonNikei.cs:272/329/343/359, frm305004.cs:462/541), nhưng hàm web khai **0 tham số**
  và cắt luôn cụm 「プリンタに」. `TCM4` là bất biến chung bắt loại lỗi này, Q00039 là
  ngoại lệ duy nhất được ghi nhận.

---

## 1b. Bằng chứng bằng ẢNH — để người khác tự xác nhận

Mỗi lần một hộp thoại được bắt, cả hai vế chụp **riêng cái hộp thoại đó** (không phải cả
màn hình) và ghi kèm nguyên văn vào manifest:

```
msgtbl-evidence/
  win/<MÃ>__<chỗ bung>.png    ảnh MessageBox WinForm, cắt theo #32770   (Infrastructure/MsgEvidence.cs)
  web/<MÃ>__<chỗ bung>.png    ảnh hộp thoại web, cắt theo locator       (tests/_shared/msgtbl.ts)
  {win,web}/manifest.tsv      mã ⇥ nguyên văn ⇥ khuôn MSGTBL ⇥ nút ⇥ ảnh ⇥ giờ
  index.md                    bảng đối chiếu hai vế, có ✔/✘
```

```bash
./collect-msgtbl-evidence.sh            # kéo vế win từ ochacom-win rồi dựng index.md
./collect-msgtbl-evidence.sh --no-fetch # chỉ dựng lại index từ cái đang có
```

Ảnh chụp **trước khi assert chạy**, nên lượt đỏ cũng có ảnh — lúc đỏ mới là lúc cần nhìn.
Ảnh cắt riêng nên nặng 4–25 KB thay vì 2 MB của ảnh toàn desktop.

**Cột 「khớp」 so theo KHUÔN, không so nguyên câu.** Khuôn MSGTBL được cắt ở `{0}` thành
các đoạn cố định; vế web phải chứa đủ các đoạn ấy, đúng thứ tự. Phải làm vậy vì cùng một
mã, hai call-site truyền tham số khác nhau: `E00002` ở tab 個別 là 「個別入力のコード」
còn ở 患者登録 là 「保険者番号」 — so nguyên câu thì ra "lệch" trong khi cả hai đều đúng.

---

## 2. Vì sao phải đo lại, và đo bằng gì

Audit dựa trên `legacy/DB/MSGTBL.sql` — file nay **không còn** trên máy nào. Không có nó,
~10 mã 「sai chữ thuần」 chỉ là lời khai không kiểm được.

Bộ này bỏ đường vòng đó: hỏi **thẳng SQL Server** `SIM2000`, bảng `MSGTBL`, 140 row.
Chuỗi kết nối lấy từ `db.connectionString` — cùng chuỗi mà app dùng
(`INP/Call/Ocha.xml` → `<DbConnectString>`).

> `MSG` là `varchar` (CP932) chứ không phải `nvarchar`. `Microsoft.Data.SqlClient` giải mã
> theo collation của cột nên chuỗi trả về đã là Unicode — **đừng** ép `Encoding` lần nữa.

### Hai nửa của một bằng chứng

| Nửa | Fixture | Trả lời |
|---|---|---|
| Dữ liệu | `MsgTblParityTests` (không mở app) | row DB nói gì, web nói gì, lệch ở đâu |
| Giao diện | `MsgTblDialogTests` (mở app) | row DB **có đúng là** câu người dùng thấy không |

Nửa thứ hai là thứ không script nào thay được: giữa row và màn hình còn `getMsg` với ba
nhánh của nó, và còn khả năng app đọc bảng khác.

---

## 3. Các ca

```
TCM0  MSGTBL có đúng 140 row; in bảng đối chiếu đầy đủ 40 mã        (chỉ DB)
TCM1  ĐỐI CHỨNG — 24 mã web đang khớp thì phải khớp TỪNG KÝ TỰ      (chỉ DB)
TCM2  16 mã đang lệch — lệch ĐÚNG như đã đo                          (chỉ DB)
TCM3  E00007 = body của E00100@frm201045; E00020 cũ = E00002 đã
      render; E00101 KHÔNG có row (nhánh 3 của getMsg)               (chỉ DB)
TCM4  bất biến: row có {0} ⇔ hàm web nhận tham số; Q00039 ngoại lệ   (chỉ DB)

TCM5  ĐỐI CHỨNG GIAO DIỆN — E00002 trên 個別 tab: hộp thoại == row
      DB == literal web                                              (mở app)
TCM6  E00003 trên frm203042: hộp thoại == row DB, KHÁC literal web   (mở app)

TCC1  Q00049 — frm203001 「F7 会計作成」: câu có cảnh báo GHI ĐÈ, nút
      mặc định là Cancel; bản web bỏ cả hai                        (mở app)
TCC2  Q00039 — 来患集計 「F1 印刷」: câu có 「プリンタに」 và CÓ điền
      tham số " "; bản web bỏ cả hai                                (mở app)

TCM9  PROBE [Explicit] — Q00049/Q00039 nguyên văn + bản đồ 患者登録  (mở app)
```

### Đo được tại call-site (2026-09-15, TCC1/TCC2 xanh)

```
Q00049  frm203001.cs:430
  WinForm : 令和08年09月15日の会計データを一括作成します。
            既に入力済の会計データは全て上書きされます。実行してよろしいですか？
  {0}     : 「令和08年09月15日」  (_dtTrtDt.getWareki())
  nút     : OK / Cancel — mặc định CANCEL (MessageBoxDefaultButton.Button2)
  web     : {0}の会計データを作成します。よろしいですか？

Q00039  frm203046.cs:156
  WinForm : 「 プリンタに用紙をセットしてください。」   ← dấu cách đầu = tham số " "
  nút     : OK / Cancel — mặc định OK
  web     : 用紙をセットして下さい。
```

Dấu cách đầu câu của Q00039 là bằng chứng trực tiếp rằng `{0}` CÓ được điền — chỉ là
legacy điền bằng một chuỗi trống nghĩa. Bản web khai 0 tham số nên không có chỗ nào để
điền tên máy in.

### Vì sao TCM1 và TCM5 tồn tại

Không có chúng thì 「web khác DB」 cũng có thể do đọc nhầm bảng, nhầm collation, chụp nhầm
nhánh web, hay đọc hộp thoại sai cách. **24 mã khớp chính xác** (TCM1) và **một hộp thoại
khớp cả hai vế** (TCM5) cho thấy cả bốn thứ đó đang đúng. Đây đúng vai 「seed đối chứng」
của `PROBE-GUIDELINE`: không có nó thì quan sát không thành kết luận.

---

## 4. Test này XANH, và nó kêu khi nào

`WebMsgSnapshot` ghi lại hiện trạng cả hai vế. `TCM2` khẳng định 16 mã lệch **đúng như đã
đo** — nên hôm nay cả fixture xanh. Nó chuyển đỏ khi:

* **web sửa xong một mã** → đỏ kèm câu 「chuyển mã này sang `Matching`」. Đó là lời nhắc cập
  nhật bảng, không phải lỗi mới.
* **row MSGTBL đổi** (đổi master, hoặc chuỗi kết nối trỏ nhầm `SIM2025`) → đỏ kèm cả hai chuỗi.

Một bộ test đỏ vĩnh viễn thì sau hai ngày không ai đọc nữa. Bộ này xanh, và chỉ kêu khi có
thứ thật sự đổi.

---

## 5. Bẫy

1. **KHÔNG so chuỗi qua `Txt.N`.** Hàm đó chuẩn hoá NFKC, mà NFKC biến 「１６歳」 (đúng như
   row E00016/E00017 đang lưu) thành 「16歳」 — xoá đúng khác biệt đang đo. Cả bộ dùng
   `StringComparison.Ordinal`, và in qua `Txt.Vis` để 全角/半角 phân biệt được trên `.trx`.
2. **So trên `Found.Raw`, không phải `Found.Text`.** `Text` đã làm phẳng `\r\n` thành space.
   Câu một dòng thì như nhau, nhưng ngày ai thêm ca Q00012/Q00049 (câu dài, MessageBox tự
   xuống dòng) thì bản phẳng nuốt mất đúng chỗ cần đo — assert 「nguyên văn」 trên bản đã
   phẳng là **xanh giả**.
3. **`Uia.Click` treo trên nút mở MessageBox** (F18). Cả hai ca giao diện bấm bằng chuột
   vật lý.
4. **`KarteAutoCalcDialog.OpenList` không mở được menu 選択.** Đo 2026-09-15: nó ném
   「bam btnF11 xong nhung khong thay cua so popup menu nao trong 5s」 trong khi **ảnh chụp
   lúc đỏ cho thấy popup đang mở rành rành** giữa màn hình — cú bấm đúng, chỉ phần dò
   popup của UIA là mù (cùng bệnh mà F17 nói về `Dialogs.Open`). TCM6 vì thế đi **đường
   bàn phím**: `F11` → `9` → `6`, dựa trên phím tắt `&` khai ngay trong designer
   (`IDM_Option.Text = "&9 オプション"` frm203002.Designer.cs:2838 →
   `IDM_AutoCmt.Text = "&6 コメント自動入力登録"` :2879). Không dò gì thì không mù được.
   *(Tiện thể: hằng của mục đó là `IDM_AutoCmt`, không phải `IDM_CmtAuto` như
   `KarteAutoCalcDialog.MenuItemId` đang ghi.)*
5. **Đừng gõ 処置コード để ép 0 件** ở frm203042: ô đó `MaxLength = 3` nên mọi mã gõ được
   đều nằm trong dải master thật, và 「mã nào đang trống」 đổi theo từng máy. TCM6 lọc theo
   **tên** (`trt_nm LIKE '%ZZZZZZZZ%'`, MstTrt.cs:2250) — chuỗi Latin không bao giờ nằm
   trong tên 処置 tiếng Nhật.

---

## 6. Việc còn lại

14 trong 16 mã còn lệch nằm ở **患者登録** (`frm201001` / `frm201021`) — màn hình bộ FlaUI
này chưa từng lái. Mọi câu ở đó bung **sau khi bấm 登録**, mà nếu dữ liệu tình cờ hợp lệ
thì cú bấm đó **ghi thật** vào hồ sơ bệnh nhân.

Nên ca thật cho chúng phải chạy trên **bệnh nhân test** do `SeededPatientTestBase` dựng
(`PAT_NO >= 990000`, xoá sạch sau lượt chạy). `TCM9` là bước chuẩn bị: nó mở màn hình,
đổ ra ô/nút/cây UIA để người viết ca tiếp theo không phải đoán. Xem `Tests/PackDialog/`
làm mẫu cho phần seed.

Ngoài ra, hai vế còn chưa đo:

* **100 mã** có trong MSGTBL nhưng bản web chưa định nghĩa — chưa ai kiểm chúng đã được
  port sang đường khác hay chưa dùng tới.
* Nhánh **「nối vào cuối」** của `getMsg` (row không có `{0}` mà người gọi vẫn truyền tham
  số): legacy chỉ đi vào nhánh này ở `E99999` và `I00100`, và bản web chưa dùng hai mã đó.

---

## 7. File

| File | Vai |
|---|---|
| `MsgTblOracle.cs` | đọc `MSGTBL`, dựng lại ba nhánh của `MsgDialog.getMsg` |
| `WebMsgSnapshot.cs` | ảnh chụp 40 literal của `ja-msgtbl.ts` + chuỗi DB đo cùng lúc |
| `MsgTblParityTests.cs` | TCM0–TCM4 — chỉ DB, không mở app |
| `MsgTblDialogTests.cs` | TCM5–TCM6 — bung hộp thoại thật |
| `MsgTblCallSiteTests.cs` | TCC1–TCC2 — đo Q00049/Q00039 tại chính call-site |
| `MsgTblProbeTests.cs` | TCM9 `[Explicit]` — probe Q00049/Q00039 + bản đồ 患者登録 |
