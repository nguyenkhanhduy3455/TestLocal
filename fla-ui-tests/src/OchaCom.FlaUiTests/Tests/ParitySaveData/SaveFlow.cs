using FlaUI.Core;
using FlaUI.Core.AutomationElements;
using FlaUI.Core.Input;
using FlaUI.Core.WindowsAPI;
using OchaCom.FlaUiTests.App;
using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Screens;

namespace OchaCom.FlaUiTests.Tests.ParitySaveData;

/// <summary>
/// Luồng F9 登録 của 診療入力 — <c>modSave.SaveChangesAndExit</c> (modSave.cs:100-132).
///
/// ⚠️ Đây là thứ mà mọi bộ test khác trong project CỐ Ý KHÔNG chạm vào
/// (xem chú thích đầu <see cref="TreatmentEntryScreen"/>: "KHÔNG BAO GIỜ bấm F9 登録").
/// Bộ parity buộc phải bấm, vì các bug cần xác minh đều nằm TRONG <c>SaveData</c>.
///
/// ─── ⚠️ 登録 gắn với phím End, KHÔNG phải F9 ────────────────────────────────
/// 「F9」 chỉ là nhãn trên thanh nút. <c>btnF9_Click</c> (frm203002.cs:882) gọi
/// <c>KeyFunc(Keys.End)</c>. Gửi phím F9 vào form là không có gì xảy ra.
/// Xem <see cref="TriggerRegister"/>.
///
/// ─── Chuỗi hộp thoại ────────────────────────────────────────────────────────
/// <code>
/// F9
///  └─ 「処置データは、変更されて{います|いません}。保存しますか？」   3 nút はい/いいえ/キャンセル
///       ├─ キャンセル → ở lại màn hình, không làm gì
///       ├─ いいえ     → RestoreData rồi VẪN đóng màn hình
///       └─ はい       → SaveData
///                        └─ CompareTrntrnData lệch (chỉ khi máy khác vừa sửa)
///                             └─ 「他の端末で処置データが更新されています。上書きしますか？」
///                                  2 nút, MẶC ĐỊNH là いいえ (MsgBoxStyle.DefaultButton2)
/// </code>
///
/// ─── Điều phải nhớ ──────────────────────────────────────────────────────────
/// F9 thành công thì <b>màn hình 診療入力 ĐÓNG LẠI</b> (SaveChangesAndExit trả true =
/// 「終了」). Nên mỗi testcase phải tự mở lại màn hình — xem
/// <c>UiTestBase.ReopenTreatmentScreen</c>.
/// </summary>
public static class SaveFlow
{
    /// <summary>Câu hỏi đầu tiên, phần bất biến giữa hai biến thể います / いません.</summary>
    public const string SaveQuestionFragment = "保存しますか";

    /// <summary>Hộp thoại xung đột — chỉ hiện khi CompareTrntrnData thấy lệch.</summary>
    public const string OverwriteQuestionFragment = "上書きしますか";

    /// <summary>Trả lời cho câu hỏi đầu tiên.</summary>
    public enum SaveAnswer { Yes, No, Cancel }

    /// <summary>Trả lời cho câu 「上書きしますか？」.</summary>
    public enum OverwriteAnswer { Yes, No }

    /// <summary>Kết quả một lượt bấm F9.</summary>
    /// <param name="SaveQuestionText">Nguyên văn câu hỏi đầu — để đối chiếu います/いません.</param>
    /// <param name="OverwriteAsked">Có hiện 「上書きしますか？」 không.</param>
    /// <param name="OverwriteDefaultButton">
    /// Tên nút đang được focus lúc hộp thoại xung đột vừa mở. WinForm khai
    /// <c>MsgBoxStyle.DefaultButton2</c> ⇒ phải là 「いいえ」. Rỗng = không đọc được.
    /// </param>
    /// <param name="ScreenClosedAfterwards">Màn hình 診療入力 có đóng lại không.</param>
    public sealed record Result(
        string SaveQuestionText,
        bool OverwriteAsked,
        string OverwriteDefaultButton,
        bool ScreenClosedAfterwards);

