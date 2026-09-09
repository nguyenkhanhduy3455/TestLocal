using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;

namespace OchaCom.FlaUiTests.Infrastructure;

/// <summary>
/// Cấu hình cho cả bộ test. Nạp theo thứ tự ưu tiên TĂNG DẦN:
///   1. testsettings.json          (commit, giá trị chung)
///   2. testsettings.local.json    (gitignore, riêng từng máy)
///   3. biến môi trường OCHA_*     (ưu tiên cao nhất, tiện cho CI / chạy nhanh một lần)
///
/// Hai file JSON được DEEP MERGE (file local chỉ cần ghi những khoá muốn đè), nên
/// không phải chép nguyên file mẫu ra rồi sửa.
/// </summary>
public sealed class TestSettings
{
    [JsonPropertyName("app")] public AppSection App { get; set; } = new();
    [JsonPropertyName("login")] public LoginSection Login { get; set; } = new();
    [JsonPropertyName("patient")] public PatientSection Patient { get; set; } = new();
    [JsonPropertyName("db")] public DbSection Db { get; set; } = new();
    [JsonPropertyName("run")] public RunSection Run { get; set; } = new();
    [JsonPropertyName("parity")] public ParitySection Parity { get; set; } = new();
    [JsonPropertyName("inpP1")] public InpP1Section InpP1 { get; set; } = new();
    [JsonPropertyName("highNeeds")] public HighNeedsSection HighNeeds { get; set; } = new();
    [JsonPropertyName("sigaTooth")] public SigaToothSection SigaTooth { get; set; } = new();
    [JsonPropertyName("autoSantei")] public AutoSanteiSection AutoSantei { get; set; } = new();
    [JsonPropertyName("perioKensa")] public PerioKensaSection PerioKensa { get; set; } = new();
    [JsonPropertyName("visitList")] public VisitListSection VisitList { get; set; } = new();
    [JsonPropertyName("buiPrice")] public BuiPriceSection BuiPrice { get; set; } = new();
    [JsonPropertyName("karteCmt")] public KarteCmtSection KarteCmt { get; set; } = new();
    [JsonPropertyName("drugAmount")] public DrugAmountSection DrugAmount { get; set; } = new();
    [JsonPropertyName("drugPathB")] public DrugPathBSection DrugPathB { get; set; } = new();
    [JsonPropertyName("drugRowReload")] public DrugRowReloadSection DrugRowReload { get; set; } = new();
    [JsonPropertyName("locators")] public Dictionary<string, string> Locators { get; set; } = new();

    private static TestSettings? _current;

    /// <summary>Cấu hình dùng chung cho cả lần chạy (nạp một lần, cache lại).</summary>
    public static TestSettings Current => _current ??= Load();

    /// <summary>
    /// Đường dẫn THẬT của <c>testsettings.local.json</c> mà tiến trình test đang đọc,
    /// kèm chỗ nên tạo file.
    ///
    /// <para>Vì sao cần: file được đọc từ thư mục build ra
    /// (<c>bin\Debug\net8.0-windows\</c>), nhưng phải tạo ở thư mục NGUỒN thì csproj
    /// mới chép sang (<c>CopyToOutputDirectory=PreserveNewest</c>). Bảo người dùng
    /// "thêm vào testsettings.local.json" mà không nói chỗ nào là chỉ đường cho họ tạo
    /// nhầm chỗ rồi ngồi tự hỏi vì sao không ăn.</para>
    /// </summary>
    public static string LocalFileHint()
    {
        var effective = Path.Combine(AppContext.BaseDirectory, "testsettings.local.json");
        return $"Tạo file ở thư mục NGUỒN (csproj sẽ tự chép sang bin lúc build):\n" +
               $"    <thu-muc-project>\\src\\OchaCom.FlaUiTests\\testsettings.local.json\n" +
               $"  Tiến trình test đang đọc bản đã chép tại:\n" +
               $"    {effective}\n" +
               $"  (hiện {(File.Exists(effective) ? "CÓ" : "KHÔNG CÓ")} file này)";
    }

    public sealed class AppSection
    {
        /// <summary>Đường dẫn tuyệt đối tới exe khởi động (project MENU).</summary>
        [JsonPropertyName("exePath")] public string ExePath { get; set; } = "";
        [JsonPropertyName("workingDirectory")] public string WorkingDirectory { get; set; } = "";
        [JsonPropertyName("arguments")] public string[] Arguments { get; set; } = [];
        [JsonPropertyName("launchTimeoutSeconds")] public int LaunchTimeoutSeconds { get; set; } = 180;
        /// <summary>App đang mở sẵn thì bám vào tiến trình đó thay vì mở thêm cái nữa.</summary>
        [JsonPropertyName("attachIfRunning")] public bool AttachIfRunning { get; set; } = true;
        /// <summary>Đóng app khi test xong. Mặc định FALSE để còn soi lại màn hình khi đỏ.</summary>
        [JsonPropertyName("closeOnFinish")] public bool CloseOnFinish { get; set; }
        [JsonPropertyName("mainWindowTitleContains")] public string MainWindowTitleContains { get; set; } = "";
        [JsonPropertyName("treatmentWindowTitleContains")] public string TreatmentWindowTitleContains { get; set; } = "診療入力";
    }

    public sealed class LoginSection
    {
        [JsonPropertyName("enabled")] public bool Enabled { get; set; } = true;
        [JsonPropertyName("userId")] public string UserId { get; set; } = "";
        [JsonPropertyName("password")] public string Password { get; set; } = "";
    }

    public sealed class PatientSection
    {
        [JsonPropertyName("patNo")] public string PatNo { get; set; } = "";
        /// <summary>yyyy-MM-dd. Rỗng = hôm nay.</summary>
        [JsonPropertyName("trtDate")] public string TrtDate { get; set; } = "";

        /// <summary>
        /// Cách mở 診療入力 từ màn chọn bệnh nhân (frm203001):
        ///   "insert" — Enter ở ô 患者番号 / F9 初再診入力 (formParam.InpKbn = Insert). Đây là
        ///              đường người dùng đi hằng ngày, nhưng app sẽ tự hỏi 「初診を算定しますか？」
        ///              (watcher trả lời いいえ).
        ///   "update" — F8 閲覧/変更 (InpKbn = Update). Không tự tính 初再診 ⇒ ít hộp thoại hơn,
        ///              lưới vẫn sửa được. Đây là mặc định vì test không cần 初再診.
        /// </summary>
        [JsonPropertyName("openMode")] public string OpenMode { get; set; } = "update";

        public DateTime ResolvedTrtDate =>
            string.IsNullOrWhiteSpace(TrtDate)
                ? DateTime.Today
                : DateTime.ParseExact(TrtDate.Trim(), "yyyy-MM-dd", null);
    }

    public sealed class DbSection
    {
        [JsonPropertyName("enabled")] public bool Enabled { get; set; }
        [JsonPropertyName("connectionString")] public string ConnectionString { get; set; } = "";
        [JsonPropertyName("commandTimeoutSeconds")] public int CommandTimeoutSeconds { get; set; } = 60;
    }

    /// <summary>
    /// Bộ test parity — bộ DUY NHẤT bấm F9 登録 nên GHI THẬT xuống DB.
    /// Mặc định tắt: bật nhầm trên máy có dữ liệu thật là ghi đè cả 処置月.
    /// </summary>
    public sealed class ParitySection
    {
        /// <summary>Bắt buộc bật thì bộ parity mới chạy (tương đương TEST_ALLOW_SAVE=1 bên Playwright).</summary>
        [JsonPropertyName("allowSave")] public bool AllowSave { get; set; }

        /// <summary>処置 dùng để tạo một dòng đơn giản, KHÔNG cần chọn 部位. Mặc định 再診.</summary>
        [JsonPropertyName("simpleTrtCd")] public int SimpleTrtCd { get; set; } = 110;

        [JsonPropertyName("simpleTrtSb")] public int SimpleTrtSb { get; set; }

