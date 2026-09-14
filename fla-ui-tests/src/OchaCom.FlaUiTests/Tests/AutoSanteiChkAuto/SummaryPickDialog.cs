using FlaUI.Core.AutomationElements;
using FlaUI.Core.Definitions;
using OchaCom.FlaUiTests.App;
using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Tests.SigaToothStatus;

namespace OchaCom.FlaUiTests.Tests.AutoSanteiChkAuto;

/// <summary>
/// 摘要選択 — hộp thoại MODAL chặn giữa chừng <c>ModMain.Chk_CmtAuto</c>.
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// VÌ SAO CÓ FILE NÀY — cái bẫy đã trả giá một lượt chạy
/// ═══════════════════════════════════════════════════════════════════════════════
/// <b>Đo được 2026-09-14, lượt chạy đầu của <see cref="ChkAutoCascadeTests"/>.</b>
/// Chốt <c>204/0 暫間固定</c> xong, app bung 「摘要選択（暫間固定-方法）」 — một
/// <c>frm203012</c> ba dòng (レジン連続冠固定法 / 線結紮法 / ワイヤーレジン充填固定法), 備考
/// 「暫間固定方法を選択してください」, hai nút <c>F9 確定</c> / <c>F10 戻る</c>.
///
/// <para>Nó là MODAL, nên nó <b>đứng giữa</b> hai nửa của <c>Chk_CmtAuto</c> và
/// <c>Chk_ChkAuto</c> — thứ được gọi SAU nó trong cùng một cú Enter ô 回
/// (frm203002.cs:5739 → :5752) — <b>không bao giờ chạy</b> chừng nào chưa ai trả lời.</para>
///
/// <para>Lượt chạy đó cho: lưới thêm đúng <b>1</b> dòng, 月計 <b>413 → 413 (Δ = 0)</b>.
/// Nhìn y hệt 「app không có 自動算定」 — <b>đổ oan cho app</b>, trong khi app chỉ đang đợi
/// người trả lời. Đây đúng là kiểu đỏ mà F1/F2 nói: ảnh chụp <c>03x_con-hop-thoai.png</c>
/// đã có sẵn và trả lời trong một cái nhìn.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// VÀ NÓ LÀ BẰNG CHỨNG, KHÔNG CHỈ LÀ CHƯỚNG NGẠI
/// ═══════════════════════════════════════════════════════════════════════════════
/// Hộp thoại này CHÍNH LÀ nửa <c>prgCmtAuto</c> — 摘要コメント lấy từ <c>mst_cmt_pack</c>,
/// chạy ở modMain.cs:766, TRƯỚC nửa <c>CMTAUTO</c> → <c>frm203012</c> (modMain.cs:779-806).
/// Bản đánh giá parity §1 nói web CHỈ port nửa này. Nhìn thấy nó bung ra là bằng chứng
/// trực tiếp rằng WinForm chạy nửa ấy trước, đúng như mô tả.
///
/// <para><b>Bấm NÚT chứ không gửi phím F9</b> (F15: phím F rơi vào NHẦM FORM khi có hộp
/// thoại chồng lên màn chính). Giữ nguyên dòng đang sáng — đó là lựa chọn mặc định của
/// app, nên lượt chạy nào cũng ra cùng một kết quả.</para>
/// </summary>
public sealed class SummaryPickDialog
{
    /// <summary>Tiêu đề cửa sổ — <c>frm203012</c> ở nhánh 摘要 (prgCmtAuto).</summary>
    public const string Title = "摘要選択";

    /// <summary>Nhãn nút xác nhận của form お茶コン: 「F9  確定」.</summary>
    private const string ConfirmButton = "確定";

    /// <summary>Trần số hộp thoại trả lời trong MỘT cú chốt — chặn vòng lặp vô hạn.</summary>
    private const int MaxPicks = 5;

    private readonly OchaApp _app;
    private readonly Window _owner;
    private readonly SigaToothFlow _flow;

    public SummaryPickDialog(OchaApp app, Window owner, SigaToothFlow flow)
    {
        _app = app;
        _owner = owner;
        _flow = flow;
    }

    /// <summary>Hộp thoại đang mở; null nếu không.</summary>
    public Window? Open() =>
        ModalDialogs.All(_app, _owner).FirstOrDefault(w => Txt.Has(Uia.NameOf(w), Title));

    /// <summary>
    /// Trả lời mọi hộp thoại 摘要選択 đang chờ. Trả về số lần đã trả lời — 0 nghĩa là cú
    /// chốt này không bung hộp thoại nào và mốc đo trước đó vẫn còn giá trị.
    /// </summary>
    /// <remarks>
    /// Deadline NGẮN có chủ ý (F2): hộp thoại hoặc đã ở đó rồi, hoặc bung ra trong vài
    /// trăm ms sau cú chốt. Chờ lâu hơn không đổi câu trả lời, chỉ đổi 6 giây thành 60.
    /// </remarks>
    public int Answer(TestTrace trace)
    {
        var answered = 0;
        while (answered < MaxPicks)
        {
            var form = Waits.TryFor(Open, TimeSpan.FromSeconds(answered == 0 ? 6 : 4));
            if (form is null) break;

            var button = form.FindAllDescendants(cf => cf.ByControlType(ControlType.Button))
                             .FirstOrDefault(b => Txt.Has(Uia.NameOf(b), ConfirmButton));
            if (button is null)
            {
                trace.Note($"摘要選択 dang mo nhung KHONG thay nut 「{ConfirmButton}」 — " +
                           "doc anh chup, co the app doi nhan nut. " + _flow.DescribeDialogs());
                break;
            }

            trace.Step($"tra loi 摘要選択 lan {answered + 1}: bam 「{Uia.NameOf(button)}」 " +
                       "(giu nguyen dong dang sang = lua chon mac dinh cua app)");
            Uia.Click(button);
            answered++;

            if (!Waits.TryUntil(() => Open() is null, TimeSpan.FromSeconds(8)))
                trace.Note("bam 確定 roi ma 摘要選択 van chua dong — xem anh chup buoc nay.");
        }

        if (answered > 0)
        {
            // Cái đuôi (Chk_ChkAuto_soutyaku + Chk_ChkAuto) chỉ chạy SAU khi hộp thoại
            // đóng, nên phải đợi lắng trước khi đo lại lưới.
            Waits.TryUntil(() => _flow.Picker() is null && _flow.OpenDialogs().Count == 0,
                           TimeSpan.FromSeconds(10));
            trace.Shot("sau-khi-tra-loi-摘要選択");
        }
        return answered;
    }
}
