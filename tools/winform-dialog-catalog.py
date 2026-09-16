#!/usr/bin/env python3
"""
Dựng BẢNG TRA mọi hộp thoại mà app WinForm có thể hiện.

═══════════════════════════════════════════════════════════════════════════════
VÌ SAO CẦN
═══════════════════════════════════════════════════════════════════════════════
Grep chuỗi hiển thị trong `src/OCHACOM/**` KHÔNG BAO GIỜ tìm được những chỗ đi qua
`MsgDialog.Show*Msg(mã, tham số)`: chuỗi nằm trong bảng MSGTBL của SQL Server, còn
source C# chỉ có MÃ và THAM SỐ. Đó chính là lý do đợt rà bên web bí ở 83 chỗ.

Script này ghép hai nguồn — call-site đọc từ source, và MSGTBL đọc từ DB — rồi render
ra ĐÚNG câu app sẽ hiện, kèm icon / bộ nút / nút mặc định.

═══════════════════════════════════════════════════════════════════════════════
ICON DO CHỖ GỌI QUYẾT ĐỊNH, KHÔNG DO MÃ
═══════════════════════════════════════════════════════════════════════════════
Cùng một mã có thể đỏ ở màn này, vàng ở màn khác. Ví dụ đã đo: `E00002` ở
`frm203002.cs:2205` đi qua `ShowWarningMsg` nên ra ⚠ VÀNG, dù tên mã bắt đầu bằng E.
Vì vậy bảng này khoá theo call-site, không khoá theo mã.

Dùng:
    python3 tools/winform-dialog-catalog.py                 # đọc MSGTBL từ SQL Server
    python3 tools/winform-dialog-catalog.py --msgtbl a.json # dùng bản đã lưu
"""
import argparse, json, os, re, subprocess, sys, collections

SRC_DEFAULT = os.path.expanduser('~/Documents/GitHub/userapp/src/OCHACOM')

# Hàm gọi -> (icon, bộ nút). Nút lấy theo NGÔN NGỮ WINDOWS của máy test (F16).
FUNC = {
    'ShowErrorMsg':       ('✕ đỏ',   'OK'),
    'ShowWarningMsg':     ('⚠ vàng', 'OK'),
    'ShowInfoMsg':        ('ⓘ xanh', 'OK'),
    'ShowOKCancelMsg':    ('？ hỏi', 'OK|Cancel'),
    'ShowYesNoMsg':       ('？ hỏi', 'Yes|No'),
    'ShowYesNoCancelMsg': ('？ hỏi', 'Yes|No|Cancel'),
    'ShoRetryCancelMsg':  ('？ hỏi', 'Retry|Cancel'),   # tên hàm thiếu chữ 'w' — của legacy
}
STYLE = {'Critical': '✕ đỏ', 'Exclamation': '⚠ vàng', 'Information': 'ⓘ xanh',
         'Question': '？ hỏi', 'Error': '✕ đỏ', 'Warning': '⚠ vàng'}

METHOD = re.compile(
    r'^\s*(?:public|private|protected|internal)\s[\w<>\[\],\s]*?\b(\w+)\s*\([^;]*$')
CALL = re.compile(r'MsgDialog\.(Show\w+Msg|ShoRetryCancelMsg)\s*\(')


def read_msgtbl(path=None):
    if path:
        return json.load(open(path, encoding='utf-8'))
    q = ("SET NOCOUNT ON; SELECT ID + '|' + CONVERT(VARCHAR(MAX), "
         "CONVERT(VARBINARY(MAX), MSG), 2) FROM MSGTBL")
    out = subprocess.run(
        ['docker', 'run', '--rm', '--network', 'host',
         'mcr.microsoft.com/mssql-tools', '/opt/mssql-tools/bin/sqlcmd',
         '-S', 'localhost,1433', '-U', 'sa', '-P', 'tmdu', '-d', 'SIM2000', '-y', '0',
         '-Q', q],
        capture_output=True, text=True).stdout
    db = {}
    for line in out.split('\n'):
        m = re.match(r'^([A-Z]\d{5})\|([0-9A-F]+)\s*$', line.strip())
        if m:
            db[m.group(1)] = bytes.fromhex(m.group(2)).decode('cp932')
    return db