        /// <summary>
        /// Hạn chờ hộp thoại của luồng 登録, giây. Dài hơn <c>run.defaultTimeoutSeconds</c>
        /// rất nhiều là CÓ CHỦ Ý.
        ///
        /// <para>Khi MessageBox modal đang mở, luồng chính của app bị chặn bên trong
        /// <c>MessageBox.Show</c>. <c>Dialogs.Open()</c> duyệt mọi cửa sổ desktop và đọc
        /// ProcessId/ClassName của TỪNG cửa sổ — kể cả frm203002 đang bị chặn — nên mỗi
        /// lần đọc phải chờ hết timeout nội bộ của UIA. Một vòng poll vì thế tốn hàng
        /// giây, và 20s mặc định trôi qua chỉ sau vài vòng.</para>
        /// </summary>
        [JsonPropertyName("dialogTimeoutSeconds")] public int DialogTimeoutSeconds { get; set; } = 90;

        public TimeSpan DialogTimeout => TimeSpan.FromSeconds(DialogTimeoutSeconds);
    }

    /// <summary>
    /// Luồng <c>Tests/InpP1Dialogs</c> — ba dialog vừa được port sang web
    /// (Ｓｔｅｐ編集 / チェック項目設定 / Ｂｒサンプル).
    ///
    /// <para>Cờ riêng chứ không dùng chung <see cref="ParitySection.AllowSave"/>: hai
    /// luồng ghi vào những bảng KHÁC HẲN nhau về mức rủi ro. Parity ghi <c>TRNTRN</c> /
    /// <c>ACC_DAT</c> (処置行 và sổ tiền của cả tháng); luồng này ghi <c>TRTSTATE</c> của
    /// đúng một bệnh nhân và <c>chkprm</c>. Trộn hai cờ thì bật cái này là mở luôn cái kia.</para>
    ///
    /// <para>Tương đương <c>TEST_ALLOW_SAVE=1</c> bên bộ Playwright
    /// (<c>web-tenant-tests/tests/step-edit-dialog.spec.ts</c> +
    /// <c>inp-p1-ported-dialogs.spec.ts</c>).</para>
    /// </summary>
    /// <summary>
    /// Luồng <c>Tests/HighNeedsFreewd</c> — câu hỏi 歯科診療困難者加算 và ô ẩn
    /// <c>hFG1[72]</c> (= <c>TRNTRN.FREEWD</c>).
    /// </summary>
    public sealed class HighNeedsSection
    {
        /// <summary>
        /// Cho phép VÁ TẠM <c>insurance.dis_flg</c> = 3 rồi trả lại nguyên trạng.
        ///
        /// <para>Bắt buộc, vì câu hỏi chỉ bung ra khi <c>dis_flg == 3</c>
        /// (modSave.cs:3449, frm203016.cs:1097) mà DB đo ngày 2026-08-26 KHÔNG có
        /// bệnh nhân nào như vậy — chỉ 0 (16.322 bn) / 1 (2 bn) / 2 (14 bn). Đây là
        /// bản WinForm của <c>TEST_ALLOW_DIS_FLG_PATCH</c> bên Playwright
        /// (treatment-score-gettensu-parity.spec.ts:156).</para>
        ///
        /// <para>Tắt (mặc định) thì các testcase cần dis_flg 3 tự Ignore; nhóm đo
        /// 「KHÔNG được hỏi」 vẫn chạy vì nó dùng đúng dữ liệu thật.</para>
        /// </summary>
        [JsonPropertyName("allowDisFlgPatch")] public bool AllowDisFlgPatch { get; set; }

        /// <summary>
        /// Bệnh nhân đem mượn để vá <c>dis_flg</c>. Rỗng = dùng <c>patient.patNo</c>.
        ///
        /// <para>Vá THEO BỆNH NHÂN chứ không theo 枝番: một bệnh nhân có nhiều 枝番 và
        /// app đọc 枝番 còn hiệu lực tại 診療日 (<c>modPat.GetValidSubCode2</c>) — vá
        /// trúng 枝番 khác là testcase đỏ oan. Bên Playwright đã dính đúng bẫy này
        /// (bệnh nhân 1 có 5 枝番, vá trúng 枝番 hiệu lực năm 2020).</para>
        /// </summary>
        [JsonPropertyName("borrowPatNo")] public string BorrowPatNo { get; set; } = "";

        /// <summary>
        /// Cho phép bấm F9 登録 để đọc <c>TRNTRN.FREEWD</c> đã ghi xuống.
        ///
        /// <para>Cột 72 là cột ẨN — UI không vẽ nó, nên đường DUY NHẤT nhìn thấy giá
        /// trị là lưu xuống rồi đọc DB (<c>modSave.cs:321</c>). F9 ghi lại TOÀN BỘ
        /// 処置行 của tháng, nên tách khỏi <c>parity.allowSave</c>: hai luồng đụng
        /// vào những bảng khác nhau và có mức rủi ro khác nhau.</para>
        /// </summary>
        [JsonPropertyName("allowSave")] public bool AllowSave { get; set; }
    }

    public sealed class InpP1Section
    {
        /// <summary>
        /// Cho phép bấm F9 để GHI THẬT <c>TRTSTATE</c> / <c>chkprm</c>. Mặc định tắt;
        /// tắt thì các testcase ghi tự Ignore, phần chỉ-đọc vẫn chạy.
        /// </summary>
        [JsonPropertyName("allowSave")] public bool AllowSave { get; set; }

        /// <summary>
        /// Hai răng của vùng 左上 dùng để tìm mẫu Br (nhánh CÓ mẫu khớp).
        /// LU răng N nằm ở bui index 8+(N-1) ⇒ vị trí 1-based 9+(N-1).
        /// </summary>
        [JsonPropertyName("brTeeth")] public int[] BrTeeth { get; set; } = [5, 6];

        /// <summary>
        /// Cặp răng KHÔNG có mẫu Br nào (nhánh 該当なし). Cầu nối răng cửa giữa (1) với
        /// răng khôn (8) là vô lý về nha khoa nên <c>BrSample</c> không có dòng nào.
        /// </summary>
        [JsonPropertyName("brNoMatchTeeth")] public int[] BrNoMatchTeeth { get; set; } = [1, 8];
    }

    /// <summary>
    /// Luồng <c>Tests/SigaToothStatus</c> — 自歯状況 (<c>SIGA</c>) và 根数 (<c>KON</c>):
    /// <c>SigaChg</c> / <c>DelExtRec</c> / <c>Chk_PModeKesson</c> / <c>SigaChg_Save</c>.
    ///
    /// <para>Cờ RIÊNG, không dùng chung <see cref="ParitySection.AllowSave"/>: luồng này
    /// ghi vào HAI bảng mà không luồng nào khác đụng tới (<c>SIGA</c>, <c>KON</c>), và
    /// nó ghi <b>ngay lúc nhập</b> chứ không đợi F9 — chính đó là thứ đang đo. Trộn cờ
    /// thì bật parity là mở luôn đường ghi 歯式.</para>
    ///
    /// <para>Tương đương <c>TEST_ALLOW_SAVE=1</c> của ba spec Playwright:
    /// <c>tooth-extraction-siga-restore</c>, <c>siga-kon-remaining-gaps</c>,
    /// <c>p-mode-kesson-siga</c>.</para>
    /// </summary>
    public sealed class SigaToothSection
    {
        /// <summary>
        /// Cho phép GHI: đặt 歯式 về mốc xuất phát, khôi phục ảnh chụp, và bấm F9 登録.
        /// Mặc định tắt ⇒ cả ba fixture tự Ignore trước khi mở app.
        /// </summary>
        [JsonPropertyName("allowSave")] public bool AllowSave { get; set; }

        /// <summary>
        /// Ô 部位 (0-based) đem thử cho 永久歯. Mặc định 10 = 左上3 ⇒ cột <c>se11</c> /
        /// <c>ekon11</c> — đúng ô mà cả ba spec Playwright dùng.
        /// </summary>
        [JsonPropertyName("permBuiSlot")] public int PermBuiSlot { get; set; } = 10;

