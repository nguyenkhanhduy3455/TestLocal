'use strict';

/* Local File Viewer - frontend. Talks to the tiny JSON API in server.js. */

const $ = (id) => document.getElementById(id);

const el = {
  form: $('path-form'),
  pathInput: $('path-input'),
  btnHome: $('btn-home'),
  btnUp: $('btn-up'),
  btnReload: $('btn-reload'),
  breadcrumb: $('breadcrumb'),
  banner: $('banner'),
  sidebar: $('sidebar'),
  filter: $('filter-input'),
  showHidden: $('show-hidden'),
  list: $('file-list'),
  listStat: $('list-stat'),
  resizer: $('resizer'),
  name: $('viewer-name'),
  meta: $('viewer-meta'),
  tabs: $('view-tabs'),
  encoding: $('encoding-select'),
  wrap: $('wrap-toggle'),
  btnCopy: $('btn-copy'),
  btnDownload: $('btn-download'),
  findBar: $('find-bar'),
  findInput: $('find-input'),
  findCount: $('find-count'),
  findPrev: $('find-prev'),
  findNext: $('find-next'),
  body: $('viewer-body'),
  btnCompare: $('btn-compare'),
  cmpOverlay: $('cmp-overlay'),
  cmpClose: $('cmp-close'),
  cmpForm: $('cmp-form'),
  cmpLeft: $('cmp-left'),
  cmpRight: $('cmp-right'),
  cmpEncoding: $('cmp-encoding'),
  cmpSwap: $('cmp-swap'),
  cmpSummary: $('cmp-summary'),
  cmpBody: $('cmp-body'),
};

const state = {
  dir: '',
  entries: [],
  selected: null, // full path of the open file
  file: null, // last /api/file payload
  mode: 'pretty', // pretty | raw (json only)
  findHits: 0,
  findIndex: 0,
};

const MAX_RENDER_LINES = 100000;
const MAX_HIGHLIGHTS = 5000;
const LS_PATH = 'lfv.lastPath';
const LS_WIDTH = 'lfv.sidebarWidth';

const TEXT_EXT = new Set([
  '.txt', '.log', '.md', '.markdown', '.csv', '.tsv', '.json', '.xml', '.yml', '.yaml',
  '.ini', '.cfg', '.conf', '.env', '.properties', '.sql', '.sh', '.bash', '.zsh', '.bat',
  '.ps1', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.css', '.scss', '.less', '.html',
  '.htm', '.vue', '.svelte', '.py', '.rb', '.php', '.java', '.kt', '.cs', '.c', '.h',
  '.cpp', '.hpp', '.go', '.rs', '.swift', '.pl', '.lua', '.r', '.toml', '.gitignore',
  '.dockerfile', '.makefile', '.diff', '.patch', '.srt', '.vtt',
]);
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.ico', '.avif']);

// -------------------------------------------------------------- utilities

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatSize(bytes) {
  if (bytes === null || bytes === undefined) return '';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}