    /// <summary>
    /// Bấm F9 rồi đi hết chuỗi hộp thoại.
    /// </summary>
    /// <param name="onOverwrite">
    /// Trả lời cho 「上書きしますか？」 nếu nó hiện ra. Truyền <c>No</c> để tái hiện BUG-2d.
    /// </param>
    /// <param name="trace">
    /// Nhật ký từng bước. Nên truyền: chuỗi hộp thoại này là chỗ dày đặc thao tác ẩn nhất
    /// của cả bộ test, và khi hỏng thì ảnh chụp ở TearDown thường chỉ còn màn hình trống.
    /// </param>
    public static Result PressF9(
        OchaApp app,
        Window treatmentWindow,
        SaveAnswer answer,
        OverwriteAnswer onOverwrite = OverwriteAnswer.No,
        TestTrace? trace = null)
    {
        trace?.Step("bam F9 登録");
        TriggerRegister(treatmentWindow, trace);
        Waits.Step();

        var dialogTimeout = TestSettings.Current.Parity.DialogTimeout;

        var hit = Waits.TryFor(() => ModalDialogs.Find(app, treatmentWindow, SaveQuestionFragment),
                               dialogTimeout);
        if (hit is null)
        {
            var ex = new TimeoutException(
                $"Quá {dialogTimeout.TotalSeconds:0}s mà không thấy hộp thoại chứa 「{SaveQuestionFragment}」.");
            trace?.Fail($"cho hop thoai 「{SaveQuestionFragment}」", ex);
            trace?.Note("cua so dang mo: " + DescribeOpenDialogs(app, treatmentWindow));
            throw ex;
        }

        var saveDialog = hit.Dialog;
        trace?.Note($"tim thay hop thoai bang duong 「{hit.Route}」");

        var saveText = Txt.N(Dialogs.TextOf(saveDialog));
        trace?.Note($"cau hoi F9: 「{saveText}」");
        trace?.Shot("hop-thoai-luu");

        var buttonName = answer switch
        {
            SaveAnswer.Yes => "はい",
            SaveAnswer.No => "いいえ",
            _ => "キャンセル",
        };
        trace?.Step($"tra loi 「{buttonName}」 cho cau hoi luu");
        if (!Dialogs.ClickButton(saveDialog, buttonName, EnglishOf(buttonName)))
        {
            var available = ButtonNames(saveDialog);
            var ex = new InvalidOperationException(
                $"Hộp thoại 「{SaveQuestionFragment}」 không có nút 「{buttonName}」. " +
                $"Các nút đang có: {available}. Nội dung đọc được: 「{saveText}」");
            trace?.Fail("bam nut tren hop thoai luu", ex);
            throw ex;
        }
        Waits.Step();

        var overwriteAsked = false;
        var defaultButton = "";

        if (answer == SaveAnswer.Yes)
        {
            // Hộp thoại xung đột CÓ THỂ không hiện — đó là trường hợp bình thường.
            // Chờ ngắn thôi: chờ đủ lâu như timeout mặc định sẽ làm mọi lượt lưu sạch
            // đều tốn thêm 20 giây.
            // Chờ ngắn hơn hẳn: KHÔNG hiện hộp thoại này là trường hợp BÌNH THƯỜNG
            // (không có xung đột), nên mọi lượt lưu sạch đều phải trả giá bằng đúng
            // khoảng chờ này. Nhưng vẫn phải đủ rộng cho cái app chậm chạp ở đây.
            var overwriteHit = Waits.TryFor(
                () => ModalDialogs.Find(app, treatmentWindow, OverwriteQuestionFragment),
                TimeSpan.FromSeconds(Math.Max(dialogTimeout.TotalSeconds / 3, 15)));

            if (overwriteHit is { } oh)
            {
                var overwrite = oh.Dialog;
                trace?.Note($"tim thay hop thoai 上書き bang duong 「{oh.Route}」");
                overwriteAsked = true;
                defaultButton = FocusedButtonName(overwrite);

                trace?.Note($"hop thoai xung dot: 「{Txt.N(Dialogs.TextOf(overwrite))}」");
                trace?.Note($"nut dang focus (= nut mac dinh): 「{defaultButton}」 " +
                            "- WinForm khai DefaultButton2 nen phai la 「いいえ」");
                // Ảnh quan trọng nhất của cả testcase: hộp thoại 上書き còn đang mở.
                trace?.Shot("hop-thoai-ghi-de");

                var name = onOverwrite == OverwriteAnswer.Yes ? "はい" : "いいえ";
                trace?.Step($"tra loi 「{name}」 cho cau hoi ghi de");
                if (!Dialogs.ClickButton(overwrite, name, EnglishOf(name)))
                {
                    var ex = new InvalidOperationException(
                        $"Hộp thoại 「{OverwriteQuestionFragment}」 không có nút 「{name}」. " +
                        $"Các nút đang có: {ButtonNames(overwrite)}.");
                    trace?.Fail("bam nut tren hop thoai ghi de", ex);
                    throw ex;
                }
                Waits.Step();
            }
            else
            {
                trace?.Note("KHONG hien hop thoai 上書き - khong co xung dot nao duoc phat hien");
            }
        }

        // Màn hình đóng lại là hành vi BÌNH THƯỜNG khi lưu xong — và cũng chính là
        // biểu hiện của BUG-2d khi người dùng đã từ chối ghi đè.
        trace?.Step("cho xem man hinh 診療入力 co dong khong");
        var closed = Waits.TryUntil(() => !IsWindowUsable(treatmentWindow),
                                    TimeSpan.FromSeconds(Math.Max(dialogTimeout.TotalSeconds / 3, 15)));
        trace?.Note($"man hinh 診療入力 {(closed ? "DA DONG" : "van con mo")}");
        trace?.Shot(closed ? "sau-khi-man-hinh-dong" : "man-hinh-van-mo");

        return new Result(saveText, overwriteAsked, defaultButton, closed);
    }