        /// <summary>
        /// Ô 部位 (0-based) đem thử cho 乳歯. Mặc định 6 = 右上Ｂ ⇒ cột <c>sn4</c>
        /// (<c>i &lt; 16 ⇒ i-2</c>, modSave.cs:995).
        /// </summary>
        [JsonPropertyName("milkBuiSlot")] public int MilkBuiSlot { get; set; } = 6;

        /// <summary>
        /// Ô 部位 (0-based) ĐỐI CHỨNG — không bao giờ được đụng tới. Mặc định 18 = 右下8
        /// ⇒ cột <c>se19</c>.
        /// </summary>
        [JsonPropertyName("controlBuiSlot")] public int ControlBuiSlot { get; set; } = 18;

        /// <summary>
        /// Cho phép XOÁ các dòng 処置 mà chính lượt chạy để lại (<c>trt_cd</c> 179/122/185
        /// trong tháng test). Chỉ chạy khi tháng đó KHÔNG có sẵn dòng nào mang các mã ấy
        /// trước lượt chạy — xem <c>SigaKonDb.CleanupTestRows</c>.
        /// </summary>
        [JsonPropertyName("allowRowCleanup")] public bool AllowRowCleanup { get; set; } = true;
    }

    /// <summary>
    /// Luồng <c>Tests/AutoSanteiChkAuto</c> — 自動算定 (bảng <c>chkauto</c>):
    /// <c>ModMain.Chk_ChkAuto</c> tự chèn tối đa 5 処置 đi kèm ngay khi Enter ô 回
    /// (frm203002.cs:5752 → modMain.cs:812).
    ///
    /// <para>Cờ RIÊNG, không dùng chung <see cref="SigaToothSection.AllowSave"/>: ở đây
    /// 歯式 KHÔNG phải thứ đang đo, nó chỉ là tiền đề — răng phải là 現存 thì
    /// <c>ChkSiga</c> mới cho 抜歯 đi qua. Trộn cờ thì bật luồng này là mở luôn đường ghi
    /// của luồng kia.</para>
    /// </summary>
    public sealed class AutoSanteiSection
    {
        /// <summary>
        /// Cho phép GHI <c>SIGA</c>: đặt răng đem thử về 現存 TRƯỚC KHI APP MỞ, và khôi
        /// phục ảnh chụp ở <c>OneTimeTearDown</c>. Chỉ nhóm 抜歯 cần — mã 179 đi qua
        /// <c>frm203016.SigaChg</c> nên mỗi lượt chốt là một 「update Siga」 thật
        /// (frm203016.cs:1032-1035). Mặc định tắt ⇒ fixture đó tự Ignore trước khi mở app.
        /// </summary>
        [JsonPropertyName("allowSave")] public bool AllowSave { get; set; }

        /// <summary>
        /// 処置 ĐEM THỬ — mặc định 179/2 抜歯手術(臼歯), đúng ca trong báo cáo lệch parity.
        /// <c>chkauto(179,2)</c> → <c>cd1 = 310 / sb1 = 2</c> (OA+ｵｰﾗ注歯科用ｶｰﾄﾘｯｼﾞ 1.8mL).
        /// </summary>
        [JsonPropertyName("trtCd")] public int TrtCd { get; set; } = 179;

        /// <summary>枝番 của <see cref="TrtCd"/>.</summary>
        [JsonPropertyName("trtSb")] public int TrtSb { get; set; } = 2;

        /// <summary>
        /// 処置 ĐỐI CHỨNG — cùng đường nhập (cùng răng, cùng 病名), nhưng KHÔNG có dòng nào
        /// trong <c>chkauto</c>. Mặc định 171/0 感染根管処置(単根): cùng họ <c>acc_unit = 9</c>
        /// với 170 抜髄 (mã CÓ chkauto), và KHÔNG nằm trong switch của
        /// <c>frm203016.IregCodChk</c> nên không ghi 歯式.
        ///
        /// <para>Không có ô đối chứng này thì 「lưới dài thêm một dòng」 chẳng chứng minh
        /// được gì: mọi lượt nhập đều làm lưới dài thêm.</para>
        /// </summary>
        [JsonPropertyName("controlTrtCd")] public int ControlTrtCd { get; set; } = 171;

        /// <summary>枝番 của <see cref="ControlTrtCd"/>.</summary>
        [JsonPropertyName("controlTrtSb")] public int ControlTrtSb { get; set; }

        /// <summary>
        /// 病名 đăng ký ở 病名選択 cho 部位病名行. Mặc định 100 = Ｃ — đúng 病名 của dòng
        /// 「6 (1) Ｃ₂」 trong ảnh so sánh.
        ///
        /// <para><b>BẮT BUỘC phải có, không được để trống.</b> Đo được 2026-09-08: đăng ký
        /// 部位 mà KHÔNG có 病名 thì dòng không trở thành 部位病名行 đúng nghĩa, và khi chốt
        /// 抜歯 app bung 「…を算定していますが、算定可能な部位がありません。」 rồi ghi
        /// <c>回 = 0</c>. Mà <c>回 = 0</c> đóng luôn cửa vào <c>Chk_ChkAuto</c>
        /// (frm203002.cs:5745) ⇒ testcase đỏ như thể app thiếu chức năng.</para>
        /// </summary>
        [JsonPropertyName("disCd")] public int DisCd { get; set; } = 100;

        /// <summary>
        /// Ô 部位 (0-based, 0..31 ⇒ cột <c>BUI{n+1}</c> của TRNTRN). Mặc định <b>2 = 右上6</b>
        /// — KHỚP <c>BUI_SLOT = 2</c> của spec Playwright, và đúng răng 「6」 trong ảnh báo lỗi.
        ///
        /// <para>⚠️ Đổi ô này là đổi cả cột <c>siga.se{n+1}</c> mà fixture đặt về 現存;
        /// hai bên parity phải dùng CÙNG một ô, nếu không thì so nhau vô nghĩa.</para>
        /// </summary>
        [JsonPropertyName("buiSlot")] public int BuiSlot { get; set; } = 2;

        /// <summary>Giá trị ô 部位 seed; 1 = 永久歯 đang chọn (↔ <c>BUI_VAL = 1</c> bên web).</summary>
        [JsonPropertyName("buiVal")] public int BuiVal { get; set; } = 1;

        /// <summary>
        /// 病名枝番 của <see cref="DisCd"/>. Mặc định 2 ⇒ 「Ｃ₂」 — khớp
        /// <c>DIS_SB_C2 = 2</c> bên web và đúng dòng 「6 (1) Ｃ₂」 trong ảnh.
        /// </summary>
        [JsonPropertyName("disSb")] public int DisSb { get; set; } = 2;

        /// <summary>
        /// Cho phép XOÁ các dòng mang mã đem thử + mã đi kèm trong NGÀY test. Chỉ chạy khi
        /// ngày đó KHÔNG có sẵn dòng nào mang các mã ấy trước lượt chạy (hàng rào F22).
        /// </summary>
        [JsonPropertyName("allowRowCleanup")] public bool AllowRowCleanup { get; set; } = true;

        /// <summary>
        /// Mã 処置 mà probe dò thêm ở nhánh KHÔNG cần 部位 — mặc định 110/0 再診,
        /// <c>chkauto(110,0)</c> có TỚI HAI mã đi kèm (108/9 và 108/12) nên là chỗ duy nhất
        /// đo được vòng lặp <c>for (i = 0; i &lt; 5; i++)</c> chạy quá một lượt.
        ///
        /// <para>CHỈ probe, KHÔNG assert: cả hai mã đi kèm đều là 加算 giới hạn 月1回, nên
        /// 診療チェック (<c>Check.getCheckAnswerGuide</c>, modMain.cs:914) loại hay không là
        /// tuỳ tháng test đã có 再診 chưa — đỏ ở đó không nói gì về <c>Chk_ChkAuto</c>.</para>
        /// </summary>
        [JsonPropertyName("multiTrtCd")] public int MultiTrtCd { get; set; } = 110;

        /// <summary>枝番 của <see cref="MultiTrtCd"/>.</summary>
        [JsonPropertyName("multiTrtSb")] public int MultiTrtSb { get; set; }
    }

