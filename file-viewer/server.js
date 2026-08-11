'use strict';

/**
 * Local File Viewer - zero dependency HTTP server.
 *
 * Serves the SPA in ./public and a small JSON API that reads the local
 * filesystem. Binds to 127.0.0.1 only: this tool intentionally reads any
 * absolute path the user types, so it must never be reachable from outside.
 */

const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const url = require('url');

const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 5173);
const PUBLIC_DIR = path.join(__dirname, 'public');

/** Max bytes we ever read from a single file for the text viewer. */
const MAX_READ_BYTES = 8 * 1024 * 1024;
/** Files bigger than this are truncated unless ?full=1 is passed. */
const DEFAULT_READ_BYTES = 2 * 1024 * 1024;

/**
 * Số dòng tối đa mỗi bên còn chạy thuật toán LCS khi so file.
 *
 * LCS dựng bảng n×m nên 3000×3000 ≈ 9 triệu ô — vẫn nhanh và vừa bộ nhớ. Vượt
 * ngưỡng thì rơi về so theo VỊ TRÍ dòng: kém thông minh hơn (chèn một dòng ở đầu
 * làm mọi dòng sau lệch) nhưng không bao giờ treo máy. Kết quả có cờ `algorithm`
 * để người đọc biết mình đang nhìn kiểu so nào.
 */
const LCS_MAX_LINES = 3000;
/** Trần số mục khi so thư mục, chặn cây quá lớn làm treo trình duyệt. */
const COMPARE_MAX_ENTRIES = 5000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.ico', '.avif']);
const IMAGE_MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.avif': 'image/avif',
};

// ---------------------------------------------------------------- helpers

function sendJson(res, status, body) {
  const buf = Buffer.from(JSON.stringify(body), 'utf8');
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': buf.length,
    'Cache-Control': 'no-store',
  });
  res.end(buf);
}

function fail(res, status, message) {
  sendJson(res, status, { error: message });
}

/**
 * Expand `~`, strip surrounding quotes (drag & drop from Finder/Terminal
 * often adds them) and resolve to an absolute path.
 */
function normalizeInputPath(raw) {
  let p = String(raw || '').trim();
  if (
    (p.startsWith('"') && p.endsWith('"') && p.length > 1) ||
    (p.startsWith("'") && p.endsWith("'") && p.length > 1)
  ) {
    p = p.slice(1, -1);
  }
  // Finder/zsh escape spaces when dropping a path into a terminal.
  p = p.replace(/\\ /g, ' ');
  if (!p) return '';
  if (p === '~') p = os.homedir();
  else if (p.startsWith('~/')) p = path.join(os.homedir(), p.slice(2));
  return path.resolve(p);
}

function describeError(err, target) {
  switch (err && err.code) {
    case 'ENOENT':
      return `Không tìm thấy đường dẫn: ${target}`;
    case 'EACCES':
    case 'EPERM':
      return `Không có quyền truy cập: ${target}`;
    case 'ENOTDIR':
      return `Đường dẫn không phải là thư mục: ${target}`;
    case 'EISDIR':
      return `Đường dẫn là thư mục, không phải file: ${target}`;
    case 'ELOOP':
      return `Symlink lặp vòng: ${target}`;
    default:
      return `${(err && err.message) || 'Lỗi không xác định'} (${target})`;
  }
}

/** A file is treated as binary if a NUL byte shows up early in the content. */
function looksBinary(buf) {
  const n = Math.min(buf.length, 8000);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
  return false;
}

function decodeUtf8Strict(buf) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return null;
  }
}

function decodeWith(buf, encoding) {
  try {
    return new TextDecoder(encoding).decode(buf);
  } catch {
    return buf.toString('latin1');
  }
}

/**
 * Decode a buffer to text. `auto` prefers strict UTF-8 and falls back to
 * Shift_JIS (common for Japanese CSV/TXT exports), then latin1.
 */
function decodeText(buf, requested) {
  const enc = requested || 'auto';
  if (enc !== 'auto') return { text: decodeWith(buf, enc), encoding: enc };

  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return { text: decodeUtf8Strict(buf.subarray(3)) ?? decodeWith(buf, 'utf-8'), encoding: 'utf-8 (BOM)' };
  }
  const utf8 = decodeUtf8Strict(buf);
  if (utf8 !== null) return { text: utf8, encoding: 'utf-8' };

  const sjis = decodeWith(buf, 'shift_jis');
  if (sjis && !sjis.includes('�')) return { text: sjis, encoding: 'shift_jis' };

  return { text: decodeWith(buf, 'utf-8'), encoding: 'utf-8 (có ký tự lỗi)' };
}

