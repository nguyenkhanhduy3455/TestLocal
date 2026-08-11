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

        static void Set(string name, Action<string> apply)
        {
            var v = Environment.GetEnvironmentVariable(name);
            if (!string.IsNullOrWhiteSpace(v)) apply(v.Trim());
        }

        static bool ToBool(string v) =>
            v is "1" or "true" or "TRUE" or "True" or "yes" or "on";
    }
}