function formatTime(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function iconFor(entry) {
  if (entry.isDir) return '📁';
  if (entry.ext === '.json') return '🧾';
  if (entry.ext === '.csv' || entry.ext === '.tsv') return '📊';
  if (IMAGE_EXT.has(entry.ext)) return '🖼️';
  if (TEXT_EXT.has(entry.ext)) return '📄';
  return '📦';
}

function showBanner(message, kind) {
  el.banner.textContent = message;
  el.banner.className = `banner${kind === 'warn' ? ' warn' : ''}`;
  el.banner.hidden = !message;
}

async function api(path, params) {
  const qs = new URLSearchParams(params || {}).toString();
  const res = await fetch(`${path}${qs ? `?${qs}` : ''}`);
  const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// ------------------------------------------------------------- navigation

async function openDir(dirPath, selectFile) {
  showBanner('');
  el.list.innerHTML = '<div class="loading">Đang đọc thư mục…</div>';
  try {
    const data = await api('/api/list', { path: dirPath });
    state.dir = data.path;
    state.entries = data.entries;
    el.pathInput.value = data.path;
    el.btnUp.disabled = !data.parent;
    el.btnUp.dataset.parent = data.parent || '';
    localStorage.setItem(LS_PATH, data.path);
    renderBreadcrumb(data.path);
    renderList();
    const target = selectFile || data.selectFile;
    if (target) openFile(target);
  } catch (err) {
    el.list.innerHTML = '';
    el.listStat.textContent = '';
    showBanner(err.message);
  }
}

function renderBreadcrumb(p) {
  el.breadcrumb.innerHTML = '';
  const parts = p.split('/').filter(Boolean);
  const add = (label, target) => {
    const b = document.createElement('button');
    b.className = 'crumb';
    b.textContent = label;
    b.onclick = () => openDir(target);
    el.breadcrumb.appendChild(b);
  };
  add('/', '/');
  let acc = '';
  parts.forEach((part, i) => {
    acc += `/${part}`;
    if (i > 0) {
      const sep = document.createElement('span');
      sep.className = 'crumb-sep';
      sep.textContent = '/';
      el.breadcrumb.appendChild(sep);
    }
    add(part, acc);
  });
}

function visibleEntries() {
  const q = el.filter.value.trim().toLowerCase();
  const hidden = el.showHidden.checked;
  return state.entries.filter((e) => {
    if (!hidden && e.name.startsWith('.')) return false;
    return !q || e.name.toLowerCase().includes(q);
  });
}

function renderList() {
  const rows = visibleEntries();
  el.list.innerHTML = '';
  const frag = document.createDocumentFragment();

  for (const entry of rows) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = `row${entry.isDir ? ' dir' : ''}${entry.unreadable ? ' dim' : ''}`;
    if (entry.path === state.selected) row.classList.add('active');
    row.dataset.path = entry.path;
    row.title = `${entry.path}${entry.mtime ? `\nSửa: ${formatTime(entry.mtime)}` : ''}`;

    const ic = document.createElement('span');
    ic.className = 'ic';
    ic.textContent = iconFor(entry);

    const nm = document.createElement('span');
    nm.className = 'nm';
    nm.textContent = entry.name;

    const sz = document.createElement('span');
    sz.className = 'sz';
    sz.textContent = entry.isDir ? '' : formatSize(entry.size);

    row.append(ic, nm, sz);
    row.onclick = () => (entry.isDir ? openDir(entry.path) : openFile(entry.path));
    frag.appendChild(row);
  }

  el.list.appendChild(frag);
  const dirs = rows.filter((e) => e.isDir).length;
  el.listStat.textContent = `${rows.length} mục (${dirs} thư mục, ${rows.length - dirs} file)${
    rows.length !== state.entries.length ? ` · lọc từ ${state.entries.length}` : ''
  }`;
}

function markActiveRow() {
  for (const row of el.list.querySelectorAll('.row')) {
    row.classList.toggle('active', row.dataset.path === state.selected);
  }
}

// ----------------------------------------------------------- file loading

async function openFile(filePath, opts) {
  const options = opts || {};
  state.selected = filePath;
  markActiveRow();
  el.name.textContent = filePath.split('/').pop();
  el.meta.textContent = '';
  el.body.innerHTML = '<div class="loading">Đang đọc file…</div>';

  try {
    const data = await api('/api/file', {
      path: filePath,
      encoding: el.encoding.value,
      full: options.full ? '1' : '',
      force: options.force ? '1' : '',
    });
    state.file = data;
    state.mode = data.kind === 'json' ? 'pretty' : 'raw';
    renderViewer();
  } catch (err) {
    state.file = null;
    el.body.innerHTML = '';
    showBanner(err.message);
  }
}

function renderViewer() {
  const f = state.file;
  if (!f) return;
  showBanner('');

  el.name.textContent = f.name;
  el.meta.textContent = [
    formatSize(f.size),
    f.encoding || '',
    formatTime(f.mtime),
    f.kind === 'binary' ? 'nhị phân' : '',
  ]
    .filter(Boolean)
    .join(' · ');

  el.tabs.hidden = f.kind !== 'json';
  for (const tab of el.tabs.querySelectorAll('.tab')) {
    tab.classList.toggle('active', tab.dataset.mode === state.mode);
  }

  el.body.innerHTML = '';

  if (f.kind === 'image') {
    const wrap = document.createElement('div');
    wrap.className = 'img-wrap';
    const img = document.createElement('img');
    img.src = f.imageUrl;
    img.alt = f.name;
    wrap.appendChild(img);
    el.body.appendChild(wrap);
    return;
  }

  if (f.kind === 'binary') {
    el.body.appendChild(
      notice(
        'File này có vẻ là file nhị phân nên không hiển thị dạng text.',
        'Xem dạng text',
        () => openFile(f.path, { force: true })
      )
    );
    appendCode(f.hex || '', { numbers: false });
    return;
  }

  if (f.truncated) {
    el.body.appendChild(
      notice(
        `File lớn (${formatSize(f.size)}) — chỉ hiển thị ${formatSize(f.bytesRead)} đầu tiên.`,
        f.bytesRead < f.maxBytes ? `Tải thêm (tối đa ${formatSize(f.maxBytes)})` : null,
        () => openFile(f.path, { full: true })
      )
    );
  }

  const text = f.content || '';

  if (f.kind === 'json' && state.mode === 'pretty') {
    let pretty;
    try {
      pretty = JSON.stringify(JSON.parse(text), null, 2);
    } catch (err) {
      el.body.appendChild(
        notice(`JSON không hợp lệ (${err.message}). Đang hiển thị nội dung gốc.`, null, null)
      );
      appendCode(text, { numbers: true });
      applyFind();
      return;
    }
    appendCode(pretty, { numbers: true, json: true });
  } else {
    appendCode(text, { numbers: true });
  }

  applyFind();
}

function notice(message, actionLabel, onAction) {
  const box = document.createElement('div');
  box.className = 'notice';
  box.append(document.createTextNode(message));
  if (actionLabel && onAction) {
    const btn = document.createElement('button');
    btn.className = 'btn small';
    btn.textContent = actionLabel;
    btn.onclick = onAction;
    box.appendChild(btn);
  }
  return box;
}

/** Renders a Notepad++-style pane: sticky line-number gutter + <pre> text. */
function appendCode(text, opts) {
  const options = opts || {};
  let lines = text.split('\n');
  let clipped = false;
  if (lines.length > MAX_RENDER_LINES) {
    lines = lines.slice(0, MAX_RENDER_LINES);
    clipped = true;
  }
  const body = lines.join('\n');

  const code = document.createElement('div');
  code.className = `code${el.wrap.checked ? ' wrap' : ''}`;

  if (options.numbers !== false) {
    const gutter = document.createElement('div');
    gutter.className = 'gutter';
    gutter.textContent = lines.map((_, i) => i + 1).join('\n');
    code.appendChild(gutter);
  }

  const pre = document.createElement('pre');
  pre.className = 'code-text';
  pre.id = 'code-text';
  pre.innerHTML = options.json ? highlightJson(body) : escapeHtml(body);
  code.appendChild(pre);

  el.body.appendChild(code);

  if (clipped) {
    el.body.insertBefore(
      notice(`Chỉ hiển thị ${MAX_RENDER_LINES.toLocaleString()} dòng đầu tiên để trang không bị treo.`, null, null),
      code
    );
  }
}

const JSON_TOKEN = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;

function highlightJson(text) {
  // Escaping first is safe: it never introduces or removes double quotes,
  // so the tokenizer still sees the original JSON structure.
  return escapeHtml(text).replace(JSON_TOKEN, (match, str, colon, word) => {
    if (str !== undefined) {
      return colon !== undefined
        ? `<span class="j-key">${str}</span>${colon}`
        : `<span class="j-str">${str}</span>`;
    }
    if (word !== undefined) return `<span class="${word === 'null' ? 'j-null' : 'j-bool'}">${word}</span>`;
    return `<span class="j-num">${match}</span>`;
  });
}

// ------------------------------------------------------------ find in file

function applyFind() {
  const pre = $('code-text');
  state.findHits = 0;
  state.findIndex = 0;
  if (!pre) {
    el.findCount.textContent = '';
    return;
  }

  const query = el.findInput.value;
  if (!query) {
    el.findCount.textContent = '';
    return;
  }

  const needle = query.toLowerCase();
  const walker = document.createTreeWalker(pre, NodeFilter.SHOW_TEXT);
  const targets = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeValue.toLowerCase().includes(needle)) targets.push(node);
  }

  let count = 0;
  for (const node of targets) {
    if (count >= MAX_HIGHLIGHTS) break;
    const value = node.nodeValue;
    const lower = value.toLowerCase();
    const frag = document.createDocumentFragment();
    let from = 0;
    let at = lower.indexOf(needle);
    while (at !== -1 && count < MAX_HIGHLIGHTS) {
      if (at > from) frag.appendChild(document.createTextNode(value.slice(from, at)));
      const mark = document.createElement('mark');
      mark.className = 'hit';
      mark.textContent = value.slice(at, at + needle.length);
      frag.appendChild(mark);
      count++;
      from = at + needle.length;
      at = lower.indexOf(needle, from);
    }
    if (from < value.length) frag.appendChild(document.createTextNode(value.slice(from)));
    node.parentNode.replaceChild(frag, node);
  }

  state.findHits = count;
  el.findCount.textContent = count
    ? `${count}${count >= MAX_HIGHLIGHTS ? '+' : ''} kết quả`
    : 'không tìm thấy';
  if (count) gotoHit(0);
}