    /// <summary>
    /// Luồng <c>Tests/PerioKensaOrder</c> — 検査順 (<c>pInpOpt[36]</c>) chi phối hướng quét
    /// của 歯周基本検査 (<c>frm203028</c>) và 歯周精密検査 (<c>frm203029</c>).
    ///
    /// <para>Nửa WinForm của <c>../web-tenant-tests/tests/perio-kensa-order.spec.ts</c>.</para>
    /// </summary>
    public sealed class PerioKensaSection
    {
        /// <summary>
        /// Cho phép ĐỔI 検査順 qua màn 処置入力設定 (F9 登録 của <c>frm203003</c>).
        ///
        /// <para>Vì sao phải có cờ riêng, và vì sao KHÔNG dùng chung
        /// <see cref="ParitySection.AllowSave"/>: thao tác này không ghi DB mà ghi
        /// <b><c>C:\NEW_SIM2000\Ocha.xml</c></b> — cấu hình CỦA MÁY, ảnh hưởng tới người
        /// đang dùng app thật trên chính máy đó. Bản Playwright không cần cờ nào vì nó
        /// đè response HTTP chứ không đụng tới cấu hình
        /// (xem khối 「VÌ SAO ĐÈ RESPONSE」 của spec).</para>
        ///
        /// <para>Fixture chụp giá trị cũ ở <c>OneTimeSetUp</c> và trả lại ở
        /// <c>OneTimeTearDown</c>, kể cả khi đỏ giữa chừng. Tắt (mặc định) ⇒ chỉ chạy được
        /// nhóm testcase khớp với 検査順 mà máy ĐANG đặt, phần còn lại tự Ignore.</para>
        /// </summary>
        [JsonPropertyName("allowSettingChange")] public bool AllowSettingChange { get; set; }

        /// <summary>
        /// <c>dis_cd</c> đem chọn ở 病名選択 khi dựng 部位病名行. Mặc định 103 = Ｐ
        /// (歯周炎) — đúng nhánh <c>case 103</c> của <c>frm203028.initProc</c> và cùng mã
        /// mà spec Playwright seed.
        /// </summary>
        [JsonPropertyName("disCd")] public int DisCd { get; set; } = 103;
    }

    public sealed class VisitListSection
    {
        /// <summary>
        /// 診療年月 (yyyyMM) đem đo ở màn 来患一覧. Để trống = tự chọn tháng có dữ liệu mà
        /// KHÔNG quá <see cref="MaxPatients"/> bệnh nhân.
        ///
        /// <para>Mặc định 200601 để khớp <c>TEST_SINRYO_YM</c> của
        /// <c>web-tenant-tests/tests/patient-visit-list-rcp-type.spec.ts</c>: hai bên phải
        /// đo CÙNG một tháng thì con số mới so được với nhau.</para>
        /// </summary>
        [JsonPropertyName("sinryoYm")] public string SinryoYm { get; set; } = "200601";

        /// <summary>
        /// Trần số bệnh nhân khi tự chọn tháng.
        ///
        /// <para>frm204008 gọi <c>getBuiPrice2</c> cho TỪNG (bệnh nhân × ngày), mỗi lượt là
        /// vài truy vấn — tháng 600 bệnh nhân của dataset demo chạy hàng chục phút, vượt
        /// trần <c>TimeoutMinutes</c> của wrapper và làm treo cả máy Windows chứ không chỉ
        /// đỏ (xem PROBE-GUIDELINE).</para>
        /// </summary>
        [JsonPropertyName("maxPatients")] public int MaxPatients { get; set; } = 60;

        /// <summary>Trần thời gian cho MỘT lượt 集計 (phút).</summary>
        [JsonPropertyName("searchTimeoutMinutes")] public int SearchTimeoutMinutes { get; set; } = 8;
    }

    /// <summary>
    /// Luồng <c>Tests/BuiPriceE00100</c> — hộp thoại <b>E00100</b> mà
    /// <c>buiPrice.getBuiPrice2</c> bật khi 一部負担金 tính hỏng (buiPrice.cs:196-203 và
    /// :1734).
    ///
    /// <para>Nửa WinForm của
    /// <c>../web-tenant-tests/tests/accounting-unpaid/bui-price-e00100-parity.spec.ts</c>.
    /// Spec bên kia CHÈN <c>warnings</c> vào response bằng <c>page.route</c>; bên này
    /// không có đường nào giả lập — muốn thấy E00100 thì phải làm hỏng dữ liệu đăng ký
    /// THẬT, nên nhóm testcase đó nằm sau cờ riêng ở đây.</para>
    /// </summary>
    public sealed class BuiPriceSection
    {
        /// <summary>
        /// Cho phép seed 公費 hỏng để E00100 nổ.
        ///
        /// <para>Cụ thể: <c>UPDATE INSURANCE.PUBEXPINF_NO</c> của bệnh nhân test (đang là
        /// 0 nên <c>PatInfoList.setData</c> bỏ qua mọi dòng 公費, PatInfoList.cs:678) và
        /// <c>INSERT</c> MỘT dòng <c>PUBEXPINF</c> mang <see cref="MissingLflg"/>. Cả hai
        /// được chụp ảnh ở <c>OneTimeSetUp</c> và trả lại ở <c>OneTimeTearDown</c>.</para>
        ///
        /// <para>Cờ RIÊNG chứ không dùng chung <see cref="ParitySection.AllowSave"/>: hai
        /// luồng ghi vào bảng khác hẳn nhau, và luồng này sửa <b>đăng ký bệnh nhân</b> chứ
        /// không phải 処置/sổ tiền. Tắt (mặc định) ⇒ chỉ nhóm TC-CLEAN chạy, nhóm
        /// TC-E00100 tự Ignore.</para>
        /// </summary>
        [JsonPropertyName("allowSeed")] public bool AllowSeed { get; set; }

        /// <summary>
        /// 福祉医療番号 KHÔNG có trong bảng <c>LOCALFLG</c> — đem gán vào
        /// <c>PUBEXPINF.LFLG</c> để <c>LocalFlg.getLocalFlg</c> trả null
        /// (LocalFlg.cs:275-281) ⇒ buiPrice.cs:1734 bật E00100.
        ///
        /// <para>Fixture VẪN kiểm lại mã này vắng mặt trong <c>LOCALFLG</c> trước khi
        /// seed: trúng một mã CÓ THẬT thì app chạy trơn và testcase xanh sai.</para>
        /// </summary>
        [JsonPropertyName("missingLflg")] public string MissingLflg { get; set; } = "99999999";

        /// <summary>
        /// <c>PUBEXPINF_NO</c> của dòng seed. Phải KHÁC 0: <c>PatInfoList.setData</c> bỏ
        /// hẳn dòng 公費 khi <c>ins.pubexpinf_no == 0</c> (PatInfoList.cs:678), nên để 0
        /// thì seed không có tác dụng gì mà cũng không báo lỗi.
        /// </summary>
        [JsonPropertyName("seedPubexpinfNo")] public int SeedPubexpinfNo { get; set; } = 9001;
    }

    /// <summary>
    /// Luồng <c>Tests/KarteCmtBuiCaret</c> — <c>frm203012.btnF1_Click</c> (chèn 省略表示
    /// 部位 vào ô テキスト của カルテ記載選択).
    ///
    /// <para>Nửa WinForm của
    /// <c>../web-tenant-tests/tests/dialogs-selection/bui-caret-newline-branch.spec.ts</c>.
    /// Spec bên kia dựng CẢ HAI kỳ vọng bằng công thức đọc từ C# và chưa đo lần nào trên
    /// app thật; luồng này đo, để quyết định có port cái lệch đó sang web hay không.</para>
    /// </summary>
    public sealed class KarteCmtSection
    {
        /// <summary>
        /// Nút group thứ mấy trên <c>frm203011</c> sẽ mở (<c>btn01</c>…<c>btn30</c>,
        /// frm203011.cs:193-197). Group nào cũng được — luồng này KHÔNG chọn dòng comment
        /// nào, nó chỉ cần ô テキスト của <c>frm203012</c>.
        /// </summary>
        [JsonPropertyName("groupNo")] public int GroupNo { get; set; } = 1;

