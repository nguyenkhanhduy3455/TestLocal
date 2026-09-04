using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.PerioKensaOrder;

/// <summary>
/// 検査順 — hướng quét của 歯周基本検査 (<c>frm203028</c>) và 歯周精密検査 (<c>frm203029</c>).
/// Nửa WinForm của <c>../web-tenant-tests/tests/perio-kensa-order.spec.ts</c>.
///
/// <para><b>Đây là ĐÁP ÁN, không phải kiểm bản web.</b> Mọi con số dưới đây đo từ WinForm
/// thật; bản web phải khớp với chúng. Testcase nào ở đây đỏ nghĩa là WinForm không cư xử
/// như source nói — lúc đó phải đọc lại source chứ đừng sửa số cho vừa.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// BẢNG TƯƠNG ỨNG VỚI SPEC PLAYWRIGHT
/// ═══════════════════════════════════════════════════════════════════════════════
/// <code>
///  TcREAD ←  TC-READ  cổng của chính setting: combo 基本･精密検査 có đủ 左上/右上
///  Tc1    ←  TC-1     右上から 基本: con trỏ vào răng 0, Enter đi tới  (ĐỐI CHỨNG)
///  Tc2    ←  TC-2     左上から 基本: con trỏ vào răng 15, Enter đi NGƯỢC
///  Tc4    ←  TC-4     左上から 基本: hết vòng ⇒ sang hàng 動揺度 (idx + 100)
///  Tc5    ←  TC-5     右上から 精密 6点法: điểm 口蓋 ĐẦU của răng 0      (ĐỐI CHỨNG)
///  Tc6    ←  TC-6     左上から 精密 6点法: điểm 口蓋 CUỐI của răng 15
///  Tc7    ←  TC-7     左上から 精密 6点法: 3 điểm chạy ngược rồi sang 頬側 idx+2
///  Tc7b   ←  TC-7b    左上から 精密 4点法: điểm giữa ⇒ 頬側 điểm CUỐI
///  Tc8    ←  TC-8     ←/→ KHÔNG đổi theo 検査順                         (ĐỐI CHỨNG)
/// </code>
/// Spec web KHÔNG có TC-3 — số nhảy là cố ý, giữ nguyên để hai bên tra chéo được.
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// NGUỒN WINFORM (mọi assert bám vào đây)
/// ═══════════════════════════════════════════════════════════════════════════════
/// <list type="bullet">
///   <item>modCommon.cs:595-597 — <c>pInpOpt[36] = XmlControl.OchaXml.InpInfo.KensaOrder</c>,
///     là cd_val của <c>mst_cod</c> cd_type 68: <b>1 = 左上から, 2 = 右上から</b>. Giá trị
///     <b>0</b> (máy chưa cấu hình) KHÔNG phải cd_val, và cả hai form chỉ kiểm <c>== 1</c>
///     nên 0 chạy nhánh 右上 y như 2.</item>
///   <item>frm203028.cs:471-484 — <c>tyToothInf[].next = i+1</c> / <c>.prev = i-1</c>,
///     khép vòng <c>31 ↔ 0</c>.</item>
///   <item>frm203028.cs:488-512 — フォーカス設定: 左上 quét 上顎 <c>15→0</c> TRƯỚC, chỉ khi
///     上顎 trống mới quét 下顎 <c>31→16</c>; 右上 quét thẳng <c>0→31</c>.</item>
///   <item>frm203028.cs:610-657 <c>getMoveIndex</c> — 左上 dùng <c>.prev</c> và coi là hết
///     vòng khi về <b>15</b>; 右上 dùng <c>.next</c> và hết vòng khi về <b>0</b>. Hết vòng
///     ⇒ <c>idx + 100</c> = sang hàng đo kế tiếp (EPP ⇄ 動揺度, frm203028.cs:190-199).</item>
///   <item>frm203028.cs:660-724 <c>getMoveIndexArrow</c> — <b>không có nhánh
///     <c>pInpOpt[36]</c> nào</b>; mép cung là <c>15 ↔ 31</c> và <c>16 ↔ 0</c>.</item>
///   <item>frm203029.cs:100-156 — cùng luật quét, rồi focus điểm 口蓋: 4点法 <c>t*3+1</c>;
///     6点法 右上 <c>t*3+0</c>, <b>左上 <c>t*3+2</c></b>.</item>
///   <item>frm203029.cs:667-716 <c>txtKou_KeyPress</c> — 6点法 左上 <c>2→1→0→頬側 idx+2</c>;
///     6点法 右上 <c>0→1→2→頬側 idx-2</c>; 4点法 左上 <c>điểm giữa → 頬側 idx+1</c>.</item>
///   <item>frm203029.cs:472-530 <c>txtHoho_KeyPress</c> — 左上 <c>idx%3 != 0 → idx-1</c>;
///     右上 <c>idx%3 != 2 → idx+1</c>. Hết 3 điểm ⇒ <c>getMoveIndex</c> sang răng kế.</item>
///   <item>frm203029.cs:826-834 — 4点法 khoá ／ hai điểm 口蓋 NGOÀI CÙNG
///     (<c>t*3</c> và <c>t*3+2</c>). Đây là mốc để đo chế độ từ giao diện.</item>
/// </list>
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// BA ĐIỂM KHÁC BẢN PLAYWRIGHT — VÀ ĐỀU LÀ KHÁC BIỆT THẬT, KHÔNG PHẢI THIẾU SÓT
/// ═══════════════════════════════════════════════════════════════════════════════
/// <list type="number">
///   <item><b>検査順 phải GHI THẬT.</b> Spec web đè <c>GET /tenant/settings/inp</c>; ở
///     WinForm thì <c>pInpOpt[36]</c> đến từ <c>C:\NEW_SIM2000\Ocha.xml</c> — cấu hình
///     của MÁY. Đường duy nhất đổi trong một phiên là 処置入力設定 F9 登録 (nó gọi
///     <c>pGetInpOpt()</c> ngay sau khi ghi). Nằm sau cờ
///     <c>perioKensa.allowSettingChange</c>; cờ tắt thì fixture chỉ chạy nhóm khớp
///     nhánh máy đang chạy.</item>
///   <item><b>4点法/6点法 KHÔNG đổi được giữa phiên.</b> <c>pGetInpOpt</c> chỉ nạp lại XML;
///     <c>pInpOpt[32]</c> lấy từ <c>_inpConfigData</c> (bảng <c>INPCONFIG</c>) vốn chỉ nạp
///     một lần lúc app khởi động. Một lượt chạy vì thế chỉ phủ được MỘT chế độ —
///     <c>Tc5/Tc6/Tc7</c> hoặc <c>Tc7b</c>, cái còn lại tự <c>Ignore</c>. Bên web cả hai
///     chạy trong một lượt vì đó chỉ là một field JSON.</item>
///   <item><b>部位 dựng qua GIAO DIỆN, không seed DB.</b> Spec web phải <c>INSERT trn_trn</c>
///     vì Playwright không lái được 部位選択; ở đây <c>F7 全顎</c> làm đúng việc đó trong
///     bộ nhớ, không dòng nào rơi xuống DB vì fixture không bao giờ bấm F9 登録.</item>
/// </list>
///
/// <para>⚠️ F1 của <c>frm203028</c>/<c>frm203029</c> là 「ﾃﾞﾌｫﾙﾄ設定」 — nó GHI
/// <c>kihon_def</c>/<c>seimitu_def</c>. Fixture này không bao giờ gửi F1 vào hai màn đó
/// (chỉ vào <c>frm203011</c>, nơi F1 là 「基本検査」).</para>
/// </summary>
[TestFixture]
public sealed class PerioKensaOrderTests : PerioKensaTestBase
{
    private const int Left = PerioKensaOrderFlow.UpperLeftFirst;
    private const int Right = PerioKensaOrderFlow.UpperRightFirst;
    private const int FourPoint = PerioKensaOrderFlow.FourPoint;
    private const int SixPoint = PerioKensaOrderFlow.SixPoint;

