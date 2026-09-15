using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.MsgTblParity;

/// <summary>
/// <b>MSGTBL ↔ ja-msgtbl.ts</b> — 40 mã thông báo bản web dựng lại, đối chiếu từng ký tự
/// với bảng <c>MSGTBL</c> THẬT của <c>SIM2000</c>.
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// CÂU HỎI ĐANG TRẢ LỜI
/// ═══════════════════════════════════════════════════════════════════════════════
/// 「Mấy câu thông báo mà audit nói là sai — có sai THẬT không?」
///
/// <para>Audit <c>audit-260911-1248-msgtbl-db-parity.html</c> đối chiếu với một dump
/// <c>legacy/DB/MSGTBL.sql</c> mà nay không còn trên máy nào. Không có dump thì cột
/// 「Cũ」 của nó là lời khai không kiểm được, và ~10 mã 「sai chữ thuần」 chỉ còn dựa vào
/// niềm tin. Fixture này bỏ hẳn đường vòng đó: <b>hỏi thẳng SQL Server</b>.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// VÌ SAO LÀ MỘT FIXTURE FLAUI CHỨ KHÔNG PHẢI MỘT SCRIPT
/// ═══════════════════════════════════════════════════════════════════════════════
/// Vì kết luận 「row DB là câu người dùng THẬT SỰ thấy」 không tự hiển nhiên: giữa row và
/// màn hình còn <c>getMsg</c> với ba nhánh của nó. <see cref="MsgTblDialogTests"/> đóng
/// nốt khoảng đó bằng cách bung hộp thoại thật trên WinForm rồi đọc nguyên văn. Hai
/// fixture ở chung thư mục vì chúng là hai nửa của MỘT bằng chứng.
///
/// <para>Fixture NÀY cố ý <b>không mở app</b> (không kế thừa <c>UiTestBase</c>): nó chạy
/// trong vài giây, chạy được cả khi <c>MENU.exe</c> không mở nổi, và không tốn lượt
/// đăng nhập nào.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// CÁC CA
/// ═══════════════════════════════════════════════════════════════════════════════
/// <code>
///   TCM0  bảng có đúng 140 row; in bảng đối chiếu đầy đủ ra trace  (chạy TRƯỚC)
///   TCM1  ĐỐI CHỨNG — 24 mã web đang khớp thì phải khớp TỪNG KÝ TỰ
///   TCM2  16 mã đang lệch — lệch ĐÚNG như đã đo, không hơn không kém
///   TCM3  bốn lỗi CẤU TRÚC (sai mã / sai số tham số), không phải chuyện câu chữ
///   TCM4  bất biến chung: row có {0} ⇔ hàm web nhận tham số
/// </code>
///
/// <para><b>TCM1 chạy trước TCM2 là có chủ ý.</b> TCM1 đỏ nghĩa là chính PHƯƠNG PHÁP hỏng
/// — sai DB, sai collation, chụp nhầm nhánh web — và khi đó mọi con số của TCM2 đều vô
/// nghĩa. Đây đúng là vai 「seed đối chứng」 của <c>PROBE-GUIDELINE</c>: không có nó thì
/// quan sát không thành kết luận.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// ⚠️ SO CHUỖI ORDINAL, IN RA BẰNG Txt.Vis
/// ═══════════════════════════════════════════════════════════════════════════════
/// <c>Txt.N</c> chuẩn hoá NFKC ⇒ 「１６歳」 (row E00016/E00017) thành 「16歳」, tức là xoá
/// đúng khác biệt đang đo. Cả fixture so chuỗi THÔ — <c>Is.EqualTo</c> của NUnit so chuỗi
/// bằng <c>string.Equals</c> ordinal, đúng thứ cần — và in qua <see cref="Txt.Vis"/> để
/// 全角/半角 còn phân biệt được trên <c>.trx</c>.
///
/// <para>GHI DB: <b>không</b>. Cả fixture chỉ <c>SELECT</c>.</para>
/// </summary>
[TestFixture]
[NonParallelizable]
[Category("msgtbl-parity")]
[CancelAfter(120_000)]
public sealed class MsgTblParityTests
{
    private MsgTblOracle _db = null!;

