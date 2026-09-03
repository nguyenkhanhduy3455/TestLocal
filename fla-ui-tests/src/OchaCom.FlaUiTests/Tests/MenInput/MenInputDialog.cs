using System.Drawing;
using FlaUI.Core.AutomationElements;
using OchaCom.FlaUiTests.App;
using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Screens;

namespace OchaCom.FlaUiTests.Tests.MenInput;

/// <summary>
/// Hộp thoại <c>frm203035</c>「面入力」 — nửa WinForm của
/// <c>../web-tenant-tests/tests/men-input-dialog.spec.ts</c>.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// NÓ MỞ LÚC NÀO
/// ═══════════════════════════════════════════════════════════════════════════
/// KHÔNG phải trước khi chọn 処置 như 自費金額 / 残根数 / IS, mà NGAY SAU khi dòng đã
/// đáp xuống lưới. Điều kiện ở <c>frm203016.cs:1565-1585</c>:
/// <code>
///     vieTrtSel[i]["men"] == "1"   VÀ   ModCommon.pInpOpt[6] == 1
///                                        (= INPCONFIG.MENINPUT_FLG, modCommon.cs:473)
/// </code>
/// và <c>frm203035_Activated</c> (:133-140) đóng NGAY nếu dòng không có 部位 nào
/// (<c>_buiCnt == 0</c>).
///
/// ═══════════════════════════════════════════════════════════════════════════
/// CONTROL (frm203035.Designer.cs)
/// ═══════════════════════════════════════════════════════════════════════════
/// <code>
///   lblBui        :194  glyph răng đang hỏi — gaiji vùng PUA của cnv_tooth_text
///   lblTrt        :183  tên 処置 (= cột 2 của dòng lưới)
///   lblMenTop     :171  ┐
///   lblMenLeft    :160  │ nhãn 5 MẶT, chữ do chkBui đặt theo vị trí răng
///   lblMenCenter  :149  │ (frm203035.cs:288-368)
///   lblMenRight   :127  │
///   lblMenBottom  :138  ┘
///   lblNumTop/Left/Center/Right/Bottom  :73-119  gợi ý phím (8)(4)(5)(6)(2)
///   tthSn         :206  mô hình răng, TabIndex 0 ⇒ giữ con trỏ lúc mở
/// </code>
///
/// ⚠️ <b>「Đang chọn」 chỉ đọc được bằng MÀU NỀN.</b> <c>chgBkColor</c> (:596-627) đặt
/// <c>BackColor</c> của cặp <c>lblMen*</c> + <c>lblNum*</c> thành LightGray khi chọn,
/// White khi không. UIA không phơi <c>BackColor</c> ra, nên phải đo pixel — xem
/// <see cref="PixelProbe"/>.
///
/// ⚠️ <b>ESC ở đây là 確定, không phải huỷ.</b> <c>BaseDialog2.formBase_KeyDown</c>
/// (BaseDialog2.cs:196-201) map cả <c>End</c> lẫn <c>Escape</c> sang <c>btnF9_Click</c>.
/// Muốn bỏ ngang phải bấm <b>F10 戻り</b>.
/// </summary>
public static class MenInputDialog
{
    public const string DialogId = "frm203035";
    public const string TitleFragment = "面入力";

    /// <summary>Năm mặt, đúng thứ tự mà <c>chgBkColor</c> quét (frm203035.cs:582-589).</summary>
    public enum Face
    {
        Top,
        Left,
        Center,
        Right,
        Bottom,
    }

    /// <summary>
    /// Phím bật/tắt từng mặt — <c>formBase_KeyDown</c> (frm203035.cs:196-229).
    /// Cả hàng số trên lẫn NumPad đều nhận; ở đây gửi hàng số trên.
    /// </summary>
    public static ushort KeyOf(Face face) => face switch
    {
        Face.Top => Vk.Digit(8),
        Face.Left => Vk.Digit(4),
        Face.Center => Vk.Digit(5),
        Face.Right => Vk.Digit(6),
        Face.Bottom => Vk.Digit(2),
        _ => throw new ArgumentOutOfRangeException(nameof(face)),
    };