        /// <summary>
        /// Cho phép bấm Enter TRONG ô テキスト để đo xem phím đó làm gì.
        ///
        /// <para>⚠️ GHI DB, và đây là chỗ dễ mất cảnh giác nhất của cả luồng:
        /// <c>txtValue_KeyDown</c> gặp Enter mà chuỗi KHÔNG còn dấu <c>*</c> nào thì gọi
        /// thẳng <c>fixProc</c> (frm203012.cs:339-342) — tức 確定, và <c>fixProc</c> gọi
        /// <c>fixCmt2()</c> cập nhật <c>use_cnt</c> của <c>mst_cmt2</c> (:1370) rồi đóng
        /// form. Mặt khác <c>AcceptButton = btnDummy</c> (:399) lại CHÈN XUỐNG DÒNG. Cái
        /// nào thắng thì phụ thuộc <c>AcceptsReturn</c> và thứ tự xử lý dialog-key của
        /// WinForms — <b>đọc source không kết luận được</b>, nên nó là một câu hỏi probe
        /// riêng chứ không phải một bước chuẩn bị.</para>
        ///
        /// <para>Mặc định false ⇒ mọi testcase dựng trạng thái bằng ValuePattern +
        /// Ctrl+Home/→, KHÔNG bao giờ gửi Enter, và câu hỏi Enter tự Ignore.</para>
        /// </summary>
        [JsonPropertyName("allowConfirm")] public bool AllowConfirm { get; set; }

        /// <summary>
        /// Phần chữ mồi trước dấu xuống dòng. Caret sẽ được đặt ở đúng
        /// <c>probeText.Length</c>, tức NGAY TRƯỚC <c>\r\n</c> cuối — điều kiện
        /// <c>idx == Text.Length - 2</c> của nhánh đang đo (frm203012.cs:201).
        /// </summary>
        [JsonPropertyName("probeText")] public string ProbeText { get; set; } = "ABC";
    }

    /// <summary>
    /// Luồng <c>Tests/DrugAmountSelect</c> — <b>G1: 薬剤使用量選択 (frm203020)</b>, hộp thoại
    /// bung ra khi chốt một mã thuốc có <c>mst_trt.F2 = 1</c> (数量変更可,
    /// frm203016.cs:1426-1440). Nửa WinForm của phần chưa port bên
    /// <c>ochacom-saas</c> (<c>ResolveDrugHandler</c> lấy điểm thẳng từ
    /// <c>mst_trt.score1</c>; <c>DrugNameEditor</c> ghi rõ 「The 数量変更 (free_wd)
    /// override is not wired」).
    /// </summary>
    public sealed class DrugAmountSection
    {
        /// <summary>
        /// Cho phép bật <c>F2 = 1</c> trên bảng master đang áp dụng.
        ///
        /// <para>⚠️ <b>Bắt buộc phải có</b>, và có RIÊNG chứ không dùng chung
        /// <c>parity.allowSave</c>: dữ liệu dev có <b>0</b> dòng <c>F2 = 1</c>
        /// (đo 2026-09-09 trên <c>MST_TRT266</c>), nên không seed thì hộp thoại KHÔNG BAO
        /// GIỜ mở và mọi testcase đều xanh vì chẳng đo gì. Mà thứ bị sửa lại là
        /// <b>bảng master dùng chung cả phòng khám</b>, không phải dữ liệu bệnh nhân test.</para>
        ///
        /// <para>Mặc định false ⇒ fixture tự Ignore TRƯỚC khi mở app.</para>
        /// </summary>
        [JsonPropertyName("allowSeed")] public bool AllowSeed { get; set; }

        /// <summary>
        /// Cho phép bấm F9 登録 để 数量 rơi xuống <c>TRNTRN.FREEWD</c> thật.
        ///
        /// <para>Tách khỏi <see cref="AllowSeed"/> vì mức rủi ro khác hẳn: F9 ghi lại
        /// TOÀN BỘ 処置行 của tháng (xoá + chèn lại). Mặc định false ⇒ nhóm testcase đọc
        /// DB sau F9 tự Ignore, phần đo trên giao diện vẫn chạy.</para>
        /// </summary>
        [JsonPropertyName("allowSave")] public bool AllowSave { get; set; }

        /// <summary>
        /// Mã thuốc đem thử. 605/0 = 「ｵｾﾞｯｸｽ150ｍｇ３T」.
        ///
        /// <para>Chọn nó vì bốn điều kiện, thiếu cái nào cũng làm testcase mất tác dụng
        /// (xem <c>DrugAmountDb.DefaultCandidate</c>): đúng MỘT 枝番 (⇒ 処置選択 không
        /// hiện, bớt một cửa sổ mỗi vòng — F7), đúng MỘT thành phần thuốc
        /// (<c>free_wd</c> chỉ một số), <c>cost_type != 「3」</c> (⇒ 使用量 sửa được), và
        /// 薬価 × 使用量 = 28.60 × 3 = 85.80 <b>&gt; 15</b> ⇒ đang ở nhánh TÍNH của
        /// <c>getPoint</c> chứ không phải nhánh trả cứng 1 điểm (frm203020.cs:505).</para>
        ///
        /// <para>Tên thuốc 「オゼックス錠１５０」 là duy nhất trong dải 600–699 của dữ liệu
        /// dev ⇒ dò dòng trên lưới theo tên không lẫn với mã khác.</para>
        ///
        /// <para>0 = tự chọn ứng viên đầu tiên thoả cả bốn điều kiện.</para>
        /// </summary>
        [JsonPropertyName("trtCd")] public int TrtCd { get; set; } = 605;

        [JsonPropertyName("trtSb")] public int TrtSb { get; set; }

        /// <summary>
        /// Mã <b>ĐỐI CHỨNG</b> — cùng hình dạng nhưng <c>F2</c> để NGUYÊN 0.
        /// 606/0 = 「ｸﾗﾋﾞｯﾄ錠250ｍｇ2T」 (một 枝番, một thành phần, 59.80 × 2 = 119.60).
        ///
        /// <para>Không có nó thì quan sát không thành kết luận (F20): lượt 605 mở được
        /// hộp thoại — đó là do <c>F2 = 1</c>, hay do 「mã thuốc nào cũng mở」? Chạy 606
        /// rồi so: 606 KHÔNG mở ⇒ thủ phạm đúng là <c>F2</c>.</para>
        /// </summary>
        [JsonPropertyName("controlTrtCd")] public int ControlTrtCd { get; set; } = 606;

        [JsonPropertyName("controlTrtSb")] public int ControlTrtSb { get; set; }

        /// <summary>
        /// Số lần click vào một dòng của hộp thoại. <c>CellClick</c> cộng 使用量 thêm 1
        /// mỗi lần, trần 255 (frm203020.cs:321-329).
        /// </summary>
        [JsonPropertyName("clickTimes")] public int ClickTimes { get; set; } = 1;

        /// <summary>
        /// 使用量 gõ thẳng vào ô, cho nhánh <c>CellValidating</c> (:269-301). Để trống =
        /// bỏ qua câu hỏi đó (chỉ đo đường click).
        /// </summary>
        [JsonPropertyName("typedCount")] public string TypedCount { get; set; } = "10";
    }

    /// <summary>
    /// Luồng <c>Tests/DrugPathB</c> — <b>G2: path B của <c>EditControl.editDrugName</c></b>,
    /// nhánh chạy khi KHÔNG tìm thấy dòng <c>MST_DRUG_RX</c>: tên lấy từ
    /// <c>MstTrt.getMstTrtDataYaku</c>, 用法 lấy từ <c>MST_MED</c>
    /// (EditControl.cs:1137-1148).
    ///
    /// <para>Bản web dừng ở <c>alertDialog(「この薬剤コードは現在未対応です。」)</c>
    /// (treatment-entry-detail.tsx:5077-5079) và KHÔNG chèn dòng nào.</para>
    /// </summary>
    public sealed class DrugPathBSection
    {
        /// <summary>
        /// Cho phép TẠO các mã 薬剤 seed trong bảng master + <c>MST_MED</c>.
        ///
        /// <para>⚠️ Bắt buộc: cả 63/63 mã 600–699 của dev đều có <c>MST_DRUG_RX</c> phủ
        /// ngày test (đo 2026-09-09) ⇒ path B không bao giờ chạy, và mọi testcase sẽ
        /// xanh vì chẳng đo gì.</para>
        ///
        /// <para>Lượt chạy <b>chỉ THÊM dòng rồi XOÁ</b>, không sửa dòng nào có sẵn — nhưng
        /// bảng bị thêm vào là master dùng chung cả phòng khám, nên vẫn có cờ RIÊNG,
        /// không dùng chung <c>drugAmount.allowSeed</c> (bên đó SỬA <c>mst_trt.F2</c> của
        /// một dòng thật). Mặc định false ⇒ fixture tự Ignore TRƯỚC khi mở app.</para>
        /// </summary>
        [JsonPropertyName("allowSeed")] public bool AllowSeed { get; set; }