function kindOf(ext) {
  if (ext === '.json') return 'json';
  if (ext === '.csv' || ext === '.tsv') return 'csv';
  if (IMAGE_EXT.has(ext)) return 'image';
  return 'text';
}

// ------------------------------------------------------------------- API

async function apiHome(res) {
  sendJson(res, 200, {
    home: os.homedir(),
    cwd: process.cwd(),
    sep: path.sep,
    platform: process.platform,
  });
}

async function apiList(res, query) {
  const target = normalizeInputPath(query.path);
  if (!target) return fail(res, 400, 'Vui lòng nhập đường dẫn thư mục.');

  let stat;
  try {
    stat = await fsp.stat(target);
  } catch (err) {
    return fail(res, 404, describeError(err, target));
  }

  // Typing a file path is a common slip - list its folder and preselect it.
  if (!stat.isDirectory()) {
    return sendJson(res, 200, {
      path: path.dirname(target),
      parent: path.dirname(path.dirname(target)) === path.dirname(target) ? null : path.dirname(path.dirname(target)),
      selectFile: target,
      entries: await readEntries(path.dirname(target)),
    });
  }

  let entries;
  try {
    entries = await readEntries(target);
  } catch (err) {
    return fail(res, 403, describeError(err, target));
  }

  const parent = path.dirname(target);
  sendJson(res, 200, {
    path: target,
    parent: parent === target ? null : parent,
    entries,
  });
}

async function readEntries(dir) {
  const dirents = await fsp.readdir(dir, { withFileTypes: true });
  const entries = await Promise.all(
    dirents.map(async (d) => {
      const full = path.join(dir, d.name);
      const entry = {
        name: d.name,
        path: full,
        isDir: d.isDirectory(),
        isSymlink: d.isSymbolicLink(),
        ext: path.extname(d.name).toLowerCase(),
        size: null,
        mtime: null,
        unreadable: false,
      };
      try {
        // stat() follows symlinks so a link to a folder browses like a folder.
        const st = await fsp.stat(full);
        entry.isDir = st.isDirectory();
        entry.size = st.isDirectory() ? null : st.size;
        entry.mtime = st.mtimeMs;
      } catch {
        entry.unreadable = true;
      }
      entry.kind = entry.isDir ? 'dir' : kindOf(entry.ext);
      return entry;
    })
  );

  entries.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
  });
  return entries;
}

async function apiFile(res, query) {
  const target = normalizeInputPath(query.path);
  if (!target) return fail(res, 400, 'Thiếu tham số path.');

  let stat;
  try {
    stat = await fsp.stat(target);
  } catch (err) {
    return fail(res, 404, describeError(err, target));
  }
  if (stat.isDirectory()) return fail(res, 400, describeError({ code: 'EISDIR' }, target));

  const ext = path.extname(target).toLowerCase();
  const kind = kindOf(ext);
  const wantFull = query.full === '1';
  const limit = Math.min(wantFull ? MAX_READ_BYTES : DEFAULT_READ_BYTES, MAX_READ_BYTES);

  const meta = {
    path: target,
    name: path.basename(target),
    ext,
    kind,
    size: stat.size,
    mtime: stat.mtimeMs,
  };

  if (kind === 'image') {
    return sendJson(res, 200, { ...meta, imageUrl: `/api/raw?path=${encodeURIComponent(target)}` });
  }

  let buf;
  try {
    buf = await readPrefix(target, limit);
  } catch (err) {
    return fail(res, 403, describeError(err, target));
  }

  const truncated = stat.size > buf.length;
  const binary = looksBinary(buf);
  if (binary && query.force !== '1') {
    return sendJson(res, 200, {
      ...meta,
      kind: 'binary',
      binary: true,
      truncated,
      bytesRead: buf.length,
      hex: hexDump(buf.subarray(0, 4096)),
    });
  }

  let { text, encoding } = decodeText(buf, query.encoding);
  if (truncated) {
    // Drop the last (possibly cut in half) line so nothing renders garbled.
    const cut = text.lastIndexOf('\n');
    if (cut > 0) text = text.slice(0, cut);
  }

  sendJson(res, 200, {
    ...meta,
    kind: binary ? 'text' : kind,
    binary,
    encoding,
    truncated,
    bytesRead: buf.length,
    maxBytes: MAX_READ_BYTES,
    content: text,
  });
}