    /// <summary>Nhãn gợi ý phím in trên màn hình — dùng cho khẳng định nội dung.</summary>
    public static string HintOf(Face face) => face switch
    {
        Face.Top => "(8)",
        Face.Left => "(4)",
        Face.Center => "(5)",
        Face.Right => "(6)",
        Face.Bottom => "(2)",
        _ => throw new ArgumentOutOfRangeException(nameof(face)),
    };

    public static string MenLabelId(Face face) => "lblMen" + face;

    public static string NumLabelId(Face face) => "lblNum" + face;

    public static readonly Face[] AllFaces =
        [Face.Top, Face.Left, Face.Center, Face.Right, Face.Bottom];

    // ── Tìm cửa sổ ───────────────────────────────────────────────────────────

    /// <summary>
    /// Cửa sổ 面入力 nếu đang mở.
    ///
    /// <para>Quét <c>ModalWindows</c> của 診療入力 TRƯỚC: frm203035 được mở bằng
    /// <c>showDialog</c> từ trong frm203016, và <c>GetAllTopLevelWindows</c> không phải
    /// lúc nào cũng trả về cửa sổ dạng đó (bẫy đã ghi ở <c>BrSampleFlow.FindToothDialog</c>).</para>
    /// </summary>
    public static Window? Find(OchaApp app, TreatmentEntryScreen screen)
    {
        try
        {
            foreach (var w in screen.Window.ModalWindows)
                if (Is(w)) return w;
        }
        catch { /* cửa sổ chủ đang bận vì có modal chặn */ }

        var byId = app.Window(DialogId);
        if (byId is not null) return byId;

        try
        {
            foreach (var w in app.Windows())
                if (Is(w)) return w;
        }
        catch { /* */ }

        return null;
    }

    public static Window? WaitFor(OchaApp app, TreatmentEntryScreen screen, int seconds = 20)
    {
        Window? hit = null;
        Waits.TryUntil(() => (hit = Find(app, screen)) is not null, TimeSpan.FromSeconds(seconds));
        return hit;
    }

    /// <summary>
    /// KHẲNG ĐỊNH 面入力 KHÔNG mở — phải chờ trọn <paramref name="seconds"/> rồi mới kết luận.
    ///
    /// <para>Hỏi ngay lập tức thì bao giờ cũng 「chưa thấy」: đây là loại khẳng định dễ
    /// xanh sai nhất của cả luồng (cùng lý do với <c>HighNeedsFlow.StaysSilent</c>).</para>
    /// </summary>
    public static bool StaysClosed(OchaApp app, TreatmentEntryScreen screen, int seconds = 6)
    {
        var deadline = DateTime.UtcNow.AddSeconds(seconds);
        while (DateTime.UtcNow < deadline)
        {
            if (Find(app, screen) is not null) return false;
            Thread.Sleep(250);
        }
        return true;
    }

    private static bool Is(Window w)
    {
        try
        {
            return Txt.Same(Uia.AutomationIdOf(w), DialogId)
                   || Txt.Has(Uia.NameOf(w), TitleFragment);
        }
        catch { return false; }
    }

    // ── Đọc ──────────────────────────────────────────────────────────────────

    /// <summary>
    /// Glyph răng đang hỏi (<c>lblBui</c>).
    ///
    /// <para>Đây là ký tự GAIJI vùng PUA lấy từ <c>CNV_TOOTH_TEXT</c> (<c>lblBuiShow</c>,
    /// frm203035.cs:374-422) — đo được trên DB của máy test: 右上6 là <c>U+E08C</c>.
    /// KHÔNG so mặt chữ, chỉ kiểm KHÁC RỖNG và kiểm nó ĐỔI khi sang răng kế.</para>
    /// </summary>
    public static string Bui(Window dialog) => Read(dialog, "lblBui");

    /// <summary>Tên 処置 đang chạy (<c>lblTrt</c> = cột 2 của dòng lưới, :421).</summary>
    public static string Trt(Window dialog) => Read(dialog, "lblTrt");

