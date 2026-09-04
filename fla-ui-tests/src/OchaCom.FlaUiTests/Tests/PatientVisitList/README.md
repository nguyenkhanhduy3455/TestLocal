# 来患一覧 (`frm204008`) — nửa WinForm của `patient-visit-list-rcp-type.spec.ts`

Anh em song sinh của `web-tenant-tests/tests/patient-visit-list-rcp-type.spec.ts`.
Bên kia đo **bản web**, bên này đo **chính WinForm** — tức là đo cái “đáp án” mà bản
web phải khớp.

## 1. Đang đo cái gì

Cột `レセプト種別` bị báo là “luôn null” ở bản web. Soát lại thì lộ ra một bug **khác**
ở đúng cột đó: `buiPrice.getReceiptType` ghi `単独` **ngược** vào
`patInfoData.ins.combi_kbn` (`COMMON/Lib/buiPrice.cs:1563`).

* **WinForm** gọi `PatInfoList.getPatInfoCopyData` lại cho **TỪNG dòng**
  (`frm204008.cs:711`) ⇒ ghi đè không lan sang dòng sau.
* **Bản web** dùng lại **một** instance `Insurance` xuyên các ngày ⇒ một ngày không có
  公費 kéo mọi ngày sau xuống `単独`.

Fixture này **không** so trực tiếp hai bên (hai máy, hai DB). Nó chốt đáp án WinForm
bằng một **oracle độc lập** dựng thẳng từ `insurance` + `medinsinf`
(`ReceiptTypeOracle`), và spec Playwright có **đúng** hàm oracle đó
(`expectedReceiptType`). Hai bên cùng khớp oracle của mình ⇒ hai bên khớp nhau; bên nào
lệch thì lệch một mình, và log chỉ thẳng ra dòng nào.

## 2. Đường vào

```
メインメニュー          pnlBtn1  → 日常業務            (MENU/MainMenu.cs:812)
                        pnlMenu4 → ID204001 窓口精算   (MENU/MainMenu.cs:824)
frm204001 窓口精算（患者選択）
                        F3 「来患一覧」 → ID204008     (frm204001.cs:241-250)
frm204008 来患一覧
```

`frm204001` mở ở chế độ 未精算患者一覧 và tìm ngay; không có 未精算 nào thì nó bung
E00003. `VisitListScreen.Open` dẹp mọi hộp thoại **trước** khi bấm F3 — phím gửi vào một
MessageBox đang modal thì không bao giờ tới được form.

## 3. Chạy

```powershell
.\run-patient-visit-list.ps1                 # fixture assert
.\run-patient-visit-list.ps1 -Diagnostics    # PROBE (Tc0a..Tc0d)
.\run-patient-visit-list.ps1 -Diagnostics -Case Tc0d
.\run-patient-visit-list.ps1 -SinryoYm 200602
```

**CHỈ ĐỌC.** Không seed, không F9, không ghi DB. Thứ duy nhất ghi ra đĩa là file CSV
trong `artifacts\screenshots\visit-list-<yyyyMM>.csv`.

⚠️ **Đừng trỏ vào tháng có hàng trăm bệnh nhân.** `frm204008` gọi `getBuiPrice2` cho
**từng** (bệnh nhân × ngày). Dataset demo có nhiều tháng 600+ bệnh nhân; chạy vào đó là
vượt trần `TimeoutMinutes` của wrapper và làm **treo cả máy Windows** chứ không chỉ đỏ.
`visitList.maxPatients` (mặc định 60) chặn chuyện đó khi để `sinryoYm` trống.

## 4. Bảng tương ứng với spec Playwright

