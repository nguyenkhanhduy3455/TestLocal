using FlaUI.Core.AutomationElements;
using OchaCom.FlaUiTests.App;
using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Tests.ParityAccountingCorrection;

namespace OchaCom.FlaUiTests.Tests.UnpaidSyosinFlag;

/// <summary>
/// Lái chuỗi F8 会計 tới ĐÚNG nhánh <b>TẠO 未精算データ</b>.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// VÌ SAO KHÔNG DÙNG LẠI <see cref="AccountingFlow.WalkToChgAccData"/>
/// ═══════════════════════════════════════════════════════════════════════════
/// Bộ luật của lớp đó nhắm tới 会計データ修正, nên nó trả lời <b>いいえ</b> cho
/// 「既に…会計処理…されていますが、未清算データ(…)を作成してよろしいですか?」 — đúng cho
/// mục tiêu của nó, và <b>ngược hẳn</b> mục tiêu ở đây.
///
/// <para>Đo thật 2026-08-26 bằng probe Tc0: chuỗi đi trọn 3 hộp thoại, tới được
/// 会計データ修正, và <c>UNPAID</c> vẫn <b>0 dòng</b> — không có gì để đọc
/// <c>SFLG</c>.</para>
///
/// <code>
/// [1] 「処置データチェックでエラーがありました。このまま続けますか?」  [OK, Cancel] → OK
/// [2] 「会計処理を行う日が本日でありません。よろしいですか。」          [OK, Cancel] → OK
/// [3] 「既に、¥1,020 の会計処理がされていますが、
///      未清算データ(¥0)を作成してよろしいですか?」                     [Yes, No]   → ここが違う
/// </code>
///
/// <para>Luồng này trả lời <b>はい</b> cho [3]: modAcc.cs:566 đặt
/// <c>past_billing_amount = 0</c> ⇒ rẽ vào nhánh 「会計データが存在しない（未精算データを
/// 作成場合を含む）」 (modAcc.cs:598) — đúng nhánh ghi <c>unPaidData.sflg</c>
/// (modAcc.cs:639).</para>
///
/// <para><c>入金指定</c> (frm203027) chỉ bung ra khi <c>ModCommon.pNYUKIN == true</c>
/// (modAcc.cs:602); cấu hình khác thì đi thẳng tới bước insert. Nên nó có luật riêng
/// chứ không còn bị coi là 「dấu hiệu đi nhầm nhánh」 như bên
/// <see cref="AccountingFlow"/> — ở đó nó là dấu hiệu nhầm, ở đây nó nằm trên đường
/// đúng.</para>
///
/// ⚠️ Nhánh này GHI THẬT: <c>UNPAID</c>, và có thể cả <c>ACCDAT</c>/<c>PERSON_EXP</c>.
/// Fixture gọi lớp này phải chụp ảnh và khôi phục.
/// </summary>
public static class UnpaidCreationFlow
{
    public const string PreCheckMsg = "続けますか";
    public const string DateGateMsg = "本日でありません";
    public const string SaveQuestionMsg = "保存しますか";

    /// <summary>「既に…未清算データ(…)を作成してよろしいですか?」 — modAcc.cs:560-570.</summary>
    public const string CreateUnpaidMsg = "未清算データ";

    /// <summary>Cửa sổ 入金指定 (frm203027) — modAcc.cs:602, chỉ khi pNYUKIN.</summary>
    public const string NyukinMarker = "入金指定額";

    /// <summary>Đích cuối của cây quyết định 会計 — ngoài phạm vi luồng này.</summary>
    public const string ChgAccDataMsg = "計上しますか";

    public sealed record Seen(string Text, string Answered, IReadOnlyList<string> Buttons)
    {
        public override string ToString() =>
            $"「{Text}」 nút=[{string.Join(", ", Buttons)}] → bấm 「{Answered}」";
    }

    public sealed record Walk(IReadOnlyList<Seen> Trail, bool SawCreateUnpaid, string Explain);