    /// <summary>
    /// Kích hoạt 登録.
    ///
    /// ═══════════════════════════════════════════════════════════════════════
    /// ⚠️ GỬI PHÍM F9 KHÔNG CÓ TÁC DỤNG
    /// ═══════════════════════════════════════════════════════════════════════
    /// 「F9」 chỉ là NHÃN in trên thanh nút. Handler thật là
    /// <c>frm203002.btnF9_Click</c> (frm203002.cs:882), và khi <c>ShiftFlg == false</c>
    /// nó gọi <c>KeyFunc(Keys.End)</c> — tức 登録 gắn với phím <b>End</b>, không phải F9.
    /// Bắn <c>VirtualKeyShort.F9</c> vào form thì không có gì xảy ra: đúng triệu chứng
    /// đã gặp — F9 được bấm, chờ 20s, không hộp thoại nào hiện, 「hộp thoại đang mở:
    /// (không có)」.
    ///
    /// Cũng KHÔNG gửi phím End: sau khi 個別 chèn 処置, app đặt con trỏ vào ô 回 rồi
    /// <c>BeginEdit</c> (frm203002.cs:6919-6925). Ô đang soạn thảo thì End bị chính
    /// TextBox nuốt để nhảy con trỏ về cuối chuỗi, form không thấy gì.
    ///
    /// Nên: CLICK NÚT. Vừa giống thao tác người dùng, vừa miễn nhiễm với focus và
    /// chế độ soạn thảo ô. Phím End chỉ dùng làm đường lui.
    /// </summary>
    private static void TriggerRegister(Window window, TestTrace? trace)
    {
        window.Focus();

        var button = Uia.ByIdOrName(window, "btnF9", "登録",
                                    FlaUI.Core.Definitions.ControlType.Button);
        if (button is not null)
        {
            trace?.Note($"kich hoat 登録 bang CLICK nut 「{Uia.NameOf(button)}」 (btnF9)");
            Uia.MouseClick(button);
            return;
        }

        trace?.Note("KHONG thay nut btnF9 — lui ve gui phim End (登録 gan voi End, " +
                    "khong phai F9; xem chu thich TriggerRegister). Neu o luoi dang " +
                    "soan thao thi End se bi TextBox nuot.");
        Keyboard.Press(VirtualKeyShort.END);
    }

    /// <summary>
    /// Tên nút đang giữ focus trong hộp thoại — cách duy nhất đọc được
    /// <c>MsgBoxStyle.DefaultButton2</c> từ bên ngoài.
    /// </summary>
    private static string FocusedButtonName(Window dialog)
    {
        try
        {
            foreach (var b in dialog.FindAllDescendants(cf =>
                         cf.ByControlType(FlaUI.Core.Definitions.ControlType.Button)))
            {
                if (b.Properties.HasKeyboardFocus.ValueOrDefault)
                    return Uia.NameOf(b).Replace("&", "");
            }
        }
        catch { /* hộp thoại đã đóng */ }
        return "";
    }

    /// <summary>Tên các nút của hộp thoại — để câu lỗi nói được "đang có những nút nào".</summary>
    private static string ButtonNames(Window dialog)
    {
        try
        {
            var names = dialog.FindAllDescendants(cf =>
                    cf.ByControlType(FlaUI.Core.Definitions.ControlType.Button))
                .Select(b => "「" + Uia.NameOf(b).Replace("&", "") + "」")
                .ToList();
            return names.Count == 0 ? "(không đọc được nút nào)" : string.Join(" ", names);
        }
        catch { return "(hộp thoại đã đóng)"; }
    }

    private static string DescribeOpenDialogs(OchaApp app, Window owner)
    {
        var texts = ModalDialogs.All(app, owner)
            .Select(d => Txt.N(Dialogs.TextOf(d)))
            .Where(t => t.Length > 0)
            .ToList();
        return texts.Count == 0 ? "(khong co)" : string.Join(" / ", texts.Select(t => $"「{t}」"));
    }

    private static bool IsWindowUsable(Window w)
    {
        try { return Uia.IsOnScreen(w); }
        catch { return false; }
    }

    private static string EnglishOf(string japanese) => japanese switch
    {
        "はい" => "Yes",
        "いいえ" => "No",
        "キャンセル" => "Cancel",
        _ => japanese,
    };
}