    /// <summary>Chữ trên nhãn một mặt — <c>chkBui</c> đặt theo vị trí răng (:301-364).</summary>
    public static string MenLabel(Window dialog, Face face) => Read(dialog, MenLabelId(face));

    /// <summary>Gợi ý phím của một mặt (<c>lblNum*</c>, Designer :73-119).</summary>
    public static string NumLabel(Window dialog, Face face) => Read(dialog, NumLabelId(face));

    /// <summary>
    /// Thứ tự PHÁT chữ của <c>makeMenStr</c> (frm203035.cs:491-516) — <b>không</b> phải thứ
    /// tự bấm phím: M → O → I → D → B → P → L. Chọn 中央 rồi 左 ở răng 右上5 (nhãn 中央=O,
    /// 左=D) vẫn ra 「OD」 chứ không phải 「DO」.
    /// </summary>
    public static readonly string[] EmitOrder = ["M", "O", "I", "D", "B", "P", "L"];

    /// <summary>
    /// Chuỗi 面 mà <c>makeMenStr</c> sẽ phát ra nếu <paramref name="selected"/> đang được
    /// chọn — tính từ NHÃN ĐANG HIỆN, không hard-code.
    ///
    /// <para>Nhãn phụ thuộc vị trí răng (<c>chkBui</c> có 8 nhánh), mà răng lại phụ thuộc
    /// dữ liệu của máy. Hard-code 「OD」 thì đổi bệnh nhân là testcase đỏ oan; tính từ nhãn
    /// thì chỉ đỏ khi WinForm thật sự phát sai thứ tự.</para>
    ///
    /// <para><c>Txt.N</c> đã NFKC nên nhãn 「Ｏ」 đủ chiều rộng của Designer và chữ 「O」 nửa
    /// chiều rộng mà <c>getMenStr</c> phát ra (<c>STR_O[IDX_HALF_SIZE]</c>) so được với nhau.</para>
    /// </summary>
    public static string ExpectedSurfaces(Window dialog, params Face[] selected)
    {
        var chosen = selected.Select(f => Txt.N(MenLabel(dialog, f)))
                             .Where(s => s.Length > 0)
                             .ToHashSet(StringComparer.Ordinal);
        return string.Concat(EmitOrder.Where(chosen.Contains));
    }

    /// <summary>
    /// Regex khớp một token <c>&lt;歯 + 面&gt;</c>.
    ///
    /// <para>Glyph răng là ký tự GAIJI vùng PUA (<c>U+E092</c> = 右上5, đo 2026-09-03) và có
    /// thể là cặp surrogate ⇒ khớp 1-2 ký tự bất kỳ, KHÔNG so mặt chữ. Cùng cách mà spec
    /// Playwright dùng.</para>
    /// </summary>
    public static System.Text.RegularExpressions.Regex TokenRegex(string surfaces) =>
        new($"<[\\s\\S]{{1,2}}{System.Text.RegularExpressions.Regex.Escape(surfaces)}>");

    /// <summary>Bộ 5 chữ mặt theo thứ tự 上/左/中央/右/下 — dạng để in vào nhật ký.</summary>
    public static string DescribeFaces(Window dialog) =>
        string.Join(" ", AllFaces.Select(f => $"{f}=「{MenLabel(dialog, f)}」{NumLabel(dialog, f)}"));

    private static string Read(Window dialog, string automationId)
    {
        var e = Uia.ById(dialog, automationId);
        return e is null ? "" : Txt.N(Uia.ValueOf(e));
    }

    // ── Màu nền = trạng thái chọn ────────────────────────────────────────────

