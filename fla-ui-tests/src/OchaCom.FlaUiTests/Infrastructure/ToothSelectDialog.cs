using FlaUI.Core.AutomationElements;
using OchaCom.FlaUiTests.App;
using OchaCom.FlaUiTests.Screens;

namespace OchaCom.FlaUiTests.Infrastructure;

/// <summary>
/// <c>frm902003</c>「部位選択」 — mọi hiểu biết về hộp thoại chọn răng, gom MỘT chỗ.
///
/// <para>Ban đầu nằm trong <c>Tests/InpP1Dialogs/BrSampleFlow</c> (nơi 部位選択 chỉ là
/// trạm trung chuyển tới Ｂｒサンプル). Nâng lên <c>Infrastructure/</c> ngày 2026-09-03 khi
/// luồng thứ hai cần chính hộp thoại này — <c>Tests/SigaToothStatus</c> lái nó qua đường
/// 病検 → Ｐ変更 và cần cả 確定 (End) lẫn các phím F. Theo quy ước ở README mục 8b:
/// dùng chung thì nâng lên đây, KHÔNG chép đôi. <c>BrSampleFlow</c> giữ nguyên API cũ,
/// thân hàm nay uỷ nhiệm về lớp này.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// BỐN VÙNG VÀ SỐ HIỆU CỦA CHÚNG (BuiInfo.cs:443-477)
/// ═══════════════════════════════════════════════════════════════════════════════
/// <code>
///   pos 1 = 左上 (LU)      pos 2 = 右上 (RU)
///   pos 3 = 左下 (LD)      pos 4 = 右下 (RD)
/// </code>
/// <c>_pos</c> khởi tạo <b>2 = 右上</b> (BuiInfo.cs:351). Di chuyển bằng mũi tên
/// (<c>moveAreaUDRL</c>, :590-634):
/// <code>
///   →  : RU(2)→LU(1) · RD(4)→LD(3)
///   ←  : LU(1)→RU(2) · LD(3)→RD(4) · RU(2) → KHÔNG đi đâu ⇒ ĐÓNG dialog (leftKeyFlg)
///   ↓  : RU(2)→RD(4) · LU(1)→LD(3)
/// </code>
/// ⚠️ <b>← khi đang ở 右上 là ĐÓNG hộp thoại</b>, không phải "không làm gì":
/// <c>ProcessCmdKey</c> đặt <c>leftKeyFlg = true</c> rồi <c>fm.Close()</c> (BuiInfo.cs:390-399),
/// và <c>ByokenChg</c> hiểu cờ đó là 「dời con trỏ về cột ngày rồi thoát」 (frm203002.cs:6277).
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// ÁNH XẠ VÙNG/RĂNG ↔ Ô 部位 0..31 (buiData.unionBui, buiData.cs:485-496)
/// ═══════════════════════════════════════════════════════════════════════════════
/// <code>
///   bui[i]      = buiRU[7-i]   i=0..7   ⇒ 右上 răng N ở ô  8-N   (RU8→0 … RU1→7)
///   bui[i+8]    = buiLU[i]              ⇒ 左上 răng N ở ô  8+(N-1)
///   bui[i+16]   = buiRD[7-i]            ⇒ 右下 răng N ở ô 16+(8-N)
///   bui[i+24]   = buiLD[i]              ⇒ 左下 răng N ở ô 24+(N-1)
/// </code>
/// Xem <see cref="SlotOf"/> / <see cref="ToothAtSlot"/> — đừng tự nhẩm lại, ba spec
/// Playwright đã có một chỗ nhẩm sai (chú thích 「ô 18 = 右下8」 trong khi công thức trên
/// cho <b>右下6</b>; con số cột <c>se19</c> thì vẫn đúng).
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// PHÍM ĐẶT GIÁ TRỊ CHO MỘT RĂNG (BuiInfo.ProcessCmdKey, :368-440)
/// ═══════════════════════════════════════════════════════════════════════════════
/// <code>
///   1..8      → 永久歯: NyusiFlg = false, BuiVal + 1   (ô trống ⇒ thành 1)
///   A..E      → 乳歯  : NyusiFlg = true,  BuiVal + 1   (ô trống ⇒ thành 11)
///   Delete    → clearBuiData() xoá sạch 32 ô
///   - / Back  → xoá đúng ô đang chọn
/// </code>
/// Miền giá trị là chỗ dễ sai nhất: <b>永久歯 1..9, 乳歯 11..19</b> (BuiLabel.chkVal,
/// :163-208). Gõ phím số cho một răng sữa thì nó thành 永久歯 và nhánh SN/NKon của
/// <c>SigaChg</c> KHÔNG BAO GIỜ chạy — testcase xanh giả.
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// PHÍM CỦA CHÍNH HỘP THOẠI (frm902003.cs:152-410)
/// ═══════════════════════════════════════════════════════════════════════════════
/// <code>
///   F1 ７～７   F2 ７～４   F3 ３～３   F4 ４～７   F5 ７～１   F6 １～７
///   F7 全顎     F8 永久歯/乳歯   F9 Ｂｒ例   F10 反転   F11 全消去   F12 戻る
///   End / Escape = btnEntry_Click  ⇒ 確定
/// </code>
/// ⚠️ <b>F9 KHÔNG phải 確定</b> ở màn này (nó là 「Ｂｒ例」), và <b>Escape cũng là 確定</b>
/// chứ không phải huỷ. F1..F6 chỉ tác động lên <b>VÙNG ĐANG CHỌN</b>
/// (<c>buiInfo1.getPos()</c>), không phải cả hàm.
/// </summary>
public static class ToothSelectDialog
{
    public const string DialogId = "frm902003";
    public const string TitleFragment = "部位選択";

