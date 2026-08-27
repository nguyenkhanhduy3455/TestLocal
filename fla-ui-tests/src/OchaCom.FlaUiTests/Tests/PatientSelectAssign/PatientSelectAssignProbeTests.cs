using FlaUI.Core.AutomationElements;
using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.PatientSelectAssign;

/// <summary>
/// <b>PROBE — dò 患者確定 của frm203001, KHÔNG assert.</b>
///
/// Bước 2 của vòng làm việc bắt buộc trong <c>fla-ui-tests/PROBE-GUIDELINE.md</c>:
/// chưa biết app thật hành xử ra sao thì <b>chụp màn hình → đọc ảnh → rồi mới viết
/// assert</b>. Fixture này không bao giờ ném; một lượt chạy phải trả lời hết những
/// câu mà ĐỌC SOURCE KHÔNG kết luận được.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// VÌ SAO CẦN PROBE Ở ĐÂY
/// ═══════════════════════════════════════════════════════════════════════════
/// Ba thứ đọc source xong vẫn không biết:
///
/// <list type="number">
/// <item><description><b>Nguyên văn E00027 / E00005.</b> <c>MsgDialog.ShowWarningMsg</c>
/// lấy câu từ bảng <c>MSGTBL</c> (MsgTbl.cs:15-33) — KHÔNG có trong source, cũng không
/// có file seed. Bản web đang dùng câu ĐOÁN và tự khai điều đó ở
/// <c>locales/ja.ts:63</c>「MSGTBL は本リポジトリに無く E00027 の実文言は未確認」.
/// KQ-2 đọc câu thật ra.</description></item>
///
/// <item><description><b>Ｄｒ．nào thắng trên header 処置入力.</b> Có BA đoạn cùng
/// tranh nhau ghi, và thứ tự thật chỉ đo mới biết:
/// <code>
///   frm203001.cs:1054  Let_Data_frmPatId : pintDrNo = intAttending (att_dr của 患者マスタ)
///                      — chạy VÔ ĐIỀU KIỆN vì DrId_fixed không được gán true ở đâu cả
///   frm203002.cs:425   cboDr.SelectedValue = formParam.UserNo  → :8095 ghi pintDrNo lại
///                      — nhưng SelectedValueChanged chỉ bắn khi GIÁ TRỊ ĐỔI
///   modMain.cs:2125    Chg_DrName : lbDr lấy cột 69 CỦA DÒNG (dr_no đã lưu) nếu có,
///                      không có mới rơi về pintDrNo
/// </code>
/// KQ-6 đo thẳng: chọn tay một Ｄｒ．khác <c>att_dr</c> rồi xem nhãn <c>lbDr</c> ra ai.</description></item>
///
/// <item><description><b>Cửa vào từ lưới 受付患者一覧.</b>
/// <c>dgvView_CellDoubleClick</c> có câu <c>defData</c> BỊ COMMENT
/// (frm203001.cs:303-309) ⇒ double-click lẽ ra là no-op, trong khi bản Playwright
/// mở màn chi tiết bằng đúng cử chỉ đó. KQ-9 đo cả double-click lẫn Enter.</description></item>
/// </list>
///
/// ═══════════════════════════════════════════════════════════════════════════
/// MƯỜI CÂU HỎI
/// ═══════════════════════════════════════════════════════════════════════════
/// <code>
///  KQ-1   Control frm203001 đọc được bằng AutomationId không? Hàng 衛生士 hiện hay ẩn?
///  KQ-2   MSGTBL trả nguyên văn gì cho E00002 / E00005 / E00027?
///  KQ-3   Combo Ｄｒ．phơi ra mấy mục? Mục đầu có phải dòng TRỐNG? Chọn được kiểu nào?
///  KQ-4   Dữ liệu máy này dựng được những nhánh nào (att_dr / thiếu att_dr / thiếu att_st / wait)?
///  KQ-5   Combo TRỐNG + 患者番号 có att_dr → 確定 ra gì? Header lbDr hiện ai?
///  KQ-6   Combo CHỌN TAY (≠ att_dr) → header lbDr hiện ai?   ← câu quan trọng nhất
///  KQ-7   患者番号 không tồn tại → nguyên văn hộp thoại?
///  KQ-8   Bệnh nhân thiếu att_dr → nguyên văn hộp thoại? Sau khi OK còn ở 患者選択 không?
///         Và FOCUS rơi về control nào sau khi đóng hộp thoại? (:673 / :708 / :724)
///  KQ-9   Lưới 受付一覧: double-click có mở màn không (source nói KHÔNG)? Enter thì sao?
///  KQ-10  F10 戻る từ 処置入力 có bung hộp thoại gì không?
/// </code>
///
/// ═══════════════════════════════════════════════════════════════════════════
/// KHÔNG GHI DB
/// ═══════════════════════════════════════════════════════════════════════════
/// Probe chỉ ĐỌC. Nó không bấm F9 登録, không seed dòng <c>wait</c> (khác bản
/// Playwright — xem <see cref="PatientSelectAssignDb"/>), và mọi hộp thoại
/// 「保存しますか？」 gặp phải đều trả lời <b>いいえ</b>.
///
/// <para>Chạy: <c>.\run-confirm-patient.ps1 -Diagnostics</c>.
/// Runner lọc sẵn mọi dòng <c>=== KQ-</c> ra <c>confirm-patient-KQ.txt</c>.</para>
/// </summary>
[TestFixture]
[Explicit("PROBE — chỉ chạy đích danh, không nằm trong lượt chạy đủ")]
[Category("confirm-patient")]
public sealed class PatientSelectAssignProbeTests : UiTestBase
{
    private PatientSelectFlow _flow = null!;
    private PatientSelectAssignDb? _db;