function gotoHit(index) {
  const hits = el.body.querySelectorAll('mark.hit');
  if (!hits.length) return;
  const i = ((index % hits.length) + hits.length) % hits.length;
  state.findIndex = i;
  hits.forEach((m, n) => m.classList.toggle('current', n === i));
  hits[i].scrollIntoView({ block: 'center', behavior: 'smooth' });
  el.findCount.textContent = `${i + 1}/${hits.length}${state.findHits >= MAX_HIGHLIGHTS ? '+' : ''}`;
}

function openFind(open) {
  el.findBar.classList.toggle('open', open);
  if (open) el.findInput.focus();
  else {
    el.findInput.value = '';
    renderViewer();
  }
}

// ------------------------------------------------------------------ events

el.form.addEventListener('submit', (e) => {
  e.preventDefault();
  const value = el.pathInput.value.trim();
  if (value) openDir(value);
});

el.btnHome.onclick = async () => {
  const info = await api('/api/home');
  openDir(info.home);
};
el.btnUp.onclick = () => el.btnUp.dataset.parent && openDir(el.btnUp.dataset.parent);
el.btnReload.onclick = () => state.dir && openDir(state.dir, state.selected);

el.filter.addEventListener('input', renderList);
el.showHidden.addEventListener('change', renderList);