    /// <summary>Sơ đồ răng — UserControl <c>buiInfo1</c> (frm902003.Designer.cs:991).</summary>
    public const string ToothMapId = "buiInfo1";

    public const int PosUpperLeft = 1;
    public const int PosUpperRight = 2;
    public const int PosLowerLeft = 3;
    public const int PosLowerRight = 4;

    /// <summary>Vùng đang chọn lúc dialog vừa mở — <c>_pos = 2</c> (BuiInfo.cs:351).</summary>
    public const int InitialPos = PosUpperRight;

    /// <summary>Giá trị ô 部位 đầu tiên của 永久歯 (một lần bấm phím số vào ô trống).</summary>
    public const int PermFirstValue = 1;

    /// <summary>Giá trị ô 部位 đầu tiên của 乳歯 (một lần bấm A..E vào ô trống) — BuiLabel.cs:199.</summary>
    public const int MilkFirstValue = 11;

    // ── Tìm / mở ─────────────────────────────────────────────────────────────

    /// <summary>
    /// Cửa sổ 部位選択 đang mở; null nếu không có.
    ///
    /// <para><c>ModalWindows</c> của cửa sổ CHỦ đi trước: frm902003 là dialog modal thuộc
    /// sở hữu frm203002, mà <c>GetAllTopLevelWindows</c> không phải lúc nào cũng trả về
    /// cửa sổ dạng đó.</para>
    /// </summary>
    public static Window? Find(OchaApp app, Window? owner)
    {
        if (owner is not null)
        {
            try
            {
                foreach (var w in owner.ModalWindows)
                    if (IsToothDialog(w)) return w;
            }
            catch { /* cửa sổ chủ đang bận */ }
        }

        var byId = app.Window(DialogId);
        if (byId is not null) return byId;

        try
        {
            foreach (var w in app.Windows())
                if (IsToothDialog(w)) return w;
        }
        catch { /* */ }

        return null;
    }

