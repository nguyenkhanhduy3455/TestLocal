namespace OchaCom.FlaUiTests.Data;

/// <summary>
/// Chép lại phần <c>CommonChk.getTensu</c> mà testcase cần, để biết ĐÁNG LẼ app phải
/// ghi bao nhiêu điểm khi chọn một 処置 ở tab 個別 (CommonChk.cs:83-175).
///
/// Chỉ chép nhánh dùng tới, cố ý không chép đủ:
///   acc_unit 9..12 + NGÀY 訪問診療 + f1 = 0
///       乳幼児 hoặc 身障(dis_flg 1)  → score2
///       còn lại                      → score3
///
/// Ba nhánh KHÔNG mô phỏng (và testcase tự Ignore khi rơi vào):
///   · <c>dis_flg = 3</c> (歯科診療特別対応) — getTensu còn hỏi 加算 đã tính TRONG NGÀY
///     (<c>chkHighNeedsAdd</c>), không chốt được kỳ vọng tĩnh;
///   · f1 = 10/11 — cũng phụ thuộc 特別対応加算;
///   · 外来 + 全身麻酔 đã tính trong ngày (<c>chkGeneralAnesthesia</c>).
/// </summary>
public static class TensuOracle
{
    /// <summary>dis_flg 1 = 歯科診療困難者 (getTensu nâng lên score2).</summary>
    public const int DisFlgHandicapped = 1;

    /// <summary>dis_flg 3 = 歯科診療特別対応 — nhánh phụ thuộc 加算, testcase bỏ qua.</summary>
    public const int DisFlgHighNeeds = 3;

    /// <summary>
    /// 乳幼児 hay không, theo đúng mốc của <c>CommonChk.chkNyuyouji</c> (CommonChk.cs:48-71):
    /// trước 2002/04 là dưới 6 tuổi, 2002/04–2010/03 là dưới 5, từ 2010/04 lại là dưới 6.
    /// </summary>
    public static bool IsNyuyouji(int age, DateTime date)
    {
        if (date < new DateTime(2002, 4, 1)) return age < 6;
        if (date < new DateTime(2010, 4, 1)) return age < 5;
        return age < 6;
    }

    /// <summary>
    /// Điểm kỳ vọng khi chọn <paramref name="c"/> vào một NGÀY 訪問診療, kèm tên nhánh để
    /// in ra khi assert đỏ.
    /// </summary>
    public static (int Expected, string Branch) HomeVisitScore(
        MstTrtCandidate c, PatientScoreContext patient, DateTime date)
    {
        if (patient.DisFlg == DisFlgHighNeeds)
            throw new InvalidOperationException(
                "dis_flg = 3 (歯科診療特別対応): nhánh này phụ thuộc 加算 đã tính trong ngày, " +
                "gọi TensuOracle là sai — testcase phải Ignore trước đó.");

        if (c.AccUnit is < 9 or > 12 || c.F1 != 0)
            throw new InvalidOperationException(
                $"TensuOracle chỉ mô phỏng acc_unit 9..12 + f1 = 0, nhận được acc_unit={c.AccUnit} f1={c.F1}.");

        var nyuyouji = IsNyuyouji(patient.Age, date);
        if (nyuyouji || patient.DisFlg == DisFlgHandicapped)
            return (c.Score2, $"乳幼児/困難者 → score2 (tuổi {patient.Age}, dis_flg {patient.DisFlg})");

        return (c.Score3, $"ngoài 乳幼児/困難者 → score3 (tuổi {patient.Age}, dis_flg {patient.DisFlg})");
    }
}
