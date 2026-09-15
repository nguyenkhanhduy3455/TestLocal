namespace OchaCom.FlaUiTests.Tests.MsgTblParity;

/// <summary>Một mã mà bản web ĐANG khớp MSGTBL — dùng làm ĐỐI CHỨNG.</summary>
/// <param name="Code">Mã thông báo.</param>
/// <param name="Template">Literal bên web, tham số đã đổi về <c>{0}</c> để so với row DB.</param>
/// <param name="Arity">Số tham số của hàm bên web.</param>
/// <param name="Line">Dòng trong <c>ja-msgtbl.ts</c> lúc chụp.</param>
/// <param name="Note">Ghi chú, để trống nếu không có gì đặc biệt.</param>
public sealed record WebMsg(string Code, string Template, int Arity, int Line, string Note = "");

/// <summary>Một mã mà bản web ĐANG LỆCH MSGTBL, kèm chuỗi DB đo được lúc chụp.</summary>
public sealed record WebDiff(
    string Code,
    string WebTemplate,
    string DbTemplate,
    int Arity,
    int Line,
    string Why);

/// <summary>
/// Ảnh chụp <c>apps/web-tenant/src/shared/locales/ja-msgtbl.ts</c> — 40 mã mà bản web
/// định nghĩa — đặt cạnh chuỗi MSGTBL đo được CÙNG LÚC.
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// VÌ SAO CHÉP LITERAL VÀO ĐÂY THAY VÌ ĐỌC FILE .ts
/// ═══════════════════════════════════════════════════════════════════════════════
/// Máy chạy FlaUI (<c>ochacom-win</c>) KHÔNG có repo web — nó chỉ có app WinForm và
/// SQL Server. Đọc file <c>.ts</c> lúc chạy sẽ biến mọi testcase ở đây thành
/// 「Ignore vì không thấy file」 trên đúng cái máy cần chạy chúng. Và Luật 1 của repo
/// cấm ghi test vào source app, nhưng ĐỌC thì được — đó là việc đã làm để chụp bảng này.
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// ĐÂY LÀ TEST 「KHOÁ HIỆN TRẠNG」 (characterization), KHÔNG PHẢI TEST ĐỎ SẴN
/// ═══════════════════════════════════════════════════════════════════════════════
/// <see cref="Diverging"/> ghi lại 16 mã ĐANG lệch. <see cref="MsgTblParityTests"/> khẳng
/// định chúng lệch ĐÚNG NHƯ ĐÃ ĐO — nên hôm nay cả fixture XANH, và nó chuyển ĐỎ ngay khi
/// một trong hai vế đổi:
///
/// <list type="bullet">
///   <item><description>web sửa xong một mã ⇒ testcase đỏ và bảo 「chuyển mã này sang
///     <see cref="Matching"/>」 — tức là nó nhắc cập nhật bảng, không phải báo lỗi mới;</description></item>
///   <item><description>row MSGTBL đổi (đổi master, trỏ nhầm sang DB khác như
///     <c>SIM2025</c>) ⇒ đỏ kèm cả hai chuỗi.</description></item>
/// </list>
///
/// <para>Một bộ test đỏ vĩnh viễn thì sau hai ngày không ai đọc nữa. Bộ này xanh, và chỉ
/// kêu khi có thứ thật sự thay đổi.</para>
///
/// ─── Chụp lúc nào ───────────────────────────────────────────────────────────────
/// 2026-09-15, nhánh <c>demo1</c> của <c>ochacom-saas</c>, sau commit
/// <c>1e5afabb7 fix(web-tenant): MSGTBL のコード取り違えと文言のずれを legacy に合わせる</c>
/// (commit đó đã sửa 6 mã: E00013, E00021, Q00009, Q00010, I00002, +I00003, và gỡ E00020).
/// Đối chiếu với <c>SIM2000.MSGTBL</c> — 140 row.
/// </summary>
public static class WebMsgSnapshot
{
    public const string SourceFile = "apps/web-tenant/src/shared/locales/ja-msgtbl.ts";
    public const string SourceBranch = "demo1";
    public const string SourceCommit = "1e5afabb7";
    public const string TakenOn = "2026-09-15";

    /// <summary>Số row của MSGTBL lúc chụp — lệch nghĩa là đang nói chuyện với bảng khác.</summary>
    public const int MsgTblRowCount = 140;