el.encoding.addEventListener('change', () => state.selected && openFile(state.selected));
el.wrap.addEventListener('change', () => state.file && renderViewer());

el.tabs.addEventListener('click', (e) => {
  const tab = e.target.closest('.tab');
  if (!tab) return;
  state.mode = tab.dataset.mode;
  renderViewer();
});

el.btnCopy.onclick = async () => {
  if (!state.file || state.file.content === undefined) return;
  try {
    await navigator.clipboard.writeText(state.file.content);
    el.btnCopy.textContent = 'Đã copy';
    setTimeout(() => (el.btnCopy.textContent = 'Copy'), 1200);
  } catch {
    showBanner('Trình duyệt chặn clipboard — hãy bôi đen rồi copy thủ công.', 'warn');
  }
};

el.btnDownload.onclick = () => {
  if (!state.selected) return;
  window.location.href = `/api/download?path=${encodeURIComponent(state.selected)}`;
};

let findTimer;
el.findInput.addEventListener('input', () => {
  clearTimeout(findTimer);
  findTimer = setTimeout(() => renderViewer(), 200);
});
el.findInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    gotoHit(state.findIndex + (e.shiftKey ? -1 : 1));
  } else if (e.key === 'Escape') {
    openFind(false);
  }
});
el.findNext.onclick = () => gotoHit(state.findIndex + 1);
el.findPrev.onclick = () => gotoHit(state.findIndex - 1);

document.addEventListener('keydown', (e) => {
  // Bảng so sánh là lớp trên cùng — Esc phải đóng nó trước, và đừng để các phím
  // điều hướng danh sách file phía dưới cướp mất khi người dùng đang gõ đường dẫn.
  if (!el.cmpOverlay.hidden) {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeCompare();
    }
    return;
  }
  if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
    e.preventDefault();
    openFind(true);
  } else if (e.key === 'Escape' && el.findBar.classList.contains('open')) {
    openFind(false);
  } else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && document.activeElement !== el.pathInput) {
    const rows = visibleEntries().filter((x) => !x.isDir);
    if (!rows.length) return;
    const at = rows.findIndex((x) => x.path === state.selected);
    const next = rows[Math.min(rows.length - 1, Math.max(0, at + (e.key === 'ArrowDown' ? 1 : -1)))];
    if (next && next.path !== state.selected) {
      e.preventDefault();
      openFile(next.path);
    }
  }
});

