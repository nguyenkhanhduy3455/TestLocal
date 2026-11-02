# Seisan — 窓口精算 (frm204001..204009)

Đo WinForm để đối chiếu bản web, chia nhóm G0–G7. Đã xong G0 (probe), G1 (UI tĩnh), G2 (điều hướng + danh sách), G3 (phép tính).

```powershell
.\run-seisan.ps1 -Diagnostics   # G0 PROBE: không assert
.\run-seisan.ps1 -Case SeisanStaticUiTests      # G1  18 case ~6 phút
.\run-seisan.ps1 -Case SeisanNavigationTests    # G2  12 case ~3 phút (Tc2j GHI: xoá UNPAID bệnh nhân test)
.\run-seisan.ps1 -Case SeisanCalcTests          # G3  16 case ~7.5 phút
.\run-seisan.ps1 -Case SeisanTaxMatrixTests     # G3  19 case ~7.5 phút — ĐỔI ACCCONFIG rồi trả lại
.\run-seisan.ps1 -Case SeisanNavProbe           # PROBE G2 (SeisanCalcProbe cho G3: -Case Tc0_Calc / Tc0b_Calc)
```

⚠ Chạy TỪNG fixture: wrapper `runner-task.ps1` cắt ở 15 phút (F7) — gộp G1+G2+G3 là vượt.

```
```

Đầu ra: `bin\Debug\net8.0-windows\artifacts\screenshots\Seisan_uia\<trạng thái>.controls.tsv`
(id, type, name, value, enabled, offscreen, rect) + `.uia.txt`, cùng ảnh từng bước trong
`Seisan_Tc0*`. Các dòng KQ được lọc vào `seisan-KQ.txt`.

## G0 đi qua những trạng thái nào (đo 2026-10-20, 12/12 xanh, không ghi DB)

| Trạng thái | Đường vào |
|---|---|
| 204001_unpaid / _patinfo / _after_f10 | menu `pnlBtn1` → `pnlMenu4`; F1 đổi chế độ |
| 204008_visitlist | 204001 F3 |
| 204004_list | 204001 F2 |
| 204002_seikyu / _nyukin / _seikyu_after_f7x2 | 204001 `cboPatNo` + F9; F7 đổi 請求 ⇄ 入金 |
| 204002_henkin / _after_henkin | F6, rồi F7 ×2 |
| 204006_receDetail | 入金 mode, gõ 本日入金 < 請求, F3 |
| 204003_goods → 204009_goodsHistory | F2, rồi F1 |
| 204004_print / 204004_update | 204002 F1 / F8 |

Chưa đo: **frm204005** (cần ACCDAT trong 204004 Update + F9 訂正 ⇒ G6) và
**frm204007** (chỉ bung trong `F9Proc` ⇒ G5).

Dữ liệu: bệnh nhân test 990000+ (`SeededPatientTestBase`) + 2 dòng UNPAID (保険 km_cd 40 =
900円/300点, 自費 km_cd 50 = 5000 + thuế 500, `rece_amt = -1`).

Cấu hình máy đo (ảnh hưởng mọi nhóm sau): `ACCCONFIG` RECE_TYPE=28, RECE_RCV_FLG=1,
APPO_DSP_FLG=1, FST_VISIT_FLG=0, J/B_TAX_KBN=1, J/B_CALC_KBN=3; `YOYAKUCONFIG.APPO_FLG=1`;
thuế CODMST 900 = 10%, 901 = 8%.

## G1 — `SeisanStaticUiTests` (18/18 xanh 2026-10-20)

Tiêu đề + bộ phím F (nhãn, bật/tắt) của mọi trạng thái G0; giá trị mở màn từ UNPAID seed;
bật/tắt vùng 返金/点数/入金 (`repayArea`/`scoreArea`/`receArea`); `rdoPrint*` +
`cboReceType` theo `ACCCONFIG.RECE_TYPE`; `cboReceKbn`; F7 tự điền 本日入金; MaxLength 6 ô;
hộp Q00004 khi F10. Kỳ vọng dẫn `file:dòng` của source WinForm.

Chưa có: thứ tự Tab, lớp phím Shift (pnlShiftButton ẩn ⇒ không có trong cây UIA khi không giữ Shift).

## G2 — `SeisanNavigationTests` (12/12 xanh 2026-10-20, chung lượt 30/30 với G1)

Lưới 未精算患者一覧 (oracle = cột của `PatInfoList.getUnPaidPatInfo`, N0), F8 chưa tick ⇒
E00021, 患者番号 không tồn tại ⇒ E00005, 患者検索 theo カナ riêng của bệnh nhân test /
E00003, F11 ⇒ Q00004 ⇒ 204001 (未精算), F12 ⇒ Q00004 ⇒ Cancel ở lại, lớp phím Shift, Shift+F5–F8
mở 患者登録 / カルテ印刷 / 診療入力 / 口腔内情報 rồi F10 về. **Tc2j GHI DB**: tick + F8 + OK xoá
UNPAID của bệnh nhân test. Lớp nền chung: `SeisanTestBase`.

Quirk WinForm đo được (không assert là đúng/sai, chỉ ghi lại): sau Shift+Fn rồi F10 quay về,
204002 **kẹt ở lớp phím Shift** (nút 「ON」) vì KeyUp của Shift rơi vào màn kia; phải bấm
nút ON (hoặc nhấn-nhả Shift) mới về dải thường. Kết quả 患者検索 hiện chữ 「(null)」 khi
最終診療日 rỗng; cả `getUnPaidPatInfo` lẫn `getSearchPatInf` KHÔNG có ORDER BY.

## G3 — `SeisanCalcTests` (16/16) + `SeisanTaxMatrixTests` (19/19), xanh 2026-10-20

