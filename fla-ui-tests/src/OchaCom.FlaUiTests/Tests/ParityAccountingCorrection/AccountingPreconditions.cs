using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.ParityAccountingCorrection;

/// <summary>
/// Dựng ĐỦ tiền đề để chuỗi F8 会計 rẽ được vào nhánh G (会計データ修正).
///
/// ═══════════════════════════════════════════════════════════════════════════
/// VÌ SAO PHẢI CÓ FILE NÀY
/// ═══════════════════════════════════════════════════════════════════════════
/// Lượt chẩn đoán 2026-08-11 11:21 đi hết chuỗi mà không gặp hộp thoại 「既に…会計処理…」
/// nào, rồi dừng ở cửa sổ 入金指定. Phản xạ đầu tiên là "thiếu luật cho cửa sổ đó" —
/// <b>sai</b>. Đọc <c>LetAccData2</c> thì thấy 入金指定 nằm ở modAcc.cs:602, tức là BÊN
/// TRONG nhánh 「会計データが存在しない」. Thấy nó = đã đi nhầm nhánh từ trước, thêm bao
/// nhiêu luật hộp thoại cũng không kéo về được.
///
/// <para>Nhánh rẽ ở modAcc.cs:598 và chỉ có hai điều kiện:</para>
/// <code>
///   if (past_billing_amount == 0 || ModCommon.pAccLink == false) {  // nhánh F: tạo 未精算
///       ... frm203027 入金指定 ...
///   } else {                                                        // nhánh G
///       ... ChgAccData(...) ...
///   }
/// </code>
/// <list type="number">
///   <item><b><c>past_billing_amount &gt; 0</c></b> — ngày test phải có dòng ACCDAT
///     医療保険 (<c>km_cd</c> 40-49/57/58, <c>lflg = 0</c>) với <c>claim_amt</c> khác 0.
///     <c>GetAccData</c> lọc theo (診療日, 患者) rồi CỘNG DỒN (modAcc.cs:869-880), không
///     lọc theo <c>km_cd</c> hay <c>trt_cnt</c> — nên một dòng seed là đủ.</item>
///   <item><b><c>tre_acc_link = 1</c></b> — công tắc tổng, đọc một lần lúc app khởi động.</item>
/// </list>
///
/// <para>Cả <see cref="ChgAccDataTests"/> lẫn <see cref="AccountingFlowDiagnosticsTests"/>
/// đều đi qua đây. Trước kia chỉ testcase dựng tiền đề, còn công cụ chẩn đoán thì không —
/// nên nó khảo sát một cây quyết định KHÁC với cây mà testcase sẽ gặp, và mọi luật rút ra
/// từ nó đều lệch địa chỉ. Công cụ chẩn đoán phải đứng cùng chỗ với testcase thì bản đồ
/// nó vẽ mới dùng được.</para>
/// </summary>
public static class AccountingPreconditions
{
    /// <param name="Blocker">null = đủ điều kiện; khác null = lý do nhánh G không tới được.</param>
    /// <param name="SeededAccounting">true = dòng 会計 do lô test tạo ⇒ teardown phải xoá.</param>
    public sealed record Result(string? Blocker, bool SeededAccounting)
    {
        public bool Ok => Blocker is null;
    }

    /// <summary>点数 / 請求金額 của dòng 会計 seed. Xấp xỉ một lượt 窓口精算 thật.</summary>
    public const int SeedScore = 339;

    public const int SeedClaimAmt = 1_020;

    public static Result Ensure(OchaDbAccounting db, int patNo, DateTime trtDt, TestTrace trace)
    {
        // ── 1. Công tắc tổng ────────────────────────────────────────────────
        var link = trace.Do("doc accconfig.tre_acc_link (cong tac tong cua nhanh G)",
                            db.ReadTreAccLink);
        trace.Note($"  tre_acc_link = {(link is null ? "(bang accconfig rong)" : link.ToString())}");

        if (link != 1)
        {
            // Được phép sửa DB (đây là auto test), nhưng KHÔNG được im lặng chạy tiếp:
            // app đang mở đã nạp cờ cũ vào ModCommon.pAccLink từ lúc khởi động.
            db.SetTreAccLink(1);
            trace.Note("  => da BAT tre_acc_link = 1 trong DB");
            return new Result(
                "処置会計連動 (accconfig.tre_acc_link) đang TẮT nên nhánh 会計データ修正 " +
                "không tồn tại — mọi lần F8 đều đi tạo 未精算データ.\n\n" +
                "  Đã tự bật = 1. Nhưng cờ này chỉ được đọc MỘT LẦN lúc app khởi động " +
                "(modCommon.cs:346), nên phải ĐÓNG WinForm rồi chạy lại lệnh test.\n\n" +
                "  Muốn trả về nguyên trạng sau khi xong:\n" +
                $"    UPDATE accconfig SET tre_acc_link = {link?.ToString() ?? "0"};",
                SeededAccounting: false);
        }

        // ── 2. 会計 đã chốt cho ngày test ────────────────────────────────────
        var patBr = trace.Do("lay 枝番 tu 処置 cua ngay", () => db.ResolvePatBr(patNo, trtDt));
        var seeded = trace.Do(
            $"bao dam ngay {trtDt:yyyy-MM-dd} co 会計 da chot (score={SeedScore} claim={SeedClaimAmt})",
            () => db.EnsureSettledAccounting(patNo, trtDt, SeedScore, SeedClaimAmt, patBr));
        trace.Note(seeded ? "  => VUA TAO dong 会計 (teardown se xoa)"
                          : "  => da co san, khong tao them");

        var rows = trace.Do("doc lai ACCDAT cua ngay test", () => db.ReadAccDat(patNo, trtDt));
        foreach (var r in rows)
            trace.Note($"  acc_dt={r.AccDt:yyyy-MM-dd} acc_cnt={r.AccCnt} trt_cnt={r.TrtCnt} " +
                       $"km_cd={r.KmCd} lflg={r.Lflg} score={r.Score} claim={r.ClaimAmt}");

        var target = db.FindTargetRow(patNo, trtDt);
        if (target is null)
            return new Result(
                "Ngày test vẫn không có dòng 医療保険 (km_cd 40-49 / 57 / 58, lflg = 0) " +
                "sau khi seed — xem danh sách ACCDAT ở trên.",
                seeded);

        // past_billing_amount cộng cả 介護 + 自費, nhưng dòng seed là 医療保険 nên
        // claim_amt của nó chính là toàn bộ. Bằng 0 thì điều kiện > 0 vẫn trượt.
        if (target.ClaimAmt == 0)
            return new Result(
                $"Dòng 会計 của ngày test có claim_amt = 0, nên past_billing_amount = 0 và " +
                "modAcc.cs:598 vẫn rẽ sang nhánh tạo 未精算データ.",
                seeded);

        trace.Note($"TIEN DE DU: dong se bi sua km_cd={target.KmCd} score={target.Score} " +
                   $"claim_amt={target.ClaimAmt} rece_amt={target.ReceAmt}");
        return new Result(null, seeded);
    }
}