    /// <summary>Chờ 部位選択 hiện ra; null nếu hết giờ.</summary>
    public static Window? WaitFor(OchaApp app, Window? owner, TimeSpan timeout) =>
        Waits.TryFor(() => Find(app, owner), timeout);

    private static bool IsToothDialog(Window w)
    {
        try
        {
            return Txt.Same(Uia.AutomationIdOf(w), DialogId)
                || Txt.Has(Uia.NameOf(w), TitleFragment);
        }
        catch { return false; }
    }

    /// <summary>
    /// Mở 部位選択 bằng cách click ô cột 部位 của lưới đăng ký.
    ///
    /// <para><c>grdRegi_CellClick</c> (frm203002.cs:1686-1697): MỘT click vào ô cột 部位
    /// là đủ, miễn cột ẩn 51 (<c>BuiDispFlg</c>) của dòng đó khác <c>"99"</c> — dòng
    /// 日計/合計 bằng 99 nên không mở được. Vì thế phải THỬ NHIỀU DÒNG.</para>
    ///
    /// <para>Trả <c>null</c> khi không dòng nào mở được — testcase phải
    /// <c>IgnoreWithReason</c> chứ đừng đỏ: đó là chuyện dữ liệu của máy.</para>
    /// </summary>
    public static Window? OpenFromGrid(OchaApp app, TreatmentEntryScreen screen, TestTrace? trace = null)
    {
        var already = Find(app, screen.Window);
        if (already is not null)
        {
            trace?.Note($"{DialogId} da mo san — dung lai");
            return already;
        }

        var rows = screen.Regi.Grid.Rows(limit: 12);
        trace?.Note($"luoi dang ky co {rows.Count} dong (da cat con 12)");
        if (rows.Count == 0) return null;

        for (var rowIndex = 0; rowIndex < rows.Count; rowIndex++)
        {
            var row = rows[rowIndex];
            var cells = Uia.Children(row.Element).ToList();

            var idx = -1;
            var descs = row.CellDescriptions;
            for (var c = 0; c < descs.Count && c < cells.Count; c++)
                if (Txt.Has(descs[c], "部位")) { idx = c; break; }
            if (idx < 0 && cells.Count > RegiGrid.Col.Bui) idx = RegiGrid.Col.Bui;
            if (idx < 0) continue;

            trace?.Note($"thu mo 部位選択: dong {rowIndex}, o {idx} — 「{row}」");
            Uia.MouseClick(cells[idx]);
            Waits.Step();

            var dialog = Waits.TryFor(() => Find(app, screen.Window), TimeSpan.FromSeconds(4));
            if (dialog is not null)
            {
                trace?.Note($"mo duoc 部位選択 tu dong {rowIndex}");
                trace?.Shot("bui-dialog-mo");
                return dialog;
            }
        }

        trace?.Note("khong dong nao mo duoc 部位選択");
        return null;
    }

    // ── Tiêu điểm ────────────────────────────────────────────────────────────

    /// <summary>Đưa cửa sổ lên trước và cho nó giữ tiêu điểm.</summary>
    public static void FocusWindow(Window window)
    {
        try
        {
            var hwnd = window.Properties.NativeWindowHandle.ValueOrDefault;
            if (hwnd != IntPtr.Zero) Uia.ForceForeground(hwnd);
        }
        catch { /* cửa sổ bận — vẫn thử Focus() bên dưới */ }

        try { window.Focus(); } catch { /* không quan trọng */ }
        Thread.Sleep(120);
    }