// ------------------------------------------------------------- so sánh
//
// Hai câu hỏi KHÁC NHAU, trả lời riêng, đừng gộp:
//
//   bytesEqual — hai file giống nhau từng byte.
//   textEqual  — sau khi decode thì nội dung giống nhau.
//
// Chúng lệch nhau đúng ở trường hợp hay gặp nhất của dự án này: file gốc do
// WinForm xuất là **Shift_JIS**, còn bản web sinh ra có thể là UTF-8 (hoặc
// ngược lại). Lúc đó bytesEqual=false nhưng textEqual=true, và kết luận đúng là
// "nội dung khớp, chỉ khác bảng mã" chứ không phải "sai dữ liệu". Chỉ trả về một
// chữ "khác nhau" là ép người đọc đi dò tay lại từ đầu.
//
// Vì thế `encoding` áp cho CẢ HAI bên, và mặc định `auto` (UTF-8 nghiêm ngặt →
// Shift_JIS → latin1) đủ để đọc đúng file tiếng Nhật mà không cần chỉ định.
// Muốn chốt cứng thì truyền `shift_jis`.

/** Đọc một file về đủ thứ cần cho việc so: byte, text đã decode, và các dòng. */
async function readSideForCompare(target, encoding) {
  const stat = await fsp.stat(target);
  const buf = await readPrefix(target, MAX_READ_BYTES);
  const binary = looksBinary(buf);
  const decoded = decodeText(buf, encoding);
  return {
    path: target,
    name: path.basename(target),
    size: stat.size,
    mtime: stat.mtimeMs,
    truncated: stat.size > buf.length,
    binary,
    encoding: decoded.encoding,
    buf,
    text: decoded.text,
    // CRLF của Windows và LF của Unix cùng tách ra một mảng dòng: chênh lệch
    // xuống dòng được báo riêng bằng `eolDiffers` thay vì làm mọi dòng đỏ lên.
    lines: splitLines(decoded.text),
    eol: detectEol(decoded.text),
  };
}

function splitLines(text) {
  const lines = text.split(/\r\n|\n|\r/);
  // File kết thúc bằng ký tự xuống dòng sinh ra một phần tử rỗng ở cuối. Bỏ nó
  // đi, nếu không mọi file "đúng chuẩn" đều thừa một dòng trống khi so.
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

function detectEol(text) {
  if (text.includes('\r\n')) return 'CRLF';
  if (text.includes('\n')) return 'LF';
  if (text.includes('\r')) return 'CR';
  return 'none';
}

/**
 * Diff hai mảng dòng bằng LCS, trả về danh sách thao tác đã ghép cặp:
 *   { type: 'same' | 'change' | 'left' | 'right', leftNo, rightNo, left, right }
 *
 * `change` là một cặp xoá+thêm liền nhau được gộp lại, để giao diện xếp được hai
 * bên cạnh nhau thay vì hiện thành hai dòng rời.
 */
function diffLines(a, b) {
  if (a.length > LCS_MAX_LINES || b.length > LCS_MAX_LINES) {
    return { algorithm: 'positional', ops: positionalDiff(a, b) };
  }
  return { algorithm: 'lcs', ops: pairChanges(lcsDiff(a, b)) };
}

function lcsDiff(a, b) {
  const n = a.length;
  const m = b.length;
  // Bảng (n+1)×(m+1); Int32Array phẳng thay vì mảng lồng nhau cho gọn bộ nhớ.
  const width = m + 1;
  const table = new Int32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i * width + j] =
        a[i] === b[j]
          ? table[(i + 1) * width + (j + 1)] + 1
          : Math.max(table[(i + 1) * width + j], table[i * width + (j + 1)]);
    }
  }

  const ops = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ type: 'same', leftNo: i + 1, rightNo: j + 1, left: a[i], right: b[j] });
      i++;
      j++;
    } else if (table[(i + 1) * width + j] >= table[i * width + (j + 1)]) {
      ops.push({ type: 'left', leftNo: i + 1, rightNo: null, left: a[i], right: null });
      i++;
    } else {
      ops.push({ type: 'right', leftNo: null, rightNo: j + 1, left: null, right: b[j] });
      j++;
    }
  }
  while (i < n) ops.push({ type: 'left', leftNo: ++i, rightNo: null, left: a[i - 1], right: null });
  while (j < m) ops.push({ type: 'right', leftNo: null, rightNo: ++j, left: null, right: b[j - 1] });
  return ops;
}

