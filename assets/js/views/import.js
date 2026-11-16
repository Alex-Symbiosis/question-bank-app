window.Views = window.Views || {};

Views.import = {
  st: null,
  render() {
    const s = this.st || {
      step: 'source', tab: 'file', rawText: '', fileName: '', pages: 0, chars: 0,
      questions: [], warnings: [], busy: '', aiBusy: false, progress: '',
      title: '', subject: '导入题库', monogram: 'TXT', accent: 'accent', description: '',
      sourceLabel: '', cancelled: false,
    };
    if (!this.st) this.st = s;
    return `
      <div class="page-head">
        <div>
          <h1 class="page-title">导入题库</h1>
          <p class="page-sub">支持 PDF、TXT、Markdown 与直接粘贴；识别后可逐题校对，再保存为题库。</p>
        </div>
      </div>
      <div class="progress-steps" id="imp-steps">${this.stepsHTML(s.step)}</div>
      <div id="import-body"></div>`;
  },
  mount() {
    this.paint();
    Q('#import-body').addEventListener('click', (e) => this.onClick(e));
    Q('#import-body').addEventListener('change', (e) => {
      if (e.target.id === 'file-input') {
        const f = e.target.files && e.target.files[0];
        if (f) this.handleFile(f);
      }
    });
    Q('#import-body').addEventListener('input', (e) => {
      const id = e.target.id;
      if (id === 'imp-title') this.st.title = e.target.value;
      if (id === 'imp-subject') this.st.subject = e.target.value;
      if (id === 'imp-mono') this.st.monogram = e.target.value;
      if (id === 'imp-desc') this.st.description = e.target.value;
      if (id === 'paste-text') this.st.pasteText = e.target.value;
    });
  },
  onClick(e) {
    const eb = e.target.closest('[data-edit]');
    if (eb) { this.editDraft(+eb.dataset.edit); return; }
    const db = e.target.closest('[data-del]');
    if (db) {
      this.st.questions.splice(+db.dataset.del, 1);
      this.paint();
      return;
    }
    const rb = e.target.closest('[data-raw]');
    if (rb) {
      const q = this.st.questions[+rb.dataset.raw];
      if (q) openModal({ title: '原始文本片段', body: `<div class="raw-text">${esc((q.meta && q.meta.raw) || q.stem)}</div>`, actions: [{ label: '关闭', kind: 'primary' }] });
    }
  },

  stepsHTML(active) {
    const steps = [['source', '选择来源'], ['parse', '识别题目'], ['preview', '校对内容'], ['save', '生成题库']];
    const idx = active === 'source' ? 0 : active === 'parse' ? 1 : active === 'preview' ? 2 : 3;
    return steps.map(([k, label], i) => `
      ${i ? '<span class="pstep-line"></span>' : ''}
      <span class="pstep ${i === idx ? 'active' : ''} ${i < idx ? 'done' : ''}">
        <span class="n">${i < idx ? icon('check') : i + 1}</span>${label}
      </span>`).join('');
  },
  paint() {
    const s = this.st;
    Q('#imp-steps').innerHTML = this.stepsHTML(s.step);
    if (s.busy) { this.paintBusy(); return; }
    if (s.step === 'source') this.paintSource();
    else if (s.step === 'preview') this.paintPreview();
  },
  paintSource() {
    const s = this.st;
    Q('#import-body').innerHTML = `
      <div class="card" style="padding:26px">
        <div class="between mb-16">
          <div>
            <div class="card-title">${icon('upload')} 从哪里开始？</div>
            <div class="card-desc">PDF 会先提取文字；扫描件可能没有文字层，建议改用粘贴文本。</div>
          </div>
          <div class="tabs" id="imp-tabs">
            <button data-tab="file" class="${s.tab === 'file' ? 'active' : ''}">上传文件</button>
            <button data-tab="paste" class="${s.tab === 'paste' ? 'active' : ''}">粘贴文本</button>
          </div>
        </div>
        ${s.tab === 'file' ? `
          <div class="dropzone" id="dropzone">
            <div class="dz-orb">${icon('upload')}</div>
            <h3>拖入文件，或点击选择</h3>
            <p>支持 PDF / TXT / Markdown，文件只在本机解析</p>
            <div class="formats">
              <span class="chip plain">.pdf</span>
              <span class="chip plain">.txt</span>
              <span class="chip plain">.md</span>
            </div>
            <input type="file" id="file-input" accept=".pdf,.txt,.md,.markdown,application/pdf,text/plain" hidden />
          </div>` : `
          <div class="field">
            <label>粘贴原始题目文本 <span class="hint">题号、选项、答案、解析混排也可以</span></label>
            <textarea class="textarea" id="paste-text" rows="12" placeholder="示例：&#10;1. 下列哪项属于监督学习？&#10;A. 聚类&#10;B. 用带标签数据训练模型&#10;C. 降维&#10;D. 异常检测&#10;答案：B&#10;解析：监督学习依赖标签……">${esc(s.pasteText || '')}</textarea>
          </div>
          <div class="row mt-16">
            <button class="btn btn-primary" id="btn-parse-paste">${icon('search')} 识别题目</button>
            <span class="small muted">识别后可以再用 AI 重新结构化</span>
          </div>`}
      </div>
      <div class="guide-card mt-16">
        <div class="g-orb">${icon('sparkle')}</div>
        <div><h4>识别不理想？交给 AI 结构化</h4><p>本地规则解析适合格式规整的题库；排版混乱、跨行、选项挤在一起时，用 AI 重新拆解效果更好（会使用你的 API Key）。</p></div>
      </div>`;
    const di = Q('#file-input');
    const pb = Q('#btn-parse-paste');
    if (pb) pb.onclick = () => {
      const txt = (Q('#paste-text').value || '').trim();
      if (txt.length < 10) { toast('先把题目内容粘贴进来', 'bad'); return; }
      this.st.rawText = txt;
      this.st.fileName = '粘贴的文本';
      this.st.sourceLabel = '粘贴文本';
      this.st.monogram = 'TXT';
      this.parseLocal();
    };
    const dz = Q('#dropzone');
    if (dz) {
      dz.onclick = () => di && di.click();
      ['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('drag'); }));
      ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('drag'); }));
      dz.addEventListener('drop', (e) => {
        const f = e.dataTransfer.files[0];
        if (f) this.handleFile(f);
      });
    }
    QA('#imp-tabs button').forEach((b) => {
      b.onclick = () => { this.st.tab = b.dataset.tab; this.paint(); };
    });
  },
  paintBusy() {
    const s = this.st;
    Q('#import-body').innerHTML = `
      <div class="card result-card" style="padding:64px 32px">
        <div class="spinner" style="width:30px;height:30px;border-width:3px;margin:0 auto 22px"></div>
        <h2 class="result-title">${esc(s.busy)}</h2>
        <p class="result-sub" id="busy-progress">${esc(s.progress || '请稍候…')}</p>
        ${s.aiBusy ? `<button class="btn btn-ghost btn-sm mt-24" id="btn-cancel-ai">取消</button>` : ''}
      </div>`;
    const c = Q('#btn-cancel-ai');
    if (c) c.onclick = () => { this.st.cancelled = true; AI.cancel(); };
  },
  setBusy(title, progress, ai) {
    this.st.busy = title; this.st.progress = progress || ''; this.st.aiBusy = !!ai;
    this.paint();
  },
  updateBusy(progress) {
    const el = Q('#busy-progress');
    if (el) el.textContent = progress;
  },

  async handleFile(file) {
    if (this.st.busy) return;
    const name = file.name || '';
    const ext = (name.split('.').pop() || '').toLowerCase();
    if (!['pdf', 'txt', 'md', 'markdown'].includes(ext)) {
      toast('目前支持 PDF、TXT、MD 文件', 'bad');
      return;
    }
    this.st.fileName = name;
    this.st.sourceLabel = ext === 'pdf' ? 'PDF' : ext === 'md' || ext === 'markdown' ? 'Markdown' : 'TXT';
    this.st.monogram = ext === 'pdf' ? 'PDF' : ext === 'md' || ext === 'markdown' ? 'MD' : 'TXT';
    this.st.rawText = '';
    this.st.questions = [];
    this.st.warnings = [];
    this.st.step = 'parse';

    if (ext === 'pdf') {
      this.setBusy('正在提取 PDF 文本', '准备中…');
      try {
        const res = await PDFImport.extract(file, (p, i, total) => {
          this.updateBusy(`第 ${i} / ${total} 页 · ${Math.round(p * 100)}%`);
        });
        this.st.pages = res.pageCount;
        this.st.chars = res.chars;
        if (res.scanned) {
          this.st.warnings.push('这份 PDF 几乎没有文字层，可能是扫描件。建议用 OCR 或直接粘贴文本导入。');
        }
        this.st.rawText = res.text;
        this.st.busy = '';
        this.parseLocal();
      } catch (e) {
        this.st.busy = '';
        this.st.step = 'source';
        this.paint();
        toast(e.message || 'PDF 解析失败', 'bad', 5200);
      }
      return;
    }

    this.setBusy('正在读取文本', '解析编码…');
    try {
      const buf = await readFile(file, 'buffer');
      const text = decodeText(buf);
      this.st.chars = text.length;
      this.st.pages = 1;
      this.st.rawText = ext === 'md' || ext === 'markdown' ? cleanMarkdown(text) : text;
      this.st.busy = '';
      this.parseLocal();
    } catch (e) {
      this.st.busy = '';
      this.st.step = 'source';
      this.paint();
      toast('读取文件失败：' + (e.message || ''), 'bad');
    }
  },

  parseLocal() {
    const s = this.st;
    try {
      const res = PDFImport.parse(s.rawText, { defaultCategory: s.subject || '导入题库' });
      s.questions = res.questions || [];
      s.warnings = (s.warnings || []).concat(res.warnings || []);
      const base = (s.fileName || '新题库').replace(/\.(pdf|txt|md|markdown)$/i, '');
      if (!s.title) s.title = base.slice(0, 40);
      s.step = 'preview';
      this.paint();
      if (!s.questions.length) toast('没有识别到题目，可以试试 AI 结构化', 'bad', 4000);
    } catch (e) {
      console.error(e);
      this.setBusy('识别失败', e.message);
      setTimeout(() => { s.busy = ''; s.step = 'source'; this.paint(); }, 900);
    }
  },

  paintPreview() {
    const s = this.st;
    const total = s.questions.length;
    const high = s.questions.filter((q) => (q.meta && q.meta.confidence >= 0.8)).length;
    const need = s.questions.filter((q) => (q.meta && q.meta.confidence < 0.6) || !q.answer).length;
    const chars = (s.rawText || '').replace(/\s/g, '').length;
    Q('#import-body').innerHTML = `
      <div class="import-summary">
        <div class="import-stat"><b>${total}</b><span>识别题目</span></div>
        <div class="import-stat"><b>${high}</b><span>高可信度</span></div>
        <div class="import-stat"><b>${need}</b><span>需要检查</span></div>
        <div class="import-stat"><b>${chars > 1000 ? (chars / 1000).toFixed(1) + 'k' : chars}</b><span>文本字数</span></div>
      </div>

      ${(s.warnings || []).length ? `<div class="warn-box mb-16">${icon('alert')}<div>${s.warnings.slice(0, 4).map(esc).join('<br/>')}</div></div>` : ''}

      <div class="card mb-16" style="padding:22px 24px">
        <div class="between wrap" style="gap:12px">
          <div>
            <div class="card-title">${icon('sparkle')} AI 结构化</div>
            <div class="card-desc">当排版混乱、选项跨行或本地规则识别不准时，让 AI 按统一格式重新拆解。</div>
          </div>
          <div class="row">
            <button class="btn btn-ghost btn-sm" id="btn-reparse">${icon('refresh')} 重新识别</button>
            <button class="btn btn-primary" id="btn-ai">${icon('sparkle')} 用 AI 重新结构化</button>
          </div>
        </div>
        <div class="row wrap mt-16" style="gap:6px">
          <span class="chip plain">${esc(AI.isConfigured() ? '当前模型：' + Store.settings.api().model : '未配置 AI')}</span>
          <span class="chip plain">${esc(s.sourceLabel || '文本')} 来源</span>
          <span class="chip plain">${esc(s.fileName || '')}</span>
        </div>
      </div>

      <div class="card mb-16" style="padding:22px 24px">
        <div class="card-title mb-16">${icon('book')} 题库信息</div>
        <div class="form-grid">
          <div class="field span2"><label>题库名称</label><input class="input" id="imp-title" value="${esc(s.title)}" placeholder="例如：计算机网络期末复习" /></div>
          <div class="field"><label>学科 / 来源</label><input class="input" id="imp-subject" value="${esc(s.subject)}" /></div>
          <div class="field"><label>标记（2-4 字符）</label><input class="input" id="imp-mono" maxlength="4" value="${esc(s.monogram)}" /></div>
          <div class="field span2"><label>简介 <span class="hint">可留空</span></label><input class="input" id="imp-desc" value="${esc(s.description)}" placeholder="一句话说明这份题库的范围" /></div>
          <div class="field span2"><label>主题色</label>
            <div class="preset-chips" id="imp-accents">
              ${Object.keys(ACCENTS).map((a) => `<button type="button" data-accent="${a}" style="border-color:${s.accent === a ? '#23262A' : ''};color:${s.accent === a ? '#23262A' : ''}">${a}</button>`).join('')}
            </div>
          </div>
        </div>
      </div>

      <div class="preview-toolbar">
        <strong style="font-size:13.5px">题目预览</strong>
        <span class="small muted">逐题检查，点「编辑」可修改</span>
        <span class="grow"></span>
        <button class="btn btn-quiet btn-sm" id="btn-clear">清空重来</button>
      </div>
      <div class="q-list" style="gap:8px;background:transparent;border:0">
        ${s.questions.map((q, i) => this.draftRow(q, i)).join('') || `<div class="empty" style="padding:40px"><p>还没有识别到题目。</p><button class="btn btn-soft" id="btn-ai-empty">${icon('sparkle')} 用 AI 结构化</button></div>`}
      </div>

      <div class="card mt-24" style="padding:18px 22px;position:sticky;bottom:14px;box-shadow:var(--sh-3)">
        <div class="between wrap">
          <div class="small muted">保存后可在题库中随时编辑、删除与查看题量。</div>
          <div class="row">
            <button class="btn btn-ghost" id="btn-back-source">上一步</button>
            <button class="btn btn-primary" id="btn-save" ${total ? '' : 'disabled'}>保存为题库（${total} 题）</button>
          </div>
        </div>
      </div>`;

    QA('#imp-accents [data-accent]').forEach((b) => {
      b.onclick = () => {
        s.accent = b.dataset.accent;
        QA('#imp-accents [data-accent]').forEach((x) => { x.style.borderColor = ''; x.style.color = ''; });
        b.style.borderColor = '#23262A'; b.style.color = '#23262A';
      };
    });
    Q('#btn-reparse').onclick = () => { s.questions = []; s.warnings = []; s.step = 'parse'; this.setBusy('重新识别中', '清理缓存…'); setTimeout(() => { s.busy = ''; this.parseLocal(); }, 120); };
    Q('#btn-ai').onclick = () => this.aiStructure();
    const emptyAi = Q('#btn-ai-empty');
    if (emptyAi) emptyAi.onclick = () => this.aiStructure();
    Q('#btn-clear').onclick = async () => {
      const ok = await confirmModal({ title: '清空当前导入？', body: '已识别的草稿会被丢弃，原始文本不会被保存。', okText: '清空', danger: true });
      if (ok) { this.st = null; App.render(); }
    };
    Q('#btn-back-source').onclick = () => { s.step = 'source'; this.paint(); };
    Q('#btn-save').onclick = () => this.saveBank();
  },

  draftRow(q, i) {
    const conf = (q.meta && q.meta.confidence) || 0;
    const dot = conf >= 0.8 ? 'conf-high' : conf >= 0.6 ? 'conf-mid' : 'conf-low';
    const issue = (q.meta && q.meta.issues && q.meta.issues.length) ? q.meta.issues.join('、') : '';
    return `<div class="pq-card">
      <div class="pnum">${String(i + 1).padStart(2, '0')}</div>
      <div class="pbody">
        <div class="pstem">${esc(q.stem || '（空题干）')}</div>
        <div class="pmeta">
          <span class="chip ${typeChip(q.type)}">${typeLabel(q.type)}</span>
          <span class="chip plain">答案 ${esc(Array.isArray(q.answer) ? q.answer.join('、') : (q.answer === 'T' ? '正确' : q.answer === 'F' ? '错误' : q.answer || '—'))}</span>
          ${q.options && q.options.length ? `<span class="chip plain">${q.options.length} 个选项</span>` : ''}
          ${q.category ? `<span class="chip plain">${esc(q.category)}</span>` : ''}
          <span class="small muted"><i class="conf-dot ${dot}"></i> ${Math.round(conf * 100)}%</span>
          ${q.meta && q.meta.page ? `<span class="small muted">第 ${q.meta.page} 页</span>` : ''}
          ${issue ? `<span class="chip bad">${esc(issue)}</span>` : ''}
        </div>
      </div>
      <div class="pq-actions">
        <button class="btn btn-quiet btn-sm" data-edit="${i}">${icon('edit')} 编辑</button>
        <button class="raw-toggle" data-raw="${i}">看原文</button>
        <button class="raw-toggle" data-del="${i}" style="color:var(--bad)">删除</button>
      </div>
    </div>`;
  },

  editDraft(i) {
    const s = this.st;
    const q = s.questions[i];
    if (!q) return;
    const types = ['single', 'multiple', 'judge', 'blank', 'short'];
    const optsHTML = () => (q.options || []).map((o, k) => `
      <div class="orow" data-ok="${k}">
        <span class="k">${o.key}</span>
        <input class="input" data-otext="${k}" value="${esc(o.text)}" />
        <button class="icon-btn" data-odel="${k}" title="删除选项">${icon('x')}</button>
      </div>`).join('');
    const m = openModal({
      title: `编辑第 ${i + 1} 题`,
      sub: '修改后会立即更新到草稿',
      wide: true,
      body: `
        <div class="form-grid">
          <div class="field"><label>题型</label>
            <select class="select" id="ed-type">
              ${types.map((t) => `<option value="${t}" ${q.type === t ? 'selected' : ''}>${typeLabel(t)}</option>`).join('')}
            </select>
          </div>
          <div class="field"><label>分类 / 知识点</label><input class="input" id="ed-cat" value="${esc(q.category || '')}" /></div>
          <div class="field span2"><label>题干</label><textarea class="textarea" id="ed-stem" rows="4">${esc(q.stem || '')}</textarea></div>
          <div class="field span2" id="ed-options-wrap"><label>选项 <span class="hint">单选 / 多选使用</span></label>
            <div class="opt-editor" id="ed-options">${optsHTML()}</div>
            <button class="btn btn-ghost btn-sm mt-10" id="ed-add-opt" type="button">${icon('plus')} 添加选项</button>
          </div>
          <div class="field span2"><label>答案 <span class="hint" id="ed-answer-hint"></span></label>
            <input class="input" id="ed-answer" value="${esc(Array.isArray(q.answer) ? q.answer.join(',') : (q.answer === 'T' ? 'T' : q.answer === 'F' ? 'F' : q.answer || ''))}" />
          </div>
          <div class="field span2"><label>解析</label><textarea class="textarea" id="ed-exp" rows="4">${esc(q.explanation || '')}</textarea></div>
        </div>`,
      actions: [
        { label: '取消', kind: 'ghost' },
        { label: '保存修改', kind: 'primary', onClick: () => {
          const type = Q('#ed-type').value;
          const stem = Q('#ed-stem').value.trim();
          if (!stem) { toast('题干不能为空', 'bad'); return false; }
          const options = QA('#ed-options .orow').map((row, k) => ({
            key: Q('[data-otext]', row) ? String.fromCharCode(65 + k) : String.fromCharCode(65 + k),
            text: Q('[data-otext]', row).value.trim(),
          })).filter((o) => o.text);
          const rawAns = Q('#ed-answer').value.trim();
          let answer = rawAns;
          if (type === 'multiple') answer = normalizeAnswer('multiple', rawAns);
          else if (type === 'single') answer = normalizeAnswer('single', rawAns);
          else if (type === 'judge') answer = normalizeAnswer('judge', rawAns);
          Object.assign(q, {
            type, stem, options: (type === 'single' || type === 'multiple') ? options : [],
            answer, explanation: Q('#ed-exp').value.trim(),
            category: Q('#ed-cat').value.trim() || '未分类',
            meta: Object.assign({}, q.meta, { confidence: 0.95, issues: [], edited: true }),
          });
          this.paint();
          toast('已更新', 'ok');
        } },
      ],
      onMount(api) {
        const typeEl = Q('#ed-type', api.el);
        const hint = Q('#ed-answer-hint', api.el);
        const sync = () => {
          const t = typeEl.value;
          hint.textContent = t === 'single' ? '填字母，例如 B' : t === 'multiple' ? '填字母，例如 A,C' : t === 'judge' ? '填 T（正确）或 F（错误）' : '填写参考答案原文';
          Q('#ed-options-wrap', api.el).style.display = (t === 'single' || t === 'multiple') ? '' : 'none';
        };
        typeEl.onchange = sync; sync();
        Q('#ed-add-opt', api.el).onclick = () => {
          const wrap = Q('#ed-options', api.el);
          const k = wrap.children.length;
          if (k >= 8) { toast('最多 8 个选项', 'bad'); return; }
          const div = document.createElement('div');
          div.className = 'orow';
          div.innerHTML = `<span class="k">${String.fromCharCode(65 + k)}</span><input class="input" data-otext="${k}" /><button class="icon-btn" data-odel="${k}">${icon('x')}</button>`;
          wrap.appendChild(div);
          div.querySelector('[data-odel]').onclick = () => div.remove();
        };
        QA('[data-odel]', api.el).forEach((b) => { b.onclick = () => b.closest('.orow').remove(); });
      },
    });
  },

  async aiStructure() {
    const s = this.st;
    if (!AI.isConfigured()) {
      openModal({
        title: '还没有配置 AI',
        body: 'AI 结构化需要一个 OpenAI 兼容的接口。配置只保存在本机，所有 AI 功能共用。',
        actions: [
          { label: '稍后再说', kind: 'ghost' },
          { label: '去设置', kind: 'primary', onClick: () => { location.hash = '#/settings'; } },
        ],
      });
      return Promise.resolve();
    }
    const text = (s.rawText || '').trim();
    if (!text) { toast('没有可结构化的文本', 'bad'); return; }
    const ok = await confirmModal({
      title: '用 AI 重新结构化？',
      body: `将把原文分段发送给「${Store.settings.api().model}」进行拆解，返回的题目会替换当前草稿。原文约 ${text.length} 字，可能需要一点时间。`,
      okText: '开始结构化',
    });
    if (!ok) return;
    s.cancelled = false;
    this.setBusy('AI 正在拆解题库', '准备分段…', true);
    try {
      const res = await AI.structureQuestions({
        text,
        hint: '题库名称：' + (s.title || '未命名'),
        onProgress: (p) => this.updateBusy(`正在处理第 ${p.done} / ${p.total} 段 · 已结构化 ${p.count} 题`),
        isCancelled: () => s.cancelled,
      });
      const list = res.questions.map((q) => normalizeStructured(q)).filter((q) => q.stem);
      if (!list.length) throw new Error('没有有效题目');
      s.questions = list;
      s.warnings = [];
      if (res.errors.length) s.warnings.push(`${res.errors.length} 段未成功结构化，已保留其余结果`);
      if (res.truncated) s.warnings.push('文本较长，只处理了前面的部分，建议分批导入');
      s.busy = '';
      s.aiBusy = false;
      this.paint();
      toast(`AI 结构化完成，共 ${list.length} 题`, 'ok', 3200);
    } catch (e) {
      s.busy = ''; s.aiBusy = false;
      this.paint();
      if (e.code === 'ABORTED') toast('已取消 AI 结构化');
      else toast(e.friendly || e.message || 'AI 结构化失败', 'bad', 6000);
    }
  },

  saveBank() {
    const s = this.st;
    const title = (Q('#imp-title') ? Q('#imp-title').value : s.title).trim();
    if (!title) { toast('给题库起个名字吧', 'bad'); return; }
    if (!s.questions.length) { toast('至少需要一道题目', 'bad'); return; }
    const bank = Store.banks.create({
      title,
      subject: (Q('#imp-subject') ? Q('#imp-subject').value : s.subject).trim() || '导入题库',
      monogram: (Q('#imp-mono') ? Q('#imp-mono').value : s.monogram).trim() || 'TXT',
      description: (Q('#imp-desc') ? Q('#imp-desc').value : s.description).trim(),
      accent: s.accent,
      source: { type: 'import', label: s.sourceLabel || '文本导入', fileName: s.fileName, pages: s.pages },
      questions: s.questions.map((q) => ({
        type: q.type, stem: q.stem, options: q.options, answer: q.answer,
        explanation: q.explanation, category: q.category,
        difficulty: q.difficulty || 2, meta: q.meta,
      })),
    });
    toast(`题库已创建，共 ${bank.questions.length} 题`, 'ok', 3000);
    this.st = null;
    location.hash = '#/bank/' + bank.id;
  },
};