    /// <summary>
    /// Đưa tiêu điểm vào sơ đồ răng <c>buiInfo1</c>.
    ///
    /// <para><b>Bắt buộc trước khi gửi Delete / mũi tên / phím số / A..E.</b> WinForms
    /// chuyển <c>ProcessCmdKey</c> đi LÊN theo chuỗi cha của control ĐANG FOCUS. Focus nằm
    /// ngoài <c>buiInfo1</c> (ví dụ trên một nút F-key) thì <c>BuiInfo.ProcessCmdKey</c>
    /// không bao giờ được gọi — phím bay vào hư không, ô răng không đổi, và testcase đỏ ở
    /// một bước sau với thông báo hoàn toàn sai địa chỉ.</para>
    ///
    /// <para>Phím F1..F12 / End thì KHÁC: chúng do <c>formBase_KeyDown</c> của chính form
    /// nghe (<c>KeyPreview = true</c>) nên chỉ cần cửa sổ đang active.</para>
    /// </summary>
    public static void FocusToothMap(Window dialog)
    {
        FocusWindow(dialog);

        var map = Uia.ById(dialog, ToothMapId);
        if (map is null) return;

        try { map.Focus(); }
        catch { /* UserControl không nhận Focus qua UIA — TabIndex 0 nên thường đã có sẵn */ }
        Thread.Sleep(120);
    }

    // ── Gõ vào sơ đồ răng ────────────────────────────────────────────────────

    /// <summary>Xoá sạch 32 ô — <c>Delete</c> → <c>clearBuiData()</c> (BuiInfo.cs:375-379).</summary>
    public static void ClearAllTeeth(Window dialog, TestTrace? trace = null)
    {
        FocusToothMap(dialog);
        trace?.Step("Delete — xoa sach 32 o");
        Uia.SendKey(Vk.Delete);
        Thread.Sleep(150);
    }

    /// <summary>
    /// Chuyển vùng đang chọn tới <paramref name="pos"/> bằng mũi tên, xuất phát từ
    /// <see cref="InitialPos"/>.
    ///
    /// <para>Đi bằng ↓ rồi → (KHÔNG bao giờ dùng ←): ← khi đang ở 右上 sẽ ĐÓNG hộp thoại.</para>
    /// </summary>
    public static void MoveToArea(Window dialog, int pos, TestTrace? trace = null)
    {
        if (pos is < PosUpperLeft or > PosLowerRight)
            throw new ArgumentOutOfRangeException(nameof(pos), pos, "vùng phải là 1..4 (LU/RU/LD/RD)");

        FocusToothMap(dialog);

        // Từ RU(2): ↓ để xuống hàm dưới (RD 4), → để sang bên trái (LU 1 / LD 3).
        var down = pos is PosLowerLeft or PosLowerRight;
        var right = pos is PosUpperLeft or PosLowerLeft;

        trace?.Step($"chon vung pos={pos} (tu RU: {(down ? "↓ " : "")}{(right ? "→" : "")})");
        if (down) { Uia.SendKey(Vk.Down); Thread.Sleep(150); }
        if (right) { Uia.SendKey(Vk.Right); Thread.Sleep(150); }
    }

    /// <summary>
    /// Bấm một lần lên răng <paramref name="idx"/> (1..8) của VÙNG ĐANG CHỌN.
    /// <paramref name="milk"/> = true ⇒ dùng phím A..E (乳歯, giá trị 11+).
    /// </summary>
    public static void PressTooth(int idx, bool milk = false)
    {
        if (idx is < 1 or > 8) throw new ArgumentOutOfRangeException(nameof(idx), idx, "răng phải là 1..8");
        if (milk && idx > 5)
            throw new ArgumentOutOfRangeException(nameof(idx), idx, "乳歯 chỉ có 5 răng mỗi vùng (A..E)");

        Uia.SendKey(milk ? Vk.Letter('A' + idx - 1) : Vk.Digit(idx));
        Thread.Sleep(150);
    }

    /// <summary>
    /// Xoá sạch rồi chọn đúng một ô 部位 theo CHỈ SỐ Ô 0..31 — cách gọi an toàn nhất vì
    /// nó nói cùng ngôn ngữ với <c>bui1..bui32</c> của DB.
    /// </summary>
    public static void SelectOnlySlot(Window dialog, int slot, bool milk = false, TestTrace? trace = null)
    {
        var (pos, idx) = ToothAtSlot(slot);
        ClearAllTeeth(dialog, trace);
        MoveToArea(dialog, pos, trace);
        trace?.Step($"chon o {slot} = pos {pos} rang {idx} ({(milk ? "乳歯 A..E" : "永久歯 1..8")})");
        PressTooth(idx, milk);
        Waits.Step();
    }

