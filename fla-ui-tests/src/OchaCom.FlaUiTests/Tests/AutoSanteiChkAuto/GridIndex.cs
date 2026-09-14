using OchaCom.FlaUiTests.Tests.SigaToothStatus;
using OchaCom.FlaUiTests.Tests.TreatmentGrid;

namespace OchaCom.FlaUiTests.Tests.AutoSanteiChkAuto;

/// <summary>
/// Tìm CHỖ của một dòng trên lưới 処置 — bản sao 1-1 của <c>lastIdxOf()</c> và
/// <c>nearestIdxOf()</c> trong
/// <c>../../../../../web-tenant-tests/tests/auto-santei/chk-auto-comment-order.spec.ts</c>.
///
/// <para><b>BẪY 1 của cặp parity này (đừng gỡ).</b> Lưới <c>grdRegi</c> mở CẢ THÁNG, và
/// bệnh nhân test có sẵn dòng TRÙNG TÊN ở ngày khác — 「OA+ｵｰﾗ注歯科用ｶｰﾄﾘｯｼﾞ 料1.8mL」 của
/// ngày 03 và của ngày 14 là hai dòng khác nhau nhưng cùng một chuỗi. Hỏi 「dòng đó ở
/// đâu」 bằng <c>FirstOrDefault</c> là vớ phải bản của ngày khác, và mọi assert về THỨ TỰ
/// sau đó đều sai mà không ai biết.</para>
///
/// <para>Vì thế mọi phép định vị phải neo vào dòng 処置 VỪA CHỐT: <see cref="Last"/> tìm
/// chính nó (bản mới nhất), <see cref="Nearest"/> tìm các dòng đi kèm quanh nó.</para>
///
/// <para>Hai bên PHẢI dùng cùng một quy tắc, nếu không thì đỏ/xanh nói về harness chứ
/// không nói về app.</para>
/// </summary>
public static class GridIndex
{
    /// <summary>
    /// Lần xuất hiện CUỐI của <paramref name="needle"/> (đã chuẩn hoá) — dùng cho chính
    /// dòng 処置 vừa chốt, vì nó là bản mới nhất trên lưới.
    /// </summary>
    public static int Last(IReadOnlyList<RegiRow> rows, string needle)
    {
        var n = AutoSanteiOps.Norm(needle);
        if (n.Length == 0) return -1;
        for (var i = rows.Count - 1; i >= 0; i--)
            if (AutoSanteiOps.Norm(rows[i].Ryo).Contains(n)) return i;
        return -1;
    }

    /// <summary>
    /// Bản GẦN <paramref name="anchor"/> nhất — dùng cho các dòng đi kèm. Bản đã lưu ở
    /// ngày khác nằm xa hơn nên không cướp mất kết quả.
    /// </summary>
    /// <remarks>
    /// Khi hai bản CÁCH ĐỀU anchor thì bản ở TRÊN thắng (so sánh <c>&lt;</c> chặt, không
    /// phải <c>&lt;=</c>) — giữ y hệt bên web, kể cả ở chỗ hơi tuỳ tiện này, để hai vế
    /// không bao giờ lệch nhau vì một quy tắc phá hoà.
    /// </remarks>
    public static int Nearest(IReadOnlyList<RegiRow> rows, string needle, int anchor)
    {
        var n = AutoSanteiOps.Norm(needle);
        if (n.Length == 0) return -1;
        var best = -1;
        for (var i = 0; i < rows.Count; i++)
        {
            if (!AutoSanteiOps.Norm(rows[i].Ryo).Contains(n)) continue;
            if (best < 0 || Math.Abs(i - anchor) < Math.Abs(best - anchor)) best = i;
        }
        return best;
    }

    /// <summary>
    /// Chỗ của một 処置 theo master — thử CẢ HAI tên (<c>cct_nm</c> / <c>trt_nm</c>) vì lưới
    /// in cái nào là tuỳ cờ <c>ModCommon.pCultTrt</c> của MÁY.
    /// </summary>
    public static int NearestOf(IReadOnlyList<RegiRow> rows, MstTrtRow master, int anchor)
    {
        foreach (var name in master.DisplayNames)
        {
            var i = Nearest(rows, name, anchor);
            if (i >= 0) return i;
        }
        return -1;
    }

    /// <summary>Chỗ CUỐI của một 処置 theo master — dùng cho chính dòng vừa chốt.</summary>
    public static int LastOf(IReadOnlyList<RegiRow> rows, MstTrtRow master)
    {
        foreach (var name in master.DisplayNames)
        {
            var i = Last(rows, name);
            if (i >= 0) return i;
        }
        return -1;
    }

    /// <summary>Nội dung lưới dạng một dòng, để nhét vào thông điệp assert.</summary>
    public static string Describe(IReadOnlyList<RegiRow> rows) =>
        "[" + string.Join(" / ", rows.Select(r => r.Ryo)) + "]";
}