        /// <summary>
        /// Dòng 薬剤 dùng làm NGUỒN CLONE, và đồng thời là <b>đối chứng path A</b>.
        /// 628/0 「カロナール錠200mg　１T」 — <c>active_flg = 1</c>, <c>F2 = 0</c> (không mở
        /// 薬剤使用量選択; đó là luồng G1), <c>score1 = 1</c>, <c>g_cnt = 2</c>,
        /// <c>med_kbn = 22</c> ⇒ path A của nó CÓ hậu tố 用量 「n回分」.
        ///
        /// <para><b><c>grp = 2</c> là điều kiện thứ nhất</b>: mã seed thừa hưởng
        /// <c>grp</c> của dòng nguồn, nên nó nằm ở tab 屯服 của 薬剤選択 — tab chỉ có
        /// <b>9</b> dòng, không phải cuộn để với tới. Clone từ một mã <c>grp = 1</c>
        /// (内服) thì tab đó dài và lưới <c>DataGridView</c> chỉ phơi ra dòng ĐANG NHÌN
        /// THẤY (F10).</para>
        ///
        /// <para><b><c>selected_treat_kb = 0</c> là điều kiện thứ hai</b>, và nó tốn một
        /// lượt chạy mới lộ ra. Bản đầu clone từ <c>600/0</c> — cùng hình dạng, nhưng
        /// thành phần của nó (<c>620007096</c> ボルタレン) mang
        /// <c>MST_DRUG.selected_treat_kb = '1'</c>. Với <c>F3 = 1</c> (院内処方) thì
        /// <c>CmtAuto.IsDrug_lt_listed_product</c> (CmtAuto.cs:925-975) trả true ⇒ lượt
        /// 確定 của 薬剤選択 bung <c>frm203012</c>
        /// 「医療上の必要性を選択してください」 (長期収載品の選定療養) và dòng KHÔNG rơi
        /// xuống lưới. Đo được 2026-09-09 (Tc4/KQ-10). Đó là một <b>tính năng khác</b>,
        /// không thuộc path B — kéo nó vào đây thì testcase đỏ vì lý do chẳng liên quan.
        /// Trong dải 600–699 <c>grp = 2</c>: 600/601/624 dính cờ đó, còn
        /// 628/631/632/637/654/662 thì không.</para>
        ///
        /// <para>Muốn ĐO chính cascade 選定療養 thì đặt lại về <c>600</c> — nhưng đó nên
        /// là một luồng riêng.</para>
        /// </summary>
        [JsonPropertyName("cloneTrtCd")] public int CloneTrtCd { get; set; } = 628;

        [JsonPropertyName("cloneTrtSb")] public int CloneTrtSb { get; set; }

        /// <summary>Mã seed CÓ dòng <c>MST_MED</c> ⇒ path B đủ hai dòng. Trùng vế Playwright.</summary>
        [JsonPropertyName("pathBTrtCd")] public int PathBTrtCd { get; set; } = 698;

        /// <summary>Mã seed KHÔNG có dòng <c>MST_MED</c> ⇒ path B chỉ còn dòng 処置名称.</summary>
        [JsonPropertyName("noMedTrtCd")] public int NoMedTrtCd { get; set; } = 699;

        [JsonPropertyName("trtSb")] public int TrtSb { get; set; }

        /// <summary>
        /// 処置名称 của mã seed — <b>dòng thứ nhất</b> path B in ra.
        ///
        /// <para>Cố ý ĐỘC NHẤT và KHÔNG chứa 「日分」/「回分」, để câu hỏi 「path B có gắn
        /// hậu tố 用量 không」 không bị chính dữ liệu seed làm nhiễu. Trùng từng ký tự với
        /// vế Playwright.</para>
        /// </summary>
        [JsonPropertyName("pathBTrtNm")] public string PathBTrtNm { get; set; } = "ﾃｽﾄ院内調剤薬PB";

        [JsonPropertyName("noMedTrtNm")] public string NoMedTrtNm { get; set; } = "ﾃｽﾄ院内調剤薬NM";

        /// <summary><c>MST_MED.usage</c> của mã seed — <b>dòng thứ hai</b>. Trùng vế Playwright.</summary>
        [JsonPropertyName("pathBUsage")] public string PathBUsage { get; set; } = "ﾃｽﾄ用法　毎食後　服用";
    }

    /// <summary>
    /// Luồng <c>Tests/DrugRowReload</c> — <b>G3: dựng lại dòng thuốc khi LOAD lưới</b>.
    /// <c>ModSave.GetTrnRs</c> (modSave.cs:2627-2637) và bản của lưới quá khứ (:4961-4974)
    /// KHÔNG hiện <c>trn_trn.dsp_trt</c> cho dòng 600–699 — chúng dựng lại từ master +
    /// <c>freewd</c>, rồi khoá ô.
    ///
    /// <para>Bản web đọc thẳng <c>dspTrt</c> (treatment-table-mapper.ts:160,234), không có
    /// nhánh <c>isDrugCode</c> nào ở luồng load.</para>
    /// </summary>
    public sealed class DrugRowReloadSection
    {
        /// <summary>
        /// Cho phép CHÈN dòng <c>TRNTRN</c> seed + mã master cho nhánh path B.
        ///
        /// <para>⚠️ <b>Luồng ghi nặng nhất của cả bộ</b>: <c>TRNTRN</c> là 処置行 thật của
        /// bệnh nhân. Không có đường nào khác — thứ đang đo là đường LOAD, nên dữ liệu
        /// phải nằm sẵn trong DB trước khi màn hình mở.</para>
        ///
        /// <para>Lượt chạy <b>CHỈ CHÈN</b> rồi <b>XOÁ</b>: dòng <c>TRNTRN</c> mang
        /// <c>DISP_NO</c> riêng, và mã master <see cref="PathBTrtCd"/> chưa từng tồn tại.
        /// Không dòng nào có sẵn bị sửa. Mặc định TẮT ⇒ fixture tự Ignore TRƯỚC khi mở app.</para>
        /// </summary>
        [JsonPropertyName("allowSeed")] public bool AllowSeed { get; set; }

        /// <summary>
        /// <c>DISP_NO</c> đầu tiên của luồng; các dòng seed dùng <c>DispNo + 0..3</c>.
        ///
        /// <para>Tránh dải đã có chủ: <c>9001</c> (seed 再初診 — bệnh nhân 10 ĐANG có một
        /// dòng mang số đó), <c>9101-9103</c> (<c>UnpaidRaiinCnt</c>).</para>
        ///
        /// <para>⚠️ Vế Playwright dùng <c>SEED_DISP_BASE + 1..3</c> = 9001–9003 trên
        /// <b>Postgres</b>. Số không trùng nhau là KHÔNG SAO: <c>disp_no</c> không hiện ra
        /// lưới và không testcase nào assert nó — hai bên chỉ cần cùng <b>nội dung</b> dòng.</para>
        /// </summary>
        [JsonPropertyName("dispNo")] public int DispNo { get; set; } = 9201;

        /// <summary>
        /// Mã 薬剤 <b>CÓ</b> <c>mst_drug_rx</c> — dùng cho hai dòng path A.
        /// 602/0 「ﾒｲｱｸﾄMS錠100ｍｇ４T」 (<c>cnt1 = 4</c>, <c>med_kbn = 21</c>).
        /// Trùng <c>TEST_LOAD_TRT_CD</c> của
        /// <c>treatment-grid/drug-row-rebuild-on-load.spec.ts</c>.
        /// </summary>
        [JsonPropertyName("trtCd")] public int TrtCd { get; set; } = 602;

