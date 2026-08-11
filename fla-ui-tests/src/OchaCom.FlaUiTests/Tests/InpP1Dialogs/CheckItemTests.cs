using FlaUI.Core.AutomationElements;
using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.InpP1Dialogs;

/// <summary>
/// <b>B. チェック項目設定 (frm203044)</b> — bản WinForm của nhóm TC-CHK-* trong
/// <c>web-tenant-tests/tests/inp-p1-ported-dialogs.spec.ts</c>.
///
/// <para>Giá trị lớn nhất của fixture này là <c>Tc1</c>: 19 nhãn ở đây là <b>đáp án</b> cho
/// hợp đồng BE↔FE của bản web (<c>Domain/Constants/CheckItemSettings.cs</c> → JSON của
/// <c>GET /tenant/chk-prm</c>). Bên web không khai lại bảng nhãn trong component nên
/// testcase là chỗ DUY NHẤT khoá được nội dung — và chỗ này là nơi lấy nội dung đó ra.</para>
///
/// <para><b>Ghi DB</b>: chỉ <c>Tc6</c>, và chỉ khi <c>inpP1.allowSave = true</c>.
/// ⚠️ <c>chkprm</c> là cấu hình TOÀN PHÒNG KHÁM — đổi nó là đổi luật check của mọi bệnh
/// nhân, không phải dữ liệu của riêng bệnh nhân test.</para>
/// </summary>
[TestFixture]
[Category("inp-p1")]
[Category("check-item")]
public sealed class CheckItemTests : InpP1TestBase
{
    private Window? _dialog;

    private Window Dialog => _dialog ??= CheckItemDialog.Open(App, Screen.Window);

