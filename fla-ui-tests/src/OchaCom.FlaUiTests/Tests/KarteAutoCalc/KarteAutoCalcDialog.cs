using FlaUI.Core.AutomationElements;
using OchaCom.FlaUiTests.App;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.KarteAutoCalc;

/// <summary>
/// <c>frm203042</c>「カルテ自動算定一覧」 và <c>frm203043</c>「カルテ自動算定登録」 —
/// cặp màn master của <c>cmtauto</c>.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// VÌ SAO CÓ LUỒNG NÀY
/// ═══════════════════════════════════════════════════════════════════════════
/// Bản web vừa port cặp này (<c>GET/PUT /tenant/cmt-autos/masters|defs</c>). Có SÁU
/// điểm mà <b>đọc source không kết luận chắc được</b>, phải xem WinForm thật chạy ra
/// gì. Mỗi testcase dưới đây tương ứng một điểm; xem doc-comment của từng
/// <c>Tc*</c> trong <see cref="KarteAutoCalcTests"/>.
///
/// Luồng này <b>không</b> khẳng định bản web đúng hay sai — nó chỉ ghi lại hành vi
/// thật của WinForm để đối chiếu. Vì thế phần lớn testcase là <b>ghi log</b> chứ
/// không assert cứng: cái ta chưa biết thì không thể assert.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// ĐƯỜNG ĐI
/// ═══════════════════════════════════════════════════════════════════════════
/// <c>frm203002</c> F11 → 「９ オプション」 → 「６ コメント自動入力登録」
/// (<c>IDM_CmtAuto</c>) mở <c>frm203042</c>. Từ đó F9 選択 mở <c>frm203043</c>.
///
/// Menu do <see cref="KarteAutoCalcMenu"/> lo — bản riêng của luồng này, KHÔNG
/// dời cửa sổ về (0,0) và trả lý do thay vì ném. Xem doc-comment của lớp đó.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// TÊN CONTROL
/// ═══════════════════════════════════════════════════════════════════════════
/// Chưa xác minh trên máy thật. <see cref="KarteAutoCalcTests.Tc0_DumpUiaTree"/>
/// đổ cây UIA của cả hai form ra artifact — <b>chạy nó TRƯỚC</b>, rồi sửa các hằng
/// dưới đây nếu lệch. Suy đoán hiện tại lấy từ Designer của các form anh em:
/// lưới của <c>frm901003</c> là <c>dgvView</c>, ô tìm kiếm là <c>txtTrtCd</c> /
/// <c>txtTrtNm</c>, nhãn đếm là <c>lblCount</c>.
/// </summary>
public static class KarteAutoCalcDialog
{
    // ── frm203042 一覧 ───────────────────────────────────────────────────────

    public const string ListId = "frm203042";
    public const string ListTitleFragment = "カルテ自動算定一覧";

    /// <summary>Lưới của <c>frm901003</c> (lớp cha của frm203042).</summary>
    public const string ListGridId = "dgvView";

    /// <summary>Ô 処置コード của thanh 検索.</summary>
    public const string ListTrtCdBoxId = "txtTrtCd";

    /// <summary>Ô 処置名 của thanh 検索.</summary>
    public const string ListTrtNmBoxId = "txtTrtNm";

    /// <summary>Nhãn 該当件数.</summary>
    public const string ListCountLabelId = "lblCount";

    /// <summary>Nút 検索.</summary>
    public const string ListSearchButtonId = "btnSearch";

    /// <summary>Cột của lưới 一覧 (frm203042.cs:46-53).</summary>
    public static readonly string[] ListColumns =
        ["dsp_trt_cd", "trt_nm", "dsp_cmt_cd", "cmt_nm", "disp_no", "valid"];

    // ── frm203043 登録 ───────────────────────────────────────────────────────

    public const string RegisterId = "frm203043";
    public const string RegisterTitleFragment = "カルテ自動算定登録";

    /// <summary>Lưới sửa của <c>frm203043</c>.</summary>
    public const string RegisterGridId = "dgvView";

    /// <summary>Checkbox 確認画面不要 (frm203043.cs:402 <c>chkNoChk</c>).</summary>
    public const string NoChkCheckBoxId = "chkNoChk";

    /// <summary>Cột của lưới 登録 (frm203043.cs:61-65). <c>no_chk</c> bị ẩn (:417).</summary>
    public static readonly string[] RegisterColumns =
        ["cmt_cd", "cmt_sb", "cmt_nm", "disp_no", "valid"];

