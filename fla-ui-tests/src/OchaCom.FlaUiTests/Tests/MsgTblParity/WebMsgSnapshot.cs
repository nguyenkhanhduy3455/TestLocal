namespace OchaCom.FlaUiTests.Tests.MsgTblParity;

/// <summary>Một mã web định nghĩa, kèm chuỗi và chữ ký của nó.</summary>
/// <param name="Code">Mã thông báo.</param>
/// <param name="Template">Literal bên web, tham số đã đổi về <c>{0}</c> để so với row DB.</param>
/// <param name="Arity">Số tham số của hàm bên web.</param>
/// <param name="Line">Dòng trong <c>ja-msgtbl.ts</c> lúc chụp.</param>
/// <param name="Note">Ghi chú, để trống nếu không có gì đặc biệt.</param>
public sealed record WebMsg(string Code, string Template, int Arity, int Line, string Note = "");

/// <summary>Một chuỗi SAI mà bản web từng dùng — không được phép quay lại.</summary>
public sealed record WebRegression(string Code, string WrongTemplate);

/// <summary>
/// Ảnh chụp <c>apps/web-tenant/src/shared/locales/ja-msgtbl.ts</c> — 40 mã — đặt cạnh
/// bảng <c>MSGTBL</c> thật.
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// TÌNH TRẠNG: 40/40 KHỚP (2026-09-15, sau commit ce245472d)
/// ═══════════════════════════════════════════════════════════════════════════════
/// Bản chụp trước (2026-09-15 sáng) ghi 24 khớp / 16 lệch. Commit
/// <c>ce245472d fix(web-tenant): MSGTBL 実行 DB と一致しない 16 件の文言を行の値に戻す</c>
/// đã đưa cả 16 mã về đúng giá trị row. <b>Phần CHỮ và phần MÃ nay không còn lệch.</b>
///
/// <para>Phần <b>HÀNH VI</b> thì chưa: số nút, nút mặc định, và những hộp thoại bản web
/// có mà WinForm không có. Xem <c>MsgTblCallSiteTests</c> (Q00049 mặc định Cancel) và
/// <c>MsgTblReferralTests.TCR4</c> (紹介状 lưu/xoá im lặng).</para>
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// VÌ SAO CHÉP LITERAL VÀO ĐÂY THAY VÌ ĐỌC FILE .ts
/// ═══════════════════════════════════════════════════════════════════════════════
/// Máy chạy FlaUI (<c>ochacom-win</c>) KHÔNG có repo web — nó chỉ có app WinForm và
/// SQL Server. Đọc file <c>.ts</c> lúc chạy sẽ biến mọi testcase ở đây thành
/// 「Ignore vì không thấy file」 trên đúng cái máy cần chạy chúng.
///
/// ─── Chụp lúc nào ───────────────────────────────────────────────────────────────
/// 2026-09-15, nhánh <c>demo1</c> của <c>ochacom-saas</c>, tại commit <c>ce245472d</c>.
/// Đối chiếu với <c>SIM2000.MSGTBL</c> — 140 row.
/// </summary>
public static class WebMsgSnapshot
{
    public const string SourceFile = "apps/web-tenant/src/shared/locales/ja-msgtbl.ts";
    public const string SourceBranch = "demo1";
    public const string SourceCommit = "ce245472d";
    public const string TakenOn = "2026-09-15";

    /// <summary>Số row của MSGTBL lúc chụp — lệch nghĩa là đang nói chuyện với bảng khác.</summary>
    public const int MsgTblRowCount = 140;