    /// <summary>24 mã web đang khớp MSGTBL từng ký tự. ĐỐI CHỨNG của cả bộ.</summary>
    public static readonly IReadOnlyList<WebMsg> Matching =
    [
        new("E00001", "{0}が入力されていません。", 1, 25, ""),
        new("E00002", "{0}が間違っています。", 1, 34, ""),
        new("E00005", "{0}が登録されていません。", 1, 48, ""),
        new("E00008", "{0}は既に登録されています。", 1, 60, ""),
        new("E00013", "初回来院日より古い日付が診療開始日に入力されています。", 0, 71, "Đã sửa ở commit 1e5afabb7."),
        new("E00021", "{0}が選択されていません。", 1, 91, "Đã sửa ở commit 1e5afabb7."),
        new("E00026", "{0}に失敗しました。", 1, 99, ""),
        new("E00027", "{0}を特定出来ません。{0}を選択して下さい。", 1, 108, "Row DB có {0} XUẤT HIỆN HAI LẦN; web nhận 1 tham số và nội suy 2 chỗ ⇒ khớp."),
        new("E00035", "範囲選択する場合は、連続して選択して下さい。", 0, 110, ""),
        new("E00100", "msg", 1, 117, "Web là hàm đồng nhất (msg) => msg; row DB đúng bằng 「{0}」 ⇒ hai vế cho CÙNG kết quả với mọi tham số."),
        new("I00001", "登録が完了しました。", 0, 193, ""),
        new("I00002", "更新が完了しました。", 0, 200, "Đã sửa ở commit 1e5afabb7 (trước đó giữ chữ của nhánh XOÁ)."),
        new("I00003", "削除が完了しました。", 0, 207, "Mã mới thêm ở commit 1e5afabb7 — trước đó web không có, nên nhánh 削除 gọi nhầm I00002."),
        new("I00004", "明細入力は不要です。", 0, 209, ""),
        new("I00005", "{0}が完了しました。", 1, 214, ""),
        new("Q00001", "登録してよろしいですか？", 0, 121, ""),
        new("Q00002", "更新してよろしいですか？", 0, 123, ""),
        new("Q00003", "削除してよろしいですか？", 0, 125, ""),
        new("Q00005", "{0}は既に登録されています。更新してよろしいですか？", 1, 138, ""),
        new("Q00006", "選択されている{0}を削除します。よろしいですか？", 1, 143, ""),
        new("Q00009", "{0}が入力されていません。今日の日付にしてよろしいですか？", 1, 150, "Đã sửa ở commit 1e5afabb7."),
        new("Q00010", "{0}が入力されていません。診療開始日の日付にしてよろしいですか？", 1, 157, "Đã sửa ở commit 1e5afabb7."),
        new("Q00019", "印刷してよろしいですか？", 0, 165, ""),
        new("Q00047", "CSV出力してよろしいですか？", 0, 180, ""),    ];