    // ── Hằng nghiệp vụ ──────────────────────────────────────────────────────

    /// <summary>Dải カルテコメントマスタ — <c>DbLibrary.codeRange[karte]</c> (DbLibrary.cs:31).</summary>
    public const int KarteCodeMin = 7000;
    public const int KarteCodeMax = 8999;

    /// <summary>Biên 表示順 — frm203043.cs:511.</summary>
    public const int DispNoMin = -256;
    public const int DispNoMax = 255;

    /// <summary>cd_type của combo 使用 (可 / 否).</summary>
    public const int ValidCdType = 60;

    /// <summary>Số byte tối đa WinForm cắt bằng <c>ComLibrary.LeftB</c> (frm203043.cs:585/588).</summary>
    public const int TrtNmMaxBytes = 50;
    public const int CmtNmMaxBytes = 60;

    // ── Mở / đóng ───────────────────────────────────────────────────────────

    /// <summary>AutomationId của mục submenu mở <c>frm203042</c> (frm203002.Designer.cs).</summary>
    public const string MenuItemId = "IDM_CmtAuto";

    /// <summary>Chữ trên mục menu — đường dự phòng khi UIA không có AutomationId.</summary>
    public const string MenuItemText = "コメント自動入力登録";

    /// <summary>
    /// F11 → オプション → コメント自動入力登録.
    ///
    /// <para>Dialog đang mở sẵn thì trả về luôn — các testcase nối tiếp nhau trong
    /// một fixture, testcase trước có thể đã để nó mở.</para>
    /// </summary>
    public static Window OpenList(OchaApp app, Window screen, TestTrace? trace = null)
    {
        var already = app.Window(ListId);
        if (already is not null)
        {
            trace?.Note($"dialog {ListId} da mo san — dung lai");
            return already;
        }

        var opened = KarteAutoCalcMenu.OpenSentakuMenu(app, screen, trace);
        if (opened.Popup is null)
            throw new InvalidOperationException(
                $"Khong mo duoc menu 選択: {opened.Reason}. Chay Tc0 (-Diagnostics) de co " +
                "danh sach cua so + MenuItem dang hien.");

        if (!KarteAutoCalcMenu.ClickOptionSubItem(
                app, opened.Popup, MenuItemId, MenuItemText, out var why, trace))
            throw new InvalidOperationException(
                $"Khong click duoc muc menu: {why}. Chay Tc0 (-Diagnostics) de xem ten thuc te.");

        var dialog = Waits.For(() => app.Window(ListId),
                               $"dialog {ListId} hien len sau khi click 「{MenuItemText}」",
                               TestSettings.Current.Run.DefaultTimeout);

        // initProc() nạp lưới xong chưa.
        Waits.For(() => Uia.ById(dialog, ListGridId),
                  $"luoi {ListGridId} cua {ListId} dung xong",
                  TestSettings.Current.Run.DefaultTimeout);
        return dialog;
    }

    /// <summary>
    /// F9 選択 trên 一覧 → <c>frm203043</c>.
    ///
    /// <para>Bấm bằng nút F9 thật của thanh phím chứ không gửi VK_F9: form dùng
    /// <c>btnF9_Click</c> (frm203042.cs:117-124) và nút luôn có mặt, còn phím chỉ tới
    /// được khi tiêu điểm nằm đúng chỗ.</para>
    /// </summary>
    public static Window OpenRegister(OchaApp app, Window list, TestTrace? trace = null)
    {
        var already = app.Window(RegisterId);
        if (already is not null)
        {
            trace?.Note($"dialog {RegisterId} da mo san — dung lai");
            return already;
        }

        trace?.Step("F9 選択 tren 一覧");
        var f9 = Uia.ById(list, "btnF9")
            ?? throw new InvalidOperationException(
                $"Khong thay btnF9 tren {ListId}. Chay Tc0_DumpUiaTree roi sua ten nut.");
        f9.Click();
        Waits.Step();

        return Waits.For(() => app.Window(RegisterId),
                         $"dialog {RegisterId} hien len sau F9 選択",
                         TestSettings.Current.Run.DefaultTimeout);
    }

    /// <summary>F10 戻る — đóng mà không ghi gì.</summary>
    public static void Close(OchaApp app, Window dialog)
    {
        var f10 = Uia.ById(dialog, "btnF10");
        if (f10 is not null) { f10.Click(); }
        else { Uia.SendKey(InpP1Dialogs.Vk.F10); }
        Waits.Step();
    }
}