/* ---------- 辅助 ---------- */
function decodeText(buffer) {
  const bytes = new Uint8Array(buffer);
  let text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  const bad = (text.match(/\uFFFD/g) || []).length;
  if (bad > Math.max(3, text.length * 0.004)) {
    try {
      const gbk = new TextDecoder('gbk').decode(bytes);
      if (gbk && (gbk.match(/\uFFFD/g) || []).length < bad) return gbk;
    } catch (e) { }
  }
  return text;
}

function cleanMarkdown(text) {
  return text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^>\s?/gm, '')
    .replace(/^\s*[-*+]\s+(?=[A-D][.、])/gm, '');
}

function normalizeStructured(raw) {
  const allowed = ['single', 'multiple', 'judge', 'blank', 'short'];
  let type = allowed.includes(raw.type) ? raw.type : 'short';
  let options = (Array.isArray(raw.options) ? raw.options : []).map((o, i) => ({
    key: String(o.key || String.fromCharCode(65 + i)).toUpperCase().slice(0, 1),
    text: String(o.text || o.value || '').trim(),
  })).filter((o) => o.text && /^[A-H]$/.test(o.key));
  if (options.length && !['single', 'multiple'].includes(type)) {
    type = options.length >= 2 ? (Array.isArray(raw.answer) && raw.answer.length > 1 ? 'multiple' : 'single') : 'short';
  }
  if (type === 'judge') options = [];
  if (type === 'blank' || type === 'short') options = [];
  let answer = raw.answer;
  if (type === 'multiple') answer = normalizeAnswer('multiple', Array.isArray(answer) ? answer : String(answer || ''));
  else if (type === 'single') answer = normalizeAnswer('single', String(answer || ''));
  else if (type === 'judge') answer = normalizeAnswer('judge', String(answer === true ? 'T' : answer === false ? 'F' : answer || ''));
  else answer = String(Array.isArray(answer) ? answer.join('；') : (answer || '')).trim();
  return {
    id: uid('q'),
    type,
    stem: String(raw.stem || raw.question || '').trim(),
    options,
    answer,
    explanation: String(raw.explanation || raw.analysis || '').trim(),
    category: String(raw.category || raw.knowledge || '未分类').trim() || '未分类',
    difficulty: Number(raw.difficulty) || 2,
    meta: { confidence: 0.95, issues: answer ? [] : ['缺少答案'], source: 'ai' },
  };
}