// Drag & drop a file/folder from Finder onto the page to open it.
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => {
  e.preventDefault();
  const file = e.dataTransfer.files && e.dataTransfer.files[0];
  // Browsers expose only the file name, so fall back to any text/plain path.
  const text = e.dataTransfer.getData('text/plain');
  const candidate = (text && text.trim()) || (file && file.path) || '';
  if (candidate.startsWith('/')) openDir(candidate);
  else showBanner('Không lấy được đường dẫn từ thao tác kéo thả — hãy dán đường dẫn vào ô trên.', 'warn');
});

// Sidebar resizer.
(() => {
  let dragging = false;
  const saved = localStorage.getItem(LS_WIDTH);
  if (saved) el.sidebar.style.width = `${saved}px`;

  el.resizer.addEventListener('mousedown', () => {
    dragging = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const width = Math.min(Math.max(e.clientX, 180), window.innerWidth - 320);
    el.sidebar.style.width = `${width}px`;
  });
  window.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    localStorage.setItem(LS_WIDTH, parseInt(el.sidebar.style.width, 10));
  });
})();

// -------------------------------------------------------------- so sánh
//
// Hai file → diff theo dòng, hai cột cạnh nhau. Hai thư mục → bảng trạng thái
// từng file, bấm vào dòng khác nhau thì mở luôn diff của cặp file đó.
//
// Điểm quan trọng nhất của phần này là KHÔNG gộp hai câu hỏi làm một: file gốc
// WinForm xuất ra là Shift_JIS còn bản web sinh ra có thể là UTF-8, nên
// "khác từng byte" và "khác nội dung" phải hiện thành hai dòng kết luận riêng.
// Gộp lại là đẩy người đọc đi dò tay một khác biệt vốn vô hại.

const CMP_STATUS_LABEL = {
  same: 'Giống',
  different: 'Khác',
  'left-only': 'Chỉ bên trái',
  'right-only': 'Chỉ bên phải',
  unreadable: 'Không đọc được',
};

function openCompare(left, right) {
  if (left !== undefined) el.cmpLeft.value = left;
  if (right !== undefined) el.cmpRight.value = right;
  el.cmpOverlay.hidden = false;
  ;(el.cmpLeft.value ? el.cmpRight : el.cmpLeft).focus();
}

function closeCompare() {
  el.cmpOverlay.hidden = true;
}

function cmpNotice(message, kind) {
  el.cmpSummary.className = `cmp-summary${kind ? ` ${kind}` : ''}`;
  el.cmpSummary.textContent = message;
}

async function runCompare() {
  const left = el.cmpLeft.value.trim();
  const right = el.cmpRight.value.trim();
  if (!left || !right) return cmpNotice('Nhập đủ hai đường dẫn.', 'warn');

  cmpNotice('Đang so sánh…');
  el.cmpBody.innerHTML = '';
  try {
    const data = await api('/api/compare', { left, right, encoding: el.cmpEncoding.value });
    if (data.mode === 'dir') renderDirCompare(data);
    else renderFileCompare(data);
  } catch (err) {
    cmpNotice(err.message, 'warn');
  }
}

function renderFileCompare(d) {
  // Hai kết luận tách bạch — xem chú thích đầu mục.
  const verdict = d.bytesEqual
    ? '✅ Giống nhau từng byte'
    : d.textEqual
      ? '🟡 Nội dung giống nhau, chỉ khác cách lưu'
      : '❌ Nội dung khác nhau';

  const notes = [];
  if (!d.bytesEqual && d.encodingDiffers) notes.push(`bảng mã ${d.left.encoding} ≠ ${d.right.encoding}`);
  if (!d.bytesEqual && d.eolDiffers) notes.push(`xuống dòng ${d.left.eol} ≠ ${d.right.eol}`);
  if (d.left.truncated || d.right.truncated) notes.push('file quá lớn, chỉ so phần đầu');
  if (d.algorithm === 'positional') notes.push('file dài, so theo vị trí dòng thay vì LCS');
  if (d.binary) notes.push('file nhị phân, chỉ so byte');

  const counts = d.binary
    ? ''
    : ` · ${d.stats.same} dòng giống, ${d.stats.change} khác, ${d.stats.left} chỉ trái, ${d.stats.right} chỉ phải`;

  cmpNotice(`${verdict}${counts}${notes.length ? ` (${notes.join('; ')})` : ''}`,
    d.bytesEqual ? 'ok' : d.textEqual ? 'warn' : 'bad');

  if (d.binary) {
    el.cmpBody.innerHTML = `<div class="empty"><p>File nhị phân — chỉ so được ở mức byte.</p></div>`;
    return;
  }

  const head =
    `<div class="cmp-diff-head"><span>${escapeHtml(d.left.name)} · ${formatSize(d.left.size)}</span>` +
    `<span>${escapeHtml(d.right.name)} · ${formatSize(d.right.size)}</span></div>`;

  const rows = d.ops
    .map((op) => {
      const cls = op.type === 'same' ? '' : ` d-${op.type}`;
      return (
        `<tr class="cmp-row${cls}">` +
        `<td class="cmp-no">${op.leftNo ?? ''}</td>` +
        `<td class="cmp-txt">${op.left === null ? '' : escapeHtml(op.left)}</td>` +
        `<td class="cmp-no">${op.rightNo ?? ''}</td>` +
        `<td class="cmp-txt">${op.right === null ? '' : escapeHtml(op.right)}</td>` +
        `</tr>`
      );
    })
    .join('');

  el.cmpBody.innerHTML = `${head}<table class="cmp-diff"><tbody>${rows}</tbody></table>`;
}