def render(db, code, para):
    """Đúng ba nhánh của MsgDialog.getMsg (COMMON/Lib/MsgDialog.cs:184-211)."""
    t = db.get(code)
    if t is None:
        return para or '(không có row — tham số LÀ toàn bộ câu)'
    if '{0}' in t:
        return t.replace('{0}', para)
    return t + para


def split_args(s):
    """Tách đối số ở mức ngoặc 0, giữ nguyên chuỗi có dấu phẩy."""
    args, depth, cur, instr = [], 0, '', False
    for ch in s:
        if ch == '"':
            instr = not instr
        if not instr:
            if ch in '([':
                depth += 1
            elif ch in ')]':
                if depth == 0:
                    break
                depth -= 1
            elif ch == ',' and depth == 0:
                args.append(cur.strip()); cur = ''; continue
        cur += ch
    if cur.strip():
        args.append(cur.strip())
    return args


def scan(src, db):
    rows = []
    for root, _, files in os.walk(src):
        for fn in files:
            if not fn.endswith('.cs'):
                continue
            path = os.path.join(root, fn)
            rel = os.path.relpath(path, src)
            try:
                lines = open(path, encoding='utf-8', errors='replace').read().split('\n')
            except OSError:
                continue

            method = ''
            for i, line in enumerate(lines):
                stripped = line.strip()
                m = METHOD.match(line)
                if m and not stripped.startswith('//'):
                    method = m.group(1)

                if stripped.startswith('//'):
                    continue

                # ── đường MSGTBL ────────────────────────────────────────────
                c = CALL.search(line)
                if c:
                    blob = '\n'.join(lines[i:i + 4])
                    args = split_args(blob[blob.index(c.group(0)) + len(c.group(0)):])
                    func = c.group(1)

                    # ShowFreeMsg(strMsg, msgButton, msgIcon) — đối số ĐẦU là CHỮ, không
                    # phải mã (MsgDialog.cs:219). Icon và nút lấy thẳng từ hai đối số sau.
                    if func == 'ShowFreeMsg':
                        lit = re.match(r'^"(.*)"$', args[0], re.S) if args else None
                        ic = re.search(r'MessageBoxIcon\.(\w+)', blob)
                        bt = re.search(r'MessageBoxButtons\.(\w+)', blob)
                        rows.append(dict(kind='free', file=rel, line=i + 1,
                                         screen=os.path.splitext(fn)[0], method=method,
                                         func=func, code='', para='',
                                         icon=STYLE.get(ic.group(1), 'không icon') if ic else 'không icon',
                                         buttons=bt.group(1) if bt else 'OK',
                                         default='Button1 (ngầm)',
                                         text=lit.group(1) if lit else '⟨chuỗi ghép lúc chạy⟩'))
                        continue

                    icon, buttons = FUNC.get(func, ('?', '?'))

                    code_raw = args[0] if args else ''
                    cm = re.match(r'^"([A-Z]\d{5})"$', code_raw)
                    # Mã viết SAI trong legacy (vd "E0026" — thiếu một chữ số). MSGTBL
                    # không có row ⇒ rơi vào nhánh 3 của getMsg: tham số thành CẢ câu.
                    bad = re.match(r'^"([A-Z]\d{1,4})"$', code_raw)
                    # Mã RỖNG ("" / string.Empty) là cách gọi CỐ Ý: getMsg không tra được
                    # row nào nên tham số trở thành TOÀN BỘ câu (MsgDialog.cs:207). Đây là
                    # 「chữ tự do」, không phải chỗ hỏng.
                    empty = code_raw in ('""', 'string.Empty', '""))')
                    code = ('' if empty
                            else cm.group(1) if cm
                            else f'⚠ MÃ SAI {bad.group(1)}' if bad
                            else f'⟨biến {code_raw[:20]}⟩')

                    para, para_note = '', ''
                    if len(args) > 1:
                        pm = re.match(r'^"(.*)"$', args[1], re.S)
                        if pm:
                            para = pm.group(1)
                        else:
                            para_note = args[1][:40]

                    default = 'Button1 (ngầm)'
                    dm = re.search(r'MessageBoxDefaultButton\.(Button\d)', blob)
                    if dm:
                        default = dm.group(1) + ' (khai rõ)'

                    text = (render(db, code, para) if cm
                            else para if (empty or bad) and para
                            else '⟨không render được: mã là biến⟩')
                    if para_note:
                        text = text.replace('{0}', f'⟨{para_note}⟩') if '{0}' in (db.get(code) or '') \
                               else f'{text} ⟨+{para_note}⟩'

                    rows.append(dict(kind='msgtbl', file=rel, line=i + 1,
                                     screen=os.path.splitext(fn)[0], method=method,
                                     func=func, code=code, para=para or para_note,
                                     icon=icon, buttons=buttons, default=default,
                                     text=text))
                    continue

                # ── MsgBox thô: chuỗi nằm NGAY trong source ─────────────────
                if 'MsgBoxStyle.' in line or 'MessageBoxIcon.' in line:
                    styles = re.findall(r'MsgBoxStyle\.(\w+)|MessageBoxIcon\.(\w+)', line)
                    names = [a or b for a, b in styles]
                    icons = [STYLE[n] for n in names if n in STYLE]
                    # OkOnly / OKCancel là kiểu NÚT, không phải icon. Không style icon nào
                    # ⇒ MessageBox KHÔNG có icon (và không kêu tiếng nào).
                    asks = [n for n in names if n in ('YesNo', 'OKCancel', 'YesNoCancel')]
                    icon = icons[0] if icons else 'không icon'
                    # 「hộp hỏi màu vàng」 = YesNo/OKCancel KÈM Exclamation hoặc Critical.
                    # Đây là thứ primitive bên web chưa diễn tả được: nó luôn ra ？ xanh.
                    # YesNo + Question thì chỉ là hộp hỏi bình thường, KHÔNG đánh dấu.
                    if asks:
                        odd = [i for i in icons if i != '？ hỏi']
                        icon = f'？ hỏi + {odd[0]}' if odd else '？ hỏi'
                    lit = re.search(r'"([^"]{4,})"', line)
                    rows.append(dict(kind='msgbox', file=rel, line=i + 1,
                                     screen=os.path.splitext(fn)[0], method=method,
                                     func='|'.join(names), code='', para='',
                                     icon=icon, buttons='|'.join(asks) or 'OK',
                                     default='Button1 (ngầm)',
                                     text=lit.group(1) if lit else '⟨chuỗi ghép lúc chạy⟩'))
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', default=SRC_DEFAULT)
    ap.add_argument('--msgtbl')
    ap.add_argument('--out', default='winform-dialog-catalog')
    a = ap.parse_args()

    db = read_msgtbl(a.msgtbl)
    if not db:
        sys.exit('KHÔNG đọc được MSGTBL — bật container OCHASQLEXPRESS, hoặc truyền --msgtbl')
    rows = scan(a.src, db)

    with open(a.out + '.tsv', 'w', encoding='utf-8') as f:
        cols = ['kind', 'text', 'icon', 'buttons', 'default', 'screen', 'method',
                'file', 'line', 'func', 'code', 'para']
        f.write('\t'.join(cols) + '\n')
        for r in rows:
            f.write('\t'.join(str(r[c]).replace('\t', ' ').replace('\n', '\\n')
                              for c in cols) + '\n')

    by_icon = collections.Counter(r['icon'] for r in rows)
    warn_ask = [r for r in rows if r['icon'].startswith('？ hỏi + ')]
    unrendered = [r for r in rows if r['text'].startswith('⟨không render')]

    print(f"MSGTBL: {len(db)} row")
    print(f"call-site: {len(rows)}  ({sum(1 for r in rows if r['kind']=='msgtbl')} qua MSGTBL, "
          f"{sum(1 for r in rows if r['kind']=='msgbox')} MsgBox thô)")
    print(f"màn: {len(set(r['screen'] for r in rows))}")
    for k, v in by_icon.most_common():
        print(f"  {k:16s} {v}")
    print(f"\n「hộp hỏi màu vàng」 (web chưa có biến thể): {len(warn_ask)}")
    for r in warn_ask:
        print(f"  {r['file']}:{r['line']}  {r['method']}  {r['text'][:50]}")
    print(f"\nkhông render được (mã là biến): {len(unrendered)}")
    print(f"\n-> {a.out}.tsv")


if __name__ == '__main__':
    main()
