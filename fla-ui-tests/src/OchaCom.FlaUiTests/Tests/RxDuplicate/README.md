# Tái hiện: lưu 診療入力 (nhập khám) ghi đè đơn thuốc đã huỷ

Legacy WinForm, bảng `RX_INF`. Lỗi: bấm 登録 (lưu) ở 診療入力 làm mất `PrescriptionId` của đơn **đã huỷ** (取消) khi
đơn đó cùng khóa `(pat_no, rx_type, trt_dt, seq_no)` với một đơn nháp (chưa có `PrescriptionId`).
Nguyên nhân (đọc code): `RxInf.updateManyRxInfDataNotRegistered` (`RxInf.cs:821`) UPDATE `RX_INF` theo khóa mà không có `DeleteDate`.

## 0. Chuẩn bị

| Thứ | Giá trị |
|---|---|
| DB | SQL Server `SIM2000`, container `ochacom_sql2022` trên máy Mac (cổng 1434), user `sa` / mật khẩu `tmdu` (lấy từ `testsettings.local.json`) |
| App | `MENU.exe` trên máy Windows `ochacom-win` (đọc cùng DB đó). `C:\NEW_SIM2000\Ocha.xml` phải có `<RXScreenUse>true</RXScreenUse>` |
| Bệnh nhân | `4031` (山田 徳廣), đã có đơn mẫu ngày 2025-10-08 (1 đơn sống + 1 đơn huỷ, thuốc リリカOD錠75mg) |

Chạy SQL từ máy Mac (thay `FILE.sql` bằng file muốn chạy):

```bash
docker exec -i ochacom_sql2022 /opt/mssql-tools18/bin/sqlcmd -C -S localhost -U sa -P tmdu -d SIM2000 -W -s"|" -b -i /dev/stdin < FILE.sql
```

**Quan trọng:** hộp thoại 処方 (đơn thuốc) từ 診療入力 chỉ mở được trong **tháng hiện tại**; tháng khác app báo
「当月以外の操作はできません」 (không thao tác được ngoài tháng hiện tại). Tài liệu này dùng tháng 2026-10, ngày 07.
Nếu làm vào tháng khác, đổi mọi `2026-10-07` thành một ngày **đã qua trong tháng hiện tại** (và ở bước 2.2 nhập đúng ngày đó).
Ngày seed phải là **ngày cuối cùng có dữ liệu trong tháng** (xem bước 2.5, con trỏ luôn rơi vào ngày cuối).

## 1. Seed dữ liệu (kịch bản D)

Tạo, cho bệnh nhân 4031 ngày 2026-10-07: 24 dòng điều trị (`TRNTRN`) copy từ ngày 2025-10-08, cùng 1 đơn **nháp** (sống,
`PrescriptionId` rỗng) và 1 đơn **huỷ** (có `PrescriptionId`), cùng khóa `(4031, 2, 2026-10-07, 1)`, kèm usage/detail của cả hai.

Trước đó xác nhận tháng này của 4031 đang trống (nếu không trống, đừng chạy `cleanup` ở bước 4):

```sql
SELECT (SELECT COUNT(*) FROM RX_INF WHERE pat_no=4031 AND trt_dt>='2026-10-01') AS rx_inf,
       (SELECT COUNT(*) FROM TRNTRN WHERE PAT_NO=4031 AND TRT_DT>='2026-10-01') AS trntrn;  -- phải là 0 | 0
```

Chạy file seed:

```sql
SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRAN;
DECLARE @pat int = 4031, @src date = '2025-10-08';

-- Copy rows of one table from @src to @dst. @where narrows the source rows. New PrescriptionId per copy.
DECLARE @copy nvarchar(max) = N'';

CREATE TABLE #plan (dst date, tbl sysname, dcol sysname, wh nvarchar(200), times int);
-- 2026-10-07 baseline: live only
INSERT #plan VALUES
 ('2026-10-07','TRNTRN','TRT_DT','1=1',1),
 ('2026-10-07','RX_INF','trt_dt','1=1',1),
 ('2026-10-07','RX_USAGE','trt_dt','1=1',1),
 ('2026-10-07','RX_DETAIL','trt_dt','1=1',1);

DECLARE @dst date, @tbl sysname, @dcol sysname, @wh nvarchar(200), @times int, @cols nvarchar(max), @sel nvarchar(max), @sql nvarchar(max), @i int;
DECLARE c CURSOR FOR SELECT dst,tbl,dcol,wh,times FROM #plan;
OPEN c; FETCH NEXT FROM c INTO @dst,@tbl,@dcol,@wh,@times;
WHILE @@FETCH_STATUS=0
BEGIN
  SELECT @cols = STRING_AGG(CAST(QUOTENAME(name) AS nvarchar(max)), ','),
         @sel  = STRING_AGG(CAST(CASE WHEN name=@dcol THEN '''' + CONVERT(char(10),@dst,120) + ''''
                                 WHEN name='PrescriptionId' THEN 'CASE WHEN PrescriptionId IS NULL THEN NULL ELSE CAST(NEWID() AS varchar(36)) END'
                                 ELSE QUOTENAME(name) END AS nvarchar(max)), ',')
  FROM sys.columns WHERE object_id=OBJECT_ID(@tbl) AND is_identity=0 AND is_computed=0;
  SET @sql = N'INSERT INTO '+@tbl+N' ('+@cols+N') SELECT '+@sel+N' FROM '+@tbl+N' WHERE '+
             CASE WHEN @tbl='TRNTRN' THEN N'PAT_NO' ELSE N'pat_no' END+N'=@p AND '+@dcol+N'=@s AND '+@wh;
  SET @i=0;
  WHILE @i<@times BEGIN EXEC sp_executesql @sql, N'@p int,@s date', @p=@pat, @s=@src; SET @i+=1; END
  FETCH NEXT FROM c INTO @dst,@tbl,@dcol,@wh,@times;
END
CLOSE c; DEALLOCATE c;
COMMIT;

UPDATE RX_INF SET PrescriptionId=NULL, AccessCode=NULL WHERE pat_no=4031 AND trt_dt='2026-10-07' AND DeleteDate='1900-01-01';
SELECT 'RX_INF' t, CONVERT(char(10),trt_dt,120) d, COUNT(*) n, SUM(CASE WHEN DeleteDate='1900-01-01' THEN 1 ELSE 0 END) live FROM RX_INF WHERE pat_no=@pat AND trt_dt>='2026-10-01' GROUP BY trt_dt
UNION ALL SELECT 'RX_USAGE', CONVERT(char(10),trt_dt,120), COUNT(*), SUM(CASE WHEN DeleteDate='1900-01-01' THEN 1 ELSE 0 END) FROM RX_USAGE WHERE pat_no=@pat AND trt_dt>='2026-10-01' GROUP BY trt_dt
UNION ALL SELECT 'RX_DETAIL', CONVERT(char(10),trt_dt,120), COUNT(*), SUM(CASE WHEN DeleteDate='1900-01-01' THEN 1 ELSE 0 END) FROM RX_DETAIL WHERE pat_no=@pat AND trt_dt>='2026-10-01' GROUP BY trt_dt
UNION ALL SELECT 'TRNTRN', CONVERT(char(10),TRT_DT,120), COUNT(*), 0 FROM TRNTRN WHERE PAT_NO=@pat AND TRT_DT>='2026-10-01' GROUP BY TRT_DT
ORDER BY 1,2;
```

Kết quả mong đợi (cuối script):

```
RX_DETAIL|2026-10-07|2|1      -- 2 dòng, 1 sống
RX_INF   |2026-10-07|2|1
RX_USAGE |2026-10-07|2|1
TRNTRN   |2026-10-07|24|0
```

## 2. Chụp DB TRƯỚC khi lưu

```sql
SET NOCOUNT ON;
SELECT 'INF' t, rx_type, seq_no, LEFT(ISNULL(PrescriptionId,'<NULL>'),8) pid, ISNULL(AccessCode,'<NULL>') acc, CONVERT(char(19),DeleteDate,120) del, CONVERT(char(19),upd_dt,120) upd FROM RX_INF WHERE pat_no=4031 AND trt_dt='2026-10-07' ORDER BY DeleteDate;
SELECT 'USAGE' t, rx_type, seq_no, rp_no, trt_cd, trt_sb, CONVERT(char(19),DeleteDate,120) del FROM RX_USAGE WHERE pat_no=4031 AND trt_dt='2026-10-07' ORDER BY DeleteDate, rp_no;
SELECT 'DETAIL' t, rx_type, seq_no, rp_no, rp_no_sub, dg_cd, CONVERT(char(19),DeleteDate,120) del FROM RX_DETAIL WHERE pat_no=4031 AND trt_dt='2026-10-07' ORDER BY DeleteDate, rp_no, rp_no_sub;
SELECT 'TRNTRN rows' t, COUNT(*) n FROM TRNTRN WHERE PAT_NO=4031 AND TRT_DT='2026-10-07';
```

Mong đợi (cột `pid` = 8 ký tự đầu của PrescriptionId):

