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
    public const ushort F7 = 0x76;
    public const ushort F9 = 0x78;
    public const ushort F10 = 0x79;
    public const ushort F11 = 0x7A;
    public const ushort F12 = 0x7B;

    /// <summary>Escape — ở BaseDialog2 phím này chạy <c>btnF9_Click</c> (確定), KHÔNG phải huỷ
    /// (BaseDialog2.cs:196-201). Xem <c>Tests/MenInput</c>.</summary>
    public const ushort Escape = 0x1B;

    public const ushort Delete = 0x2E;
    public const ushort Left = 0x25;
    public const ushort Up = 0x26;
    public const ushort Right = 0x27;
    public const ushort Down = 0x28;

    /// <summary>Phím số hàng trên (Keys.D1..D8) — đúng nhánh <c>keyData >= Keys.D1</c> của BuiInfo.</summary>
    public static ushort Digit(int d) => (ushort)(0x30 + d);
}