| WinForm (`PatientVisitListTests`) | Playwright (`patient-visit-list-rcp-type.spec.ts`) | Đo gì |
|---|---|---|
| `TC_OPEN_1` | TC-OPEN-1 | 3 cờ 初診/再診/訪問診療 mặc định bật; 検索 chạy xong, không E00100 |
| `TC_OPEN_2` | TC-OPEN-2 | 12 cột đúng nhãn + đúng thứ tự `_viewItem` |
| `TC_RCP_1` | TC-RCP-1 | mọi dòng đều có `レセプト種別` |
| `TC_RCP_2` | TC-RCP-2 | đúng hình dạng `保険種別・単独\|N併・区分` |
| `TC_RCP_3` | TC-RCP-3 | một bệnh nhân chỉ một 種別 trong cùng tháng |
| `TC_DB_1` | TC-DB-1 | khớp oracle dựng từ `insurance`/`medinsinf` |
| `TC_BAND_1` | TC-BAND-1 | dòng lặp lại bị `IsTheSameCellValue` bỏ trắng |
| `TC_BAND_2` | TC-BAND-2 | dòng 合計 nằm cuối + đúng công thức |
| `TC_CSV_1` | — | F4 CSV出力: header + dữ liệu **không** bị banding |
| `TC_ROW_1` | — | mọi dòng đều có gốc `(trt_dt, pat_br)` trong `trntrn` |
| `TC_SORT_1` | TC-OPEN-2 (một nửa) | bấm tiêu đề: `患者番号` **không** sort, `氏名` và `レセプト種別` **có** |
| — | TC-WARN-1 | bản web gom lỗi vào `warnings`; WinForm bung **MessageBox từng dòng** (xem §6) |

## 5. Số đo thật (WIN-1J9ELM7F15M, 2026-09-04, 診療年月 200601)

Chín câu hỏi của probe, và câu trả lời:

| | Đo được |
|---|---|
| Tháng test | `200601` — 36 bệnh nhân, 86 dòng (bệnh nhân × ngày × 枝番). Cùng con số với Postgres của bản web ⇒ **hai DB là một dataset** |
| 検索 | **5.4 giây**, thanh tiến trình `frm902005` không kịp hiện, **0 hộp thoại**, **0 E00100** |
| Cột | 12 nhãn đúng `_viewItem`, đúng thứ tự |
| `レセプト種別` | **0/86 dòng rỗng**, 7 loại, **0 lệch** so với oracle |
| Dòng 合計 | `合計   36名　（  86件）`, 医療保険点数 89.337, 合計金額 241.820 |
| `cboEra` | `「」/ 明治 / 大正 / 昭和 / 平成 / 令和` (mục đầu là dòng trống) |

Lượt chạy xanh của `PatientVisitListTests` (11/11 passed):

```
検索 4.1s · lưới 88 phần tử dòng · CSV 88 dòng (86 dòng khám + 1 dòng 合計)
TC-RCP-3 : 28 bệnh nhân có nhiều ngày khám, tất cả nhất quán
TC-BAND-1: 36 dòng mở nhóm có 種別, 50 dòng lặp lại được bỏ trắng đúng
TC-DB-1  : đối chiếu 86 dòng; bỏ qua 0
TC-ROW-1 : 86/86 cặp (bệnh nhân × ngày) lên được màn hình
```

Đối chiếu với payload thật của bản web cùng ngày (`GET /tenant/settlement/visit-list?sinryoYm=200601`):
**86/86 dòng, cùng thứ tự, 0 lệch** trên cả 10 trường; con số của TC-BAND-1 (36/50) và
TC-RCP-3 (28) **trùng khít** hai bên. Một điểm lệch duy nhất trong dữ liệu là nhãn dòng
合計 — xem §6.

> `TC_DB_1` bên này đối chiếu được **cả 86 dòng**, trong khi TC-DB-1 bên Playwright chỉ
> đối chiếu được 34 (bỏ 52 vì bệnh nhân có nhiều 枝番). Lý do: WinForm lấy 枝番 từ chính
> dòng `trntrn` nên tra được đúng bản 保険, còn payload của web không trả 枝番.

## 6. Bốn điểm LỆCH so với bản web

1. **Nhãn dòng 合計** — lệch thật, đã đo.
   * WinForm (`frm204008.cs:768`): `"合計" + 人数.PadLeft(5) + "名　（" + 件数.PadLeft(4) + "件）"`
     → `合計   36名　（  86件）` (khoảng trắng **全角** U+3000 sau 「名」, 件数 độn 4).
   * API (`GetPatientVisitListHandler.cs:183`): `名 （` khoảng trắng **半角**, 件数
     `PadLeft(5)` → `合計   36名 （   86件）`.
   * Unit test `GetPatientVisitListHandlerTests.cs:246` đang chốt **đúng chuỗi sai đó**.
   * `TC_BAND_2` khẳng định công thức WinForm, nên nó là chỗ ghi lại điểm lệch này.