        [JsonPropertyName("trtSb")] public int TrtSb { get; set; }

        /// <summary>
        /// Mã seed cho nhánh <b>path B khi load</b> — clone từ <see cref="TrtCd"/> nên mọi
        /// cột khác giống dữ liệu thật, và <b>không</b> có <c>mst_drug_rx</c>.
        /// Trùng <c>TEST_LOADPB_TRT_CD</c> của vế Playwright.
        /// </summary>
        [JsonPropertyName("pathBTrtCd")] public int PathBTrtCd { get; set; } = 694;

        [JsonPropertyName("pathBTrtNm")] public string PathBTrtNm { get; set; } = "ﾃｽﾄ読込薬PB";

        [JsonPropertyName("pathBUsage")] public string PathBUsage { get; set; } = "ﾃｽﾄ用法　就寝前　服用";

        /// <summary>
        /// Mã ĐỐI CHỨNG — <b>ngoài</b> dải 600–699 nên rơi vào nhánh <c>else</c>
        /// (<c>hFG1[2] = dsp_trt</c>, modSave.cs:2639). 110 = 再診.
        ///
        /// <para>Nó tách đôi câu hỏi: 「chuỗi rác bị bỏ qua」 là hành vi RIÊNG của dòng
        /// 薬剤, hay app không bao giờ hiện <c>dsp_trt</c>? <b>Vế Playwright chưa có
        /// testcase này</b> — xem README §7.</para>
        /// </summary>
        [JsonPropertyName("controlTrtCd")] public int ControlTrtCd { get; set; } = 110;

        [JsonPropertyName("controlTrtSb")] public int ControlTrtSb { get; set; }

        /// <summary>
        /// Chuỗi rác cố ý ghi vào <c>dsp_trt</c>. Hiện ra trên lưới ⇒ app in giá trị đã
        /// lưu; biến mất ⇒ app dựng lại. Đó là toàn bộ phép đo.
        /// Trùng <c>STALE</c> của vế Playwright; mỗi dòng nối thêm số thứ tự.
        /// </summary>
        [JsonPropertyName("stale")] public string Stale { get; set; } = "ｽﾃｰﾙ保存文字列ZZZ";

        /// <summary>回数 của mọi dòng seed. Vào hậu tố 用量 「n日分」/「n回分」.</summary>
        [JsonPropertyName("trtCnt")] public int TrtCnt { get; set; } = 7;

        /// <summary>
        /// 点数 của dòng seed đầu tiên; các dòng sau dùng <c>MarkerPoint + 1..3</c>.
        ///
        /// <para><b>Mốc để dò dòng trên lưới.</b> Dò theo 点 chứ không theo tên là bắt
        /// buộc: cái đang đo CHÍNH LÀ chuỗi tên, lấy tên làm mốc tìm thì thành vòng luẩn
        /// quẩn — không thấy thì không phân biệt được 「app dựng tên khác」 với 「dòng
        /// không có trên lưới」.</para>
        ///
        /// <para>⚠️ Vế Playwright để cả ba dòng cùng <c>trt_pt = 40</c> (mặc định của
        /// <c>seedTreatmentRows</c>) và nhận dòng theo thứ tự. Đặt 点 khác nhau ở đây
        /// KHÔNG làm hai bên đo khác nhau — không testcase nào assert 点, nó chỉ để thông
        /// báo lỗi đọc được.</para>
        /// </summary>
        [JsonPropertyName("markerPoint")] public int MarkerPoint { get; set; } = 771;
    }

    public sealed class RunSection
    {
        [JsonPropertyName("stepMs")] public int StepMs { get; set; }
        [JsonPropertyName("defaultTimeoutSeconds")] public int DefaultTimeoutSeconds { get; set; } = 20;
        [JsonPropertyName("gridLoadTimeoutSeconds")] public int GridLoadTimeoutSeconds { get; set; } = 60;
        [JsonPropertyName("screenshotDir")] public string ScreenshotDir { get; set; } = @"artifacts\screenshots";
        [JsonPropertyName("captureOnPass")] public bool CaptureOnPass { get; set; } = true;

        /// <summary>
        /// Chụp màn hình ở TỪNG BƯỚC của <see cref="TestTrace"/>, không chỉ một ảnh cuối
        /// testcase. Tắt đi nếu ổ đĩa eo hẹp hoặc chạy CI — nhưng khi đang dò lỗi trên máy
        /// người khác thì đây là thứ giá trị nhất.
        /// </summary>
        [JsonPropertyName("traceScreenshots")] public bool TraceScreenshots { get; set; } = true;
        [JsonPropertyName("captureOnFail")] public bool CaptureOnFail { get; set; } = true;
        [JsonPropertyName("stopOnFirstFailure")] public bool StopOnFirstFailure { get; set; } = true;

        /// <summary>
        /// Khi một testcase <b>đỏ</b>: <c>UiTestBase.TearDown</c> gọi
        /// <c>OchaApp.ForceKill()</c> thay vì đợi <c>OneTimeTearDown</c>. Trước đây app
        /// vẫn sống nguyên cho tới khi cả fixture xong — nghĩa là testcase lỗi sẽ để
        /// app ở trạng thái lệch, chờ thao tác thật của người chạy. Cờ này <b>mặc
        /// định bật</b>: lần fail nào cũng kill ngay, khỏi treo.
        ///
        /// <para><b>Chỉ áp dụng khi test tự mở app</b> (<c>App.OwnsProcess = true</c>).
        /// Nếu test bám vào Menu.exe đang chạy (<c>app.attachIfRunning = true</c>) thì
        /// không kill — đó là app THẬT của người dùng.</para>
        /// </summary>
        [JsonPropertyName("killOnFail")] public bool KillOnFail { get; set; } = true;

        /// <summary>
        /// Khi testcase <b>xanh</b> (Passed): kill app. Mặc định <c>false</c> để người
        /// chạy còn xem app cho biết app "sạch" trông thế nào. Bật khi chạy CI / chạy
        /// nhiều fixture liên tiếp, muốn kết thúc ngay.
        /// </summary>
        [JsonPropertyName("killOnSuccess")] public bool KillOnSuccess { get; set; }

        /// <summary>
        /// Khi testcase <b>timeout</b> (Failed vì vượt quá <c>testTimeout</c> của NUnit):
        /// kill app. Mặc định <c>true</c> — timeout thường nghĩa là app đang ở trạng thái
        /// treo / không phản hồi, để nguyên thì người chạy phải tự tay tắt.
        /// </summary>
        [JsonPropertyName("killOnTimeout")] public bool KillOnTimeout { get; set; } = true;

        [JsonPropertyName("nuisanceDialogs")] public string[] NuisanceDialogs { get; set; } = [];
        [JsonPropertyName("nuisanceDialogButtons")] public string[] NuisanceDialogButtons { get; set; } = ["いいえ", "No"];

        public TimeSpan DefaultTimeout => TimeSpan.FromSeconds(DefaultTimeoutSeconds);
        public TimeSpan GridLoadTimeout => TimeSpan.FromSeconds(GridLoadTimeoutSeconds);
    }

    /// <summary>
    /// AutomationId của một control, tra trong mục "locators". Thiếu khoá thì trả về
    /// chính tên khoá — để code vẫn chạy được khi ai đó thêm locator mới mà quên khai báo.
    /// </summary>
    public string Locator(string key) =>
        Locators.TryGetValue(key, out var v) && !string.IsNullOrWhiteSpace(v) ? v : key;