    /// <summary>左上8 — mốc xuất phát của nhánh 左上から.</summary>
    private const int LastUpper = PerioExamDialog.UpperLeftLastTooth;

    // ═════════════════════════════════════════════════════════════════════════
    // Cổng của chính setting
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(0)]
    [Description("TcREAD — combo 「基本･精密検査」 có đủ hai lựa chọn 左上/右上 (mst_cod cd_type 68)")]
    public void TcREAD_ComboKensaOrderCoDuHaiLuaChon()
    {
        using var trace = TestTrace.Begin();

        // Đối ứng TC-READ của spec web: bên đó khẳng định BE còn trả `clinic.kensaOrder`,
        // vì spec TỰ BƠM key đó vào response — mất field thì mọi TC khác vẫn xanh mà tính
        // năng đã chết. Ở đây rủi ro y hệt nhưng ở tầng khác: fixture tự GHI setting, nên
        // nếu combo mất một lựa chọn thì mọi TC sau chỉ đo lại đúng một nhánh.
        // KHÔNG mở nổi màn 処置入力設定 là giới hạn của BỘ TEST (menu F11), không phải
        // khuyết tật của app ⇒ Ignore. Để nó Fail thì `run.stopOnFirstFailure` giết luôn
        // 8 testcase phía sau — đúng chuyện đã xảy ra lượt chạy 2026-09-04 14:11.
        if (OrderComboItems.Count == 0 && !Txt.Same(OrderReadReason, "ok"))
            IgnoreWithReason(
                "chưa mở/đọc được combo 検査順 nên không khoá được cổng setting. " +
                OrderReadReason);

        Assert.That(OrderComboItems, Is.Not.Empty,
            $"mở được 処置入力設定 (frm203003) nhưng combo {PerioKensaOrderFlow.KensaOrderComboId} " +
            "không có mục nào. Combo nạp từ mst_cod cd_type 68 (frm203003.cs:160) — bảng đó " +
            "rỗng thì 検査順 không đặt được từ giao diện.");

        var left = PerioKensaOrderFlow.ItemFor(OrderComboItems, Left);
        var right = PerioKensaOrderFlow.ItemFor(OrderComboItems, Right);
        trace.Note($"muc combo: {string.Join(" / ", OrderComboItems)}");

        Assert.Multiple(() =>
        {
            Assert.That(left, Is.Not.Null,
                "combo thiếu lựa chọn 「左上」. Mục thật: " + string.Join(" / ", OrderComboItems));
            Assert.That(right, Is.Not.Null,
                "combo thiếu lựa chọn 「右上」. Mục thật: " + string.Join(" / ", OrderComboItems));
        });

        TestContext.Out.WriteLine(
            $"検査順 — 「左上」 = 「{left}」, 「右上」 = 「{right}」, đang đặt 「{OriginalOrderLabel}」.");
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 基本検査 (frm203028)
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(1)]
    [Description("Tc1 (đối chứng) — 右上から: con trỏ vào răng ĐẦU TIÊN quét 0→31, Enter đi TỚI")]
    public void Tc1_HuuThuong_ConTroVaoRangDauTien()
    {
        using var trace = TestTrace.Begin();
        RequireOrder(Right, trace);

        var row = RequireArchRow(trace);
        var kihon = OpenKihon(row, trace);

        var present = PerioNav.PresentFromKihon(kihon);
        trace.Note(PerioNav.Describe(present));
        var t0 = RequireFirstTooth(present, leftFirst: false, trace);

        AssertFocus(PerioExamDialog.Epp(t0),
            $"フォーカス設定 nhánh 右上 quét 0→31 và dừng ở răng CÒN TỒN TẠI đầu tiên " +
            $"(frm203028.cs:505-511) ⇒ răng {t0}. {PerioNav.Describe(present)}",
            trace);

        var (t1, r1) = PerioNav.MoveIndex(present, t0, leftFirst: false);
        Assert.That(r1, Is.False,
            $"bước Enter đầu tiên từ răng {t0} đã đi qua mốc 0 ⇒ dữ liệu này không đo được " +
            "chuyện 「Enter đi tới răng kế」. Chọn bệnh nhân còn nhiều răng hơn.");
        EnterTo(PerioExamDialog.Epp(t1), $"getMoveIndex 右上 dùng .next ⇒ {t0} → {t1}", trace);

        var (t2, r2) = PerioNav.MoveIndex(present, t1, leftFirst: false);
        if (r2)
        {
            trace.Note($"bo qua buoc thu hai: {t1} → {t2} da vong ve moc 0 (sang hang 動揺度)");
            return;
        }
        EnterTo(PerioExamDialog.Epp(t2), $"{t0} → {t1} → {t2}", trace);
    }

    [Test, Order(3)]
    [Description("Tc2 — 左上から: con trỏ vào răng cuối 上顎 quét 15→0, Enter đi NGƯỢC lại")]
    public void Tc2_TaThuong_ConTroVaoRangCuoiThuongHam()
    {
        using var trace = TestTrace.Begin();
        RequireOrder(Left, trace);

        var row = RequireArchRow(trace);
        var kihon = OpenKihon(row, trace);

        var present = PerioNav.PresentFromKihon(kihon);
        trace.Note(PerioNav.Describe(present));
        var t0 = RequireFirstTooth(present, leftFirst: true, trace);

        AssertFocus(PerioExamDialog.Epp(t0),
            $"フォーカス設定 nhánh 左上 quét 上顎 15→0 TRƯỚC (frm203028.cs:490-496) ⇒ răng {t0}. " +
            "Ra một răng nhỏ hơn nghĩa là setting chưa tới được form; ra răng ≥16 trong khi " +
            $"上顎 vẫn còn răng nghĩa là ai đó cài 「duyệt ngược 31→0」 thay vì 「上顎 trước」. " +
            PerioNav.Describe(present),
            trace);

        var (t1, r1) = PerioNav.MoveIndex(present, t0, leftFirst: true);
        Assert.That(r1, Is.False,
            $"bước Enter đầu tiên từ răng {t0} đã đi qua mốc 15 ⇒ dữ liệu này không đo được " +
            "chuyện 「Enter đi ngược」. Chọn bệnh nhân còn nhiều răng hơn.");
        EnterTo(PerioExamDialog.Epp(t1), $"getMoveIndex 左上 dùng .prev ⇒ {t0} → {t1}", trace);

        var (t2, r2) = PerioNav.MoveIndex(present, t1, leftFirst: true);
        if (r2)
        {
            trace.Note($"bo qua buoc thu hai: {t1} → {t2} da vong ve moc 15 (sang hang 動揺度)");
            return;
        }
        EnterTo(PerioExamDialog.Epp(t2), $"{t0} → {t1} → {t2}", trace);
    }

    [Test, Order(4)]
    [Description("Tc4 — 左上から: đi hết vòng thì chuyển sang hàng 動揺度 (idx + 100)")]
    public void Tc4_TaThuong_HetVongThiSangHangDouyou()
    {
        using var trace = TestTrace.Begin();
        RequireOrder(Left, trace);

        var row = RequireArchRow(trace);
        var kihon = OpenKihon(row, trace);

        var present = PerioNav.PresentFromKihon(kihon);
        trace.Note(PerioNav.Describe(present));
        var t = RequireFirstTooth(present, leftFirst: true, trace);
        AssertFocus(PerioExamDialog.Epp(t), "mốc xuất phát của nhánh 左上", trace);

        // Đi ngược hết cung. Bước 0 → 31 là chỗ .prev khép vòng (frm203028.cs:604-608):
        // phải sang 下顎 mà VẪN ở hàng EPP. Bản port nào coi 「chỉ số < 0」 là hết vòng sẽ
        // nhảy hàng ngay tại đây.
        var steps = 0;
        while (true)
        {
            var (next, rowChange) = PerioNav.MoveIndex(present, t, leftFirst: true);
            steps++;
            Assert.That(steps, Is.LessThanOrEqualTo(PerioNav.ToothCount + 1),
                "đi quá 33 bước Enter mà chưa hết vòng — getMoveIndex không bao giờ trả idx+100?");

            if (rowChange)
            {
                EnterTo(PerioExamDialog.Douyo(next),
                    $"về mốc 最初の部位 (răng 15) ⇒ getMoveIndex trả idx+100 ⇒ sang hàng 動揺度, " +
                    $"ô đầu của hàng mới là răng {next} (frm203028.cs:190-196). " +
                    $"Đi hết {steps} bước Enter. {PerioNav.Describe(present)}",
                    trace);
                return;
            }

            EnterTo(PerioExamDialog.Epp(next),
                $"EPP đi ngược, bước {steps}: {t} → {next} (vẫn ở hàng EPP)");
            t = next;
        }
    }

    [Test, Order(8)]
    [Description("Tc8 (đối chứng) — ←/→ KHÔNG đổi theo 検査順")]
    public void Tc8_MuiTenKhongDoiTheoKensaOrder()
    {
        using var trace = TestTrace.Begin();
        RequireOrder(Left, trace);

        var row = RequireArchRow(trace);
        var kihon = OpenKihon(row, trace);

        var present = PerioNav.PresentFromKihon(kihon);
        trace.Note(PerioNav.Describe(present));
        var t0 = RequireFirstTooth(present, leftFirst: true, trace);
        AssertFocus(PerioExamDialog.Epp(t0), "mốc xuất phát của nhánh 左上", trace);

        // getMoveIndexArrow KHÔNG có nhánh pInpOpt[36] nào (frm203028.cs:664-724): nó chỉ
        // rẽ theo phím. Nếu ai đó 「thống nhất cho gọn」 bằng cách đảo luôn mũi tên theo
        // 検査順 thì TC này đỏ.
        //
        // Đích của → không tính bằng getMoveIndex mà bằng luật MÉP CUNG riêng của mũi tên:
        //   0..14 → +1 ;  15 → 31 ;  16 → 0 ;  17..31 → -1     (và ngược lại cho ←)
        var right = ArrowTarget(present, t0, toRight: true);
        var back = ArrowTarget(present, right, toRight: false);

        PerioExamDialog.PressRight();
        AssertFocus(PerioExamDialog.Epp(right),
            $"→ tại răng {t0} phải sang {right} BẤT KỂ 検査順 — luật mép cung của " +
            "getMoveIndexArrow (frm203028.cs:686-689), không phải .next/.prev",
            trace);

        PerioExamDialog.PressLeft();
        AssertFocus(PerioExamDialog.Epp(back),
            $"← tại răng {right} quay về {back} (frm203028.cs:715-718)", trace);
    }

    /// <summary>
    /// <c>getMoveIndexArrow</c> (frm203028.cs:664-724) — bước một nấc theo luật MÉP CUNG,
    /// lặp tới khi gặp răng còn tồn tại. Không có nhánh nào theo <c>pInpOpt[36]</c>.
    /// </summary>
    private static int ArrowTarget(bool[] present, int idx, bool toRight)
    {
        if (!present.Any(p => p)) return idx;
        var guard = 0;
        do
        {
            idx = toRight
                ? idx <= 14 ? idx + 1 : idx == 15 ? 31 : idx == 16 ? 0 : idx - 1
                : idx == 0 ? 16 : idx <= 15 ? idx - 1 : idx <= 30 ? idx + 1 : 15;
        } while (!present[idx] && ++guard <= PerioNav.ToothCount * 2);
        return idx;
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 精密検査 (frm203029) — thêm việc đảo thứ tự 3 điểm TRONG một răng
    // ═════════════════════════════════════════════════════════════════════════

    [Test, Order(2)]
    [Description("Tc5 (đối chứng) — 右上から 6点法: vào răng đầu tiên, điểm 口蓋 ĐẦU (t*3)")]
    public void Tc5_HuuThuong_SauDiem_DiemKouDau()
    {
        using var trace = TestTrace.Begin();
        RequireOrder(Right, trace);

        var row = RequireArchRow(trace);
        var seimitu = OpenSeimitu(row, trace);
        RequireSeimituMode(seimitu, SixPoint, trace);

        var present = PerioNav.PresentFromSeimitu(seimitu);
        trace.Note(PerioNav.Describe(present));
        var t0 = RequireFirstTooth(present, leftFirst: false, trace);

        AssertFocus(PerioExamDialog.Kou(PerioNav.KouEntryPoint(t0, leftFirst: false, fourPoint: false)),
            $"frm203029.cs:137-152 — 右上 6点法 vào điểm ĐẦU (t*3) của răng {t0}. " +
            PerioNav.Describe(present),
            trace);
    }

    [Test, Order(5)]
    [Description("Tc6 — 左上から 6点法: vào răng cuối 上顎, điểm 口蓋 CUỐI (t*3+2)")]
    public void Tc6_TaThuong_SauDiem_DiemKouCuoi()
    {
        using var trace = TestTrace.Begin();
        RequireOrder(Left, trace);

        var row = RequireArchRow(trace);
        var seimitu = OpenSeimitu(row, trace);
        RequireSeimituMode(seimitu, SixPoint, trace);

        var present = PerioNav.PresentFromSeimitu(seimitu);
        trace.Note(PerioNav.Describe(present));
        var t0 = RequireFirstTooth(present, leftFirst: true, trace);

        AssertFocus(PerioExamDialog.Kou(PerioNav.KouEntryPoint(t0, leftFirst: true, fourPoint: false)),
            $"frm203029.cs:104-134 — 左上 quét 上顎 15→0 rồi vào điểm 口蓋 t*3+2 (:132), " +
            $"KHÔNG phải t*3 ⇒ răng {t0} điểm {t0 * 3 + 2}. Đây là chỗ dễ port thiếu nhất: " +
            "getMoveIndex có thể đã đúng mà điểm VÀO răng vẫn sai. " + PerioNav.Describe(present),
            trace);
    }

    [Test, Order(6)]
    [Description("Tc7 — 左上から 6点法: 3 điểm chạy ngược 2→1→0 rồi sang 頬側 idx+2")]
    public void Tc7_TaThuong_SauDiem_ChuoiEnter()
    {
        using var trace = TestTrace.Begin();
        RequireOrder(Left, trace);

        var row = RequireArchRow(trace);
        var seimitu = OpenSeimitu(row, trace);
        RequireSeimituMode(seimitu, SixPoint, trace);

        var present = PerioNav.PresentFromSeimitu(seimitu);
        trace.Note(PerioNav.Describe(present));
        var t0 = RequireFirstTooth(present, leftFirst: true, trace);
        var b = t0 * 3;

        AssertFocus(PerioExamDialog.Kou(b + 2), $"mốc xuất phát: điểm 口蓋 cuối của răng {t0}", trace);

        EnterTo(PerioExamDialog.Kou(b + 1), "6点法 左上: 口蓋 2 → 1 (frm203029.cs:684-687)", trace);
        EnterTo(PerioExamDialog.Kou(b + 0), "口蓋 1 → 0 (idx%3==1, 6点法 ⇒ idx-1)", trace);
        EnterTo(PerioExamDialog.Hoho(b + 2), "口蓋 0 → 頬側 idx+2 (frm203029.cs:690)", trace);

        // 頬側 cũng chạy ngược: idx%3 != 0 → idx-1 (frm203029.cs:478-481).
        EnterTo(PerioExamDialog.Hoho(b + 1), "頬側 2 → 1", trace);
        EnterTo(PerioExamDialog.Hoho(b + 0), "頬側 1 → 0", trace);

        // Hết 3 điểm 頬側 ⇒ getMoveIndex sang răng kế, vào điểm 口蓋 của nó.
        var (t1, rowChange) = PerioNav.MoveIndex(present, t0, leftFirst: true);
        if (rowChange)
        {
            // Hết vòng ngay ⇒ sang hàng 動揺度 chứ không sang răng kế (frm203029.cs:493-497).
            EnterTo(PerioExamDialog.Douyo(t1),
                $"頬側 điểm cuối ⇒ getMoveIndex trả idx+100 ⇒ sang hàng 動揺度 răng {t1}", trace);
            return;
        }

        EnterTo(PerioExamDialog.Kou(PerioNav.KouEntryPoint(t1, leftFirst: true, fourPoint: false)),
            $"頬側 điểm cuối ⇒ getMoveIndex 左上 → răng {t1}, vào điểm 口蓋 t*3+2 " +
            "(frm203029.cs:486-500)",
            trace);
    }

    [Test, Order(7)]
    [Description("Tc7b — 左上から 4点法: chỉ có điểm giữa, giao sang 頬側 điểm CUỐI")]
    public void Tc7b_TaThuong_BonDiem_ChuoiEnter()
    {
        using var trace = TestTrace.Begin();
        RequireOrder(Left, trace);

        var row = RequireArchRow(trace);
        var seimitu = OpenSeimitu(row, trace);
        // Vế đối xứng của Tc7. 4点法 khoá hai điểm 口蓋 ngoài cùng, nên 口蓋 giao NGAY sang
        // 頬側 — và giao ở điểm CUỐI (idx+1 khi bước là -1), frm203029.cs:674-681.
        // Thiếu TC này thì một bản port bỏ quên nhánh 4点法 vẫn xanh hết.
        RequireSeimituMode(seimitu, FourPoint, trace);

        var present = PerioNav.PresentFromSeimitu(seimitu);
        trace.Note(PerioNav.Describe(present));
        var t0 = RequireFirstTooth(present, leftFirst: true, trace);
        var b = t0 * 3;

        AssertFocus(PerioExamDialog.Kou(b + 1),
            "4点法 vào điểm GIỮA bất kể 検査順 (frm203029.cs:125-128 và :143-147) — đó là " +
            "điểm 口蓋 duy nhất còn mở",
            trace);

        EnterTo(PerioExamDialog.Hoho(b + 2), "4点法 左上: 口蓋 điểm giữa → 頬側 điểm cuối", trace);
        EnterTo(PerioExamDialog.Hoho(b + 1), "頬側 2 → 1", trace);
        EnterTo(PerioExamDialog.Hoho(b + 0), "頬側 1 → 0", trace);

        var (t1, rowChange) = PerioNav.MoveIndex(present, t0, leftFirst: true);
        if (rowChange)
        {
            EnterTo(PerioExamDialog.Douyo(t1),
                $"頬側 điểm cuối ⇒ getMoveIndex trả idx+100 ⇒ sang hàng 動揺度 răng {t1}", trace);
            return;
        }

        EnterTo(PerioExamDialog.Kou(PerioNav.KouEntryPoint(t1, leftFirst: true, fourPoint: true)),
            $"→ răng {t1}, lại là điểm giữa", trace);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // Trợ giúp
    // ═════════════════════════════════════════════════════════════════════════

    /// <summary>
    /// Răng mà フォーカス設定 phải chọn, tính từ tập răng CÓ THẬT. Không răng nào tồn tại
    /// (無歯顎) thì <c>Ignore</c> — đó là chuyện dữ liệu, không phải WinForm sai.
    /// </summary>
    private int RequireFirstTooth(bool[] present, bool leftFirst, TestTrace trace)
    {
        var t = PerioNav.FirstTooth(present, leftFirst);
        if (t < 0)
            IgnoreWithReason(
                "không răng nào còn tồn tại sau khi dựng 部位 (無歯顎) — フォーカス設定 không " +
                "focus ô nào và getMoveIndex đứng yên, nên không đo được gì. " +
                PerioNav.Describe(present));
        trace.Note($"rang xuat phat theo luat {(leftFirst ? "左上" : "右上")}: {t}");
        return t;
    }
}