    private static void Log(string line) => TestContext.Out.WriteLine(line);
    private static void LogKq(int no, string line) => Log($"=== KQ-{no} === {line}");

    [OneTimeSetUp]
    public void ParityOneTimeSetUp()
    {
        var db = MsgTblOracle.CreateOrNull(TestSettings.Current);
        if (db is null) Assert.Ignore("db.enabled = false hoặc thiếu chuỗi kết nối — fixture này CHỈ cần DB.");
        if (db!.ProbeError() is { } err) Assert.Ignore($"không kết nối được SQL Server: {err}");
        _db = db;
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TCM0 — đang nói chuyện với đúng bảng nào
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(0)]
    [Description("TCM0 — MSGTBL có đúng 140 row, và in bảng đối chiếu đầy đủ 40 mã")]
    public void TCM0_Table_Is_The_One_We_Measured()
    {
        var rows = _db.RowCount();
        LogKq(0, $"MSGTBL có {rows} row (lúc chụp: {WebMsgSnapshot.MsgTblRowCount}).");

        foreach (var code in WebMsgSnapshot.AllCodes.OrderBy(c => c, StringComparer.Ordinal))
        {
            var template = _db.Template(code);
            Log($"   {code}  DB  = {(template is null ? "(KHÔNG có row)" : Txt.Vis(template))}");
        }

        Assert.That(rows, Is.EqualTo(WebMsgSnapshot.MsgTblRowCount),
            $"MSGTBL phải có {WebMsgSnapshot.MsgTblRowCount} row như lúc chụp ({WebMsgSnapshot.TakenOn}). " +
            "Lệch ⇒ hoặc master đã đổi, hoặc chuỗi kết nối đang trỏ sang DB khác (SIM2025?) — " +
            "kiểm db.connectionString TRƯỚC khi đọc bất kỳ kết luận nào bên dưới.");
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TCM1 — ĐỐI CHỨNG
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(1)]
    [Description("TCM1 — ĐỐI CHỨNG: 24 mã web đang khớp phải khớp MSGTBL từng ký tự")]
    public void TCM1_Control_Group_Still_Matches()
    {
        // Không có ca này thì TCM2 không chứng minh được gì: 「web khác DB」 cũng có thể do
        // đọc nhầm bảng, nhầm collation, hay chụp nhầm nhánh web. 24 mã khớp chính xác cho
        // thấy cả ba thứ đó đều đang đúng.
        Assert.Multiple(() =>
        {
            foreach (var m in WebMsgSnapshot.Matching)
            {
                var db = _db.Template(m.Code);

                // E00100 là hàm đồng nhất bên web ((msg) => msg) và row DB đúng bằng 「{0}」
                // ⇒ so literal thì khác, nhưng KẾT QUẢ RENDER giống nhau với mọi tham số.
                // Đó mới là thứ người dùng thấy, nên so ở mức render.
                var expected = m.Code == "E00100" ? "{0}" : m.Template;

                Assert.That(db, Is.EqualTo(expected),
                    $"{m.Code} ({WebMsgSnapshot.SourceFile}:{m.Line}) đang nằm trong danh sách ĐỐI CHỨNG " +
                    $"nhưng không còn khớp.\n" +
                    $"        web = {Txt.Vis(m.Template)}\n" +
                    $"        DB  = {Txt.Vis(db)}\n" +
                    (m.Note.Length > 0 ? $"        ghi chú: {m.Note}\n" : "") +
                    "        ⇒ PHƯƠNG PHÁP hoặc DỮ LIỆU đã đổi. Đừng đọc TCM2 khi ca này còn đỏ.");
            }
        });

        LogKq(1, $"{WebMsgSnapshot.Matching.Count} mã đối chứng khớp MSGTBL từng ký tự — " +
                 "phương pháp đối chiếu đứng vững.");
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TCM2 — 16 mã đang lệch
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(2)]
    [Description("TCM2 — 16 mã đang lệch MSGTBL, lệch ĐÚNG như đã đo")]
    public void TCM2_Known_Divergences_Are_Still_Exactly_These()
    {
        Assert.Multiple(() =>
        {
            foreach (var d in WebMsgSnapshot.Diverging)
            {
                var db = _db.Template(d.Code);

                Assert.That(db, Is.EqualTo(d.DbTemplate),
                    $"{d.Code}: row MSGTBL đã ĐỔI so với lúc chụp ({WebMsgSnapshot.TakenOn}).\n" +
                    $"        đã đo = {Txt.Vis(d.DbTemplate)}\n" +
                    $"        bây giờ = {Txt.Vis(db)}");

                Assert.That(d.WebTemplate, Is.Not.EqualTo(db),
                    $"{d.Code} ({WebMsgSnapshot.SourceFile}:{d.Line}) nay ĐÃ KHỚP MSGTBL — tin tốt.\n" +
                    $"        ⇒ chuyển mã này từ WebMsgSnapshot.Diverging sang Matching rồi chạy lại.");
            }
        });

        LogKq(2, $"{WebMsgSnapshot.Diverging.Count} mã vẫn lệch MSGTBL:");
        foreach (var d in WebMsgSnapshot.Diverging)
        {
            Log($"   {d.Code}  ({WebMsgSnapshot.SourceFile}:{d.Line})");
            Log($"      DB  = {Txt.Vis(d.DbTemplate)}");
            Log($"      web = {Txt.Vis(d.WebTemplate)}");
            Log($"      → {d.Why}");
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TCM3 — lỗi CẤU TRÚC, không phải câu chữ
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(3)]
    [Description("TCM3 — E00007 lấy nhầm body của E00100; E00020 không có chỗ; E00101 không có row")]
    public void TCM3_Structural_Defects_Are_Confirmed_By_The_Table()
    {
        // ── E00007: chuỗi web đang giữ là BODY của E00100 ở frm201045 ──────────
        //
        // frm201045.cs:298  ShowWarningMsg("E00100", "選択するデータがありません。")
        //
        // E00100 có row đúng bằng 「{0}」 ⇒ nhánh 1 của getMsg thay {0} bằng tham số ⇒ câu
        // hiện ra CHÍNH LÀ tham số. Người port nhặt câu đã render đó về gán cho E00007.
        const string bodyPassedToE00100AtFrm201045 = "選択するデータがありません。";
        var webE00007 = WebMsgSnapshot.Diverging.Single(d => d.Code == "E00007").WebTemplate;

        Assert.Multiple(() =>
        {
            Assert.That(_db.Template("E00100"), Is.EqualTo("{0}"),
                "E00100 phải là 「{0}」 — đó là lý do nó hoạt động như 「túi đựng chữ tự do」.");

            Assert.That(_db.Render("E00100", bodyPassedToE00100AtFrm201045),
                Is.EqualTo(webE00007),
                "chuỗi web đang gán cho E00007 phải TRÙNG KHÍT kết quả render của " +
                "ShowWarningMsg(\"E00100\", …) tại frm201045.cs:298 — đó là bằng chứng nó bị " +
                "nhặt nhầm từ đó, chứ không phải diễn đạt lại row E00007.");

            Assert.That(_db.Template("E00007"), Is.Not.EqualTo(webE00007),
                "…và KHÔNG phải row E00007 thật.");
        });

        // ── E00020: web đã gỡ (commit 1e5afabb7). Chốt lại rằng chuỗi cũ không thuộc mã nào ──
        //
        // Chuỗi cũ 「保険者番号の桁数が間違っています。」 là kết quả render của
        // E00002 + tham số 「保険者番号の桁数」 (frm201021.cs:146), không phải row E00020.
        const string oldWebE00020 = "保険者番号の桁数が間違っています。";
        Assert.Multiple(() =>
        {
            Assert.That(_db.Template("E00020"), Is.Not.Null,
                "E00020 CÓ row trong MSGTBL — nó chỉ không được phát ra ở nhánh mà web dùng.");

            Assert.That(_db.Render("E00002", "保険者番号の桁数"),
                Is.EqualTo(oldWebE00020),
                "chuỗi mà web từng để ở E00020 chính là E00002 đã render với 「保険者番号の桁数」 " +
                "(frm201021.cs:146) — sai mã, không phải sai chữ.");

            Assert.That(_db.Template("E00020"), Is.Not.EqualTo(oldWebE00020),
                "…và khác hẳn row E00020 thật (câu về 保険有効期限).");
        });

        // ── E00101: KHÔNG có row ⇒ nhánh 3 của getMsg ────────────────────────
        Assert.That(_db.Template("E00101"), Is.Null,
            "E00101 KHÔNG được có row: chính vì thiếu row mà tham số thứ hai trở thành TOÀN BỘ " +
            "nội dung hộp thoại (MsgDialog.cs:207). Có row ⇒ mọi call-site E00101 đổi nghĩa.");

        LogKq(3, "E00007 = body của E00100@frm201045; E00020 cũ = E00002 đã render; E00101 không có row.");
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TCM4 — bất biến: row có {0} ⇔ hàm web nhận tham số
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(4)]
    [Description("TCM4 — mọi row có {0} thì hàm web phải nhận tham số; Q00039 là ngoại lệ DUY NHẤT")]
    public void TCM4_Placeholder_And_Arity_Agree()
    {
        // Chữ ký hàm bên web gõ cứng số tham số. Row có {0} mà hàm nhận 0 tham số thì
        // KHÔNG có cách nào điền — phần câu quanh {0} cũng thường bị cắt luôn cho khỏi cấn.
        // Đó đúng là chuyện đã xảy ra với Q00039.
        var offenders = new List<string>();

        foreach (var code in WebMsgSnapshot.AllCodes)
        {
            var template = _db.Template(code);
            if (template is null) continue;

            var dbWantsParam = template.Contains("{0}", StringComparison.Ordinal);
            var arity = WebMsgSnapshot.Matching.FirstOrDefault(m => m.Code == code)?.Arity
                        ?? WebMsgSnapshot.Diverging.First(d => d.Code == code).Arity;

            if (dbWantsParam && arity == 0) offenders.Add($"{code} (DB có {{0}}, web nhận 0 tham số)");
            if (!dbWantsParam && arity > 0 && code != "E00100")
                offenders.Add($"{code} (DB KHÔNG có {{0}} nhưng web nhận {arity} tham số ⇒ " +
                              "bên WinForm tham số bị NỐI vào cuối câu, MsgDialog.cs:203)");
        }

        LogKq(4, offenders.Count == 0
            ? "mọi mã có {0} đều có tham số bên web."
            : "lệch chữ ký: " + string.Join(" / ", offenders));

        Assert.That(offenders, Is.EqualTo(new[] { "Q00039 (DB có {0}, web nhận 0 tham số)" }),
            "Q00039 là ca DUY NHẤT đã biết: row là 「{0}プリンタに用紙をセットしてください。」 và legacy CÓ " +
            "truyền tham số (frm203046.cs:156, CommonNikei.cs:272/329/343/359, frm305004.cs:462/541), " +
            "trong khi web khai 0 tham số và cắt luôn cụm 「プリンタに」. Danh sách đổi ⇒ có mã mới " +
            "lệch chữ ký, hoặc Q00039 đã được sửa — cập nhật ca này theo hướng tương ứng.");

        Assert.Multiple(() =>
        {
            Assert.That(_db.Template("Q00039"), Does.Contain("{0}"),
                "row Q00039 phải còn {0} — đó là chỗ điền tên máy in.");
            Assert.That(_db.Template("Q00039"), Does.Contain("プリンタに"),
                "…và phải còn cụm 「プリンタに」 mà bản web đã cắt.");
        });
    }
}