    [OneTimeTearDown]
    public void CloseDialogIfLeftOpen()
    {
        var open = App?.Window(CheckItemDialog.DialogId);
        if (open is null) return;
        try { CheckItemDialog.Close(App!, open); }
        catch (Exception e) { Log($"khong dong duoc {CheckItemDialog.DialogId}: {e.Message}"); }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Tc1 — TC-CHK-OPEN-1 + TC-CHK-ROWS-1
    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(1)]
    [Description("Tc1 — mở dialog: đủ 19 nhãn ĐÚNG NGUYÊN VĂN và đủ 19 combo")]
    public void Tc1_OpenAndRows()
    {
        using var trace = TestTrace.Begin();

        _dialog = CheckItemDialog.Open(App, Screen.Window, trace);

        var title = Uia.NameOf(_dialog);
        trace.Note($"title: 「{title}」");
        Assert.That(Txt.Has(title, CheckItemDialog.TitleFragment), Is.True,
            $"Dialog {CheckItemDialog.DialogId} phai co title chua " +
            $"「{CheckItemDialog.TitleFragment}」 (_title, frm203044.cs:30).");

        // 19 nhãn, nguyên văn Designer: 「  9 調Ａの算定漏れ」 = số thứ tự + nhãn.
        // Sai một chữ là màn hình nói sai với người dùng — và bản web đang chép lại
        // đúng danh sách này từ BE.
        var actual = new List<string>();
        foreach (var item in CheckItemDialog.Items)
        {
            var text = CheckItemDialog.LabelText(_dialog, item.No);
            actual.Add(text);
            Assert.That(text, Is.Not.Empty,
                $"khong doc duoc nhan cua muc {item.No} ({item.LabelId}) — " +
                "kiem lai frm203044.Designer.cs con dat ten customLabel{n} khong.");
            Assert.That(Txt.Same(text, item.ExpectedLabelText), Is.True,
                $"muc {item.No}: WinForm hien 「{text}」, ky vong 「{item.ExpectedLabelText}」 " +
                "(frm203044.Designer.cs customLabel" + item.No + ".Text). " +
                "Neu WinForm moi la dung thi phai sua CheckItemSettings.cs cua ban web.");
        }
        LogKq(4, "19 nhan cua frm203044: " + string.Join(" | ", actual));

        // Đúng 19 combo — _param = new ComboBox[19] (frm203044.cs:25). ChkPrmData còn có
        // param20 (ChkPrm.cs:39) nhưng KHÔNG có ô nào trên màn cho nó.
        foreach (var item in CheckItemDialog.Items)
        {
            Assert.That(Uia.ById(_dialog, item.ComboId), Is.Not.Null,
                $"khong thay combo 「{item.ComboId}」 cua muc {item.No}. " +
                "Chu y quy tac dem so 0: cboParam01..cboParam09 roi cboParam10..cboParam19.");
        }
        Assert.That(Uia.ById(_dialog, "cboParam20"), Is.Null,
            "man hinh KHONG duoc co cboParam20 — _param chi co 19 phan tu (frm203044.cs:25).");
        trace.Step("19 nhan + 19 combo");
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Tc2 — TC-CHK-ROWS-2
    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(2)]
    [Description("Tc2 — bố cục hai cột: mục 1-10 bên trái, mục 11-19 bên phải")]
    public void Tc2_TwoColumnLayout()
    {
        using var trace = TestTrace.Begin();

        var leftLast = CheckItemDialog.LabelElement(Dialog, CheckItemDialog.LeftColumnLastItem);
        var rightFirst = CheckItemDialog.LabelElement(Dialog, CheckItemDialog.LeftColumnLastItem + 1);
        Assert.That(leftLast, Is.Not.Null, $"khong thay nhan muc {CheckItemDialog.LeftColumnLastItem}");
        Assert.That(rightFirst, Is.Not.Null, $"khong thay nhan muc {CheckItemDialog.LeftColumnLastItem + 1}");

        var left = leftLast!.BoundingRectangle;
        var right = rightFirst!.BoundingRectangle;
        trace.Note($"muc {CheckItemDialog.LeftColumnLastItem}: X={left.X} Y={left.Y} · " +
                   $"muc {CheckItemDialog.LeftColumnLastItem + 1}: X={right.X} Y={right.Y}");

        // Đọc theo TOẠ ĐỘ, không theo thứ tự trong cây UIA: Designer xếp control lộn xộn
        // (cboParam10 khai trước cboParam19) nên thứ tự cây không nói lên bố cục.
        Assert.That(right.X, Is.GreaterThan(left.X),
            $"muc {CheckItemDialog.LeftColumnLastItem + 1} phai nam o COT PHAI cua muc " +
            $"{CheckItemDialog.LeftColumnLastItem} (bo cuc Designer: 1-10 trai, 11-19 phai).");
        trace.Step("bo cuc hai cot dung");
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Tc3 — TC-CHK-COMBO-1
    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(3)]
    [Description("Tc3 — mỗi mục đổ combo từ đúng cd_type của nó (62 / 63 / 64)")]
    public void Tc3_ComboSourcePerItem()
    {
        using var trace = TestTrace.Begin();

        // setItemData (frm203044.cs:134-158): i == 6 → 63; i == 16 || 17 → 64; còn lại → 62.
        // Dấu hiệu QUAN SÁT ĐƯỢC của cd_type là DANH SÁCH MỤC, nên so với chính CODMST.
        var db = RequireInpDb("can doc CODMST 62/63/64 de biet moi combo phai co bao nhieu muc");

        var expectedByType = new[] { 62, 63, 64 }
            .ToDictionary(t => t, t => db.ComboItems(t).Select(c => Txt.N(c.Label)).ToList());

        foreach (var (cdType, labels) in expectedByType)
            LogKq(5, $"CODMST {cdType}: {string.Join(" / ", labels)}");

        foreach (var item in CheckItemDialog.Items)
        {
            var actual = CheckItemDialog.ComboItems(Dialog, item.No).Select(Txt.N).ToList();
            var expected = expectedByType[item.CdType];
            Assert.That(actual, Is.EqualTo(expected),
                $"muc {item.No}「{item.Label}」 phai do tu CODMST cd_type {item.CdType} " +
                $"(setItemData, frm203044.cs:141-155). Dang co: {string.Join(" / ", actual)}");
        }
        trace.Step("19 combo do dung cd_type");

        // Mục 7 là mục DUY NHẤT nhận được 「２回目以降」 — đặc điểm mà Tc6 dựa vào để
        // chứng minh payload không lệch vị trí.
        var probe = CheckItemDialog.ComboItems(Dialog, CheckItemDialog.SecondOnwardsItemNo);
        Assert.That(probe.Any(o => Txt.Has(o, "２回目以降")), Is.True,
            $"CODMST 63 phai co muc 「２回目以降」 (cd_val {CheckItemDialog.SecondOnwardsValue}), " +
            $"dang co: {string.Join(" / ", probe)}");
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Tc4 — TC-CHK-LOAD-1
    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(4)]
    [Description("Tc4 — 19 combo mang đúng giá trị chkprm; chưa từng lưu thì đúng mặc định 1 / 9")]
    public void Tc4_LoadValues()
    {
        using var trace = TestTrace.Begin();

        foreach (var item in CheckItemDialog.Items)
        {
            Assert.That(CheckItemDialog.SelectedText(Dialog, item.No), Is.Not.Empty,
                $"combo cua muc {item.No}「{item.Label}」 rong — dspData khong dat duoc " +
                "SelectedValue (frm203044.cs:163-201). ComboBoxStyle la DropDownList nen " +
                "rong = nguoi dung khong chon duoc gi.");
        }

        var db = RequireInpDb("can doc chkprm de biet 19 combo phai mang gia tri nao");
        var stored = db.ReadChkPrm();

        // dspData (frm203044.cs:163-201):
        //   · có dòng chkprm → param{i}, riêng giá trị "0" quy về 1;
        //   · KHÔNG có dòng nào → 1, riêng mục 14/15/16 → 9.
        // Đây đúng là bộ mặc định mà `GET /tenant/chk-prm` của bản web phải trả khi
        // isConfigured = false.
        LogKq(5, stored is null
            ? "chkprm CHUA co dong nao — man hinh dang hien GIA TRI MAC DINH cua WinForm."
            : $"chkprm param1..19 = {string.Join(" ", stored)}");

        foreach (var item in CheckItemDialog.Items)
        {
            var expectedVal = ExpectedValue(stored, item.No);
            var expectedLabel = db.ComboLabel(item.CdType, expectedVal);
            if (expectedLabel is null)
            {
                Log($"BO QUA muc {item.No}: CODMST {item.CdType} khong co cd_val {expectedVal}");
                continue;
            }

            var actual = CheckItemDialog.SelectedText(Dialog, item.No);
            Assert.That(Txt.Same(actual, expectedLabel), Is.True,
                $"muc {item.No}「{item.Label}」 phai hien 「{expectedLabel}」 (cd_val {expectedVal}), " +
                $"dang hien 「{actual}」 — dspData doc sai cot chkprm hoac sai mac dinh.");
        }
        trace.Step("19 combo khop chkprm / mac dinh");
    }

