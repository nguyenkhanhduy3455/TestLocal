using FlaUI.Core.WindowsAPI;
using OchaCom.FlaUiTests.App;
using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Screens;
using OchaCom.FlaUiTests.Tests.CmtPackType10;
using OchaCom.FlaUiTests.Tests.SigaToothStatus;
using OchaCom.FlaUiTests.Tests.TreatmentGrid;

namespace OchaCom.FlaUiTests.Tests.MisoutyakuE00100;

/// <summary>
/// Thao tác chung của luồng 999: chọn dòng, gõ mã, bắt hộp thoại.
///
/// <para>Dùng chung cho <see cref="MisoutyakuUiTests"/> (§B2/§B3) và
/// <see cref="MisoutyakuCodeSetTests"/> (§B4) — hai fixture phải gõ <b>Y HỆT</b> nhau thì
/// mới so được kết quả với nhau.</para>
/// </summary>
public sealed class MisoutyakuOps
{
    /// <summary>Mã 未装着 — modMain.cs:556.</summary>
    public const int MisoutyakuCode = 999;

    private readonly OchaApp _app;
    private readonly SigaToothFlow _flow;

    public MisoutyakuOps(OchaApp app, SigaToothFlow flow) { _app = app; _flow = flow; }

    public SigaToothFlow Flow => _flow;

    /// <summary>
    /// Dòng CUỐI của ngày <paramref name="day"/> có <c>点数 &gt; 0</c> — chỗ gõ đè 999.
    ///
    /// <para>§B2 chỉ có nghĩa trên một dòng <b>đã có 点数</b>: dòng trống thì hai vế (WinForm
    /// xoá / web giữ) đều ra trống và không phân biệt được.</para>
    ///
    /// <para>⚠️ Cuộn tới ngày trước đã — lưới hiện 過去データ inline nên dòng cuối của cả lưới
    /// thường thuộc THÁNG QUÁ KHỨ (F10).</para>
    /// </summary>
    public RegiRow? PickScoredRow(int day, TestTrace trace)
    {
        new CmtPackOps(_flow).ScrollToLastRowOfDay(day, trace);
        return _flow.Grid.Snapshot(200)
            .LastOrDefault(r => Txt.Int(r.Day) == day && Txt.Int(r.Ten) is > 0);
    }

    /// <summary>Gõ 999 vào ô 点 của <paramref name="row"/> ở コードモード rồi Enter.</summary>
    public void Enter999(RegiRow row, TestTrace trace)
    {
        trace.Do($"go {MisoutyakuCode} vao o 点 cua dong 「{row}」 roi Enter", () =>
        {
            _flow.Grid.FocusCell(row, RegiGrid.Col.Ten);
            if (!_flow.Grid.IsEditing()) _flow.Grid.Press(VirtualKeyShort.RETURN);
            Thread.Sleep(250);
            _flow.Grid.Type(MisoutyakuCode.ToString());
            _flow.Grid.Press(VirtualKeyShort.RETURN);
        });
    }

    /// <summary>
    /// Hộp thoại đang mở của app, bắt bằng <b>Win32</b> (F17 — <c>Dialogs.Open</c> có lúc mù).
    ///
    /// <para><paramref name="timeout"/> để NGẮN khi đang đo 「hộp thoại KHÔNG tồn tại」 (F2):
    /// chờ 60s một hộp đáng lẽ không có là 60 giây mua bằng không có gì.</para>
    /// </summary>
    public MsgBoxWin32.Found? CaptureDialog(TimeSpan timeout) =>
        Waits.TryFor(() => MsgBoxWin32.All(_app.ProcessId).FirstOrDefault(), timeout);

    /// <summary>Đóng hộp thoại bằng <c>PostMessage</c> (F18), trả về bấm được hay không.</summary>
    public bool CloseDialog(MsgBoxWin32.Found found)
    {
        var ok = MsgBoxWin32.ClickButton(found.Hwnd, "OK", "はい", "Yes");
        Thread.Sleep(1200);
        return ok;
    }
}
