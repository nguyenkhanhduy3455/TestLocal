namespace OchaCom.FlaUiTests.Tests.PatientVisitList;

/// <summary>
/// レセプト識別 KỲ VỌNG — viết lại từ <c>buiPrice.getReceiptType</c>
/// (COMMON/Lib/buiPrice.cs:1502-1602) từ dữ liệu THÔ trong DB.
///
/// <para>Vì sao viết lại thay vì đọc cột trên lưới rồi so với chính nó: một oracle độc
/// lập là thứ DUY NHẤT phân biệt được 「WinForm và web cùng đúng」 với 「hai bên cùng sai
/// theo một kiểu」. Bản Playwright cũng có đúng hàm này
/// (<c>web-tenant-tests/tests/patient-visit-list-rcp-type.spec.ts</c>
/// <c>expectedReceiptType</c>) — hai bản phải cho CÙNG kết quả trên cùng một hàng dữ
/// liệu, đó chính là phép đo parity.</para>
///
/// <para>Trả <c>null</c> khi không suy ra được — xem <see cref="Expected"/>.</para>
/// </summary>
public static class ReceiptTypeOracle
{
    /// <summary>
    /// 年齢（学年基準）— port <c>ComLibrary.getAge2</c> (ComLibrary.cs:238-251).
    ///
    /// <para>Mốc là <b>1/4 mở đầu năm học chứa ngày khám</b>, KHÔNG phải sinh nhật: tháng
    /// từ 4 trở đi thì lấy năm sau. Nhánh 六外 (&lt; 7 tuổi) đứng hay ngã ở đúng con số
    /// này.</para>
    /// </summary>
    public static int SchoolYearAge(DateTime birth, DateTime baseDate)
    {
        var wkYear = baseDate.Month >= 4 ? baseDate.Year + 1 : baseDate.Year;
        var age = wkYear - birth.Year;
        if (4 * 100 + 1 < birth.Month * 100 + birth.Day) age -= 1;
        return age;
    }

    /// <summary>
    /// レセプト識別 mà WinForm phải hiện cho một dòng (bệnh nhân × ngày).
    ///
    /// <para>Trả <c>null</c> = 「oracle không dám trả lời」, testcase bỏ qua dòng đó thay vì
    /// đoán:</para>
    /// <list type="bullet">
    /// <item><b>không có bản 保険 nào</b> cho cặp (pat_no, pat_br) của dòng đó — WinForm
    ///       sẽ ném ngay ở <c>DateTime.Parse</c> và bung E00100.</item>
    /// <item><b><c>combi_kbn != 1</c> và <c>ins_kbn != 7</c></b> (併用): số 公費 thực sự áp
    ///       dụng do <c>setBurdenType</c> quyết (buiPrice.cs:1726-1868), phụ thuộc master
    ///       福祉医療 + tỉnh — dựng lại ở đây là chép nguyên một hệ thống khác.</item>
    /// <item><b>thiếu <c>Birthdate</c></b> — cùng lý do với ca đầu.</item>
    /// </list>
    /// </summary>
    public static string? Expected(VisitInsurance? ins, DateTime trtDt)
    {
        if (ins is null) return null;

        if (ins.InsKbn == 3) return "労災";
        if (ins.InsKbn == 6) return "自費";
        if (ins.Birthdate is not { } birth) return null;

        var dsp = ins.InsKbn switch
        {
            7 => "公費・",
            1 or 8 => "社・",
            2 => "国・",
            9 => "退職・",
            10 => "後期・",
            _ => "",
        };

        if (ins.CombiKbn == 1 || ins.InsKbn == 7) dsp += "単独・";
        else return null;

        var age2 = SchoolYearAge(birth, trtDt);
        if (age2 < 7 && ins.InsKbn != 7) dsp += "六外";
        else if (ins.InsKbn == 7) dsp += "本外";
        else if (ins.OldFlg is 4 or 5) dsp += ins.BurRate == 30 ? "高外７" : "高外－";
        else if (ins.OldFlg == 1) dsp += "本外";
        else if (ins.FmType == 1) dsp += "本外";
        else dsp += "家外";

        return dsp;
    }
}
