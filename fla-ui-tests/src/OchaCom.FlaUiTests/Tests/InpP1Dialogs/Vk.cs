namespace OchaCom.FlaUiTests.Tests.InpP1Dialogs;

/// <summary>
/// Mã Virtual-Key (Winuser.h) mà luồng này gửi qua <see cref="Infrastructure.Uia.SendKey"/>.
///
/// <para><b>Vì sao không dùng <c>FlaUI.Core.Input.Keyboard</c>.</b> Cả ba dialog ở đây
/// đều nghe phím ở tầng FORM (<c>BaseDialog.KeyPreview = true</c>, BaseDialog.cs:139) và
/// ở tầng <c>ProcessCmdKey</c> của UserControl (BuiInfo.cs:368). Hai đường đó chỉ chạy khi
/// nhận <c>WM_KEYDOWN</c> THẬT. <c>Keyboard.Type(char)</c> gửi <c>KEYEVENTF_UNICODE</c> →
/// app nhận <c>WM_CHAR</c>, <c>ProcessCmdKey</c> không bao giờ thấy phím 「5」 → ô răng
/// không đổi và test đỏ ở một chỗ chẳng liên quan. <c>Uia.SendKey</c> gửi đúng virtual-key
/// nên đi qua cùng đường mà bàn phím thật đi.</para>
///
/// <para>Để ở đây (không thêm vào <c>Uia</c>) vì đây là hằng riêng của luồng: <c>Uia</c>
/// chỉ giữ hai mã mà nhiều luồng dùng chung (VK_F11 / VK_RIGHT).</para>
/// </summary>
internal static class Vk
{
    public const ushort F7 = 0x76;
    public const ushort F9 = 0x78;
    public const ushort F10 = 0x79;
    public const ushort F11 = 0x7A;
    public const ushort F12 = 0x7B;

    public const ushort Delete = 0x2E;
    public const ushort Left = 0x25;
    public const ushort Up = 0x26;
    public const ushort Right = 0x27;
    public const ushort Down = 0x28;

    /// <summary>Phím số hàng trên (Keys.D1..D8) — đúng nhánh <c>keyData >= Keys.D1</c> của BuiInfo.</summary>
    public static ushort Digit(int d) => (ushort)(0x30 + d);
}