    /// <summary>Đo CHÍNH màn 患者選択 nên nền chung không được đi qua nó.</summary>
    protected override bool NavigatesToTreatmentEntry => false;

    /// <summary>
    /// TẮT HẲN watcher hộp thoại nhiễu — probe đang đo NGUYÊN VĂN từng hộp thoại,
    /// để watcher bấm hộ là mọi phép đọc ra rỗng và log sẽ nói 「app không cảnh báo」,
    /// ngược hẳn sự thật (PROBE-GUIDELINE 3.4).
    /// </summary>
    protected override string[] NuisanceDialogPatterns => [];

    protected override AutomationElement? UiaDumpRoot
    {
        get
        {
            try { return _flow?.Screen?.Window ?? base.UiaDumpRoot; }
            catch { return null; }
        }
    }

    [OneTimeSetUp]
    public void ProbeOneTimeSetUp()
    {
        _flow = new PatientSelectFlow(App, Settings);
        _db = PatientSelectAssignDb.CreateOrNull(Settings);
    }

    private static void Log(string line)
    {
        TestContext.Out.WriteLine(line);
        try { TestContext.Progress.WriteLine(line); } catch { /* không có console */ }
    }

    private static void Kq(string tag, string line) => Log($"=== KQ-{tag} === {line}");

    /// <summary>Chạy một bước, nuốt mọi ngoại lệ, ghi lại rồi đi tiếp.</summary>
    private static void Safe(string what, Action action)
    {
        try { action(); }
        catch (Exception e) { Log($"    !! bước 「{what}」 lỗi: {e.GetType().Name}: {e.Message}"); }
    }