    /// <summary>
    /// Xoá sạch rồi chọn các răng của vùng <b>左上 (LU)</b> bằng bàn phím.
    /// Giữ lại cho <c>Tests/InpP1Dialogs</c> — xem <c>BrSampleFlow.SelectUpperLeftTeeth</c>.
    /// </summary>
    public static void SelectUpperLeftTeeth(Window dialog, IReadOnlyList<int> teeth, TestTrace? trace = null)
    {
        FocusToothMap(dialog);

        trace?.Step($"Delete (xoa 32 o) → → (RU sang LU) → {string.Join(",", teeth)}");
        Uia.SendKey(Vk.Delete);
        Thread.Sleep(150);
        Uia.SendKey(Vk.Right);
        Thread.Sleep(150);
        foreach (var t in teeth)
        {
            Uia.SendKey(Vk.Digit(t));
            Thread.Sleep(150);
        }
        Waits.Step();
    }

    // ── Phím của chính hộp thoại ─────────────────────────────────────────────

    /// <summary>F7 全顎 — chọn CẢ 32 răng (frm902003.cs:272-278).</summary>
    public static void SelectWholeArch(Window dialog, TestTrace? trace = null)
    {
        FocusWindow(dialog);
        trace?.Step("F7 全顎");
        Uia.SendKey(Vk.F7);
        Waits.Step();
    }

    /// <summary>F11 全消去 — <c>clearBui()</c> + <c>clearBuiData()</c> (frm902003.cs:394-400).</summary>
    public static void ClearAll(Window dialog, TestTrace? trace = null)
    {
        FocusWindow(dialog);
        trace?.Step("F11 全消去");
        Uia.SendKey(Vk.F11);
        Waits.Step();
    }

    /// <summary>F3 ３～３ — <c>setBui(1, 3, pos, 0)</c>, CHỈ trên vùng đang chọn (frm902003.cs:231).</summary>
    public static void SelectIncisors(Window dialog, TestTrace? trace = null)
    {
        FocusWindow(dialog);
        trace?.Step("F3 ３～３ (vung dang chon)");
        Uia.SendKey(Vk.F3);
        Waits.Step();
    }

    /// <summary>
    /// <b>End = 確定</b> (<c>btnEntry_Click</c>, frm902003.cs:196). KHÔNG phải F9 — F9 ở
    /// màn này là 「Ｂｒ例」.
    /// </summary>
    public static void Confirm(Window dialog, TestTrace? trace = null)
    {
        FocusWindow(dialog);
        trace?.Step("End 確定");
        Uia.SendKey(Vk.End);
        Waits.Step();
    }

    /// <summary>
    /// Đóng bằng <b>F12 戻る</b> (frm902003.cs:189-191 → <c>this.Close()</c>).
    ///
    /// <para>⚠️ KHÔNG dùng Escape: ở màn này Escape gọi <c>btnEntry_Click</c>, tức là
    /// XÁC NHẬN lựa chọn và đi tiếp sang 病名選択.</para>
    /// </summary>
    public static void Close(OchaApp app, Window dialog, TestTrace? trace = null)
    {
        if (!Uia.IsOnScreen(dialog)) return;

        trace?.Step("dong 部位選択 bang F12 戻る");
        FocusWindow(dialog);
        Uia.SendKey(Vk.F12);

        Waits.Until(() => app.Window(DialogId) is null,
                    "dialog frm902003 dong lai sau khi bam F12 戻る",
                    TestSettings.Current.Run.DefaultTimeout);
    }

    // ── Đọc lựa chọn ─────────────────────────────────────────────────────────

