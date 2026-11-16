/* 工具与通用 UI 组件 */
window.Q = (sel, root) => (root || document).querySelector(sel);
window.QA = (sel, root) => Array.from((root || document).querySelectorAll(sel));
window.esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

window.icon = (name, cls) => `<svg class="i ${cls || ''}"><use href="#i-${name}"/></svg>`;
window.uid = (p) => (p || 'id') + '_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
window.clamp = (n, a, b) => Math.max(a, Math.min(b, n));
window.sleep = (ms) => new Promise((r) => setTimeout(r, ms));

window.deepClone = (o) => JSON.parse(JSON.stringify(o));

window.shuffle = (arr) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

window.debounce = (fn, wait) => {
  let t;
  return function (...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
};

window.formatTime = (sec) => {
  sec = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
};

window.formatDate = (ts) => {
  if (!ts) return '';
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

window.relTime = (ts) => {
  if (!ts) return '';
  const diff = Date.now() - ts;
  if (diff < 60e3) return '刚刚';
  if (diff < 3600e3) return Math.floor(diff / 60e3) + ' 分钟前';
  if (diff < 86400e3) return Math.floor(diff / 3600e3) + ' 小时前';
  if (diff < 7 * 86400e3) return Math.floor(diff / 86400e3) + ' 天前';
  return formatDate(ts).slice(0, 10);
};

window.todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/* ---------------- 提示 ---------------- */
window.toast = (msg, kind, ms) => {
  const root = Q('#toast-root');
  const el = document.createElement('div');
  el.className = 'toast' + (kind ? ' ' + kind : '');
  el.innerHTML = (kind === 'ok' ? icon('check') : kind === 'bad' ? icon('alert') : '') + `<span>${esc(msg)}</span>`;
  root.appendChild(el);
  setTimeout(() => {
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 320);
  }, ms || 2400);
};

/* ---------------- 弹窗 ---------------- */
window.openModal = (opts) => {
  const root = Q('#modal-root');
  const mask = document.createElement('div');
  mask.className = 'modal-mask';
  const actions = opts.actions || [];
  mask.innerHTML = `<div class="modal ${opts.wide ? 'wide' : ''}">
    <div class="modal-head">
      <div><h3>${esc(opts.title || '')}</h3>${opts.sub ? `<p>${esc(opts.sub)}</p>` : ''}</div>
      ${opts.closable === false ? '' : `<button class="icon-btn" data-close aria-label="关闭">${icon('x')}</button>`}
    </div>
    <div class="modal-body">${opts.body || ''}</div>
    ${actions.length ? `<div class="modal-foot">${actions.map((a, i) =>
      `<button class="btn ${a.kind === 'primary' ? 'btn-primary' : a.kind === 'danger' ? 'btn-danger' : a.kind === 'soft' ? 'btn-soft' : a.kind === 'quiet' ? 'btn-quiet' : 'btn-ghost'}" data-act="${i}">${esc(a.label)}</button>`).join('')}</div>` : ''}
  </div>`;
  root.appendChild(mask);
  document.body.classList.add('no-scroll');

  const api = {
    el: mask.querySelector('.modal'),
    body: mask.querySelector('.modal-body'),
    close(result) {
      mask.style.animation = 'fadeIn .2s ease reverse both';
      mask.querySelector('.modal').style.animation = 'popIn .2s ease reverse both';
      setTimeout(() => {
        mask.remove();
        if (!Q('#modal-root .modal-mask')) document.body.classList.remove('no-scroll');
        if (opts.onClose) opts.onClose(result);
      }, 190);
    },
  };
  const onKey = (e) => { if (e.key === 'Escape' && opts.closable !== false) { api.close(); document.removeEventListener('keydown', onKey); } };
  document.addEventListener('keydown', onKey);

  if (opts.closable !== false) {
    mask.addEventListener('mousedown', (e) => { if (e.target === mask) api.close(); });
    const closeBtn = mask.querySelector('[data-close]');
    if (closeBtn) closeBtn.onclick = () => api.close();
  }
  actions.forEach((a, i) => {
    mask.querySelector(`[data-act="${i}"]`).onclick = async (e) => {
      if (a.onClick) {
        const keep = await a.onClick(api, e);
        if (keep === false) return;
      }
      if (a.close !== false) api.close(a.value);
    };
  });
  if (opts.onMount) opts.onMount(api);
  return api;
};

window.confirmModal = (opts) => new Promise((resolve) => {
  let decided = false;
  const m = openModal({
    title: opts.title,
    body: `<p style="line-height:2">${esc(opts.body || '')}</p>`,
    actions: [
      { label: opts.cancelText || '取消', kind: 'ghost', onClick: () => { decided = true; resolve(false); } },
      { label: opts.okText || '确定', kind: opts.danger ? 'danger' : 'primary', onClick: () => { decided = true; resolve(true); } },
    ],
    onClose: () => { if (!decided) resolve(false); },
  });
  return m;
});

/* ---------------- 答题数据 ---------------- */
window.TYPE_META = {
  single: { label: '单选题', chip: 'blue' },
  multiple: { label: '多选题', chip: 'accent' },
  judge: { label: '判断题', chip: 'amber' },
  blank: { label: '填空题', chip: 'clay' },
  short: { label: '简答题', chip: 'plain' },
};
window.typeLabel = (t) => (TYPE_META[t] || { label: '题目' }).label;
window.typeChip = (t) => (TYPE_META[t] || {}).chip || 'plain';
window.isObjective = (t) => t === 'single' || t === 'multiple' || t === 'judge';

/* 统一答案：单选 'A'；多选 ['A','C']；判断 'T'/'F'；填空/简答 文本 */
window.normalizeAnswer = (type, val) => {
  if (val == null) return type === 'multiple' ? [] : '';
  if (type === 'multiple') {
    if (Array.isArray(val)) return Array.from(new Set(val.map((x) => String(x).toUpperCase()))).sort();
    return Array.from(new Set(String(val).toUpperCase().replace(/[^A-H]/g, '').split(''))).sort();
  }
  if (type === 'single') {
    const m = String(val).toUpperCase().match(/[A-H]/);
    return m ? m[0] : '';
  }
  if (type === 'judge') {
    const s = String(val).trim();
    if (/^(对|正确|是|真|√|T|true|yes|Y)$/i.test(s)) return 'T';
    if (/^(错|错误|否|假|×|x|F|false|no|N)$/i.test(s)) return 'F';
    return s;
  }
  return typeof val === 'string' ? val.trim() : String(val);
};

window.isAnswered = (type, val) => {
  if (type === 'multiple') return Array.isArray(val) && val.length > 0;
  return val != null && String(val).trim() !== '';
};

window.answersEqual = (q, a, b) => {
  const x = normalizeAnswer(q.type, a), y = normalizeAnswer(q.type, b);
  if (q.type === 'multiple' || q.type === 'single' || q.type === 'judge') {
    return JSON.stringify(x) === JSON.stringify(y);
  }
  const norm = (s) => String(s).replace(/\s+/g, '').replace(/[，。；、,.;:：!！?？"'“”‘’()（）]/g, '').toLowerCase();
  return norm(x) === norm(y);
};

window.displayAnswer = (q, val) => {
  const a = val === undefined ? q.answer : val;
  if (q.type === 'judge') return normalizeAnswer('judge', a) === 'T' ? '正确' : normalizeAnswer('judge', a) === 'F' ? '错误' : String(a || '');
  if (q.type === 'multiple') return (normalizeAnswer('multiple', a) || []).join('、');
  return String(a == null ? '' : a);
};

/* 是否正确（客观题） */
window.judgeObjective = (q, ans) => answersEqual(q, ans, q.answer);

/* ---------------- 其它 ---------------- */
window.downloadFile = (filename, content, mime) => {
  const blob = new Blob([content], { type: mime || 'application/json;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1200);
};

window.copyText = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (_) { }
    ta.remove();
    return ok;
  }
};

window.readFile = (file, as) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = () => reject(r.error);
  if (as === 'buffer') r.readAsArrayBuffer(file); else r.readAsText(file, 'utf-8');
});

window.confetti = (count) => {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const wrap = document.createElement('div');
  wrap.className = 'confetti';
  const colors = ['#5C7D6C', '#B07E66', '#5E7C9B', '#A98443', '#C9C7BD', '#8FA79A'];
  const n = count || 46;
  for (let i = 0; i < n; i++) {
    const s = document.createElement('i');
    s.style.left = Math.random() * 100 + 'vw';
    s.style.background = colors[Math.floor(Math.random() * colors.length)];
    s.style.animationDuration = (1.6 + Math.random() * 1.4) + 's';
    s.style.animationDelay = (Math.random() * .5) + 's';
    s.style.opacity = String(.4 + Math.random() * .5);
    wrap.appendChild(s);
  }
  document.body.appendChild(wrap);
  setTimeout(() => wrap.remove(), 3600);
};

/* 极简 Markdown（AI 输出用） */
window.renderMarkdown = (text) => {
  if (!text) return '';
  let src = esc(text).replace(/\r\n/g, '\n');
  const blocks = [];
  src = src.replace(/```([\s\S]*?)```/g, (m, code) => {
    blocks.push(`<pre><code>${code.replace(/^\w*\n/, '')}</code></pre>`);
    return `\u0000B${blocks.length - 1}\u0000`;
  });
  src = src.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  src = src.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  src = src.replace(/^#{1,4}\s*(.+)$/gm, '<strong>$1</strong>');
  const lines = src.split('\n');
  const out = [];
  let list = null;
  const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };
  lines.forEach((raw) => {
    const line = raw.trim();
    if (!line) { closeList(); return; }
    if (/^\u0000B\d+\u0000$/.test(line)) { closeList(); out.push(blocks[+line.replace(/\u0000B|\u0000/g, '')]); return; }
    let m = line.match(/^([-•·*])\s+(.*)$/);
    if (m) { if (list !== 'ul') { closeList(); out.push('<ul>'); list = 'ul'; } out.push(`<li>${m[2]}</li>`); return; }
    m = line.match(/^(\d{1,2})[.、)]\s+(.*)$/);
    if (m) { if (list !== 'ol') { closeList(); out.push('<ol>'); list = 'ol'; } out.push(`<li>${m[2]}</li>`); return; }
    closeList();
    out.push(`<p>${line}</p>`);
  });
  closeList();
  return out.join('');
};

window.ACCENTS = {
  accent: { main: '#5C7D6C', soft: '#EAF1EC', deep: '#476454' },
  blue: { main: '#5E7C9B', soft: '#EDF2F7', deep: '#44617E' },
  clay: { main: '#B07E66', soft: '#F6EDE7', deep: '#916450' },
  amber: { main: '#A98443', soft: '#F7F0E1', deep: '#8A6A2F' },
};
window.accentStyle = (key) => {
  const a = ACCENTS[key] || ACCENTS.accent;
  return `--accent:${a.main};--accent-soft:${a.soft};--accent-deep:${a.deep}`;
};

window.emptyState = (opts) => `<div class="empty">
  <div class="empty-art">${icon(opts.icon || 'book')}</div>
  <h3>${esc(opts.title || '暂时空空的')}</h3>
  <p>${esc(opts.desc || '')}</p>
  ${opts.action ? `<a class="btn btn-primary" href="${opts.action.href}">${esc(opts.action.label)}</a>` : ''}
</div>`;
