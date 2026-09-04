using FlaUI.Core.AutomationElements;

namespace OchaCom.FlaUiTests.Tests.PerioKensaOrder;

/// <summary>
/// Chép lại ĐÚNG luật điều hướng của <c>frm203028</c>/<c>frm203029</c> để tính ra ô mà con
/// trỏ PHẢI tới, dựa trên <b>tập răng CÓ THẬT</b> mà chính app đang phơi ra.
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// VÌ SAO KHÔNG ASSERT SỐ CỨNG NHƯ SPEC PLAYWRIGHT
/// ═══════════════════════════════════════════════════════════════════════════════
/// Spec web seed thẳng một dòng <c>trn_trn</c> có <c>bui</c> toàn 1, nên nó biết chắc cả
/// 32 răng đều tồn tại và assert được 「răng 0」/「răng 15」 bằng số.
///
/// <para>Bên WinForm dựng 部位 qua giao diện, và <c>F7 全顎</c> <b>KHÔNG</b> nghĩa là 32
/// răng: <c>setBui</c> chỉ bật răng nào có <c>_plaqueData.bui* == 1</c> và
/// <c>_sigaData.bui* != 4</c> (欠損歯) — frm902003.cs:841-895. Đo thật 2026-09-04 trên bệnh
/// nhân test: 全顎 ra <b>25/32</b> ô, thiếu đúng các răng 0, 3, 4, 5, 15, 16, 31 — tức là
/// thiếu CẢ HAI mốc mà spec web assert cứng (răng 0 cho nhánh 右上, răng 15 cho nhánh 左上).</para>
///
/// <para>Ép cho đủ 32 thì phải ghi <c>SIGA</c> của bệnh nhân về 全部残存 — một phép GHI DB
/// vào bảng mà luồng khác đang đo. Thay vào đó, luồng này <b>đọc tập răng từ chính hộp
/// thoại</b> (ô nào không bị khoá ／ thì răng đó tồn tại — đúng bằng <c>tyToothInf[].flg</c>
/// mà <c>getMoveIndex</c> dùng) rồi tính kỳ vọng theo luật. Kết quả: assert vẫn khoá đúng
/// LUẬT, mà chạy được trên mọi bệnh nhân / mọi máy.</para>
///
/// <para>⚠️ Đây là chỗ DUY NHẤT trong luồng có "chép lại logic của app". Giữ nó nhỏ, và
/// giữ nó bám sát từng dòng của bản gốc — chú thích dưới dẫn đúng số dòng.</para>
/// </summary>
internal static class PerioNav
{
    public const int ToothCount = PerioExamDialog.ToothCount;

    /// <summary>
    /// <c>tyToothInf[i].next</c> — <c>i+1</c>, khép vòng <c>31 → 0</c>
    /// (frm203028.cs:471-484).
    /// </summary>
    public static int Next(int i) => i == 31 ? 0 : i + 1;

    /// <summary><c>tyToothInf[i].prev</c> — <c>i-1</c>, khép vòng <c>0 → 31</c>.</summary>
    public static int Prev(int i) => i == 0 ? 31 : i - 1;

    /// <summary>
    /// <c>getMoveIndex</c> (frm203028.cs:610-657, frm203029.cs:921-965) — bản dịch
    /// nguyên văn:
    /// <code>
    ///   do {
    ///       idx = leftFirst ? prev(idx) : next(idx);
    ///       if (idx == (leftFirst ? 15 : 0)) finflag = true;   // KHÔNG reset về false
    ///   } while (!present[idx]);
    /// </code>
    /// <b>Hai chi tiết dễ bỏ sót, cả hai đều đổi kết quả:</b>
    /// <list type="number">
    ///   <item><c>finflag</c> được đặt khi vòng lặp ĐI QUA mốc, kể cả khi răng ở mốc đó
    ///     KHÔNG tồn tại và vòng lặp còn chạy tiếp. Nó không bao giờ bị gán lại
    ///     <c>false</c>. Đây chính là ca của bệnh nhân test — răng 15 và răng 0 đều là
    ///     欠損.</item>
    ///   <item>Cả cụm chỉ chạy khi có ÍT NHẤT một răng tồn tại (無歯顎 thì đứng yên).</item>
    /// </list>
    /// </summary>
    /// <returns><c>Tooth</c> = răng đích; <c>RowChange</c> = <c>idx + 100</c>, tức nhảy
    /// sang hàng đo kế tiếp.</returns>
    public static (int Tooth, bool RowChange) MoveIndex(bool[] present, int idx, bool leftFirst)
    {
        if (!present.Any(p => p)) return (idx, false);   // 無歯顎: đứng yên

        var fin = false;
        var guard = 0;
        do
        {
            idx = leftFirst ? Prev(idx) : Next(idx);
            if (idx == (leftFirst ? PerioExamDialog.UpperLeftLastTooth : 0)) fin = true;
        } while (!present[idx] && ++guard <= ToothCount * 2);

        return (idx, fin);
    }

