#!/usr/bin/env bash
#
# Gom BẰNG CHỨNG BẰNG ẢNH của hai vế MSGTBL về MỘT thư mục, rồi dựng bảng đối chiếu.
#
#   msgtbl-evidence/
#     win/<MÃ>__<chỗ bung>.png   ảnh hộp thoại WinForm, đã cắt   (MsgEvidence.cs)
#     web/<MÃ>__<chỗ bung>.png   ảnh hộp thoại web,     đã cắt   (_shared/msgtbl.ts)
#     index.md                   bảng: mã | chữ win | chữ web | khớp? | hai ảnh
#
# Vế web do Playwright ghi thẳng vào đây khi chạy trên máy này. Vế win nằm trên
# ochacom-win nên script kéo về bằng scp.
#
# Dùng:
#   ./collect-msgtbl-evidence.sh              # kéo win về rồi dựng index
#   ./collect-msgtbl-evidence.sh --no-fetch   # chỉ dựng lại index từ cái đang có
#
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="${MSGTBL_EVIDENCE_ROOT:-$HERE/msgtbl-evidence}"
HOST="${OCHA_WIN_HOST:-ochacom-win}"
REMOTE="${OCHA_WIN_EVIDENCE:-C:/TCG/TestLocal/fla-ui-tests/src/OchaCom.FlaUiTests/bin/Debug/net8.0-windows/artifacts/msgtbl-evidence/win}"
FETCH=1
[[ "${1:-}" == "--no-fetch" ]] && FETCH=0

mkdir -p "$OUT/win" "$OUT/web"

if [[ $FETCH -eq 1 ]]; then
    echo "→ kéo ảnh vế WinForm từ $HOST"
    # -O: scp mới dùng SFTP và chết trên đường dẫn Windows có dấu \; -O ép về giao thức cũ.
    if scp -O -q "$HOST:$REMOTE/*" "$OUT/win/" 2>/dev/null; then
        echo "  ok"
    else
        echo "  ⚠ không kéo được — chạy '.\\run-msgtbl-parity.ps1 -WithUi' và '-CallSite' trên $HOST trước."
    fi
fi

python3 - "$OUT" <<'PY'
import csv, os, sys, datetime

out = sys.argv[1]

ACCEPT = {'ok', 'はい', 'yes'}
DECLINE = {'cancel', 'キャンセル', 'いいえ', 'no'}


def kind(label):
    """Nut mac dinh thuoc nhom nao: dong y / tu choi / khac."""
    t = (label or '').strip().lower()
    if t in ACCEPT: return 'accept'
    if t in DECLINE: return 'decline'
    return t


def read(side):
    path = os.path.join(out, side, 'manifest.tsv')
    if not os.path.exists(path):
        return {}
    rows = {}
    with open(path, encoding='utf-8-sig') as f:
        for r in csv.DictReader(f, delimiter='\t'):
            # Lần chạy SAU đè lần trước: manifest chỉ nối thêm, không tự cắt.
            rows[r['code']] = r
    return rows

win, web = read('win'), read('web')
codes = sorted(set(win) | set(web))

lines = [
    '# MSGTBL — bằng chứng bằng ảnh, hai vế WinForm / web',
    '',
    f'Dựng lúc {datetime.datetime.now():%Y-%m-%d %H:%M}. '
    f'{len(win)} mã có ảnh WinForm, {len(web)} mã có ảnh web.',
    '',
    '**Cột 「chỗ bung」** cho biết hai vế có đo CÙNG MỘT tình huống không. Cùng mã mà khác ',
    'chỗ thì vẫn so được phần chữ (theo khuôn, xem dưới) nhưng KHÔNG so được hành vi — ',
    'số nút và nút mặc định là của chỗ gọi, không phải của mã.',
    '',
    '**Cột 「nút」** so phần HÀNH VI: SỐ nút và NÚT MẶC ĐỊNH (mđ). Nhãn nút thì không so ',
    'vì WinForm lấy theo ngôn ngữ Windows (OK/Cancel) còn web tự đặt — nhưng số nút và ',
    'nút mặc định thì phải khớp: Q00049 mặc định Cancel chính là cách legacy nói ',
    '「thao tác này ghi đè, đừng Enter vội」.',
    '',
    '**Cách đọc cột 「chữ」**: so theo KHUÔN MSGTBL, không so nguyên câu. Khuôn được cắt ',
    'ở `{0}` thành các đoạn cố định; vế web phải chứa ĐỦ các đoạn đó, đúng thứ tự. ',
    'Làm vậy vì cùng một mã, hai call-site truyền tham số khác nhau — `E00002` ở tab 個別 ',
    'là 「個別入力のコード」 còn ở 患者登録 là 「保険者番号」 — so nguyên câu thì ra "lệch" ',
    'trong khi cả hai đều đúng. Trống một vế = lượt chạy bên đó chưa phủ mã này.',
    '',
    '| Mã | chữ | nút | icon win | chỗ bung (win → web) | WinForm | web | nút win → web | ảnh |',
    '|---|---|---|---|---|---|---|---|---|',
]

