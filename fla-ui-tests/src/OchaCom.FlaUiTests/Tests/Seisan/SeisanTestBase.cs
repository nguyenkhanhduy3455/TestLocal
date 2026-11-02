using System.Text.RegularExpressions;
using FlaUI.Core.AutomationElements;
using FlaUI.Core.Input;
using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.Seisan;

/// <summary>
/// Nền chung của các fixture ASSERT 窓口精算 (G1 trở đi): bệnh nhân test + 2 dòng UNPAID
/// seed, bộ phím F theo source, và các bước đi/đọc màn đã chốt ở G0–G1.
/// </summary>
public abstract class SeisanTestBase : SeededPatientTestBase
{
    private SeisanDb? _db;
    /// <summary>Form đang đứng — gốc đổ cây UIA khi đỏ.</summary>
    protected Window? Current { get; set; }

    protected override bool NavigatesToTreatmentEntry => false;
    protected override AutomationElement? UiaDumpRoot => Current;
    protected override string[] NuisanceDialogPatterns => [];

    protected int TestPatNo => int.Parse(Settings.Patient.PatNo);

    // ── Bộ phím F theo source (OCHA_OFF = nút ẩn hẳn, không có trong cây UIA) ──────

    protected const string Fk204001PatInfo = "F1 未精算患者|F2 入力一覧|F3 来患一覧|F9 選択|F10 戻る|F12 メニュー";
    protected const string Fk204001Unpaid = "F1 患者検索|F2 入力一覧|F3 来患一覧|F8 削除|F9 選択|F10 戻る|F12 メニュー";
    protected const string Fk204002Seikyu =
        "F1 領収書発行|F2 物品|F3 負担|F4 自費|F5 区分|F6 返金|F7 入金|F8 訂正|F9 登録|F10 戻る|F11 患者選択|F12 メニュー";
    protected const string Fk204002Nyukin =
        "F1 領収書発行|F2 物品|F3 明細|F4 預り|F5 ﾂﾘ銭|F6 返金|F7 請求|F8 訂正|F9 登録|F10 戻る|F11 患者選択|F12 メニュー";
    protected const string Fk204002Henkin =
        "F1 領収書発行|F2 物品(off)|F3 負担(off)|F4 自費(off)|F5 区分(off)|F6 返金|F7 入金|F8 訂正|F9 登録|F10 戻る|F11 患者選択|F12 メニュー";
    protected const string Fk204003 = "F1 販売履歴|F9 登録|F10 戻る";
    protected const string Fk204009 = "F9 選択|F10 戻る";
    protected const string Fk204006 = "F1 クリア|F9 確定|F10 戻る";
    protected const string Fk204004Print = "F1 領収書印刷|F2 精算済ﾖﾘ|F3 診療内容ﾖﾘ|F5 明細書印刷|F10 戻る";
    protected const string Fk204004Update = "F8 削除|F9 訂正|F10 戻る";
    protected const string Fk204004List = "F2 印刷|F8 削除|F9 訂正|F10 戻る";
    protected const string Fk204008 = "F4 CSV出力|F10 戻る|F12 メニュー";

    // ── Seed: 保険 900円/300点 (初再診 50 + 処置 250) + 自費 5000 + 税 500 ───────────

    protected override void PrepareDataBeforeApp()
    {
        base.PrepareDataBeforeApp();
        if (SeededPatient is null) return;

        _db = SeisanDb.CreateOrNull(Settings);
        if (_db is null) return;
        _db.SeedUnpaid(SeededPatient.PatNo, _db.FirstPatBr(SeededPatient.PatNo),
        [
            new SeisanDb.UnpaidSeed(TrtDate, KmCd: 40, Score: 300, ClaimAmt: 900, ScoreD1: 50, ScoreD9: 250),
            new SeisanDb.UnpaidSeed(TrtDate, KmCd: 50, Score: 0, ClaimAmt: 5000, Tax: 500),
        ]);
    }

    protected SeisanDb Db2 => _db ?? throw new InvalidOperationException(
        "Không seed được UNPAID (DB hoặc bệnh nhân test không sẵn) — harness hỏng, sửa trước.");

    // ─────────────────────────────────────────────────────────────────────────
    // Bước + assert dùng chung
    // ─────────────────────────────────────────────────────────────────────────

    protected Window Wait(string id, TimeSpan timeout)
    {
        var w = Waits.TryFor(() => SeisanNav.Form(App, id) is { } f && SeisanNav.ChildForms(f).Count == 0 ? f : null, timeout)
                ?? throw new AssertionException(
                    $"Không đứng ở {id} (không có modal đè). Đang hiện: [{SeisanNav.DescribeForms(App)}]. " +
                    SeisanNav.DescribeDialogs(App));
        Current = w;
        return w;
    }

