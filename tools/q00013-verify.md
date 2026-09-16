# Kiểm chứng Q00013 (commit `0d2781784`)

Đọc legacy + web, không chạy UI.

## Phần đã xác nhận ĐÚNG

| Khẳng định | Kiểm |
|---|---|
| Q00013 ở `frm201001.cs:2462` | ✓ (comment ở 2462, lời gọi `ShowYesNoMsg` ở **2463**) |
| はい → `setOldFlg(4)`, `setBurRate(20)`, `setAccRate(10\|20)` rồi **`return false`** | ✓ `:2466-2483` — `return false` nằm trong thân `if (… == Yes)` |
| いいえ → không đổi gì, lưu tiếp | ✓ không có `else` |
| acc_rate 10 nếu sinh ≤ 1944/04/01, ngược lại 20 | ✓ `:2472-2479` |
| `ZENKI_RATE_CHK` = 昭和19年4月1日 | ✓ `PAT/Lib/CommonPat.cs:17` = `"1944/04/01"`; web `new Date(1944, 3, 1)` ✓ |
| Q00013 là confirm **duy nhất chạy ngược** trong màn | ✓ — rà cả 14 confirm của chuỗi validation, 13 cái kia đều `OK/Yes → áp dụng + đi tiếp`, `Cancel/No → dừng` |
| Q00012: はい → 生保後期高齢者 + lưu tiếp · いいえ → 後期高齢者 + dừng · キャンセル → không đổi + lưu tiếp | ✓ `:2433-2455`, mặc định `Button3` ✓ |
| Hằng số Q00012 (7/3/0/0 và 10/5/10/10) | ✓ — `setPatType` ghi `cboPatType`, mà `cboPatType` ↔ `ins_kbn` (`InsurerInfo.cs:781` đặt, `:1014` đọc lại) nên `INS_KBN_KOUKI_KOUREI = 10` đúng |

---

## ⚠ Lỗi còn sót — nhánh vừa sửa không dùng được

`patient-detail-form.tsx`:

```ts
904:  const insMerged: PersonInsSlice = { ...branch.ins }   // BẢN SAO nông
...
955:  if (!(await consumeValidation(validateRegisterMed(validationInput),  branch.id))) return
956:  if (!(await consumeValidation(validateRegisterMain(validationInput), branch.id))) return
957:
958:  latestBranches = latestBranches.map((b) =>            // ← chỉ chạy khi CẢ HAI pass
959:    b.id === branch.id ? { ...b, ins: insMerged } : b,
960:  )
```

Q00013 `yes.apply` sửa `insMerged`, rồi `proceed: false` → `consumeValidation` trả `false`
→ `return` ở dòng 956 → **dòng ghi ngược 958 không bao giờ chạy**. Bản sao bị vứt.

Người dùng bấm 「はい」: màn hình không đổi gì. Bấm F9 lại → điều kiện
`!validZenkiFlags.includes(oldFlg)` vẫn đúng → Q00013 lại hiện. **Không thoát được
bằng 「はい」.**

WinForm không vướng vì nó ghi thẳng vào **control**:

```csharp
info.setOldFlg(4);   // frm201001.cs:2469 — ghi cboOldFlg, không phải bản sao
```

Lần F9 sau, `getInputData()` đọc lại control → `old_flg = 4` → nằm trong
`{1,3,4,5}` → prompt không hiện → lưu được.

**Q00012 nhánh 「いいえ」 dính y hệt** — cũng `apply` rồi `proceed: false`.

⇒ Chiều はい/いいえ đã sửa đúng, nhưng phải ghi `insMerged` ngược vào state **trước
khi** thoát ở nhánh dừng, nếu không nhánh 「はい」 vô tác dụng.

---

## Hai chỗ lệch khác trong cùng đoạn

### 1. Mốc tính tuổi sai với 枝番 cũ

```csharp
frm201001.cs:2396   if (i == iList.Count - 1) baseDt = DateTime.Today;        // 枝番 mới nhất
                    else                      baseDt = …(ins.br_dt);         // 枝番 cũ → 患者情報有効日 của nó
```

`wizard-validation.ts:755` dùng `new Date()` cho **mọi** branch. Bệnh nhân nhiều 枝番:
`age` / `age2` / `age3` của các 枝番 cũ tính theo hôm nay thay vì theo 患者情報有効日
⇒ Q00012 / Q00013 (và cả E00016 / E00017) có thể hiện sai hoặc không hiện.

### 2. `getAge2` lệch đúng ngày 1/4

```csharp
legacy:  if (dtBase.Month >= 4) wkYear = Year + 1;   // ngày 1/4 → năm sau
```
```ts
web:     if (ref.getTime() > aprilFirst.getTime())   // ngày 1/4 → KHÔNG sang năm sau
```

Đúng ngày 1/4 lệch 1 tuổi. Đụng ngưỡng 未就学 (6) và 16 tuổi. Các ngày khác khớp.