    /// <summary>Giá trị mà <c>dspData</c> sẽ chọn cho mục <paramref name="no"/>.</summary>
    private static int ExpectedValue(int[]? stored, int no)
    {
        if (stored is null)
            return CheckItemDialog.DefaultOffItemNos.Contains(no) ? CheckItemDialog.NoCheckValue : 1;

        var v = stored[no - 1];
        return v == 0 ? 1 : v;   // frm203044.cs:174-177
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Tc5 — TC-CHK-CLOSE-1
    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(5)]
    [Description("Tc5 — F10 戻る không lưu; mở lại thì bỏ chỉnh sửa dở")]
    public void Tc5_BackDiscardsEdits()
    {
        using var trace = TestTrace.Begin();

        const int probeNo = 1;
        var seeded = CheckItemDialog.SelectedText(Dialog, probeNo);
        var rowsBefore = InpDb?.CountChkPrmRows();
        var storedBefore = InpDb?.ReadChkPrm();

        if (!CheckItemDialog.SelectAnyOther(Dialog, probeNo))
            IgnoreWithReason($"combo muc {probeNo} chi co MOT muc — khong doi thu duoc.");

        var changed = CheckItemDialog.SelectedText(Dialog, probeNo);
        trace.Note($"muc {probeNo}: 「{seeded}」 → 「{changed}」");
        Assert.That(Txt.Same(changed, seeded), Is.False, "chua doi duoc gia tri de kiem 戻る.");

        CheckItemDialog.Close(App, Dialog, trace);
        _dialog = null;

        if (InpDb is not null)
        {
            Assert.That(InpDb.CountChkPrmRows(), Is.EqualTo(rowsBefore),
                "F10 戻る ma so dong chkprm doi — 戻る khong duoc ghi gi.");
            Assert.That(InpDb.ReadChkPrm(), Is.EqualTo(storedBefore),
                "F10 戻る ma chkprm doi gia tri — btnF10_Click chi Close() (BaseDialog.cs:347).");
        }

        _dialog = CheckItemDialog.Open(App, Screen.Window, trace);
        Assert.That(Txt.Same(CheckItemDialog.SelectedText(_dialog, probeNo), seeded), Is.True,
            "mo lai phai lay lai gia tri da luu (dspData chay moi lan Load), khong giu chinh sua do.");
        trace.Step("mo lai: bo chinh sua do");
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Tc6 — TC-CHK-SAVE-1 + TC-CHK-SAVE-2 (GHI THẬT)
    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(6)]
    [Description("Tc6 — F9 登録 ghi ĐÚNG param7, và chkprm còn ĐÚNG 1 dòng (inpP1.allowSave)")]
    public void Tc6_SaveWritesChkPrm()
    {
        RequireAllowSave("ghi that chkprm — cau hinh TOAN PHONG KHAM, doi ca luat check");
        var db = RequireInpDb("can doc lai chkprm de biet F9 co ghi that khong");

        using var trace = TestTrace.Begin();

        var before = db.ReadChkPrm();
        var probeNo = CheckItemDialog.SecondOnwardsItemNo;
        var probeBefore = before?[probeNo - 1];
        LogKq(5, $"truoc khi ghi: chkprm co {db.CountChkPrmRows()} dong, " +
            $"param{probeNo} = {(probeBefore?.ToString() ?? "chua co dong nao")}");

        try
        {
            // Đổi mục 7 sang 「２回目以降」 (cd_val 2) — giá trị mà KHÔNG mục nào khác nhận
            // được, nên nếu app ghi lệch vị trí là lộ ra ngay ở cột param7.
            Assert.That(CheckItemDialog.SelectByText(Dialog, probeNo, "２回目以降"), Is.True,
                $"khong chon duoc 「２回目以降」 cho muc {probeNo}.");
            trace.Step($"muc {probeNo} = 「２回目以降」");

            CheckItemDialog.PressF9(Dialog);
            var alert = InpP1MenuFlow.ReadAndDismissError(App, Dialog, TimeSpan.FromSeconds(5));
            Assert.That(alert, Is.Null,
                $"F9 登録 voi du lieu hop le ma van bung canh bao: 「{alert}」 " +
                "(E00021 = con combo chua chon; E99999 = transaction rollback).");

            Waits.Until(() => App.Window(CheckItemDialog.DialogId) is null,
                        "dialog dong lai sau khi F9 登録 thanh cong",
                        Settings.Run.DefaultTimeout);
            _dialog = null;

            var after = db.ReadChkPrm();
            Assert.That(after, Is.Not.Null, "F9 xong ma chkprm van khong co dong nao.");
            Assert.That(after![probeNo - 1], Is.EqualTo(CheckItemDialog.SecondOnwardsValue),
                $"param{probeNo} phai bang {CheckItemDialog.SecondOnwardsValue}. " +
                "setInputData ghi theo VI TRI (frm203044.cs:262-271) — lech mot o la ghi nham muc.");

            // updateProc = deleteChkPrm + insertChkPrm trong MỘT transaction (:239-241)
            // ⇒ mỗi lần lưu KHÔNG được đẻ thêm dòng, nếu không thì luật check thành ngẫu nhiên.
            Assert.That(db.CountChkPrmRows(), Is.EqualTo(1),
                "chkprm phai con DUNG 1 dong sau khi luu (delete + insert, frm203044.cs:239-241).");

            _dialog = CheckItemDialog.Open(App, Screen.Window, trace);
            Assert.That(Txt.Has(CheckItemDialog.SelectedText(_dialog, probeNo), "２回目以降"), Is.True,
                "luu xong mo lai phai thay 「２回目以降」.");
            trace.Step("mo lai: thay gia tri vua ghi");
        }
        finally
        {
            RestoreChkPrm(db, before);
        }
    }