```
INF|2|1|<NULL>|<NULL>|1900-01-01 00:00:00|2025-10-08 12:18:48     <- đơn nháp (sống)
INF|2|1|95FCE57D|<NULL>|2025-10-08 12:18:18|2025-10-08 12:18:17  <- đơn huỷ, CÓ PrescriptionId
USAGE x2, DETAIL x2 (1 sống, 1 huỷ), TRNTRN rows = 24
```

## 3. Thao tác trên app (máy Windows)

Mọi bước dưới đây làm trong cửa sổ `MENU.exe`. Nếu app đang mở sẵn ở màn khác, đóng hẳn rồi mở lại `MENU.exe`.

1. **Menu chính** (メインメニュー). Bấm vào ô **「日常業務」** (nghiệp vụ hằng ngày) ở cột bên trái, rồi bấm ô **「診療入力」**
   (nhập khám chữa bệnh). Menu này là các ô Panel, phải **click chuột thật** vào ô.
2. Màn **「診療入力（患者選択）」** (nhập khám - chọn bệnh nhân):
   1. Ô **診療日** (ngày khám) gồm 4 phần: `令和` | năm | 月 (tháng) | 日 (ngày). Mặc định là hôm nay.
      Bấm vào ô **năm**, gõ `08`; bấm ô **tháng**, gõ `10`; bấm ô **ngày**, gõ `07`. (令和8年 = 2026.)
   2. Bấm sang ô **患者番号** (mã bệnh nhân) để ô ngày "chốt" giá trị (nếu không, app vẫn dùng ngày cũ).
   3. Trong ô **患者番号** gõ `4031`, rồi nhấn **Enter**.
3. Màn **「診療入力 - 08年10月」** mở ra. Đợi lưới nạp xong (có thể vài chục giây, lưới hiện cả tháng).
   Con trỏ nằm ở dòng cuối của tháng (ngày 7, dòng 日計 `[負担金 ... 円]`). **Đừng click vào lưới, đừng gõ gì thêm.**
4. Mở đơn thuốc: **giữ phím Shift**, nhìn thanh nút dưới cùng thấy nhãn F5 đổi từ 「パック」 (gói) thành **「処方」** (đơn thuốc),
   rồi nhấn **Shift + F5**. (Cách khác: giữ Shift và click nút F5.)
   - Mở được → cửa sổ **「処方」** hiện, tab **「院外処方」** (đơn ngoài viện) đang chọn, lưới 薬剤 (thuốc) dưới cùng có
     **1 dòng**: `リリカOD錠75mg | 3 | 錠 | 28 | 1日3回朝昼夕食後 服用`.
   - Hiện 「当月以外の操作はできません」 → ngày bạn chọn không thuộc tháng hiện tại; làm lại từ bước 1 với ngày đúng.
5. Trong cửa sổ 処方, bấm nút **「F9 確定」** (xác nhận) (hoặc nhấn F9). Cửa sổ đóng, quay về 診療入力; trong lưới xuất hiện dòng thuốc
   `リリカOD錠75mg 3T / １日３回朝昼夕食後 服用 28日分` ở cuối ngày 7.
6. Lưu: nhấn phím **End** (hoặc bấm nút **「F9 登録」** (đăng ký/lưu) dưới cùng). Chú ý: phím F9 trên bàn phím không lưu, phải là End hoặc bấm nút.
7. Hộp thoại **「処置データは、変更されていません。保存しますか?」** (dữ liệu điều trị chưa thay đổi. Có lưu không?) hiện ra
   với 3 nút. Bấm **「はい」** (có). Nếu hộp thoại hiện lại lần nữa, bấm 「はい」 tiếp. Màn 診療入力 tự đóng.
   Nếu hiện 「上書きしますか」 (có ghi đè không) bấm **「はい」** (có).

## 4. Chụp DB SAU khi lưu và so sánh

Chạy lại đúng câu SQL ở mục 2. **Kết quả lỗi mong đợi:**

```
INF|2|1|<NULL>|<NULL>|1900-01-01 00:00:00|<giờ vừa lưu>        <- đơn nháp
INF|2|1|<NULL>|<NULL>|2025-10-08 12:18:18|<giờ vừa lưu>        <- đơn HUỶ: pid đã từ 95FCE57D thành <NULL>, upd_dt đổi
USAGE x2, DETAIL x2 (không đổi: vẫn 1 sống + 1 huỷ), TRNTRN rows = 24
```

Đúng như vậy là tái hiện thành công: dòng **đã huỷ** bị ghi đè `PrescriptionId` (sai: đơn huỷ không được đổi).
Lưu ý: `RX_USAGE` / `RX_DETAIL` **không** sinh thêm dòng sống nào (tức chưa thấy "dòng thuốc trùng").