    /// <summary>
    /// Bấm phím trên form hiện tại rồi chờ <paramref name="expectId"/>. Phím không tới đích
    /// thì click nút — G0 đo được F10 bằng phím không đóng frm204003 sau khi frm204009
    /// vừa đóng, còn click nút thì đóng. G1 không đo đường phím nên không đỏ vì chuyện đó.
    /// </summary>
    protected Window Go(ushort vk, string expectId, TimeSpan? timeout = null)
    {
        var from = Current ?? throw new InvalidOperationException("chưa có form hiện tại");
        var sameForm = Uia.AutomationIdOf(from) == expectId;
        var stripBefore = sameForm ? FKeys(from) : "";
        SeisanNav.Press(from, vk);

        // Ở lại cùng form (F1 của 204001, F6/F7 của 204002): mọi phím đó đều đổi dải nút F.
        // Đo 2026-10-20: ngay sau khi một modal đóng, F7 gửi vào frm204002 bị mất —
        // dải nút đứng yên — nên chờ dải đổi, không đổi thì click nút.
        if (sameForm && !Waits.TryUntil(() => FKeys(from) != stripBefore, TimeSpan.FromSeconds(4))
            && Uia.ById(from, $"btnF{vk - 0x6F}") is { } sameButton)
        {
            TestContext.Out.WriteLine($"phím 0x{vk:X2} không đổi dải nút F của {expectId} — click btnF{vk - 0x6F}");
            Uia.MouseClick(sameButton);
            Waits.TryUntil(() => FKeys(from) != stripBefore, TimeSpan.FromSeconds(4));
        }
        var unexpected = SeisanNav.AnswerDialogs(App, TimeSpan.FromSeconds(3));
        Assert.That(unexpected, Is.Empty, $"phím 0x{vk:X2} trên {Uia.AutomationIdOf(from)} bung hộp thoại: " +
                                          string.Join(" / ", unexpected));

        var limit = timeout ?? TimeSpan.FromSeconds(10);
        var w = Waits.TryFor(() => SeisanNav.Form(App, expectId) is { } f && SeisanNav.ChildForms(f).Count == 0 ? f : null, limit);
        if (w is null && Uia.ById(from, $"btnF{vk - 0x6F}") is { } button)
        {
            TestContext.Out.WriteLine($"phím 0x{vk:X2} không đưa tới {expectId} — click btnF{vk - 0x6F}");
            Uia.MouseClick(button);
        }
        return Wait(expectId, limit);
    }

    protected static string Title(Window w)
    {
        // Form modal (con trong cây UIA) có Name rỗng — tiêu đề nằm ở TitleBar.
        var name = Uia.NameOf(w);
        if (!string.IsNullOrWhiteSpace(name)) return name.Trim();
        return Uia.ById(w, "TitleBar") is { } bar ? Uia.ValueOf(bar).Trim() : "";
    }

    /// <summary>Nút F đang hiện, dạng 「F1 nhãn|F2 nhãn(off)|…」 theo thứ tự số.</summary>
    protected static string FKeys(Window w)
    {
        var keys = w.FindAllDescendants(cf => cf.ByControlType(FlaUI.Core.Definitions.ControlType.Button))
            .Select(b => (Id: Uia.AutomationIdOf(b), El: b))
            .Where(x => Regex.IsMatch(x.Id, @"^btnF\d+$") && Uia.IsOnScreen(x.El))
            // Form cha chứa cả nút của modal con — chỉ lấy nút mà form gần nhất là w.
            .Where(x => NearestFormId(x.El) == Uia.AutomationIdOf(w))
            .Select(x => (N: int.Parse(x.Id[4..]),
                          Label: Regex.Replace(Uia.NameOf(x.El), @"^F\d+\s*", "").Trim(),
                          On: x.El.Properties.IsEnabled.ValueOrDefault))
            .OrderBy(x => x.N)
            .Select(x => $"F{x.N} {x.Label}{(x.On ? "" : "(off)")}");
        return string.Join("|", keys);
    }

    protected static string NearestFormId(AutomationElement el)
    {
        var walker = el.Automation.TreeWalkerFactory.GetControlViewWalker();
        for (var p = walker.GetParent(el); p is not null; p = walker.GetParent(p))
        {
            var id = Uia.AutomationIdOf(p);
            if (id.StartsWith("frm", StringComparison.Ordinal)) return id;
        }
        return "";
    }

    protected static void AssertScreen(Window w, string title, string fkeys, string source)
    {
        Assert.Multiple(() =>
        {
            Assert.That(Title(w), Is.EqualTo(title), $"tiêu đề — {source}");
            Assert.That(FKeys(w), Is.EqualTo(fkeys), $"bộ phím F — {source}");
        });
    }