    /// <summary>Cả 40 mã web định nghĩa. Nay tất cả đều khớp MSGTBL từng ký tự.</summary>
    public static readonly IReadOnlyList<WebMsg> Matching =
    [
        new("E00001", "{0}が入力されていません。", 1, 30, ""),
        new("E00002", "{0}が間違っています。", 1, 39, ""),
        new("E00003", "該当データがありません。", 0, 44, ""),
        new("E00005", "{0}が登録されていません。", 1, 53, ""),
        new("E00007", "データが選択されていません。", 0, 65, ""),
        new("E00008", "{0}は既に登録されています。", 1, 70, ""),
        new("E00010", "苗字と名前の間に空白が必要です。", 0, 72, ""),
        new("E00012", "氏名（漢字）の文字数が越えています。全角で20文字、半角で40文字までです。", 0, 74, ""),
        new("E00013", "初回来院日より古い日付が診療開始日に入力されています。", 0, 81, ""),
        new("E00016", "年齢が１６歳未満で社保の本人になっています。", 0, 83, ""),
        new("E00017", "年齢が１６歳未満で退職者の本人になっています。", 0, 85, ""),
        new("E00018", "保険種別が「社保、国保、社・退、国・退、後期高齢者」の場合、保険情報を選択してください。", 0, 87, ""),
        new("E00019", "保険種別が「公・単」の場合、公費情報を選択してください。", 0, 90, ""),
        new("E00021", "{0}が選択されていません。", 1, 102, ""),
        new("E00022", "{0}の文字数が越えています。", 1, 104, ""),
        new("E00026", "{0}に失敗しました。", 1, 110, ""),
        new("E00027", "{0}を特定出来ません。{0}を選択して下さい。", 1, 119, ""),
        new("E00035", "範囲選択する場合は、連続して選択して下さい。", 0, 121, ""),
        new("E00052", "高齢者の設定に誤りがあります。", 0, 123, ""),
        new("E00100", "msg", 1, 128, ""),
        new("I00001", "登録が完了しました。", 0, 211, ""),
        new("I00002", "更新が完了しました。", 0, 217, ""),
        new("I00003", "削除が完了しました。", 0, 223, ""),
        new("I00004", "明細入力は不要です。", 0, 225, ""),
        new("I00005", "{0}が完了しました。", 1, 230, ""),
        new("Q00001", "登録してよろしいですか？", 0, 132, ""),
        new("Q00002", "更新してよろしいですか？", 0, 134, ""),
        new("Q00003", "削除してよろしいですか？", 0, 136, ""),
        new("Q00004", "{0}終了してよろしいですか？", 1, 141, ""),
        new("Q00005", "{0}は既に登録されています。更新してよろしいですか？", 1, 149, ""),
        new("Q00006", "選択されている{0}を削除します。よろしいですか？", 1, 154, ""),
        new("Q00009", "{0}が入力されていません。今日の日付にしてよろしいですか？", 1, 161, ""),
        new("Q00010", "{0}が入力されていません。診療開始日の日付にしてよろしいですか？", 1, 168, ""),
        new("Q00012", "{0}歳以上で、保険者番号が入力されていません。生保後期高齢者ですか？「はい」を押すと生保後期高齢者、「いいえ」を押すと後期高齢者、「キャンセル」で保留します。", 1, 170, ""),
        new("Q00013", "{0}歳以上で、高齢者の指定がされていません。高齢者ですか？「はい」を押すと高齢者、「いいえ」で保留します。", 1, 174, ""),
        new("Q00014", "有効期限が切れています。このままでよろしいですか？", 0, 178, ""),
        new("Q00019", "印刷してよろしいですか？", 0, 180, ""),
        new("Q00039", "{0}プリンタに用紙をセットしてください。", 1, 189, ""),
        new("Q00047", "CSV出力してよろしいですか？", 0, 194, ""),
        new("Q00049", "{0}の会計データを一括作成します。既に入力済の会計データは全て上書きされます。実行してよろしいですか？", 1, 205, ""),    ];

    /// <summary>
    /// 16 chuỗi SAI mà bản web dùng trước commit <c>ce245472d</c>.
    ///
    /// <para>Giữ lại để làm lưới chặn hồi quy: thấy bất kỳ chuỗi nào ở đây quay lại
    /// nghĩa là bản sửa bị revert, hoặc ai đó "sửa lại cho xuôi tai" mà không biết row
    /// DB mới là nguồn. <c>MsgTblParityTests.TCM2</c> canh đúng việc đó.</para>
    /// </summary>
    public static readonly IReadOnlyList<WebRegression> PreviouslyWrong =
    [
        new("E00003", "該当するデータがありません。"),
        new("E00007", "選択するデータがありません。"),
        new("E00010", "氏名は姓名を空白で区切って入力してください。"),
        new("E00012", "氏名（漢字）の桁数が長すぎます。"),
        new("E00016", "16歳未満は社保・本人で登録できません。"),
        new("E00017", "16歳未満は退職者保険・本人で登録できません。"),
        new("E00018", "保険情報が紐付いていません。保険証情報を入力してください。"),
        new("E00019", "公費情報が紐付いていません。公費情報を入力してください。"),
        new("E00022", "{0}の桁数が長すぎます。"),
        new("E00052", "退職者保険では高齢者区分を指定できません。"),
        new("Q00004", "{0}終了します。よろしいですか？"),
        new("Q00012", "{0}歳以上で、保険証番号が入力されていません。生保後期高齢者ですか？"),
        new("Q00013", "{0}歳以上で、高齢者の指定がされていません。高齢者ですか？"),
        new("Q00014", "有効期限が過ぎています。このまま登録してよろしいですか？"),
        new("Q00039", "用紙をセットして下さい。"),
        new("Q00049", "{0}の会計データを作成します。よろしいですか？"),    ];

    /// <summary>Mọi mã web định nghĩa = 40.</summary>
    public static IEnumerable<string> AllCodes => Matching.Select(m => m.Code);

    /// <summary>Khuôn bên web của một mã; không có thì null.</summary>
    public static string? Template(string code) =>
        Matching.FirstOrDefault(m => m.Code == code)?.Template;

    /// <summary>
    /// Chuỗi bản web sẽ hiện với tham số đó — để so THẲNG với chữ trên hộp thoại WinForm.
    ///
    /// <para>So ở mức đã render chứ không ở mức khuôn, vì cùng một mã hai call-site truyền
    /// nhãn khác nhau (E00002 ở tab 個別 là 「個別入力のコード」, ở 患者登録 là 「保険者番号」).</para>
    /// </summary>
    public static string Render(string code, string para = "")
    {
        var template = Template(code)
                       ?? throw new InvalidOperationException($"bản web không định nghĩa {code}.");
        return template.Contains("{0}", StringComparison.Ordinal)
            ? template.Replace("{0}", para, StringComparison.Ordinal)
            : template + para;
    }
}