## 5. Dọn dẹp

Chỉ xoá dữ liệu 4031 từ 2026-10-01 trở đi (tháng này vốn trống, đã kiểm ở mục 1):

```sql
SET NOCOUNT ON;
BEGIN TRAN;
DELETE FROM RX_DETAIL WHERE pat_no=4031 AND trt_dt >= '2026-10-01';
DELETE FROM RX_USAGE  WHERE pat_no=4031 AND trt_dt >= '2026-10-01';
DELETE FROM RX_INF    WHERE pat_no=4031 AND trt_dt >= '2026-10-01';
DELETE FROM TRNTRN    WHERE PAT_NO=4031 AND TRT_DT >= '2026-10-01';
COMMIT;
SELECT (SELECT COUNT(*) FROM RX_INF WHERE pat_no=4031 AND trt_dt>='2026-10-01') inf, (SELECT COUNT(*) FROM TRNTRN WHERE PAT_NO=4031 AND TRT_DT>='2026-10-01') trn;
```

Mong đợi `0|0`. Đóng `MENU.exe` nếu còn mở.

## 6. Xem đơn thuốc ở màn 処方箋 (chỉ đọc, đo "dòng thuốc nhân đôi")

Dùng dữ liệu có sẵn của 4031 (không cần seed): đơn 2025-10-08 sống (`cee4fc79…`) và huỷ (`81fd12f4…`), 2025-03-25, 2025-01-24.

1. Menu chính → 「日常業務」 → ô thứ 5 **「処方箋」** (đơn thuốc). Màn **「処方箋（患者選択）」** mở ra.
2. **Thứ tự quan trọng:** gõ **患者番号** trước, ngày sau (đổi ngày làm danh sách nạp lại và **xoá** ô bệnh nhân).
   1. Ô **患者番号**: gõ `4031`.
   2. Ô **交付日** (ngày giao đơn) hàng trên (ô "từ"): bấm vào từng phần, gõ **đè** năm `06`, tháng `01`, ngày `01`
      (không xoá trắng rồi gõ; ô dở dang sẽ hiện 「交付日が間違っています」 (ngày giao đơn sai) và chặn mọi thao tác).
      Không đụng ô "đến" (hàng dưới).
   3. Bấm lại vào ô 患者番号 (đảm bảo vẫn là `4031`), bấm nút **「検索」** (tìm kiếm).
3. Lưới 処方箋患者一覧 (danh sách đơn) hiện đơn của 4031; cột 調剤結果 của đơn đã huỷ ghi **「取消」** (huỷ).
4. Chọn một dòng (click), bấm nút **「F9 選択」** (chọn). Cửa sổ chi tiết 処方 mở; đếm số dòng ở lưới 薬剤.
   Kết quả đã đo: 2025-10-08 sống = 1 dòng; huỷ = 1 dòng; 2025-03-25 = 2 dòng; 2025-01-24 = 4 dòng (cùng thuốc, lượng khác nhau).
5. Bấm **「F10 戻る」** (quay lại) để về danh sách. Danh sách sẽ nạp lại **toàn bộ bệnh nhân** và ô 患者番号 bị xoá; làm lại bước 2 trước đơn kế tiếp.

## 7. Chạy tự động (FlaUI) thay cho thao tác tay

Từ `TestLocalGit/TestLocal/fla-ui-tests`, chép file sang Windows bằng `scp` rồi chạy qua Scheduled Task (xem `FLA-UI-GUIDELINE.md` F5, F25):

```
run-rx-duplicate.ps1                                                                   # mục 6, chỉ đọc
run-rx-from-treatment.ps1 -PatNo 4031 -TrtDt 2026-10-07                                # Shift+F5 từ 診療入力, chỉ đọc
run-rx-from-treatment.ps1 -PatNo 4031 -TrtDt 2026-10-07 -Fixture RxSaveProbeTests      # mục 3, GHI DB (chỉ DB test)
```

## 8. Bẫy đã gặp

- Lưới 診療入力 hiện cả tháng, UIA đọc rất chậm; không quét hết lưới, dùng Win32 (`MsgBoxWin32`) cho hộp thoại.
- Danh sách 処方箋 sau F10 nạp mọi bệnh nhân; `FindFirstDescendant` hết giờ ⇒ tìm control theo từng cấp con (`pnlBase` → control).
- Gõ ô ngày bằng cách xoá trắng ⇒ hộp thoại 「交付日が間違っています」 chặn app.
- Probe đứng yên ⇒ chụp màn hình và đọc ảnh trước khi chạy lại (F2).