/** Gộp một 'left' đi liền ngay trước một 'right' thành một dòng 'change'. */
function pairChanges(ops) {
  const out = [];
  for (let k = 0; k < ops.length; k++) {
    const cur = ops[k];
    const next = ops[k + 1];
    if (cur.type === 'left' && next && next.type === 'right') {
      out.push({
        type: 'change',
        leftNo: cur.leftNo,
        rightNo: next.rightNo,
        left: cur.left,
        right: next.right,
      });
      k++;
      continue;
    }
    out.push(cur);
  }
  return out;
}

/** So theo vị trí dòng — lối thoát cho file quá lớn để chạy LCS. */
function positionalDiff(a, b) {
  const ops = [];
  const max = Math.max(a.length, b.length);
  for (let k = 0; k < max; k++) {
    const left = k < a.length ? a[k] : null;
    const right = k < b.length ? b[k] : null;
    if (left === null) ops.push({ type: 'right', leftNo: null, rightNo: k + 1, left: null, right });
    else if (right === null) ops.push({ type: 'left', leftNo: k + 1, rightNo: null, left, right: null });
    else if (left === right) ops.push({ type: 'same', leftNo: k + 1, rightNo: k + 1, left, right });
    else ops.push({ type: 'change', leftNo: k + 1, rightNo: k + 1, left, right });
  }
  return ops;
}

async function compareFiles(leftPath, rightPath, encoding) {
  const [left, right] = await Promise.all([
    readSideForCompare(leftPath, encoding),
    readSideForCompare(rightPath, encoding),
  ]);

  const bytesEqual = left.buf.equals(right.buf) && left.size === right.size;
  const textEqual = left.text === right.text;

  const meta = (s) => ({
    path: s.path,
    name: s.name,
    size: s.size,
    mtime: s.mtime,
    encoding: s.encoding,
    truncated: s.truncated,
    binary: s.binary,
    eol: s.eol,
    lineCount: s.lines.length,
  });

  // File nhị phân không có "dòng" để so cho ra nghĩa — trả kết luận byte và dừng.
  if (left.binary || right.binary) {
    return {
      mode: 'file',
      bytesEqual,
      textEqual: bytesEqual,
      binary: true,
      eolDiffers: false,
      encodingDiffers: left.encoding !== right.encoding,
      left: meta(left),
      right: meta(right),
      algorithm: 'binary',
      ops: [],
      stats: { same: 0, change: 0, left: 0, right: 0 },
    };
  }

  const { algorithm, ops } = diffLines(left.lines, right.lines);
  const stats = { same: 0, change: 0, left: 0, right: 0 };
  for (const op of ops) stats[op.type]++;

  return {
    mode: 'file',
    bytesEqual,
    textEqual,
    binary: false,
    // Nội dung giống nhau mà byte khác → chênh ở xuống dòng và/hoặc bảng mã.
    eolDiffers: left.eol !== right.eol,
    encodingDiffers: left.encoding !== right.encoding,
    left: meta(left),
    right: meta(right),
    algorithm,
    ops,
    stats,
  };
}