function renderDirCompare(d) {
  const verdict = d.identical ? '✅ Hai thư mục giống nhau' : '❌ Hai thư mục khác nhau';
  const s = d.stats;
  cmpNotice(
    `${verdict} · ${s.same} giống, ${s.different} khác, ${s.leftOnly} chỉ trái, ` +
      `${s.rightOnly} chỉ phải${s.unreadable ? `, ${s.unreadable} không đọc được` : ''}` +
      `${d.truncated ? ` (đã cắt ở ${d.maxEntries} mục)` : ''}`,
    d.identical ? 'ok' : 'bad',
  );

  if (!d.entries.length) {
    el.cmpBody.innerHTML = `<div class="empty"><p>Cả hai thư mục đều rỗng.</p></div>`;
    return;
  }

  const rows = d.entries
    .map((e) => {
      // Chỉ cặp có cả hai bên mới mở được diff.
      const openable = e.status === 'different' || e.status === 'same';
      return (
        `<tr class="cmp-row s-${e.status}${openable ? ' openable' : ''}"` +
        (openable
          ? ` data-left="${escapeHtml(e.left.path)}" data-right="${escapeHtml(e.right.path)}"`
          : '') +
        `><td class="cmp-status">${CMP_STATUS_LABEL[e.status]}</td>` +
        `<td class="cmp-rel">${escapeHtml(e.rel)}</td>` +
        `<td class="cmp-size">${e.left ? formatSize(e.left.size) : '—'}</td>` +
        `<td class="cmp-size">${e.right ? formatSize(e.right.size) : '—'}</td></tr>`
      );
    })
    .join('');

  el.cmpBody.innerHTML =
    `<table class="cmp-dir"><thead><tr><th>Trạng thái</th><th>Đường dẫn tương đối</th>` +
    `<th>Trái</th><th>Phải</th></tr></thead><tbody>${rows}</tbody></table>`;
}

el.btnCompare.addEventListener('click', () => {
  // Mở sẵn với thứ đang xem: file đang chọn, không thì thư mục đang duyệt.
  openCompare(state.selected || state.dir, el.cmpRight.value);
});
el.cmpClose.addEventListener('click', closeCompare);
el.cmpOverlay.addEventListener('click', (e) => {
  if (e.target === el.cmpOverlay) closeCompare();
});
el.cmpForm.addEventListener('submit', (e) => {
  e.preventDefault();
  void runCompare();
});
el.cmpSwap.addEventListener('click', () => {
  const tmp = el.cmpLeft.value;
  el.cmpLeft.value = el.cmpRight.value;
  el.cmpRight.value = tmp;
});
el.cmpEncoding.addEventListener('change', () => {
  // Đổi bảng mã chỉ có nghĩa khi đã có kết quả để đọc lại.
  if (el.cmpBody.querySelector('.cmp-diff, .cmp-dir')) void runCompare();
});
el.cmpBody.addEventListener('click', (e) => {
  const row = e.target.closest('tr.openable');
  if (!row) return;
  openCompare(row.dataset.left, row.dataset.right);
  void runCompare();
});

// ------------------------------------------------------------------- boot

(async () => {
  const last = localStorage.getItem(LS_PATH);
  try {
    const info = await api('/api/home');
    el.pathInput.placeholder = `Ví dụ: ${info.home}/Documents`;
    await openDir(last || info.home);
  } catch (err) {
    showBanner(err.message);
  }
})();