    private static TestSettings Load()
    {
        var dir = AppContext.BaseDirectory;
        var merged = ReadJson(Path.Combine(dir, "testsettings.json")) ?? new JsonObject();
        var local = ReadJson(Path.Combine(dir, "testsettings.local.json"));
        if (local is not null) DeepMerge(merged, local);

        var settings = merged.Deserialize<TestSettings>(JsonOpts) ?? new TestSettings();
        ApplyEnvironment(settings);
        return settings;
    }

    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNameCaseInsensitive = true,
        ReadCommentHandling = JsonCommentHandling.Skip,
        AllowTrailingCommas = true,
    };

    private static JsonObject? ReadJson(string path)
    {
        if (!File.Exists(path)) return null;
        var node = JsonNode.Parse(File.ReadAllText(path), null, new JsonDocumentOptions
        {
            CommentHandling = JsonCommentHandling.Skip,
            AllowTrailingCommas = true,
        });
        return node as JsonObject;
    }

    /// <summary>Ghi đè từng khoá của <paramref name="overlay"/> lên <paramref name="target"/>.</summary>
    private static void DeepMerge(JsonObject target, JsonObject overlay)
    {
        foreach (var (key, value) in overlay)
        {
            if (value is JsonObject childOverlay && target[key] is JsonObject childTarget)
            {
                DeepMerge(childTarget, childOverlay);
            }
            else
            {
                target[key] = value?.DeepClone();
            }
        }
    }

    private static void ApplyEnvironment(TestSettings s)
    {
        Set("OCHA_EXE", v => s.App.ExePath = v);
        Set("OCHA_CLOSE_ON_FINISH", v => s.App.CloseOnFinish = ToBool(v));
        Set("OCHA_LOGIN_USER", v => s.Login.UserId = v);
        Set("OCHA_LOGIN_PASS", v => s.Login.Password = v);
        Set("OCHA_LOGIN_ENABLED", v => s.Login.Enabled = ToBool(v));
        Set("OCHA_PAT_NO", v => s.Patient.PatNo = v);
        Set("OCHA_TRT_DT", v => s.Patient.TrtDate = v);
        Set("OCHA_DB", v => s.Db.ConnectionString = v);
        Set("OCHA_DB_ENABLED", v => s.Db.Enabled = ToBool(v));
        Set("OCHA_STEP_MS", v => s.Run.StepMs = int.Parse(v));
        Set("OCHA_SCREENSHOT_DIR", v => s.Run.ScreenshotDir = v);
        Set("OCHA_STOP_ON_FIRST_FAILURE", v => s.Run.StopOnFirstFailure = ToBool(v));
        // Cần khi chạy CẢ fixture để xem hết kết quả: killOnFail giết app ngay ở TearDown
        // của testcase đỏ đầu tiên, nên mọi testcase sau đó chạy trên app ĐÃ CHẾT và đỏ
        // với lý do giả (「khong thay btnF11」). Đo thật 2026-09-04 trên luồng PerioKensaOrder.
        Set("OCHA_KILL_ON_FAIL", v => s.Run.KillOnFail = ToBool(v));
        Set("OCHA_INP_P1_ALLOW_SAVE", v => s.InpP1.AllowSave = ToBool(v));
        Set("OCHA_HIGH_NEEDS_PATCH", v => s.HighNeeds.AllowDisFlgPatch = ToBool(v));
        Set("OCHA_HIGH_NEEDS_SAVE", v => s.HighNeeds.AllowSave = ToBool(v));
        Set("OCHA_HIGH_NEEDS_PAT_NO", v => s.HighNeeds.BorrowPatNo = v);
        Set("OCHA_SIGA_ALLOW_SAVE", v => s.SigaTooth.AllowSave = ToBool(v));
        Set("OCHA_SIGA_ROW_CLEANUP", v => s.SigaTooth.AllowRowCleanup = ToBool(v));
        Set("OCHA_AUTO_SANTEI_ALLOW_SAVE", v => s.AutoSantei.AllowSave = ToBool(v));
        Set("OCHA_AUTO_SANTEI_TRT_CD", v => s.AutoSantei.TrtCd = int.Parse(v));
        Set("OCHA_AUTO_SANTEI_TRT_SB", v => s.AutoSantei.TrtSb = int.Parse(v));
        Set("OCHA_PERIO_ALLOW_SETTING_CHANGE", v => s.PerioKensa.AllowSettingChange = ToBool(v));
        Set("OCHA_PERIO_DIS_CD", v => s.PerioKensa.DisCd = int.Parse(v));
        Set("OCHA_SINRYO_YM", v => s.VisitList.SinryoYm = v);
        Set("OCHA_VISIT_MAX_PATIENTS", v => s.VisitList.MaxPatients = int.Parse(v));
        Set("OCHA_BR_TEETH", v => s.InpP1.BrTeeth = ToIntArray(v));
        Set("OCHA_BR_NO_MATCH_TEETH", v => s.InpP1.BrNoMatchTeeth = ToIntArray(v));
        Set("OCHA_BUI_PRICE_ALLOW_SEED", v => s.BuiPrice.AllowSeed = ToBool(v));
        Set("OCHA_BUI_PRICE_MISSING_LFLG", v => s.BuiPrice.MissingLflg = v);
        Set("OCHA_KARTE_CMT_GROUP_NO", v => s.KarteCmt.GroupNo = int.Parse(v));
        Set("OCHA_KARTE_CMT_ALLOW_CONFIRM", v => s.KarteCmt.AllowConfirm = ToBool(v));
        Set("OCHA_KARTE_CMT_PROBE_TEXT", v => s.KarteCmt.ProbeText = v);
        Set("OCHA_DRUG_AMOUNT_ALLOW_SEED", v => s.DrugAmount.AllowSeed = ToBool(v));
        Set("OCHA_DRUG_AMOUNT_ALLOW_SAVE", v => s.DrugAmount.AllowSave = ToBool(v));
        Set("OCHA_DRUG_AMOUNT_TRT_CD", v => s.DrugAmount.TrtCd = int.Parse(v));
        Set("OCHA_DRUG_AMOUNT_TRT_SB", v => s.DrugAmount.TrtSb = int.Parse(v));
        Set("OCHA_DRUG_AMOUNT_CONTROL_TRT_CD", v => s.DrugAmount.ControlTrtCd = int.Parse(v));
        Set("OCHA_DRUG_AMOUNT_CLICK_TIMES", v => s.DrugAmount.ClickTimes = int.Parse(v));
        Set("OCHA_DRUG_AMOUNT_TYPED_COUNT", v => s.DrugAmount.TypedCount = v);
        Set("OCHA_DRUG_PATH_B_ALLOW_SEED", v => s.DrugPathB.AllowSeed = ToBool(v));
        Set("OCHA_DRUG_PATH_B_TRT_CD", v => s.DrugPathB.PathBTrtCd = int.Parse(v));
        Set("OCHA_DRUG_PATH_B_NO_MED_TRT_CD", v => s.DrugPathB.NoMedTrtCd = int.Parse(v));
        Set("OCHA_DRUG_PATH_B_CLONE_TRT_CD", v => s.DrugPathB.CloneTrtCd = int.Parse(v));
        Set("OCHA_DRUG_PATH_B_TRT_SB", v => s.DrugPathB.TrtSb = int.Parse(v));
        Set("OCHA_DRUG_RELOAD_ALLOW_SEED", v => s.DrugRowReload.AllowSeed = ToBool(v));
        Set("OCHA_DRUG_RELOAD_DISP_NO", v => s.DrugRowReload.DispNo = int.Parse(v));
        Set("OCHA_DRUG_RELOAD_TRT_CD", v => s.DrugRowReload.TrtCd = int.Parse(v));
        Set("OCHA_DRUG_RELOAD_PATH_B_TRT_CD", v => s.DrugRowReload.PathBTrtCd = int.Parse(v));

        static void Set(string name, Action<string> apply)
        {
            var v = Environment.GetEnvironmentVariable(name);
            if (!string.IsNullOrWhiteSpace(v)) apply(v.Trim());
        }

        static bool ToBool(string v) =>
            v is "1" or "true" or "TRUE" or "True" or "yes" or "on";

        // "5,6" → [5, 6]. Giữ cùng dạng với TEST_BR_TEETH bên bộ Playwright.
        static int[] ToIntArray(string v) =>
            v.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
             .Select(p => int.TryParse(p, out var n) ? n : 0)
             .Where(n => n > 0)
             .ToArray();
    }
}