    /// <summary>AutomationId của một ô răng: <c>buiLabel{pos}{idx}</c> (BuiInfo.cs:799).</summary>
    public static string ToothId(int pos, int idx) => $"buiLabel{pos}{idx}";

    /// <summary>
    /// Chữ đang hiện trên một ô răng. Rỗng ⟺ giá trị 0 hoặc 10
    /// (<c>getToothText</c>, BuiInfo.cs:764-771). Không tìm thấy control → null.
    /// </summary>
    public static string? ToothText(Window dialog, int pos, int idx)
    {
        var holder = Uia.ById(dialog, ToothId(pos, idx));
        if (holder is null) return null;

        var inner = Uia.ById(holder, "lblBui");
        return Txt.N(inner is null ? Uia.NameOf(holder) : Uia.ValueOf(inner));
    }

    /// <summary>Mọi ô răng ĐANG CÓ CHỮ, dạng 「pos-idx=chữ」 — để in vào nhật ký.</summary>
    public static IReadOnlyList<string> MarkedTeeth(Window dialog)
    {
        var marked = new List<string>();
        for (var pos = 1; pos <= 4; pos++)
            for (var idx = 1; idx <= 8; idx++)
            {
                var text = ToothText(dialog, pos, idx);
                if (text is { Length: > 0 }) marked.Add($"{pos}-{idx}={text}");
            }
        return marked;
    }

    public static int MarkedToothCount(Window dialog) => MarkedTeeth(dialog).Count;

    /// <summary>Các Ô 部位 (0..31) đang có chữ — cùng đơn vị với <c>bui1..bui32</c>.</summary>
    public static IReadOnlyList<int> MarkedSlots(Window dialog)
    {
        var slots = new List<int>();
        for (var pos = 1; pos <= 4; pos++)
            for (var idx = 1; idx <= 8; idx++)
            {
                var text = ToothText(dialog, pos, idx);
                if (text is { Length: > 0 }) slots.Add(SlotOf(pos, idx));
            }
        slots.Sort();
        return slots;
    }

    // ── Ánh xạ vùng/răng ↔ ô 部位 ────────────────────────────────────────────

    /// <summary>Ô 部位 (0..31) của răng <paramref name="idx"/> thuộc vùng <paramref name="pos"/>.</summary>
    public static int SlotOf(int pos, int idx) => pos switch
    {
        PosUpperRight => 8 - idx,        // bui[i] = buiRU[7-i]
        PosUpperLeft => 8 + (idx - 1),   // bui[i+8] = buiLU[i]
        PosLowerRight => 16 + (8 - idx), // bui[i+16] = buiRD[7-i]
        PosLowerLeft => 24 + (idx - 1),  // bui[i+24] = buiLD[i]
        _ => throw new ArgumentOutOfRangeException(nameof(pos), pos, "vùng phải là 1..4"),
    };

    /// <summary>Chiều ngược của <see cref="SlotOf"/>.</summary>
    public static (int Pos, int Idx) ToothAtSlot(int slot) => slot switch
    {
        >= 0 and <= 7 => (PosUpperRight, 8 - slot),
        >= 8 and <= 15 => (PosUpperLeft, slot - 8 + 1),
        >= 16 and <= 23 => (PosLowerRight, 8 - (slot - 16)),
        >= 24 and <= 31 => (PosLowerLeft, slot - 24 + 1),
        _ => throw new ArgumentOutOfRangeException(nameof(slot), slot, "ô 部位 phải là 0..31"),
    };

    /// <summary>Tên người đọc được của một ô 部位, vd 「左上3」.</summary>
    public static string DescribeSlot(int slot)
    {
        var (pos, idx) = ToothAtSlot(slot);
        var area = pos switch
        {
            PosUpperLeft => "左上",
            PosUpperRight => "右上",
            PosLowerLeft => "左下",
            _ => "右下",
        };
        return $"{area}{idx}";
    }
}