    /// <summary>
    /// Màu nền đang vẽ của một mặt. Đo trên <c>lblNum*</c> chứ KHÔNG phải <c>lblMen*</c>:
    /// hai nhãn luôn đổi màu CÙNG NHAU (<c>chgBkColor</c> đặt cả cặp, :604-626), nhưng
    /// <c>lblNum*</c> rộng 22px cho ba ký tự 「(5)」 nên tỉ lệ nền/chữ cao hơn — mẫu pixel
    /// sạch hơn. Xem <see cref="PixelProbe.DominantColor(AutomationElement)"/>.
    /// </summary>
    public static Color? FaceColor(Window dialog, Face face)
    {
        var e = Uia.ById(dialog, NumLabelId(face));
        return e is null ? null : PixelProbe.DominantColor(e);
    }

    /// <summary>Mặt đó đang được chọn không (nền LightGray). Không đọc được pixel → false.</summary>
    public static bool IsSelected(Window dialog, Face face) =>
        PixelProbe.IsNear(FaceColor(dialog, face), PixelProbe.Selected);

    /// <summary>Số mặt đang được chọn — tương đương <c>selectedFaceCount()</c> của spec web.</summary>
    public static int SelectedCount(Window dialog) =>
        AllFaces.Count(f => IsSelected(dialog, f));

    /// <summary>Màu 5 mặt dưới dạng chuỗi — luôn in ra khi một khẳng định về màu đổ.</summary>
    public static string DescribeColors(Window dialog) =>
        string.Join(" ", AllFaces.Select(f => $"{f}={PixelProbe.Describe(FaceColor(dialog, f))}"));

    // ── Thao tác ─────────────────────────────────────────────────────────────

    /// <summary>Đưa hộp thoại lên foreground — bắt buộc trước MỖI lần gửi phím.</summary>
    public static void Focus(Window dialog) => InpP1Dialogs.InpP1MenuFlow.Focus(dialog);

    /// <summary>Bật/tắt một mặt bằng phím số (8/4/5/6/2).</summary>
    public static bool ToggleFace(Window dialog, Face face, TestTrace? trace = null)
    {
        Focus(dialog);
        trace?.Step($"phim {HintOf(face)} = mat {face}");
        var sent = Uia.SendKey(KeyOf(face));
        Thread.Sleep(200);
        return sent;
    }

    /// <summary>F9 確定 → <c>fixProc</c> (frm203035.cs:427-485).</summary>
    public static bool Confirm(Window dialog, TestTrace? trace = null)
    {
        Focus(dialog);
        trace?.Step("F9 確定");
        var sent = Uia.SendKey(Vk.F9);
        Thread.Sleep(400);
        return sent;
    }

    /// <summary>
    /// Escape — ở màn này CŨNG là 確定 (BaseDialog2.cs:196-201), không phải huỷ.
    /// Dùng để CHỨNG MINH điều đó, không dùng để dọn dẹp.
    /// </summary>
    public static bool ConfirmByEscape(Window dialog, TestTrace? trace = null)
    {
        Focus(dialog);
        trace?.Step("Escape (BaseDialog2 map sang btnF9_Click = 確定)");
        var sent = Uia.SendKey(Vk.Escape);
        Thread.Sleep(400);
        return sent;
    }

    /// <summary>
    /// F10 戻り → <c>btnF10_Click</c> (frm203035.cs:158-164): trả LẠI cột 72 giá trị cũ
    /// nhưng KHÔNG trả cột 2. Đây là cách DUY NHẤT đóng hộp thoại mà không 確定.
    /// </summary>
    public static bool Back(Window dialog, TestTrace? trace = null)
    {
        Focus(dialog);
        trace?.Step("F10 戻り");
        var sent = Uia.SendKey(Vk.F10);
        Thread.Sleep(400);
        return sent;
    }

    /// <summary>Bấm F10 tới khi hộp thoại đóng hẳn — dùng dọn dẹp giữa các testcase.</summary>
    public static bool CloseIfOpen(OchaApp app, TreatmentEntryScreen screen, TestTrace? trace = null)
    {
        for (var i = 0; i < 8; i++)
        {
            var dialog = Find(app, screen);
            if (dialog is null) return true;
            Back(dialog, trace);
            Waits.TryUntil(() => Find(app, screen) is null, TimeSpan.FromSeconds(3));
        }
        return Find(app, screen) is null;
    }
}