    protected static string Value(Window w, string id) =>
        Uia.ById(w, id) is { } el ? RawValue(el).Trim() : $"(không có {id})";

    /// <summary>
    /// Giá trị THẬT của ô. Ô Edit chỉ đọc ValuePattern — <c>Uia.ValueOf</c> rơi về Name khi ô
    /// rỗng, mà Name của Edit ở đây là nhãn đứng cạnh (G0: <c>txtComment1</c> đọc ra
    /// 「領収書タイプ」). ComboBox thì để <c>ValueOf</c> lo.
    /// </summary>
    protected static string RawValue(AutomationElement el)
    {
        if (Uia.ControlTypeOf(el) != FlaUI.Core.Definitions.ControlType.Edit) return Uia.ValueOf(el);
        try { return el.Patterns.Value.PatternOrDefault?.Value.ValueOrDefault ?? ""; }
        catch { return ""; }
    }

    protected static void AssertValues(Window w, string source, params (string Id, string Want)[] cells)
    {
        Assert.Multiple(() =>
        {
            foreach (var (id, want) in cells)
                Assert.That(Value(w, id), Is.EqualTo(want), $"{id} — {source}");
        });
    }

    protected static void AssertEnabled(Window w, string source, bool want, params string[] ids)
    {
        Assert.Multiple(() =>
        {
            foreach (var id in ids)
            {
                var el = Uia.ById(w, id);
                Assert.That(el, Is.Not.Null, $"không có {id}");
                if (el is not null)
                    Assert.That(el.Properties.IsEnabled.ValueOrDefault, Is.EqualTo(want), $"{id}.Enabled — {source}");
            }
        });
    }

    // ── G3: mở 204002 theo từng ca ───────────────────────────────────────────

    /// <summary>Dữ liệu nền G3: 保険 300点 / 900円, 自費 5000 + thuế 500.</summary>
    protected SeisanDb.UnpaidSeed[] BaseRows() =>
    [
        new(TrtDate, KmCd: 40, Score: 300, ClaimAmt: 900, ScoreD1: 50, ScoreD9: 250),
        new(TrtDate, KmCd: 50, Score: 0, ClaimAmt: 5000, Tax: 500),
    ];

    /// <summary>
    /// Rời 204002 không lưu. Gọi ở ĐẦU ca sau chứ không ở [TearDown]: TearDown lớp con chạy
    /// trước TearDown của UiTestBase, rời màn ở đó thì ảnh chụp lúc đỏ chỉ còn 204001.
    /// </summary>
    protected void LeaveSeisan()
    {
        if (App.Window(SeisanNav.Seisan) is not { } s) return;
        if (Uia.ById(s, "btnShift") is { } sh && Uia.NameOf(sh) == "ON") Uia.MouseClick(sh);
        SeisanNav.Press(s, Vk.F10);
        SeisanNav.AnswerDialogs(App, TimeSpan.FromSeconds(4));   // Q00004 「登録せずに」 ⇒ OK
        if (Waits.TryFor(() => App.Window(SeisanNav.Counter), TimeSpan.FromSeconds(5)) is null
            && App.Window(SeisanNav.Seisan) is { } still && Uia.ById(still, "btnF10") is { } b)
        {
            Uia.MouseClick(b);
            SeisanNav.AnswerDialogs(App, TimeSpan.FromSeconds(4));
        }
    }

    /// <summary>Trả dữ liệu bệnh nhân test về nền, áp <paramref name="setup"/>, mở 204002.</summary>
    protected Window Open(Action setup)
    {
        LeaveSeisan();
        Db2.ReplaceUnpaid(TestPatNo, BaseRows());
        Db2.SetPersonExp(TestPatNo);
        Db2.SetAccRate(TestPatNo, 0);
        setup();

        var c = Wait(SeisanNav.Counter, TimeSpan.FromSeconds(15));
        SeisanNav.EnterPatient(c, TestPatNo);
        Assert.That(SeisanNav.AnswerDialogs(App, TimeSpan.FromSeconds(3)), Is.Empty, "mở 204002 không có hộp thoại");
        return Wait(SeisanNav.Seisan, TimeSpan.FromSeconds(20));
    }

    /// <summary>F6/F7 trên 204002, chờ dải phím đổi (phím có lúc mất — README bẫy #8).</summary>
    protected void Key(Window w, ushort vk)
    {
        var before = FKeys(w);
        SeisanNav.Press(w, vk);
        if (!Waits.TryUntil(() => FKeys(w) != before, TimeSpan.FromSeconds(4)) && Uia.ById(w, $"btnF{vk - 0x6F}") is { } b)
        {
            Uia.MouseClick(b);
            Waits.TryUntil(() => FKeys(w) != before, TimeSpan.FromSeconds(4));
        }
    }
}