2. **`レセプト種別` (và 9 cột khác) sort được ở WinForm, KHÔNG sort được ở web** — đã đo:
   bấm tiêu đề `レセプト種別` **sắp lại lưới**. `InitViewItem` đặt `SortMode.Automatic` cho
   **mọi** `TextBox` column (`GradientDataGridView.cs:441`), rồi `frm204008.init` hạ
   **riêng** `pat_no`/`pat_nm` xuống `Programmatic` (`frm204008.cs:397-401`) — nên 10 cột
   còn lại (`rcp_type`, `day`, điểm, tiền…) sort được. Bản web đặt `enableSorting: false`
   cho đúng 10 cột đó.

3. **Bấm tiêu đề `患者番号` ở WinForm KHÔNG làm gì** — đã đo: lưới đứng yên.
   `dgvView_CellMouseClick` dò `dgv.Columns[e.ColumnIndex].Name == "dsp_pat_no"`
   (`frm204008.cs:241`) trong khi `_viewItem` đặt tên cột là `"pat_no"` ⇒ nhánh sort đó
   **không bao giờ chạy**, và `SortMode` cũng đã bị hạ xuống `Programmatic` nên
   `DataGridView` không tự sort thay. Bản web thì `患者番号` **sort được**.
   (`氏名` thì cả hai bên đều sort — handler khớp đúng tên cột nên `ComLibrary.kanaSort`
   chạy bình thường.)
   → cả 2 và 3 được `TC_SORT_1` chốt lại.

4. **Cách chịu lỗi 一部負担金** — WinForm bung **một MessageBox E00100 cho MỖI dòng hỏng**
   ngay trong luồng nền của thanh tiến trình (`buiPrice.cs:196-203`), và **vẫn thêm dòng
   đó vào lưới** nếu có điểm khác 0. Bản web **loại** dòng đó ra và đẩy vào `warnings`.
   Dataset demo không có ca hỏng nên chưa quan sát trực tiếp được — `TC_OPEN_1` chốt “0
   hộp E00100” để cái ngày nó xuất hiện thì có người biết.

## 7. Năm cái bẫy đã trả giá (đừng vấp lại)

### 7.1 `SelDate` chỉ cập nhật khi `CustomDate` MẤT FOCUS

`CustomDate_Leave` (`CustomDate.cs:693`) là chỗ **duy nhất** gọi `setSelDate` sau khi
người dùng gõ — `IsDate` thì không. Gõ 年/月 xong bấm 検索 ngay mà chưa rời control thì
`searchProc` chạy với **tháng cũ**, và testcase sẽ đổ oan cho dữ liệu.
`VisitListScreen.SetSinryoYm` luôn đẩy focus sang lưới trước khi trả về (lưới ReadOnly
hoàn toàn nên focus vào đó không đổi trạng thái gì — **đừng** đẩy vào 3 checkbox, chạm
nhầm là đổi luôn điều kiện tìm kiếm).

### 7.2 Hộp thoại 「CSV出力が完了しました。」 — hai lỗi chồng lên nhau

I00005 bung **sau** khi `StreamWriter` đóng file (`frm204008.cs:317`), mà `File.Exists`
thành true **ngay lúc** file được tạo — sớm hơn hộp thoại. Chờ theo file rồi dẹp một lần
là dẹp hụt, và cái hộp còn lại là **modal**.

Ngày 2026-09-04 chuyện này làm `Tc0d` báo “bấm tiêu đề cột không sort” cho **cả ba** cột
— kết luận hoàn toàn sai, ba cú click đều rơi vào hộp thoại đang che lưới. **Chỉ ảnh chụp
mới lộ ra** (PROBE-GUIDELINE mục 1).