/** Mọi file (đệ quy) dưới `root`, khoá là đường dẫn tương đối chuẩn hoá `/`. */
async function walkFiles(root, out, prefix) {
  let dirents;
  try {
    dirents = await fsp.readdir(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const d of dirents) {
    if (out.size >= COMPARE_MAX_ENTRIES) return;
    const full = path.join(root, d.name);
    const rel = prefix ? `${prefix}/${d.name}` : d.name;
    let st;
    try {
      st = await fsp.stat(full);
    } catch {
      out.set(rel, { path: full, unreadable: true, isDir: false, size: null, mtime: null });
      continue;
    }
    if (st.isDirectory()) await walkFiles(full, out, rel);
    else out.set(rel, { path: full, unreadable: false, isDir: false, size: st.size, mtime: st.mtimeMs });
  }
}

/** Hai file có giống nhau từng byte không — so kích thước trước cho rẻ. */
async function sameBytes(a, b) {
  if (a.size !== b.size) return false;
  const [bufA, bufB] = await Promise.all([
    readPrefix(a.path, MAX_READ_BYTES),
    readPrefix(b.path, MAX_READ_BYTES),
  ]);
  return bufA.equals(bufB);
}

/**
 * Gom các file theo THƯ MỤC CHA, mỗi nhóm sắp theo tên.
 *
 * Dùng cho chế độ ghép-theo-vị-trí: một số hãng đặt tên file theo đồng hồ
 * (`yyyyMMdd_HHmmss.csv`), nên bản WinForm và bản web không bao giờ trùng tên dù
 * nội dung y hệt. Ghép theo tên sẽ ra "chỉ bên trái" + "chỉ bên phải" và kết luận
 * là vô nghĩa.
 */
function groupByDir(files) {
  const groups = new Map();
  for (const [rel, meta] of files) {
    const cut = rel.lastIndexOf('/');
    const dir = cut < 0 ? '' : rel.slice(0, cut);
    const name = cut < 0 ? rel : rel.slice(cut + 1);
    if (!groups.has(dir)) groups.set(dir, []);
    groups.get(dir).push({ ...meta, rel, name });
  }
  for (const arr of groups.values()) {
    arr.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  }
  return groups;
}

async function compareDirs(leftRoot, rightRoot, ignoreNames) {
  const leftFiles = new Map();
  const rightFiles = new Map();
  await Promise.all([walkFiles(leftRoot, leftFiles, ''), walkFiles(rightRoot, rightFiles, '')]);

  const entries = [];
  const stats = { same: 0, different: 0, leftOnly: 0, rightOnly: 0, unreadable: 0 };

  const record = async (rel, l, r) => {
    let status;
    if (l && !r) status = 'left-only';
    else if (!l && r) status = 'right-only';
    else if (l.unreadable || r.unreadable) status = 'unreadable';
    else status = (await sameBytes(l, r)) ? 'same' : 'different';

    entries.push({
      rel,
      status,
      left: l ? { path: l.path, size: l.size, mtime: l.mtime } : null,
      right: r ? { path: r.path, size: r.size, mtime: r.mtime } : null,
    });
    if (status === 'left-only') stats.leftOnly++;
    else if (status === 'right-only') stats.rightOnly++;
    else if (status === 'unreadable') stats.unreadable++;
    else if (status === 'same') stats.same++;
    else stats.different++;
  };

  if (ignoreNames) {
    // Ghép theo VỊ TRÍ trong từng thư mục: file thứ i bên trái với file thứ i bên
    // phải, sau khi cả hai đã sắp theo tên. `rel` ghi cả hai tên để người đọc thấy
    // cặp nào đang được so.
    const left = groupByDir(leftFiles);
    const right = groupByDir(rightFiles);
    const dirs = Array.from(new Set([...left.keys(), ...right.keys()])).sort();
    for (const dir of dirs) {
      const l = left.get(dir) ?? [];
      const r = right.get(dir) ?? [];
      for (let i = 0; i < Math.max(l.length, r.length); i++) {
        const a = l[i];
        const b = r[i];
        const label = a && b ? `${a.name} ⇄ ${b.name}` : (a || b).name;
        await record(dir ? `${dir}/${label}` : label, a, b);
      }
    }
  } else {
    const rels = Array.from(new Set([...leftFiles.keys(), ...rightFiles.keys()])).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
    );
    for (const rel of rels) await record(rel, leftFiles.get(rel), rightFiles.get(rel));
  }

  return {
    mode: 'dir',
    left: { path: leftRoot, fileCount: leftFiles.size },
    right: { path: rightRoot, fileCount: rightFiles.size },
    identical: stats.different === 0 && stats.leftOnly === 0 && stats.rightOnly === 0,
    ignoreNames: Boolean(ignoreNames),
    truncated: leftFiles.size >= COMPARE_MAX_ENTRIES || rightFiles.size >= COMPARE_MAX_ENTRIES,
    maxEntries: COMPARE_MAX_ENTRIES,
    stats,
    entries,
  };
}

/**
 * GET /api/compare?left=&right=&encoding=
 *
 * Hai file → diff theo dòng. Hai thư mục → bảng trạng thái từng file (đệ quy).
 * Trộn file với thư mục là lỗi 400: không có câu trả lời nào có nghĩa.
 *
 * `ignoreNames=1` (chỉ có nghĩa với thư mục): ghép file theo VỊ TRÍ trong từng
 * thư mục thay vì theo tên. Cần cho những hãng đặt tên file theo đồng hồ — hai
 * bên không bao giờ trùng tên dù nội dung y hệt.
 */