    /// <summary>
    /// Bấm F8 rồi đi hết chuỗi, luôn chọn nhánh TẠO 未精算.
    ///
    /// <para>Dừng khi hết hộp thoại, hoặc khi gặp 会計データ修正 (không trả lời — nó sửa
    /// sổ tiền, ngoài phạm vi). Trần 8 vòng: chạm trần nghĩa là nghi vòng lặp, và bỏ
    /// chạy còn hơn bấm mãi vào sổ tiền.</para>
    /// </summary>
    public static Walk PressF8AndCreateUnpaid(OchaApp app, Window screen, TestTrace? trace = null)
    {
        var trail = new List<Seen>();
        var sawCreate = false;

        trace?.Step("bam F8 会計 (nhanh TAO 未精算)");
        AccountingFlow.TriggerAccounting(screen, trace);
        Waits.Step();

        for (var i = 0; i < 8; i++)
        {
            // ⚠️ ĐỪNG hỏi 「cửa sổ còn sống không」 ở đây.
            //
            // Bản đầu viết `var owner = Alive(screen) ? screen : null;` và TREO CỨNG:
            // Alive() đọc thuộc tính của frm203002 ĐÚNG LÚC luồng UI của nó đang bị
            // MessageBox chặn. Đó là cái bẫy ghi ngay đầu ModalDialogs — đọc thuộc tính
            // của cửa sổ bị chặn thì hoặc ném, hoặc treo. Đo thật 2026-08-26: chuỗi
            // dừng ngay sau khi bấm F8, hộp thoại 処置データチェック nằm im trên màn hình
            // không ai bấm, và fixture chạy tới hết trần giờ.
            //
            // Truyền thẳng `screen`: ModalDialogs.All đi đường 1 là
            // `owner.ModalWindows` — API dành đúng cho trường hợp cửa sổ chủ đang bị
            // modal chặn, hỏi cửa sổ chủ chứ không quét desktop.
            var dialog = Waits.TryFor(() => ModalDialogs.All(app, screen).FirstOrDefault(),
                                      TimeSpan.FromSeconds(i == 0 ? 30 : 6));
            if (dialog is null)
                return new Walk(trail, sawCreate,
                    trail.Count == 0
                        ? "F8 không mở hộp thoại nào — thường là 処置 khớp hệt 会計 đã chốt " +
                          "(modAcc.cs:571 trả về ngay)."
                        : "chuỗi F8 kết thúc.");

            var text = Txt.N(Dialogs.TextOf(dialog));
            var buttons = ButtonsOf(dialog);
            trace?.Note($"hop thoai [{trail.Count + 1}]: 「{text}」 nut=[{string.Join(", ", buttons)}]");
            trace?.Shot($"hop-thoai-{trail.Count + 1}");

            // 会計データ修正 — KHÔNG trả lời: nó sửa ACCDAT/PERSON_EXP.
            if (Txt.Has(text, ChgAccDataMsg))
            {
                Dialogs.ClickButton(dialog, "いいえ", "No", "キャンセル", "Cancel");
                trail.Add(new Seen(text, "いいえ (ngoai pham vi)", buttons));
                return new Walk(trail, sawCreate,
                    "tới 会計データ修正 — luồng này không trả lời, đó là việc của " +
                    "ParityAccountingCorrection.");
            }

            // 入金指定: ở đây nằm TRÊN đường đúng (khác AccountingFlow, nơi nó là dấu
            // hiệu đi nhầm). Nhãn nút gộp hai dòng 「F1\n指定なし」 nên phải so CHỨA.
            if (Txt.Has(text, NyukinMarker))
            {
                var ok = Dialogs.ClickButtonContaining(dialog, "指定なし", "登録", "OK");
                trail.Add(new Seen(text, ok ? "指定なし/登録" : "(KHONG BAM DUOC)", buttons));
                if (!ok)
                    return new Walk(trail, sawCreate,
                        "cửa sổ 入金指定 không có nút nào trong [指定なし, 登録, OK] — xem ảnh " +
                        "chụp rồi bổ sung nhãn thật.");
                Waits.Step();
                continue;
            }

            var (names, why) = RuleFor(text);
            trace?.Note($"  -> tra loi 「{names[0]}」 ({why})");

            if (!Dialogs.ClickButton(dialog, names))
            {
                trail.Add(new Seen(text, "(KHONG BAM DUOC)", buttons));
                return new Walk(trail, sawCreate,
                    $"không có nút nào trong [{string.Join(", ", names)}] trên hộp thoại cuối.");
            }

            if (Txt.Has(text, CreateUnpaidMsg)) sawCreate = true;
            trail.Add(new Seen(text, names[0], buttons));
            Waits.Step();
        }

        return new Walk(trail, sawCreate, "chạm trần 8 hộp thoại — nghi vòng lặp, dừng lại.");
    }

    /// <summary>
    /// Luật trả lời. <b>Thứ tự là một phần của luật — cụ thể trước, chung chung sau.</b>
    ///
    /// <para>Câu 「既に…未清算データ(…)を作成してよろしいですか?」 chứa CẢ 「よろしいですか」
    /// lẫn 「されています」, nên nếu để luật chung đứng trước thì nó bị nuốt và trả lời
    /// sai — đúng cái bẫy mà <see cref="AccountingFlow"/> đã ghi lại.</para>
    /// </summary>
    private static (string[] Names, string Why) RuleFor(string text)
    {
        // 1. TẠO 未精算 — はい. Đây là mục tiêu của cả luồng.
        if (Txt.Has(text, CreateUnpaidMsg))
            return (["はい", "Yes"],
                    "はい ⇒ past_billing_amount = 0 ⇒ nhánh tạo 未精算 (modAcc.cs:566/598)");

        // 2. 処置 chưa lưu — いいえ (RestoreData), để TRNTRN không lệch.
        if (Txt.Has(text, SaveQuestionMsg))
            return (["いいえ", "No"], "いいえ ⇒ RestoreData, không ghi TRNTRN");

        // 3. Cổng ngày — OK để đi tiếp (Cancel là bỏ cuộc).
        if (Txt.Has(text, DateGateMsg))
            return (["OK", "はい", "Yes"], "OK ⇒ đi tiếp qua cổng ngày");

        // 4. 処置データチェック — OK để đi tiếp.
        if (Txt.Has(text, PreCheckMsg))
            return (["OK", "はい", "Yes"], "OK ⇒ bỏ qua cảnh báo チェック");

        // 5. Lạ: phủ định cho an toàn. Hộp thoại kiểu 「…続けますか」 phải có luật riêng
        //    ở trên — phủ định với chúng là bỏ cuộc, không phải an toàn.
        return (["いいえ", "No", "キャンセル", "Cancel", "OK"],
                "KHÔNG khớp luật nào — trả lời phủ định");
    }

    public static IReadOnlyList<string> ButtonsOf(Window d)
    {
        try
        {
            return d.FindAllDescendants(cf =>
                       cf.ByControlType(FlaUI.Core.Definitions.ControlType.Button))
                   .Select(b => Txt.N(Uia.NameOf(b)).Replace("&", ""))
                   .Where(n => n.Length > 0)
                   .ToList();
        }
        catch { return []; }
    }
}
