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
        Set("OCHA_INP_P1_ALLOW_SAVE", v => s.InpP1.AllowSave = ToBool(v));
        Set("OCHA_HIGH_NEEDS_PATCH", v => s.HighNeeds.AllowDisFlgPatch = ToBool(v));
        Set("OCHA_HIGH_NEEDS_SAVE", v => s.HighNeeds.AllowSave = ToBool(v));
        Set("OCHA_HIGH_NEEDS_PAT_NO", v => s.HighNeeds.BorrowPatNo = v);
        Set("OCHA_SIGA_ALLOW_SAVE", v => s.SigaTooth.AllowSave = ToBool(v));
        Set("OCHA_SIGA_ROW_CLEANUP", v => s.SigaTooth.AllowRowCleanup = ToBool(v));
        Set("OCHA_BR_TEETH", v => s.InpP1.BrTeeth = ToIntArray(v));
        Set("OCHA_BR_NO_MATCH_TEETH", v => s.InpP1.BrNoMatchTeeth = ToIntArray(v));

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