    /// <summary>
    /// フォーカス設定 — răng mà con trỏ rơi vào khi màn hình vừa mở
    /// (frm203028.cs:488-512; frm203029.cs:100-156 dùng y hệt).
    /// <code>
    ///   左上: quét 上顎 15→0 TRƯỚC; 上顎 trống hết mới quét 下顎 31→16
    ///   右上: quét thẳng 0→31
    /// </code>
    /// </summary>
    /// <returns>-1 khi không răng nào tồn tại (無歯顎).</returns>
    public static int FirstTooth(bool[] present, bool leftFirst)
    {
        if (leftFirst)
        {
            for (var i = PerioExamDialog.UpperLeftLastTooth; i >= 0; i--)
                if (present[i]) return i;
            for (var i = ToothCount - 1; i >= 16; i--)
                if (present[i]) return i;
            return -1;
        }

        for (var i = 0; i < ToothCount; i++)
            if (present[i]) return i;
        return -1;
    }

    /// <summary>
    /// Điểm 口蓋 mà con trỏ vào khi tới răng <paramref name="tooth"/>:
    /// 4点法 → <c>t*3+1</c>; 6点法 右上 → <c>t*3+0</c>, <b>6点法 左上 → <c>t*3+2</c></b>
    /// (frm203029.cs:120-152, và y hệt ở nhánh Enter :486-500).
    /// </summary>
    public static int KouEntryPoint(int tooth, bool leftFirst, bool fourPoint) =>
        fourPoint ? tooth * 3 + 1
                  : leftFirst ? tooth * 3 + 2
                              : tooth * 3;

    // ── Đọc tập răng từ CHÍNH hộp thoại ──────────────────────────────────────

    /// <summary>
    /// Răng nào còn tồn tại, đọc từ 歯周基本検査: ô EPP bị khoá ／ ⟺ <c>bui = 0</c> ⟺
    /// <c>tyToothInf[i].flg == false</c> (frm203028.cs:413-455).
    ///
    /// <para>Đọc từ giao diện chứ không từ DB là có chủ ý: thứ chi phối
    /// <c>getMoveIndex</c> là <c>tyToothInf</c> trong RAM, dựng từ <c>bui</c> mà F6 vừa
    /// truyền sang — DB có thể nói khác.</para>
    /// </summary>
    public static bool[] PresentFromKihon(Window kihon)
    {
        var present = new bool[ToothCount];
        for (var t = 0; t < ToothCount; t++)
            present[t] = PerioExamDialog.IsCellDisabled(kihon, PerioExamDialog.Epp(t)) == false;
        return present;
    }

    /// <summary>
    /// Như trên nhưng cho 歯周精密検査 — dùng hàng <b>BOP</b>, vì hàng 口蓋 còn bị 4点法
    /// khoá thêm hai điểm ngoài cùng (frm203029.cs:826-834) nên không phân biệt được
    /// 「răng mất」 với 「điểm không dùng ở chế độ này」.
    /// </summary>
    public static bool[] PresentFromSeimitu(Window seimitu)
    {
        var present = new bool[ToothCount];
        for (var t = 0; t < ToothCount; t++)
            present[t] = PerioExamDialog.IsCellDisabled(seimitu, PerioExamDialog.Bop(t)) == false;
        return present;
    }

    public static string Describe(bool[] present) =>
        $"{present.Count(p => p)}/{ToothCount} răng còn: [" +
        string.Join(",", Enumerable.Range(0, ToothCount).Where(t => present[t])) + "]";
}