same = diff = only = 0
for code in codes:
    w, b = win.get(code), web.get(code)
    wt = (w or {}).get('raw', '').replace('\\n', ' ')
    bt = (b or {}).get('raw', '')

    if w and b:
        tpl = (w.get('template') or '').replace('\\n', ' ')
        if tpl:
            # Cắt khuôn ở {0}: vế web phải chứa đủ các đoạn cố định, ĐÚNG THỨ TỰ.
            ok, pos = True, 0
            for seg in (p for p in tpl.split('{0}') if p):
                at = bt.find(seg, pos)
                if at < 0:
                    ok = False
                    break
                pos = at + len(seg)
        else:
            ok = wt in bt
        mark = '✔' if ok else '✘'
        same, diff = same + (1 if ok else 0), diff + (0 if ok else 1)
    else:
        mark = '—'
        only += 1

    shots = []
    if w: shots.append(f'[win](win/{w["file"]})')
    if b: shots.append(f'[web](web/{b["file"]})')

    # Cot HANH VI: bo nut + nut mac dinh. So chuoi khong bao gio thay duoc phan nay —
    # Q00049 tung dung chu nhung web mac dinh OK con WinForm mac dinh Cancel.
    def shape(row):
        if not row: return ''
        btns = (row.get('buttons') or '').replace('|', '/')
        dflt = (row.get('default') or '').strip()
        return f'{btns} (mđ {dflt})' if dflt else btns

    sw, sb = shape(w), shape(b)
    if w and b:
        bw = [x for x in (w.get('buttons') or '').split('|') if x]
        bb = [x for x in (b.get('buttons') or '').split('|') if x]
        same_n = len(bw) == len(bb)
        # So Y NGHIA cua nut mac dinh, khong so NHAN: WinForm lay nhan theo NGON NGU
        # WINDOWS (OK/Cancel) con web tu dat (OK/キャンセル). 「Cancel」 va 「キャンセル」 la
        # CUNG MOT nut — so chuoi thi ra lech gia.
        same_d = kind(w.get('default')) == kind(b.get('default'))
        bmark = '✔' if (same_n and same_d) else '✘'
    else:
        bmark = '—'

    # Chỗ bung: hai vế phải là CÙNG MỘT tình huống thì so mới có nghĩa. Không tự đoán
    # được nên in cả hai nhãn ra để người đọc tự thấy — vd E00002 hiện đang là
    # 個別 tab (win) so với 保険者番号 (web): cùng mã, KHÁC chỗ.
    ww = (w or {}).get('what', '')
    bw_ = (b or {}).get('what', '')
    where = f'{ww or "—"}<br>→ {bw_ or "—"}'

    # Icon do CHO GOI quyet dinh (ShowErrorMsg/ShowWarningMsg/…), khong do ma — cung mot
    # ma co the do o man nay vang o man khac. Doc tu chinh anh da chup.
    ICONS = {'do': '✕ đỏ', 'vang': '⚠ vàng', 'xanh': 'xanh'}
    wi = ICONS.get((w or {}).get('icon', ''), (w or {}).get('icon', '') or '—')
    if w and 'xanh' in (w.get('icon') or ''):
        btns = (w.get('buttons') or '')
        wi = '？ hỏi' if ('Cancel' in btns or 'No' in btns) else 'ⓘ xanh'

    lines.append(
        f'| `{code}` | {mark} | {bmark} | {wi} | {where} | {wt or "—"} | {bt or "—"} | '
        f'{sw or "—"} → {sb or "—"} | {" · ".join(shots) or "—"} |'
    )

lines += [
    '',
    f'**Tổng: {same} khớp · {diff} lệch · {only} mới có một vế.**',
    '',
    'Ảnh của mỗi vế là ảnh CẮT RIÊNG hộp thoại, chụp ngay trước khi assert chạy — nên có ',
    'kể cả ở lượt đỏ.',
]

path = os.path.join(out, 'index.md')
with open(path, 'w', encoding='utf-8') as f:
    f.write('\n'.join(lines) + '\n')

print(f'→ {path}')
print(f'   {same} khớp · {diff} lệch · {only} mới có một vế')
PY

echo "→ thư mục báo cáo: $OUT"