Sửa xong lần một (chờ theo hộp thoại thay vì theo file) thì lộ ra lỗi thứ hai:
**`Dialogs.Open` KHÔNG nhìn thấy cái hộp đó**, dù ảnh chụp cho thấy nó đang chắn giữa màn
hình — chờ đủ 60 giây vẫn báo “không có hộp thoại nào đang mở”. Cả luồng này giờ dùng
`MsgBoxWin32` (Win32 thuần, `EnumWindows` + `PostMessage`) — cùng lớp mà
`Tests/GuideSidePanel` đã phải dựng vì lý do tương tự, nay nâng lên `Infrastructure/`.
Bonus: `Dialogs.Open` quét toàn desktop qua UIA nên gọi trong vòng poll là tự chuốc lấy
treo (đã trả giá 2026-08-27, hơn 20 phút), còn `EnumWindows` chạy trong vài mili-giây.

Và lỗi thứ ba, ngay sau đó: **hộp thoại `名前を付けて保存` cũng là lớp `#32770`** (Win32
đọc chữ trong nó ra thành `Namespace Tree Control`). Nên mọi phép đếm kiểu “có hộp thoại
rồi hết hộp thoại” đều **thoả ngay lúc nó đóng**, tức trước khi app kịp ghi xong file —
và `ExportCsv` báo “không thấy file CSV” trong khi app vẫn đang ghi bình thường.

Mốc đúng là **một hộp thoại mà ta thật sự bấm được nút `OK`**: hộp của shell có
`保存`/`キャンセル` chứ không có `OK`, nên `MsgBoxWin32.ClickButton` trả `false` — phân
biệt được hộp của app với hộp của shell mà không phải đoán tiêu đề hay HWND.

### 7.3 Ô bị banding đọc ra chuỗi `(null)`, không phải rỗng

`dgvView_CellFormatting` đặt `e.Value = ""` cho ô lặp lại (`frm204008.cs:155-159`), và
`DataGridViewCellAccessibleObject.Value` của .NET Framework trả về chuỗi tài nguyên
`DataGridView_AccNullValue` khi `FormattedValue` rỗng — trên máy test (Windows tiếng Anh)
là `(null)`.

Đừng nhầm với **ô số không có giá trị** (介護保険点数…): những ô đó qua
`string.Format("{0:#,0} ", DBNull)` thành một dấu cách, tức `FormattedValue` **không**
rỗng, nên đọc ra chuỗi rỗng sau khi trim. Dùng `VisitListScreen.IsBlanked`, đừng so với
`""`.

### 7.4 `WinFormsGrid.Headers()` trả RỖNG ở màn này

Cầu MSAA→UIA không đánh dấu dòng tiêu đề của `dgvViewS` bằng `HeaderItem`; nó về như một
**dòng thường** mà các ô mang đúng chữ tiêu đề — đúng cái bẫy PROBE-GUIDELINE 3.2. Nhãn
cột lấy qua `VisitListScreen.HeaderRow()`, và **mọi** chỗ đọc dữ liệu phải bỏ phần tử đầu.

### 7.5 Lưới này KHÁC `grdRegi`: nó phơi ra CẢ lưới

`dgvViewS` trả về đủ 88 phần tử (1 tiêu đề + 86 dòng + 1 合計) dù chỉ cao ~23 dòng, nên ở
màn này **không phải cuộn** — khác hẳn `grdRegi` của 診療入力 (PROBE-GUIDELINE 3.1).

Đổi lại nó **đắt**: 88 × 12 ô ≈ 1.000 lượt hỏi UIA, đo được **~50 giây** một lượt đọc.
`AllRows()` phải gọi **một lần** rồi giữ lại — `OneTimeSetUp` của fixture assert làm đúng
vậy. Gọi nó trong vòng lặp là cách nhanh nhất để vượt trần 15 phút của wrapper.

## 8. File

```
ReceiptTypeOracle.cs           port getReceiptType từ dữ liệu THÔ — đối chứng độc lập
VisitListDb.cs                 truy vấn CHỈ ĐỌC: trn_status / trntrn / insurance ⟕ medinsinf
VisitListScreen.cs             screen object frm204008 + đường vào + F4 CSV出力
PatientVisitListProbeTests.cs  PROBE [Explicit] — 9 câu hỏi, không assert
PatientVisitListTests.cs       TC-OPEN-1/2, TC-RCP-1/2/3, TC-DB-1, TC-BAND-1/2, TC-CSV-1, TC-ROW-1
```