async function apiCompare(res, query) {
  const leftPath = normalizeInputPath(query.left);
  const rightPath = normalizeInputPath(query.right);
  if (!leftPath || !rightPath) return fail(res, 400, 'Cần cả hai tham số left và right.');

  let leftStat;
  let rightStat;
  try {
    leftStat = await fsp.stat(leftPath);
  } catch (err) {
    return fail(res, 404, describeError(err, leftPath));
  }
  try {
    rightStat = await fsp.stat(rightPath);
  } catch (err) {
    return fail(res, 404, describeError(err, rightPath));
  }

  if (leftStat.isDirectory() !== rightStat.isDirectory()) {
    return fail(res, 400, 'Không so được một file với một thư mục — chọn cùng loại.');
  }

  const result = leftStat.isDirectory()
    ? await compareDirs(leftPath, rightPath, query.ignoreNames === '1')
    : await compareFiles(leftPath, rightPath, query.encoding);
  sendJson(res, 200, result);
}

async function readPrefix(file, limit) {
  const handle = await fsp.open(file, 'r');
  try {
    const buf = Buffer.allocUnsafe(limit);
    const { bytesRead } = await handle.read(buf, 0, limit, 0);
    return buf.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

function hexDump(buf) {
  const lines = [];
  for (let off = 0; off < buf.length; off += 16) {
    const chunk = buf.subarray(off, off + 16);
    const hex = Array.from(chunk, (b) => b.toString(16).padStart(2, '0'))
      .join(' ')
      .padEnd(47, ' ');
    const ascii = Array.from(chunk, (b) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.')).join('');
    lines.push(`${off.toString(16).padStart(8, '0')}  ${hex}  |${ascii}|`);
  }
  return lines.join('\n');
}

function apiRaw(res, query) {
  const target = normalizeInputPath(query.path);
  if (!target) return fail(res, 400, 'Thiếu tham số path.');

  fs.stat(target, (err, stat) => {
    if (err) return fail(res, 404, describeError(err, target));
    if (stat.isDirectory()) return fail(res, 400, describeError({ code: 'EISDIR' }, target));

    const ext = path.extname(target).toLowerCase();
    res.writeHead(200, {
      'Content-Type': IMAGE_MIME[ext] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': 'no-store',
    });
    const stream = fs.createReadStream(target);
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  });
}

async function apiDownload(res, query) {
  const target = normalizeInputPath(query.path);
  if (!target) return fail(res, 400, 'Thiếu tham số path.');
  let stat;
  try {
    stat = await fsp.stat(target);
  } catch (err) {
    return fail(res, 404, describeError(err, target));
  }
  if (stat.isDirectory()) return fail(res, 400, describeError({ code: 'EISDIR' }, target));

  res.writeHead(200, {
    'Content-Type': 'application/octet-stream',
    'Content-Length': stat.size,
    'Content-Disposition': `attachment; filename="${encodeURIComponent(path.basename(target))}"`,
  });
  fs.createReadStream(target).pipe(res);
}

// ---------------------------------------------------------------- static

function serveStatic(req, res, pathname) {
  const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const file = path.join(PUBLIC_DIR, rel);
  if (!file.startsWith(PUBLIC_DIR + path.sep) && file !== path.join(PUBLIC_DIR, 'index.html')) {
    return fail(res, 403, 'Forbidden');
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 Not Found');
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(data);
  });
}

// ---------------------------------------------------------------- server

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = decodeURIComponent(parsed.pathname);
  const query = parsed.query;

  const handle = async () => {
    if (req.method !== 'GET') return fail(res, 405, 'Method Not Allowed');
    switch (pathname) {
      case '/api/home':
        return apiHome(res);
      case '/api/list':
        return apiList(res, query);
      case '/api/file':
        return apiFile(res, query);
      case '/api/raw':
        return apiRaw(res, query);
      case '/api/download':
        return apiDownload(res, query);
      case '/api/compare':
        return apiCompare(res, query);
      default:
        return serveStatic(req, res, pathname);
    }
  };

  handle().catch((err) => {
    if (!res.headersSent) fail(res, 500, (err && err.message) || 'Internal error');
    else res.destroy();
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Local File Viewer đang chạy tại http://${HOST}:${PORT}`);
  console.log(`Thư mục home: ${os.homedir()}`);
});
