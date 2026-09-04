namespace OchaCom.FlaUiTests.Infrastructure;

/// <summary>
/// Mã Virtual-Key (Winuser.h) mà luồng này gửi qua <see cref="Uia.SendKey"/>.
///
/// <para><b>Vì sao không dùng <c>FlaUI.Core.Input.Keyboard</c>.</b> Cả ba dialog ở đây
/// đều nghe phím ở tầng FORM (<c>BaseDialog.KeyPreview = true</c>, BaseDialog.cs:139) và
/// ở tầng <c>ProcessCmdKey</c> của UserControl (BuiInfo.cs:368). Hai đường đó chỉ chạy khi
/// nhận <c>WM_KEYDOWN</c> THẬT. <c>Keyboard.Type(char)</c> gửi <c>KEYEVENTF_UNICODE</c> →
/// app nhận <c>WM_CHAR</c>, <c>ProcessCmdKey</c> không bao giờ thấy phím 「5」 → ô răng
/// không đổi và test đỏ ở một chỗ chẳng liên quan. <c>Uia.SendKey</c> gửi đúng virtual-key
/// nên đi qua cùng đường mà bàn phím thật đi.</para>
///
/// <para>Ban đầu là hằng riêng của <c>Tests/InpP1Dialogs</c>; nâng lên đây ngày 2026-09-03
/// khi luồng thứ hai (<c>Tests/MenInput</c>) cần đúng những mã này — theo quy ước ở
/// README mục 8b: dùng chung thì nâng lên <c>Infrastructure/</c>, không chép đôi.</para>
/// </summary>
public static class Vk
{
    /// <summary>F1 — ở <c>frm203011</c>「カルテ記載選択」 là 「基本検査」 (frm203011.cs:95).
    /// ⚠️ Ở <c>frm203028</c>/<c>frm203029</c> thì F1 là 「ﾃﾞﾌｫﾙﾄ設定」, tức GHI
    /// <c>kihon_def</c>/<c>seimitu_def</c> — đừng bao giờ gửi nhầm vào hai màn đó.</summary>
    public const ushort F1 = 0x70;

    /// <summary>F2 — ở <c>frm203011</c> là 「精密検査」 (frm203011.cs:114).</summary>
    public const ushort F2 = 0x71;

    public const ushort F3 = 0x72;

    /// <summary>F6 — ở <c>frm203002</c> là 「コメント」 ⇒ mở <c>frm203011</c>「カルテ記載選択」
    /// (frm203002.cs:826 → :4717). Chỉ đúng khi <c>ShiftFlg == false</c>.</summary>
    public const ushort F6 = 0x75;

    public const ushort F7 = 0x76;
    public const ushort F9 = 0x78;
    public const ushort F10 = 0x79;
    public const ushort F11 = 0x7A;
    public const ushort F12 = 0x7B;

    /// <summary>Escape — ở BaseDialog2 phím này chạy <c>btnF9_Click</c> (確定), KHÔNG phải huỷ
    /// (BaseDialog2.cs:196-201). Xem <c>Tests/MenInput</c>.</summary>
    public const ushort Escape = 0x1B;

    public const ushort Delete = 0x2E;

    /// <summary>
    /// Insert — ở <c>frm902007</c>「病名選択」 phím này ĐỔI CHẾ ĐỘ của ô nhập giữa
    /// 「選択番号」 (so với <c>dsp_cd</c>) và 「コード」 (so với <c>dis_cd</c>),
    /// frm902007.cs:229-232. Trên lưới 処置 thì nó là 行追加 (frm203002.cs:3570).
    /// </summary>
    public const ushort Insert = 0x2D;

    public const ushort Return = 0x0D;
    public const ushort Left = 0x25;
    public const ushort Up = 0x26;
    public const ushort Right = 0x27;
    public const ushort Down = 0x28;

    /// <summary>
    /// End — 確定 của <c>frm902003</c>「部位選択」 và <c>frm902007</c>「病名選択」
    /// (<c>btnEntry_Click</c>, frm902003.cs:196). Cũng là phím mà nút 「F9 登録」 của
    /// 診療入力 thật sự gửi (frm203002.cs:882).
    /// </summary>
    public const ushort End = 0x23;

    /// <summary>Phím số hàng trên (Keys.D1..D8) — đúng nhánh <c>keyData >= Keys.D1</c> của BuiInfo.</summary>
    public static ushort Digit(int d) => (ushort)(0x30 + d);

    /// <summary>
    /// Chữ cái A..Z (<c>Keys.A</c> = 0x41 = mã ASCII chữ HOA).
    ///
    /// <para>Ở 部位選択 thì A..E là nhánh <b>乳歯</b> của <c>BuiInfo.ProcessCmdKey</c>
    /// (BuiInfo.cs:420-427): nó đặt <c>NyusiFlg = true</c> nên ô nhận giá trị 11..19,
    /// KHÁC hẳn phím số (1..9 = 永久歯). Đây là cách DUY NHẤT chọn răng sữa bằng bàn phím.</para>
    /// </summary>
    public static ushort Letter(int upperCaseAscii) => (ushort)upperCaseAscii;
}