Mỗi ca đặt UNPAID / PERSON_EXP / 負担率 của bệnh nhân test rồi mở lại 204002 (initProc đọc lại
mọi thứ, kể cả ACCCONFIG). Phủ: 未収回収, 入金指定, 介護 (`trt_cnt` 101), 負担率 lúc mở không
tính lại, F7 với 預り金 (≥/<), txtAppr chặn ở 預り金, 点数明細 + 10円四捨五入, 点数 cộng dồn + phím
−, 負担率 Enter, 金額 保険 cộng dồn + −, 自費 外税, 値引 vượt 金額 (trả về cũ) / hợp lệ, 物品 +
軽減税率, 返金 (⛔ không cập nhật 請求合計 — quirk WinForm, assert giữ nguyên), calcClaim đảo về 請求.

Ma trận thuế: oracle `WfCalcTax` chép nguyên văn `calcTax` (giữ `float` + `(decimal)`). Đo được
WinForm x86 khớp oracle chạy .NET 8 ở cả 19 ca, gồm **内税 1100 切り上げ = 100** (double ra 101).
Fixture đổi `ACCCONFIG.J_TAX_KBN/J_CALC_KBN` (dùng chung) và trả lại ở OneTimeTearDown; lượt bị cắt
thì trả tay `UPDATE ACCCONFIG SET J_TAX_KBN = 1, J_CALC_KBN = 3`.

## Bẫy — đã trả giá

1. **End = 登録.** BaseForm bắt `Keys.End` ở KeyDown dù đang đứng ô nào (BaseForm.cs:616)
   ⇒ `btnEndEsc_Click` ⇒ `F9Proc` (frm204002.cs:1102). Lượt 2 dùng Shift+End để bôi đen ô
   ⇒ ghi 2 dòng ACCDAT, xoá UNPAID, bung frm204007. `SeisanNav.Press` chặn cả ESC lẫn End;
   gõ ô thì dùng `SeisanNav.TypeAndEnter` (Ctrl+A, Delete, gõ, Enter).
   Trên BaseDialog (204003…), End/ESC = F9 (BaseDialog.cs:314-325).
2. **Form modal là CON trong cây UIA**, không phải cửa sổ top-level: `App.Window("frm204003")`
   trả null dù form đang mở. Dùng `SeisanNav.Form` / `ChildForms`.
3. **Phím F rơi vào form cha khi modal đang mở:** F6 gửi vào frm204002 trong lúc frm204003 mở
   VẪN chạy `btnF6_Click`. `Press` ném nếu có form con đè lên.
4. **F2 物品 mở frm204003 mất ~12s** (lưới hàng hoá); chờ 10s là hụt.
5. **F10 bằng phím không đóng frm204003** sau khi frm204009 vừa đóng (chờ 20s vẫn mở);
   click `btnF10` thì đóng. Probe tự thử click khi phím không tới đích, và ghi cả hai vào KQ.
6. **F7 tự điền 本日入金 = 請求合計** (`changeF7`, frm204002.cs:2100) ⇒ F3 明細 báo I00004
   「明細入力は不要です。」. Muốn vào frm204006 thì gõ 入金 nhỏ hơn 請求 trước.
7. Thuộc tính `Name` của ô Edit là nhãn đứng cạnh (vd `txtRece` có name 「おつり」) — đọc theo
   AutomationId, đừng tin name.
8. **Phím gửi ngay sau khi một modal đóng thường bị MẤT** (F7/F10 trên frm204002/204003):
   G1 `Go` chờ đích (hoặc chờ dải nút F đổi nếu ở lại cùng form), không có thì click nút.
9. **Ctrl+A không chọn hết trong TextBox .NET Framework.** `Uia.SetText` chỉ chạy được khi ô
   vừa nhận focus và tự `SelectAll()`. Xoá ô bằng `SeisanNav.ClearByKeys` (Backspace/Delete).
   Gõ xong phải poll mới đọc được giá trị mới.
10. **`Uia.ValueOf` rơi về Name khi ô rỗng** — Name của Edit là nhãn bên cạnh. G1 đọc
    ValuePattern trực tiếp cho Edit (`RawValue`).
11. **CODMST 17 (入金区分) có SORT_ORDER = 0 ở mọi dòng** ⇒ dòng đầu do plan SQL Server quyết
    (câu gốc ra 現金, thêm `TOP 1` ra 口座１). Oracle chạy y nguyên câu của
    `CodMst.getComboData`. ⚠ Rủi ro parity: Postgres bên web có thể ra thứ tự hoà khác.
12. **F9 trên 204001 với ô 患者番号 RỖNG mở dòng đang chọn của lưới** (frm204001.cs:270-279).
    Phím gõ vào `cboPatNo` có lúc mất ⇒ F9 mở nhầm bệnh nhân. `SeisanNav.EnterPatient` gõ,
    không vào thì đặt qua ValuePattern, và luôn kiểm giá trị trước F9.
13. **Đổi カナ ở INSURANCE làm 患者登録 hỏi 「保存しますか」 khi F10** — hộp thoại lúc rời màn
    Shift+Fn là việc của màn đó, G2 chỉ trả lời an toàn và ghi log.
14. **Snapshot bằng `Uia.ById` từng ô quá chậm** (~100 s/ca, probe G3 bị wrapper cắt ở 15 phút):
    duyệt cây MỘT lần rồi tra dictionary.
15. **Dòng 介護 trong UNPAID phải có `trt_cnt` = 来院回数 + 100** — PK là
    (TRT_DT, TRT_CNT, PAT_NO, KM_CD), trùng `km_cd 40` với dòng 保険 thì INSERT hỏng.