    [Test, Order(0)]
    [Description("Tc0 — PROBE: đo mười câu hỏi của 患者確定 trong một lượt chạy")]
    public void Tc0_Probe()
    {
        using var trace = TestTrace.Begin();

        Log("╔══════════════════════════════════════════════════════════════════╗");
        Log("║ PROBE 患者確定 (frm203001.defData) — KHÔNG assert                 ║");
        Log("╚══════════════════════════════════════════════════════════════════╝");
        Log($"ngày test {TrtDate:yyyy-MM-dd}");

        PatientSelectScreen? screen = null;
        Safe("mở màn 患者選択", () =>
        {
            screen = _flow.Open();
            trace.Shot("00-man-patient-select");
        });

        if (screen is null)
        {
            Log("    ⚠ Không mở được frm203001 — mọi KQ sau đều bỏ trống.");
            return;
        }

        // ── KQ-1 ────────────────────────────────────────────────────────────
        Safe("KQ-1 doc control", () =>
        {
            string Describe(string what, Func<AutomationElement?> get)
            {
                try
                {
                    var e = get();
                    return e is null ? $"{what}=KHÔNG THẤY"
                        : $"{what}={(Uia.IsOnScreen(e) ? "hiện" : "ẩn")}";
                }
                catch (Exception ex) { return $"{what}=LỖI({ex.GetType().Name})"; }
            }

            Kq("1", string.Join(" · ",
                Describe("cboPatNo", () => screen!.PatNoCombo),
                Describe("cboUserNm", () => screen!.DrCombo),
                Describe("cboStaffNm", () => screen!.StaffCombo),
                Describe("dgvView", () => screen!.ViewGrid),
                Describe("lblStaffNm", () => screen!.StaffLabel)));

            var visible = screen!.HygienistRowVisible();
            Kq("1b", $"hàng 衛生士 {(visible ? "ĐANG HIỆN" : "ĐANG ẨN")} ⇒ Ocha.xml DispEiseisi " +
                     $"{(visible ? "≠ 0 (1 = bắt buộc, 9 = hiện mà KHÔNG bắt buộc — frm203001.cs:542 vs :721)" : "== 0")}. " +
                     "LƯU Ý: bản web suy hàng này từ inp_config.eiseiji_flg của DB, KHÔNG phải Ocha.xml.");
        });

        // ── KQ-2 ────────────────────────────────────────────────────────────
        Safe("KQ-2 doc MSGTBL", () =>
        {
            if (Db is null)
            {
                Kq("2", $"KHÔNG đọc được MSGTBL — {DbUnavailableReason}");
                return;
            }
            foreach (var id in new[] { "E00002", "E00005", "E00027" })
            {
                var raw = Db.GetMessage(id);
                Kq("2", $"{id} MSGTBL = {(raw is null ? "KHÔNG CÓ DÒNG NÀY" : $"「{Txt.N(raw)}」")}");
            }
            Kq("2b", $"E00027+「ドクター」 → 「{Db.ExpectedMessage("E00027", "ドクター")}」 · " +
                     $"E00027+「衛生士」 → 「{Db.ExpectedMessage("E00027", "衛生士")}」 · " +
                     $"E00005+「患者情報」 → 「{Db.ExpectedMessage("E00005", "患者情報")}」");
            Log("    → So với web locales/ja.ts: E00027 「{0}が選択されていません。」, E00005 「{0}が登録されていません。」");
        });

        // ── KQ-3 ────────────────────────────────────────────────────────────
        Safe("KQ-3 doc combo Dr", () =>
        {
            var names = screen!.DoctorItemNames();
            Kq("3", $"combo Ｄｒ．phơi ra {names.Count} mục qua UIA" +
                    (names.Count == 0 ? " ⇒ KHÔNG chọn được theo tên/ListItem, phải đi bằng bàn phím" : ""));
            trace.Shot("01-combo-dr");
        });

        // ── KQ-3b — THỨ TỰ THẬT của combo, đi bằng bàn phím ────────────────
        Safe("KQ-3b thu tu that cua combo", () =>
        {
            var walked = screen!.WalkDoctorLabels();
            Kq("3b", $"đi Home→Down đọc được {walked.Count} nhãn: " +
                     string.Join(" → ", walked.Select(n => n.Length == 0 ? "「」(trống)" : $"「{n}」")));
            Log("    → so với IINMST2 ORDER BY user_no ở KQ-4b. Chỉ đọc được 1 nhãn 「trống」 " +
                "nghĩa là phím vẫn không tới combo — khi đó KQ-6 sẽ không dựng được.");
        });

        // ── KQ-4 ────────────────────────────────────────────────────────────
        int? patWithDr = null, patWithoutDr = null, patWithoutSt = null;
        PersonAttending? attOfWithDr = null;
        IReadOnlyList<StaffMember> doctors = [];
        IReadOnlyList<WaitRow> waitRows = [];

        Safe("KQ-4 do du lieu", () =>
        {
            if (_db is null)
            {
                Kq("4", $"KHÔNG đọc được DB — {DbUnavailableReason ?? "db.enabled = false"}");
                return;
            }

            patWithDr = _db.PatientWithAttDr();
            patWithoutDr = _db.PatientWithoutAttDr();
            patWithoutSt = _db.PatientWithAttDrWithoutAttSt();
            doctors = _db.Doctors();
            // Combo khong pho muc nao ra UIA (KQ-3) nen chon theo TEN phai qua roster nay.
            screen!.DoctorRoster = doctors;
            waitRows = _db.WaitRows();
            if (patWithDr is not null) attOfWithDr = _db.Attending(patWithDr.Value);

            Kq("4", $"patWithAttDr={patWithDr?.ToString() ?? "KHÔNG CÓ"} (att_dr={attOfWithDr?.AttDr}, att_st={attOfWithDr?.AttSt}) · " +
                    $"patWithoutAttDr={patWithoutDr?.ToString() ?? "KHÔNG CÓ"} · " +
                    $"patWithAttDrWithoutAttSt={patWithoutSt?.ToString() ?? "KHÔNG CÓ"}");
            Kq("4b", $"IINMST2 user_kbn=0: {doctors.Count} Ｄｒ．— " +
                     string.Join(" / ", doctors.Take(10).Select(d => d.ToString())));
            Kq("4c", $"bảng wait: {waitRows.Count} dòng — " +
                     (waitRows.Count == 0
                        ? "KHÔNG có dòng 受付 nào ⇒ nhánh selRow (TC-DR-4) sẽ Ignore, luồng này KHÔNG tự seed"
                        : string.Join(" / ", waitRows.Take(10)
                            .Select(w => $"患者{w.PatNo}→user_no={w.UserNo?.ToString() ?? "NULL"}"))));

            if (waitRows.Any(w => w.UserNo is null or <= 0))
                Log("    ★ Có dòng 受付 mang user_no NULL/0. WinForm ở nhánh selRow kiểm " +
                    "SỰ TỒN TẠI CỦA CỘT chứ không kiểm giá trị (frm203001.cs:698), nên nó KHÔNG " +
                    "rơi về att_dr — nó lấy luôn 0 rồi chặn E00027. Bản web thì `waitRowUserNo || " +
                    "patientAttDr` nên rơi về att_dr và MỞ ĐƯỢC màn. Đây là một điểm lệch.");
        });

        // ── KQ-7 ────────────────────────────────────────────────────────────
        Safe("KQ-7 patNo khong ton tai", () =>
        {
            var missing = _db?.UnusedPatNo() ?? 99999999;
            screen!.ClearDoctor();
            screen.ClearPatNo();
            screen.TypePatNo(missing.ToString());
            var r = _flow.ConfirmAndObserve(() => screen.ConfirmWithEnd());
            trace.Shot("05-KQ7-patno-khong-ton-tai");
            Kq("7", $"患者番号={missing} (không tồn tại) → {r}");

            // ĐỌC, KHÔNG ĐOÁN. Hộp thoại này đã chống lại cả bốn cách đóng ở các lượt
            // trước; đổ thẳng cây UIA + rect của nó ra để biết nút OK trông thế nào và
            // nằm ở đâu, thay vì tiếp tục thử mò (PROBE-GUIDELINE mục 2).
            if (r.DialogWindow is not null)
            {
                Log("=== CÂY UIA CỦA HỘP THOẠI E00005 ===");
                Log(_flow.DescribeDialog(r.DialogWindow));
                trace.Shot("05a-hop-thoai-E00005");
            }

            try { _flow.DrainDialogs(); }
            catch (Exception e) { Log($"    !! không đóng được: {e.Message}"); }
            // ĐO SAU KHI ĐÓNG hộp thoại — còn hộp thoại thì focus là nút của nó.
            Kq("7b", $"focus sau khi đóng E00005 = {_flow.FocusedDescription()} " +
                     "(source nói cboPatNo.Focus(), frm203001.cs:673) · " +
                     $"còn hộp thoại: {_flow.FirstDialog() is not null}");
        });

        // ── KQ-8 ────────────────────────────────────────────────────────────
        Safe("KQ-8 thieu att_dr", () =>
        {
            if (patWithoutDr is null)
            {
                Kq("8", "bỏ qua — máy này không có bệnh nhân nào thiếu att_dr");
                return;
            }
            screen!.ClearDoctor();
            screen.ClearPatNo();
            screen.TypePatNo(patWithoutDr.Value.ToString());
            var r = _flow.ConfirmAndObserve(() => screen.ConfirmWithEnd());
            trace.Shot("06-KQ8-thieu-att-dr");
            Kq("8", $"患者{patWithoutDr} (att_dr ≤ 0) → {r}");
            Kq("8b", $"sau khi bung hộp thoại, frm203001 còn hiện: {screen.IsShowing()}");
            _flow.DrainDialogs();
            Kq("8c", $"focus sau khi đóng E00027「ドクター」 = {_flow.FocusedDescription()} " +
                     "(source nói cboUserNm.Focus(), frm203001.cs:708)");
        });

        // ── KQ-5 + KQ-6 chay CUOI CUNG ──────────────────────────────────────
        // Hai cau nay DIEU HUONG sang 処置入力, va duong ve (F10 戻る) da do duoc la
        // co the lam app nem unhandled exception (KQ-10, do 2026-08-26). Dat chung
        // sau moi cau chi DUNG YEN o 患者選択 thi mot lan hong duong ve khong con
        // cuop mat cac dap an kia.
        // ── KQ-5 + KQ-6 ─────────────────────────────────────────────────────
        Safe("KQ-5/6 confirm", () =>
        {
            if (patWithDr is null || attOfWithDr is null)
            {
                Kq("5", "bỏ qua — không dò được bệnh nhân có att_dr");
                return;
            }

            // KQ-5: combo TRỐNG ⇒ fallback 患者マスタ
            if (!screen!.IsShowing())
            {
                Kq("5", "bỏ qua — cửa sổ 患者選択 không còn hiện sau các bước trước");
                return;
            }
            screen.ClearDoctor();
            screen.TypePatNo(patWithDr.Value.ToString());
            var r5 = _flow.ConfirmAndObserve(() => screen.ConfirmWithEnd());
            trace.Shot("02-KQ5-sau-confirm-combo-trong");
            Kq("5", $"combo TRỐNG + 患者{patWithDr} (att_dr={attOfWithDr.AttDr}) → {r5}");

            if (r5.Opened)
            {
                var lbl = _flow.DetailDoctorLabel(r5.DetailWindow!);
                var expected = doctors.FirstOrDefault(d => d.UserNo == attOfWithDr.AttDr)?.UserNm;
                Kq("5b", $"nhãn lbDr = 「{lbl}」; att_dr={attOfWithDr.AttDr} tên là 「{expected ?? "?"}」 " +
                         $"⇒ {(expected is not null && lbl == expected ? "KHỚP" : "LỆCH")}");
                Kq("5c", $"nhãn lbEiseisi = 「{_flow.DetailHygienistLabel(r5.DetailWindow!)}」");
                Safe("KQ-5d doc cboDr", () =>
                    Kq("5d", $"combo cboDr (sau khi click nhãn) = 「{_flow.DetailDoctorCombo(r5.DetailWindow!)}」 " +
                             "— đây mới là số đóng dấu xuống TRNTRN.dr_no khi F9 (frm203002.cs:8095)"));

                Safe("KQ-10 F10 tro ve", () =>
                {
                    var asked = _flow.ReturnToPatientSelect(r5.DetailWindow!);
                    Kq("10", asked.Count == 0
                        ? "F10 戻る về thẳng 患者選択, KHÔNG hộp thoại nào"
                        : "F10 戻る bung: " + string.Join(" / ", asked.Select(a => $"「{a}」")) + " (đã trả lời いいえ)");
                    trace.Shot("03-sau-F10");
                });
                screen = _flow.Screen; screen.DoctorRoster = doctors;
            }
            else
            {
                _flow.DrainDialogs();
            }

            // KQ-6: combo CHỌN TAY một Ｄｒ．KHÁC att_dr
            var probeDr = doctors.FirstOrDefault(d => d.UserNo != attOfWithDr.AttDr);
            if (probeDr is null)
            {
                Kq("6", "bỏ qua — IINMST2 chỉ có đúng một Ｄｒ．nên không tách được hai nguồn");
                return;
            }

            if (!screen!.IsShowing())
            {
                Kq("6", "bỏ qua — cửa sổ 患者選択 không còn hiện sau các bước trước " +
                        "(xem KQ-10: F10 戻る có thể làm app ném unhandled exception)");
                return;
            }

            screen.ClearPatNo();
            var path = screen.SelectDoctorByOpening(probeDr.UserNm);
            Kq("6a", $"chọn Ｄｒ．「{probeDr.UserNm}」 — đường đi qua combo: " +
                     string.Join(" → ", path.Select(x => x.Length == 0 ? "「」(trống)" : $"「{x}」")));
            screen.TypePatNo(patWithDr.Value.ToString());
            var r6 = _flow.ConfirmAndObserve(() => screen.ConfirmWithEnd());
            trace.Shot("04-KQ6-sau-confirm-combo-chon");
            Kq("6", $"combo = {probeDr} (att_dr={attOfWithDr.AttDr}) + 患者{patWithDr} → {r6}");

            if (r6.Opened)
            {
                var lbl = _flow.DetailDoctorLabel(r6.DetailWindow!);
                var attNm = doctors.FirstOrDefault(d => d.UserNo == attOfWithDr.AttDr)?.UserNm;
                Kq("6b", $"nhãn lbDr = 「{lbl}」 · Ｄｒ．vừa chọn = 「{probeDr.UserNm}」 · " +
                         $"att_dr của 患者マスタ = 「{attNm ?? "?"}」");
                Safe("KQ-6d doc cboDr", () =>
                    Kq("6d", $"combo cboDr = 「{_flow.DetailDoctorCombo(r6.DetailWindow!)}」 " +
                             $"(Ｄｒ．vừa chọn = 「{probeDr.UserNm}」) — CÂU QUYẾT ĐỊNH: đây là số " +
                             "đóng dấu xuống TRNTRN.dr_no, còn lbDr chỉ là 担当医 của DÒNG đang đứng"));
                Log(lbl == probeDr.UserNm
                    ? "    → GIỮ Ｄｒ．vừa chọn (khớp kỳ vọng của bản web)."
                    : lbl == attNm
                        ? "    ★ LẤY att_dr CỦA 患者マスタ, KHÔNG phải Ｄｒ．vừa chọn — " +
                          "đúng nhánh Let_Data_frmPatId :1054 (DrId_fixed luôn false). Bản web GIỮ Ｄｒ．chọn ⇒ LỆCH."
                        : "    ★ Ra một tên THỨ BA — nhiều khả năng là dr_no của dòng TRNTRN cũ " +
                          "(Chg_DrName, modMain.cs:2125 đọc cột 69 của dòng). Bản web GIỮ Ｄｒ．chọn ⇒ LỆCH.");

                if (_db is not null)
                {
                    var trnDrs = _db.TrnDoctorsInMonth(patWithDr.Value, TrtDate);
                    Kq("6c", $"TRNTRN tháng {TrtDate:yyyy-MM} của 患者{patWithDr}: dr_no = " +
                             (trnDrs.Count == 0 ? "KHÔNG CÓ DÒNG NÀO" : string.Join(",", trnDrs)));
                }

                Safe("F10 tro ve sau KQ-6", () =>
                {
                    _flow.ReturnToPatientSelect(r6.DetailWindow!);
                    screen = _flow.Screen; screen.DoctorRoster = doctors;
                });
            }
            else
            {
                _flow.DrainDialogs();
            }
        });

        // ── KQ-9 ────────────────────────────────────────────────────────────
        Safe("KQ-9 luoi 受付一覧", () =>
        {
            if (waitRows.Count == 0)
            {
                Kq("9", "bỏ qua — bảng wait rỗng nên lưới 受付患者一覧 không có dòng nào");
                return;
            }

            screen!.ClearDoctor();
            screen.ClearPatNo();
            var target = waitRows[0];
            var picked = screen.SelectGridRowByPatNo(target.PatNo);
            Kq("9", $"chọn dòng 患者{target.PatNo} (user_no={target.UserNo?.ToString() ?? "NULL"}) trên lưới: " +
                    (picked ? "được" : "KHÔNG thấy dòng đó"));
            if (!picked) return;

            // Double-click TRƯỚC: source nói nó là no-op, đo để chắc.
            var center = Uia.Center(screen.ViewGrid);
            var dbl = _flow.ConfirmAndObserve(
                () => Uia.DoubleClickPhysical(center.X, center.Y),
                TimeSpan.FromSeconds(6));
            trace.Shot("07-KQ9-double-click");
            Kq("9b", $"DOUBLE-CLICK trên dòng lưới → {dbl}" +
                     (dbl.Silent
                        ? "  ⇒ đúng như source: dgvView_CellDoubleClick có defData BỊ COMMENT (frm203001.cs:303-309). " +
                          "Bản Playwright mở màn chi tiết bằng chính cử chỉ này ⇒ LỆCH."
                        : "  ⇒ KHÁC source: source nói câu defData đang bị comment, mà thực tế lại có phản ứng."));
            if (dbl.Opened)
            {
                Safe("F10 sau double-click", () => { _flow.ReturnToPatientSelect(dbl.DetailWindow!); screen = _flow.Screen; screen.DoctorRoster = doctors; });
                return;
            }
            _flow.DrainDialogs();

            // Enter trên lưới = defData(inpKbn.selRow, …)
            screen!.SelectGridRowByPatNo(target.PatNo);
            var ent = _flow.ConfirmAndObserve(() => screen.ConfirmSelectedRowWithEnter());
            trace.Shot("08-KQ9-enter");
            Kq("9c", $"ENTER trên dòng lưới → {ent}");
            if (ent.Opened)
            {
                var lbl = _flow.DetailDoctorLabel(ent.DetailWindow!);
                var rowNm = doctors.FirstOrDefault(d => d.UserNo == target.UserNo)?.UserNm;
                Kq("9d", $"header lbDr = 「{lbl}」 · user_no của DÒNG = {target.UserNo?.ToString() ?? "NULL"} " +
                         $"(「{rowNm ?? "?"}」)");
                Safe("F10 sau Enter", () => { _flow.ReturnToPatientSelect(ent.DetailWindow!); screen = _flow.Screen; screen.DoctorRoster = doctors; });
            }
            else
            {
                _flow.DrainDialogs();
            }
        });

        Safe("don dep hop thoai con lai", () =>
        {
            var left = _flow.DrainDialogs();
            if (left.Count > 0)
                Log("    hộp thoại còn sót đã đóng: " + string.Join(" / ", left.Select(t => $"「{t}」")));
        });

        Log("╔══════════════════════════════════════════════════════════════════╗");
        Log("║ HẾT PROBE — đọc confirm-patient-KQ.txt và ảnh trong artifacts     ║");
        Log("╚══════════════════════════════════════════════════════════════════╝");
    }
}