    /// <summary>
    /// Trả <c>chkprm</c> về trạng thái trước Tc6 — qua giao diện, không ghi thẳng DB.
    ///
    /// <para>Trường hợp trước đó bảng RỖNG thì không khôi phục được bằng giao diện (F9 luôn
    /// chèn một dòng); lúc đó chỉ in cảnh báo. Đó là đánh đổi có chủ ý: xoá dòng bằng SQL
    /// sẽ biến lớp chỉ-đọc thành lớp có ghi.</para>
    /// </summary>
    private void RestoreChkPrm(InpP1Db db, int[]? before)
    {
        try
        {
            if (before is null)
            {
                Log("CANH BAO — truoc Tc6 chkprm CHUA co dong nao; F9 da chen mot dong. " +
                    "Muon ve trang thai cu thi phai XOA dong do bang tay: DELETE FROM chkprm.");
                return;
            }

            var probeNo = CheckItemDialog.SecondOnwardsItemNo;
            var target = before[probeNo - 1] == 0 ? 1 : before[probeNo - 1];
            var label = db.ComboLabel(CheckItemDialog.Item(probeNo).CdType, target);
            if (label is null)
            {
                Log($"CANH BAO — CODMST 63 khong co cd_val {target}, khong tra lai duoc muc {probeNo}.");
                return;
            }

            var dialog = App.Window(CheckItemDialog.DialogId) ?? CheckItemDialog.Open(App, Screen.Window);
            CheckItemDialog.SelectByText(dialog, probeNo, label);
            CheckItemDialog.PressF9(dialog);
            InpP1MenuFlow.ReadAndDismissError(App, dialog, TimeSpan.FromSeconds(3));
            Waits.TryUntil(() => App.Window(CheckItemDialog.DialogId) is null, Settings.Run.DefaultTimeout);
            _dialog = null;

            var now = db.ReadChkPrm();
            if (now is not null && now[probeNo - 1] == target)
            {
                Log($"da tra chkprm.param{probeNo} ve {target}.");
                return;
            }

            Log($"CANH BAO — chua tra duoc chkprm.param{probeNo} ve {target} " +
                $"(hien {now?[probeNo - 1]}). KHOI PHUC THU CONG.");
        }
        catch (Exception e)
        {
            Log($"CANH BAO — khoi phuc chkprm that bai: {e.Message}. " +
                $"Gia tri goc: {(before is null ? "khong co dong nao" : string.Join(" ", before))}. " +
                "KHOI PHUC THU CONG.");
        }
    }
}