    /// <summary>16 mã web đang LỆCH MSGTBL, kèm chuỗi DB đo được cùng lúc.</summary>
    public static readonly IReadOnlyList<WebDiff> Diverging =
    [
        new("E00003", "該当するデータがありません。", "該当データがありません。", 0, 39,
            "Web thêm 「する」. Cùng nghĩa nhưng KHÁC chữ; MSGTBL là bản gốc (frm203042.cs:225 検索 0 件)."),
        new("E00007", "選択するデータがありません。", "データが選択されていません。", 0, 55,
            "Web đang giữ BODY của E00100 tại frm201045.cs:298 — ShowWarningMsg(\"E00100\", \"選択するデータがありません。\") — chứ không phải row E00007."),
        new("E00010", "氏名は姓名を空白で区切って入力してください。", "苗字と名前の間に空白が必要です。", 0, 62,
            "Web viết lại hoàn toàn câu; DB nói 「苗字と名前の間に空白が必要です。」."),
        new("E00012", "氏名（漢字）の桁数が長すぎます。", "氏名（漢字）の文字数が越えています。全角で20文字、半角で40文字までです。", 0, 64,
            "Web CẮT MẤT vế giới hạn cụ thể 「全角で20文字、半角で40文字までです。」 — người dùng mất con số để sửa."),
        new("E00016", "16歳未満は社保・本人で登録できません。", "年齢が１６歳未満で社保の本人になっています。", 0, 73,
            "DB dùng số TOÀN GIÁC 「１６歳」 và diễn đạt theo trạng thái (「…になっています。」), web diễn đạt theo lệnh cấm."),
        new("E00017", "16歳未満は退職者保険・本人で登録できません。", "年齢が１６歳未満で退職者の本人になっています。", 0, 75,
            "Như E00016; DB ghi 「退職者の本人」 chứ không phải 「退職者保険・本人」."),
        new("E00018", "保険情報が紐付いていません。保険証情報を入力してください。", "保険種別が「社保、国保、社・退、国・退、後期高齢者」の場合、保険情報を選択してください。", 0, 77,
            "DB liệt kê ĐỦ 5 loại bảo hiểm 「社保、国保、社・退、国・退、後期高齢者」; web thay bằng câu tự viết 「紐付いていません」."),
        new("E00019", "公費情報が紐付いていません。公費情報を入力してください。", "保険種別が「公・単」の場合、公費情報を選択してください。", 0, 79,
            "DB nêu điều kiện 「保険種別が「公・単」の場合」; web thay bằng 「紐付いていません」."),
        new("E00022", "{0}の桁数が長すぎます。", "{0}の文字数が越えています。", 1, 93,
            "DB 「文字数が越えています」, web 「桁数が長すぎます」 — cùng cặp chữ bị đổi như E00012."),
        new("E00052", "退職者保険では高齢者区分を指定できません。", "高齢者の設定に誤りがあります。", 0, 112,
            "DB là câu CHUNG 「高齢者の設定に誤りがあります。」 dùng cho mọi nhánh; web thu hẹp thành riêng 退職者保険."),
        new("Q00004", "{0}終了します。よろしいですか？", "{0}終了してよろしいですか？", 1, 130,
            "DB 「{0}終了してよろしいですか？」 một vế; web tách thành hai câu 「{0}終了します。よろしいですか？」."),
        new("Q00012", "{0}歳以上で、保険証番号が入力されていません。生保後期高齢者ですか？", "{0}歳以上で、保険者番号が入力されていません。生保後期高齢者ですか？「はい」を押すと生保後期高齢者、「いいえ」を押すと後期高齢者、「キャンセル」で保留します。", 1, 159,
            "HAI lỗi: (a) DB ghi 保険者番号 (mã cơ quan BH) còn web ghi 保険証番号 (số thẻ) — hai trường khác nhau; (b) web CẮT phần hướng dẫn 3 nút, trong khi frm201001.cs:2433 gọi ShowYesNoCancelMsg (3 nút) nên đó đúng là phần nói mỗi nút làm gì."),
        new("Q00013", "{0}歳以上で、高齢者の指定がされていません。高齢者ですか？", "{0}歳以上で、高齢者の指定がされていません。高齢者ですか？「はい」を押すと高齢者、「いいえ」で保留します。", 1, 161,
            "Web cắt phần hướng dẫn nút 「はい」→高齢者 /「いいえ」→保留; frm201001.cs:2463 là ShowYesNoMsg (2 nút)."),
        new("Q00014", "有効期限が過ぎています。このまま登録してよろしいですか？", "有効期限が切れています。このままでよろしいですか？", 0, 163,
            "DB 「有効期限が切れています。このままでよろしいですか？」; web đổi cả hai vế."),
        new("Q00039", "用紙をセットして下さい。", "{0}プリンタに用紙をセットしてください。", 0, 173,
            "Web bỏ HẲN tham số: row có {0} (tên máy in) và legacy CÓ truyền (frm203046.cs:156, CommonNikei.cs:272/329/343/359, frm305004.cs:462/541). Web còn cắt luôn cụm 「プリンタに」 ⇒ câu mất chỗ cần đặt giấy."),
        new("Q00049", "{0}の会計データを作成します。よろしいですか？", "{0}の会計データを一括作成します。既に入力済の会計データは全て上書きされます。実行してよろしいですか？", 1, 189,
            "Web cắt câu cảnh báo 「既に入力済の会計データは全て上書きされます」 — mất đúng thông tin nguy hiểm. frm203001.cs:430 truyền MessageBoxDefaultButton.Button2 (mặc định Cancel), tức legacy coi đây là thao tác nguy hiểm."),    ];

    /// <summary>Mọi mã web định nghĩa (khớp + lệch) = 40.</summary>
    public static IEnumerable<string> AllCodes =>
        Matching.Select(m => m.Code).Concat(Diverging.Select(d => d.Code));
}
