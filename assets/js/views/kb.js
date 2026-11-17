window.Views = window.Views || {};

/* ============================================================
   智库（知识库）：学习频道 → 导入资料 → AI 拆知识点 → AI 出题
   ============================================================ */

function kbSourceLabel(kb) {
  const s = kb.source || {};
  if (s.type === 'pdf') return 'PDF 导入';
  if (s.type === 'paste') return '粘贴文本';
  if (s.type === 'file') return '文件导入';
  return '手动创建';
}

function kbDecode(buffer) {
  const bytes = new Uint8Array(buffer);
  let text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  const bad = (text.match(/\uFFFD/g) || []).length;
  if (bad > Math.max(3, text.length * 0.004)) {
    try {
      const gbk = new TextDecoder('gbk').decode(bytes);
      if (gbk && (gbk.match(/\uFFFD/g) || []).length < bad) return gbk;
    } catch (e) { /* 环境不支持 gbk 时保留 utf-8 */ }
  }
  return text;
}

function cleanKbMarkdown(text) {
  return String(text || '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^>\s?/gm, '');
}

/* 没有 AI 时的兜底：按段落拆成知识点 */
function splitByParagraph(text) {
  const paras = String(text || '').replace(/\f/g, '\n\n')
    .split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p.length >= 12);
  return paras.slice(0, 300).map((p, i) => {
    const first = p.split(/\n/)[0].replace(/^[#*\-\s·•]+/, '').trim();
    const title = (first.length >= 3 && first.length <= 36 ? first : '要点 ' + (i + 1)).slice(0, 40);
    return { title: title || '要点 ' + (i + 1), body: p, tags: [], source: '' };
  });
}

/* ============================================================
   学习频道
   ============================================================ */
Views.learn = {
  render() {
    const list = Store.kbs.list().slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    const totalItems = list.reduce((s, k) => s + (k.items ? k.items.length : 0), 0);
    const cards = list.map((kb, i) => `
      <article class="kb-card" style="--i:${i}">
        <a class="kb-card-main" href="#/kb/${kb.id}">
          <div class="kb-card-top">
            <div class="kb-orb">${icon('layers')}</div>
            <div class="grow">
              <div class="kb-name">${esc(kb.title)}</div>
              <div class="kb-meta">${(kb.items || []).length} 条知识点 · ${esc(kbSourceLabel(kb))}</div>
            </div>
          </div>
          <div class="kb-desc">${esc(kb.description || '由资料整理出的知识点集合，可让 AI 直接出题。')}</div>
          <div class="kb-foot">
            <span class="small muted">更新于 ${esc(relTime(kb.updatedAt))}</span>
            <span class="kb-go">${icon('right')}</span>
          </div>
        </a>
        <div class="kb-card-acts">
          <button class="icon-btn" data-kb-rename="${kb.id}" title="重命名">${icon('edit')}</button>
          <button class="icon-btn" data-kb-del="${kb.id}" title="删除">${icon('trash')}</button>
        </div>
      </article>`).join('');

    return `
      <div id="learn-page">
      <div class="page-head">
        <div>
          <div class="learn-kicker">学习频道</div>
          <h1 class="page-title">智库</h1>
          <p class="page-sub">把资料拆成一条条知识点；需要练习时，让 AI 直接根据知识库出题。</p>
        </div>
        <a class="btn btn-primary" href="#/learn/import">${icon('plus')} 新建知识库</a>
      </div>

      ${learnTabs('learn')}

      <div class="learn-stats">
        <div><b>${list.length}</b><span>知识库</span></div>
        <div><b>${totalItems}</b><span>知识点</span></div>
      </div>

      ${list.length ? `<div class="kb-grid">
        ${cards}
        <a class="kb-new" href="#/learn/import">
          <div>
            <div class="plus-orb">${icon('plus')}</div>
            <strong>导入新的知识库</strong><br/>
            <span>PDF、TXT 或直接粘贴资料</span>
          </div>
        </a>
      </div>` : emptyState({
        icon: 'layers',
        title: '还没有知识库',
        desc: '导入一份资料，AI 会把它拆成一条条知识点。之后可以针对这个知识库让 AI 出题，直接进入答题模式。',
        action: { href: '#/learn/import', label: '导入第一份资料' },
      })}

      <div class="section-head"><h2>可以这样用</h2></div>
      <div class="grid-3">
        <div class="guide-card">
          <div class="g-orb">${icon('upload')}</div>
          <div><h4>导入资料</h4><p>支持 PDF、TXT、Markdown 与粘贴；AI 拆成标题 + 正文的知识点。</p></div>
        </div>
        <div class="guide-card">
          <div class="g-orb">${icon('sparkle')}</div>
          <div><h4>让 AI 出题</h4><p>选择题型与题量，AI 严格按知识库内容出题，还能给解析。</p></div>
        </div>
        <div class="guide-card">
          <div class="g-orb">${icon('pen')}</div>
          <div><h4>直接练</h4><p>生成的题进入答题模式，可问 AI 讲解，但不写入错题本。</p></div>
        </div>
      </div>
      </div>`;
  },
  mount() {
    const root = Q('#learn-page');
    root.addEventListener('click', async (e) => {
      const renameBtn = e.target.closest('[data-kb-rename]');
      if (renameBtn) {
        e.preventDefault();
        this.rename(renameBtn.dataset.kbRename);
        return;
      }
      const delBtn = e.target.closest('[data-kb-del]');
      if (delBtn) {
        e.preventDefault();
        const kb = Store.kbs.get(delBtn.dataset.kbDel);
        if (!kb) return;
        const ok = await confirmModal({
          title: '删除知识库',
          body: `「${kb.title}」以及它的 ${(kb.items || []).length} 条知识点会被删除，已生成的临时练习也会一起清理。此操作不可撤销。`,
          okText: '删除',
          danger: true,
        });
        if (!ok) return;
        Store.kbs.remove(kb.id);
        toast('已删除知识库', 'ok');
        App.render();
      }
    });
  },
  rename(id) {
    const kb = Store.kbs.get(id);
    if (!kb) return;
    openModal({
      title: '重命名知识库',
      body: `<div class="field"><label>名称</label>
        <input class="input" id="kb-rename-input" maxlength="40" value="${esc(kb.title)}" /></div>`,
      actions: [
        { label: '取消', kind: 'ghost' },
        {
          label: '保存', kind: 'primary',
          onClick: () => {
            const v = (Q('#kb-rename-input').value || '').trim();
            if (!v) { toast('名称不能为空', 'bad'); return false; }
            Store.kbs.update(kb.id, { title: v });
            toast('已重命名', 'ok');
            App.render();
          },
        },
      ],
    });
    setTimeout(() => {
      const input = Q('#kb-rename-input');
      if (input) { input.focus(); input.select(); }
    }, 120);
  },
};

/* ============================================================
   导入资料 → 生成知识库
   ============================================================ */
Views.kbImport = {
  st: null,
  render(ctx) {
    const target = ctx.query && ctx.query.kb ? Store.kbs.get(ctx.query.kb) : null;
    this.st = {
      step: 'source', tab: 'file', rawText: '', fileName: '', sourceType: 'file',
      title: '', items: [], warnings: [], busy: '', progress: '', cancelled: false,
      target,
    };
    return `
      <div class="page-head">
        <div>
          <div class="learn-kicker">学习频道 · 智库</div>
          <h1 class="page-title">${target ? '添加资料到知识库' : '新建知识库'}</h1>
          <p class="page-sub">${target
            ? `新资料拆出的知识点会追加到「${esc(target.title)}」。`
            : '上传或粘贴资料，AI 会拆成结构化的知识点条目，之后再命名保存。'}</p>
        </div>
        <a class="btn btn-quiet btn-sm" href="${target ? '#/kb/' + target.id : '#/learn'}">${icon('left')} 返回</a>
      </div>
      <div id="kb-import-body"></div>`;
  },
  mount() {
    const body = Q('#kb-import-body');
    body.addEventListener('click', (e) => this.onClick(e));
    body.addEventListener('change', (e) => {
      if (e.target.id === 'kb-file') {
        const f = e.target.files && e.target.files[0];
        if (f) this.handleFile(f);
      }
    });
    body.addEventListener('input', (e) => {
      if (e.target.id === 'kb-title') this.st.title = e.target.value;
    });
    this.paint();
  },
  onClick(e) {
    const tab = e.target.closest('[data-kb-tab]');
    if (tab) { this.st.tab = tab.dataset.kbTab; this.paint(); return; }

    if (e.target.closest('#kb-pick-file')) {
      const input = Q('#kb-file');
      if (input) input.click();
      return;
    }
    if (e.target.closest('#kb-use-paste')) {
      const txt = (Q('#kb-paste').value || '').trim();
      if (txt.length < 20) { toast('先把资料内容粘贴进来', 'bad'); return; }
      this.st.rawText = txt;
      this.st.fileName = '粘贴的资料';
      this.st.sourceType = 'paste';
      this.st.step = 'ready';
      this.paint();
      return;
    }
    if (e.target.closest('#kb-ai-split')) { this.structureWithAI(); return; }
    if (e.target.closest('#kb-local-split')) {
      const items = splitByParagraph(this.st.rawText);
      if (!items.length) { toast('没有识别到可用的段落', 'bad'); return; }
      this.st.items = items;
      this.st.step = 'preview';
      this.paint();
      return;
    }
    if (e.target.closest('#kb-cancel-ai')) { this.st.cancelled = true; AI.cancel(); return; }
    if (e.target.closest('#kb-back-source')) { this.st.step = 'source'; this.paint(); return; }
    if (e.target.closest('#kb-save')) { this.save(); return; }

    const del = e.target.closest('[data-item-del]');
    if (del) {
      this.st.items.splice(+del.dataset.itemDel, 1);
      this.paint();
    }
  },
  paint() {
    const s = this.st;
    const box = Q('#kb-import-body');
    if (!box) return;
    if (s.busy) { box.innerHTML = this.busyHTML(); this.bindBusy(); return; }
    if (s.step === 'source') box.innerHTML = this.sourceHTML();
    else if (s.step === 'ready') box.innerHTML = this.readyHTML();
    else if (s.step === 'preview') box.innerHTML = this.previewHTML();
  },
  sourceHTML() {
    const s = this.st;
    return `
      <div class="card" style="padding:26px">
        <div class="between mb-16">
          <div>
            <div class="card-title">${icon('upload')} 资料从哪里来？</div>
            <div class="card-desc">PDF 会先提取文字；扫描件可能没有文字层，建议改用粘贴。</div>
          </div>
          <div class="tabs">
            <button data-kb-tab="file" class="${s.tab === 'file' ? 'active' : ''}">上传文件</button>
            <button data-kb-tab="paste" class="${s.tab === 'paste' ? 'active' : ''}">粘贴文本</button>
          </div>
        </div>
        ${s.tab === 'file' ? `
          <div class="dropzone" id="kb-pick-file">
            <div class="dz-orb">${icon('upload')}</div>
            <h3>选择一份资料</h3>
            <p>支持 PDF / TXT / Markdown，文件只在本机解析</p>
            <div class="formats">
              <span class="chip plain">.pdf</span>
              <span class="chip plain">.txt</span>
              <span class="chip plain">.md</span>
            </div>
            <input type="file" id="kb-file" accept=".pdf,.txt,.md,.markdown,application/pdf,text/plain" hidden />
          </div>
          <p class="small muted mt-16">导入后先在本机提取文字，再由 AI 拆分知识点；不会上传原始文件。</p>` : `
          <div class="field">
            <label>粘贴学习资料 <span class="hint">讲义、笔记、规范条文、教材段落都可以</span></label>
            <textarea class="textarea" id="kb-paste" rows="12" placeholder="把要整理成知识库的内容粘贴到这里……">${esc(s.pasteText || '')}</textarea>
          </div>
          <div class="row mt-16">
            <button class="btn btn-primary" id="kb-use-paste">${icon('right')} 使用这段文本</button>
          </div>`}
      </div>`;
  },
  readyHTML() {
    const s = this.st;
    const chars = (s.rawText || '').replace(/\s/g, '').length;
    const target = s.target;
    return `
      <div class="card" style="padding:26px">
        <div class="between mb-16">
          <div>
            <div class="card-title">${icon('layers')} 准备拆分知识点</div>
            <div class="card-desc">${esc(s.fileName || '资料')} · 约 ${chars > 1000 ? (chars / 1000).toFixed(1) + 'k' : chars} 字</div>
          </div>
          <span class="chip plain">${esc(s.sourceType === 'paste' ? '粘贴文本' : '文件导入')}</span>
        </div>
        ${target ? '' : `<div class="field mb-16">
          <label>知识库名称 <span class="hint">之后可重命名</span></label>
          <input class="input" id="kb-title" maxlength="40" value="${esc(s.title)}" placeholder="例如：水工建筑物 · 重力坝要点" />
        </div>`}
        <div class="kb-split-actions">
          <button class="btn btn-primary" id="kb-ai-split" ${AI.isConfigured() ? '' : 'disabled'}>${icon('sparkle')} 用 AI 拆成知识点</button>
          <button class="btn btn-ghost" id="kb-local-split">按段落快速拆分</button>
          <button class="btn btn-quiet btn-sm" id="kb-back-source">换一份资料</button>
        </div>
        <p class="small muted mt-16">${AI.isConfigured()
          ? 'AI 会按概念、结论、公式、步骤等把资料拆成独立条目；耗时随资料长度增加。'
          : '还没有配置 AI，暂时只能按段落拆分。到设置里填写 API Key 后可以更细地拆分。'}</p>
      </div>
      ${(s.warnings || []).length ? `<div class="warn-box mt-16">${icon('alert')}<div>${s.warnings.map(esc).join('<br/>')}</div></div>` : ''}`;
  },
  busyHTML() {
    const s = this.st;
    return `
      <div class="card result-card" style="padding:64px 32px">
        <div class="spinner" style="width:30px;height:30px;border-width:3px;margin:0 auto 22px"></div>
        <h2 class="result-title">${esc(s.busy)}</h2>
        <p class="result-sub">${esc(s.progress || '请稍候…')}</p>
        <button class="btn btn-ghost btn-sm mt-24" id="kb-cancel-ai">取消</button>
      </div>`;
  },
  bindBusy() {
    const c = Q('#kb-cancel-ai');
    if (c) c.onclick = () => { this.st.cancelled = true; AI.cancel(); };
  },
  previewHTML() {
    const s = this.st;
    const target = s.target;
    const items = s.items;
    return `
      <div class="kb-preview-head">
        <div class="import-summary">
          <div class="import-stat"><b>${items.length}</b><span>知识点</span></div>
          <div class="import-stat"><b>${items.filter((x) => x.tags && x.tags.length).length}</b><span>带标签</span></div>
          <div class="import-stat"><b>${target ? (target.items || []).length : 0}</b><span>原有条目</span></div>
        </div>
        <div class="row">
          <button class="btn btn-quiet btn-sm" id="kb-back-source">${icon('left')} 重新拆分</button>
          <button class="btn btn-primary" id="kb-save">${icon('check')} ${target ? '追加并保存' : '保存知识库'}</button>
        </div>
      </div>
      ${target ? '' : `<div class="field mb-16">
        <label>知识库名称</label>
        <input class="input" id="kb-title" maxlength="40" value="${esc(s.title || s.fileName.replace(/\.(pdf|txt|md|markdown)$/i, '').slice(0, 40))}" />
      </div>`}
      <div class="kp-list">
        ${items.map((it, i) => `
          <div class="kp-item">
            <div class="kp-item-top">
              <span class="kp-num">${String(i + 1).padStart(2, '0')}</span>
              <h3>${esc(it.title)}</h3>
              <button class="icon-btn" data-item-del="${i}" title="移除这条">${icon('x')}</button>
            </div>
            <p class="kp-body">${esc(it.body)}</p>
            ${(it.tags && it.tags.length) || it.source ? `<div class="kp-meta">
              ${(it.tags || []).map((t) => `<span class="chip plain">${esc(t)}</span>`).join('')}
              ${it.source ? `<span class="small muted">${esc(it.source)}</span>` : ''}
            </div>` : ''}
          </div>`).join('')}
      </div>`;
  },

  async handleFile(file) {
    const name = file.name || '';
    const ext = (name.split('.').pop() || '').toLowerCase();
    if (!['pdf', 'txt', 'md', 'markdown'].includes(ext)) {
      toast('目前支持 PDF、TXT、MD 文件', 'bad');
      return;
    }
    const s = this.st;
    s.fileName = name;
    s.sourceType = ext === 'pdf' ? 'pdf' : 'file';
    s.warnings = [];
    if (ext === 'pdf') {
      s.busy = '正在提取 PDF 文本';
      s.progress = '准备中…';
      this.paint();
      try {
        const res = await PDFImport.extract(file, (p, i, total) => {
          s.progress = `第 ${i} / ${total} 页 · ${Math.round(p * 100)}%`;
          const el = Q('#kb-import-body .result-sub');
          if (el) el.textContent = s.progress;
        });
        s.busy = '';
        if (res.scanned) s.warnings.push('这份 PDF 几乎没有文字层，可能是扫描件。建议改用 OCR 或直接粘贴文本。');
        s.rawText = res.text;
        s.step = 'ready';
        this.paint();
      } catch (e) {
        s.busy = '';
        s.step = 'source';
        this.paint();
        toast(e.message || 'PDF 解析失败', 'bad', 5200);
      }
      return;
    }
    s.busy = '正在读取文本';
    s.progress = '解析编码…';
    this.paint();
    try {
      const buf = await readFile(file, 'buffer');
      let text = kbDecode(buf);
      if (ext === 'md' || ext === 'markdown') text = cleanKbMarkdown(text);
      s.busy = '';
      s.rawText = text;
      s.step = 'ready';
      this.paint();
    } catch (e) {
      s.busy = '';
      s.step = 'source';
      this.paint();
      toast('读取文件失败：' + (e.message || ''), 'bad');
    }
  },

  async structureWithAI() {
    const s = this.st;
    if (!AI.isConfigured()) { toast('先到设置里配置 AI', 'bad'); return; }
    s.busy = 'AI 正在拆分知识点';
    s.progress = '准备中…';
    s.cancelled = false;
    this.paint();
    try {
      const res = await AI.structureKnowledge({
        text: s.rawText,
        title: s.title || (s.target && s.target.title) || '',
        onProgress: ({ done, total, count }) => {
          s.progress = `第 ${done} / ${total} 段 · 已得到 ${count} 条知识点`;
          const el = Q('#kb-import-body .result-sub');
          if (el) el.textContent = s.progress;
        },
        isCancelled: () => s.cancelled,
      });
      s.busy = '';
      s.items = res.items.map((it) => ({
        title: String(it.title || '').trim().slice(0, 80) || '未命名知识点',
        body: String(it.body || it.content || '').trim(),
        tags: Array.isArray(it.tags) ? it.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 6) : [],
        source: String(it.source || '').trim().slice(0, 120),
      })).filter((it) => it.body);
      if (res.truncated) s.warnings.push('资料较长，只拆分了前面的一部分。可以分几次导入。');
      if (!s.items.length) throw new Error('AI 没有返回有效知识点');
      s.step = 'preview';
      this.paint();
    } catch (e) {
      s.busy = '';
      s.step = 'ready';
      this.paint();
      if (e && e.code === 'ABORTED') toast('已取消', 'ok');
      else toast((e && (e.friendly || e.message)) || '拆分失败', 'bad', 5200);
    }
  },

  save() {
    const s = this.st;
    if (!s.items.length) { toast('至少保留一条知识点', 'bad'); return; }
    if (s.target) {
      const n = Store.kbs.addItems(s.target.id, s.items);
      toast(`已加入 ${n} 条知识点`, 'ok');
      location.hash = '#/kb/' + s.target.id;
      return;
    }
    const title = (s.title || (Q('#kb-title') && Q('#kb-title').value) || '').trim();
    if (!title) { toast('先给知识库起个名字', 'bad'); const i = Q('#kb-title'); if (i) i.focus(); return; }
    const kb = Store.kbs.create({
      title,
      description: s.fileName ? `来源：${s.fileName}` : '',
      source: { type: s.sourceType, name: s.fileName },
      items: s.items,
    });
    toast('知识库已创建', 'ok');
    location.hash = '#/kb/' + kb.id;
  },
};

/* ============================================================
   知识库详情 + 让 AI 出题
   ============================================================ */
Views.kb = {
  s: null,
  render(ctx) {
    const kb = Store.kbs.get(ctx.params.id);
    if (!kb) {
      return `<div class="card">${emptyState({
        icon: 'layers', title: '知识库不存在', desc: '它可能已经被删除。',
        action: { href: '#/learn', label: '返回智库' },
      })}</div>`;
    }
    this.s = { kb };
    const items = kb.items || [];
    return `
      <div id="kb-page">
      <div class="page-head kb-head">
        <div>
          <a class="learn-back" href="#/learn">${icon('left')} 学习频道 · 智库</a>
          <h1 class="page-title">${esc(kb.title)}</h1>
          <p class="page-sub">${items.length} 条知识点 · ${esc(kbSourceLabel(kb))} · 更新于 ${esc(relTime(kb.updatedAt))}</p>
        </div>
        <div class="row">
          <a class="btn btn-soft btn-sm" href="#/kb/${kb.id}/focus">${icon('eye')} 专注模式</a>
          <a class="btn btn-ghost btn-sm" href="#/learn/import?kb=${kb.id}">${icon('plus')} 添加资料</a>
          <button class="btn btn-ghost btn-sm" data-kb-act="rename">${icon('edit')} 重命名</button>
          <button class="btn btn-primary" data-kb-act="gen">${icon('sparkle')} 让 AI 出题</button>
        </div>
      </div>

      ${items.length ? `<div class="kp-list">
        ${items.map((it, i) => `
          <div class="kp-item">
            <div class="kp-item-top">
              <span class="kp-num">${String(i + 1).padStart(2, '0')}</span>
              <h3>${esc(it.title)}</h3>
              <button class="icon-btn" data-kb-item-del="${it.id}" title="删除这条">${icon('trash')}</button>
            </div>
            <p class="kp-body">${esc(it.body)}</p>
            ${(it.tags && it.tags.length) || it.source || it.views ? `<div class="kp-meta">
              ${(it.tags || []).map((t) => `<span class="chip plain">${esc(t)}</span>`).join('')}
              ${it.source ? `<span class="small muted">${esc(it.source)}</span>` : ''}
              ${it.views ? `<span class="small muted kp-views">已看 ${it.views} 次</span>` : ''}
            </div>` : ''}
          </div>`).join('')}
      </div>` : emptyState({
        icon: 'layers', title: '这个知识库还是空的',
        desc: '添加一份资料，让 AI 拆成知识点后再出题。',
        action: { href: '#/learn/import?kb=' + kb.id, label: '添加资料' },
      })}

      <div class="kb-danger-zone">
        <button class="btn btn-quiet btn-sm" data-kb-act="del">${icon('trash')} 删除这个知识库</button>
      </div>
      </div>`;
  },
  mount() {
    const root = Q('#kb-page');
    if (!root) return;
    root.addEventListener('click', (e) => {
      const act = e.target.closest('[data-kb-act]');
      if (act) {
        const a = act.dataset.kbAct;
        if (a === 'gen') this.openGen();
        if (a === 'rename') this.rename();
        if (a === 'del') this.remove();
        return;
      }
      const del = e.target.closest('[data-kb-item-del]');
      if (del) this.removeItem(del.dataset.kbItemDel);
    });
  },
  rename() {
    const kb = this.s.kb;
    openModal({
      title: '重命名知识库',
      body: `<div class="field"><label>名称</label>
        <input class="input" id="kb-rename-input" maxlength="40" value="${esc(kb.title)}" /></div>`,
      actions: [
        { label: '取消', kind: 'ghost' },
        {
          label: '保存', kind: 'primary',
          onClick: () => {
            const v = (Q('#kb-rename-input').value || '').trim();
            if (!v) { toast('名称不能为空', 'bad'); return false; }
            Store.kbs.update(kb.id, { title: v });
            toast('已重命名', 'ok');
            App.render();
          },
        },
      ],
    });
    setTimeout(() => {
      const input = Q('#kb-rename-input');
      if (input) { input.focus(); input.select(); }
    }, 120);
  },
  async removeItem(itemId) {
    const kb = this.s.kb;
    const it = (kb.items || []).find((x) => x.id === itemId);
    if (!it) return;
    const ok = await confirmModal({
      title: '删除知识点', body: `确定删除「${it.title}」吗？`, okText: '删除', danger: true,
    });
    if (!ok) return;
    Store.kbs.removeItem(kb.id, itemId);
    toast('已删除', 'ok');
    App.render();
  },
  async remove() {
    const kb = this.s.kb;
    const ok = await confirmModal({
      title: '删除知识库',
      body: `「${kb.title}」以及它的 ${(kb.items || []).length} 条知识点会被删除，已生成的临时练习也会一起清理。此操作不可撤销。`,
      okText: '删除', danger: true,
    });
    if (!ok) return;
    Store.kbs.remove(kb.id);
    toast('已删除知识库', 'ok');
    location.hash = '#/learn';
  },

  openGen() {
    const kb = this.s.kb;
    if (!(kb.items || []).length) { toast('先导入资料，生成知识点', 'bad'); return; }
    if (!AI.isConfigured()) {
      toast('AI 未配置，先到设置里填写 API Key', 'bad', 4200);
      location.hash = '#/settings';
      return;
    }
    let generated = null;
    const m = openModal({
      title: '让 AI 出题',
      sub: `${kb.title} · ${(kb.items || []).length} 条知识点`,
      wide: true,
      body: `
        <div id="qgen-form">
          <div class="field">
            <label>题型 <span class="hint">可多选</span></label>
            <div class="qgen-types">
              <label><input type="checkbox" value="single" checked /> 单选题</label>
              <label><input type="checkbox" value="multiple" /> 多选题</label>
              <label><input type="checkbox" value="judge" /> 判断题</label>
              <label><input type="checkbox" value="blank" /> 填空题</label>
              <label><input type="checkbox" value="short" /> 简答题</label>
            </div>
          </div>
          <div class="row">
            <div class="field" style="width:130px">
              <label>题量</label>
              <input class="input" id="qgen-count" type="number" min="1" max="30" value="6" />
            </div>
            <div class="field grow">
              <label>额外要求 <span class="hint">可选</span></label>
              <input class="input" id="qgen-brief" maxlength="120" placeholder="例如：多考公式和适用条件，难度中等" />
            </div>
          </div>
          <div class="row mt-16">
            <button class="btn btn-primary" id="qgen-go">${icon('sparkle')} 生成题目</button>
            <span class="small muted">AI 只使用当前知识库的内容出题</span>
          </div>
        </div>
        <div id="qgen-result"></div>`,
      actions: [{ label: '关闭', kind: 'ghost' }],
    });

    const go = m.body.querySelector('#qgen-go');
    if (go) go.onclick = async () => {
      const types = Array.from(m.body.querySelectorAll('.qgen-types input:checked')).map((x) => x.value);
      if (!types.length) { toast('至少选一种题型', 'bad'); return; }
      const count = clamp(Number(m.body.querySelector('#qgen-count').value) || 6, 1, 30);
      const brief = (m.body.querySelector('#qgen-brief').value || '').trim();
      const result = m.body.querySelector('#qgen-result');
      go.disabled = true;
      result.innerHTML = `<div class="qgen-loading">
        <div class="spinner" style="width:26px;height:26px;border-width:3px"></div>
        <p>AI 正在根据 ${(kb.items || []).length} 条知识点出题…</p>
      </div>`;
      try {
        const res = await AI.generateQuestions({ kb, types, count, brief });
        generated = res.questions;
        result.innerHTML = this.genResultHTML(generated, res.truncated);
        const start = result.querySelector('#qgen-start');
        if (start) start.onclick = () => {
          const session = Store.kbSessions.create(kb, generated);
          m.close();
          toast('题目已生成，进入答题', 'ok');
          location.hash = '#/practice/' + session.id;
        };
        const again = result.querySelector('#qgen-again');
        if (again) again.onclick = () => {
          result.innerHTML = '';
          go.disabled = false;
        };
      } catch (e) {
        result.innerHTML = `<div class="warn-box">${icon('alert')}<div>${esc((e && (e.friendly || e.message)) || '生成失败')}</div></div>`;
        go.disabled = false;
      }
    };
  },
  genResultHTML(list, truncated) {
    return `
      <div class="qgen-summary">
        <strong>生成了 ${list.length} 道题</strong>
        <span class="small muted">${truncated ? '知识点较多，使用了前 120 条' : '来自当前知识库'}</span>
      </div>
      <div class="qgen-list">
        ${list.map((q, i) => `
          <div class="qgen-item">
            <div class="qgen-top">
              <span class="qgen-num">${i + 1}</span>
              <span class="chip ${typeChip(q.type)}">${typeLabel(q.type)}</span>
              <span class="qgen-stem">${esc(q.stem)}</span>
            </div>
            ${(q.options || []).length ? `<div class="qgen-options">
              ${q.options.map((o) => `<span>${esc(o.key)}. ${esc(o.text)}</span>`).join('')}
            </div>` : ''}
            <div class="qgen-answer">答案：${esc(displayAnswer(q.type, q.answer))}</div>
            ${q.explanation ? `<div class="qgen-exp">${esc(q.explanation)}</div>` : ''}
          </div>`).join('')}
      </div>
      <div class="row mt-16">
        <button class="btn btn-ghost btn-sm" id="qgen-again">${icon('refresh')} 重新生成</button>
        <button class="btn btn-primary" id="qgen-start">${icon('pen')} 开始答题</button>
      </div>`;
  },
};

/* ============================================================
   知识库 · 专注模式：一次一条，页面内和 AI 一起读
   ============================================================ */
Views.kbFocus = {
  s: null,
  onKey: null,
  render(ctx) {
    const kb = Store.kbs.get(ctx.params.id);
    if (!kb || !(kb.items || []).length) {
      return `<div class="card">${emptyState({
        icon: 'layers', title: '这个知识库还没有知识点',
        desc: '先添加资料并整理出条目，再进入专注模式。',
        action: { href: kb ? '#/kb/' + kb.id : '#/learn', label: '返回知识库' },
      })}</div>`;
    }
    const saved = Store.progress.get('focus', kb.id);
    let start = 0;
    if (saved && !saved.finished) start = clamp(Number(saved.index) || 0, 0, kb.items.length - 1);
    this.pkey = kb.id;
    this.resumed = start > 0;
    this.s = {
      kb, index: 0, finished: false, prevDir: 1,
      chats: {}, busy: false, pendingMode: null, hintHidden: {}, doneCelebrated: false,
    };
    this.enter(start);
    return `
      <div id="focus-page" class="focus-page">
        <div class="focus-top">
          <a class="icon-btn" href="#/kb/${kb.id}" title="返回知识库">${icon('left')}</a>
          <div class="focus-top-mid">
            <div class="focus-kb">${esc(kb.title)}</div>
            <div class="focus-progress"><div class="bar"><i id="focus-bar" style="width:0%"></i></div></div>
          </div>
          <div class="focus-count" id="focus-count"></div>
        </div>
        ${this.resumed ? `<div class="resume-note" id="focus-resume">
          <span class="grow">已接着上次的位置继续。</span>
          <button class="btn btn-quiet btn-sm" data-focus-restart="1">从头开始</button>
        </div>` : ''}
        <div id="focus-stage"></div>
      </div>`;
  },
  mount() {
    const root = Q('#focus-page');
    if (!root) return;
    root.addEventListener('click', (e) => this.onClick(e));
    root.addEventListener('submit', (e) => this.onSubmit(e));
    this.onKey = (e) => {
      const tag = (e.target && e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || (e.target && e.target.isContentEditable)) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); this.step(-1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); this.step(1); }
    };
    document.addEventListener('keydown', this.onKey);
    this.paint();
  },
  destroy() {
    if (this.onKey) document.removeEventListener('keydown', this.onKey);
    this.onKey = null;
    this.s = null;
  },

  enter(idx) {
    const s = this.s;
    const item = s.kb.items[idx];
    if (!item) return;
    s.index = idx;
    Store.kbs.touchView(s.kb.id, item.id);
    if (this.pkey) {
      if (idx > 0) Store.progress.set('focus', this.pkey, { index: idx, finished: false });
      else Store.progress.clear('focus', this.pkey);
    }
    if (!s.chats[item.id]) s.chats[item.id] = [];
  },

  onClick(e) {
    const nav = e.target.closest('[data-focus-nav]');
    if (nav) { this.step(nav.dataset.focusNav === 'prev' ? -1 : 1); return; }
    if (e.target.closest('[data-focus-restart]')) {
      const s = this.s;
      s.finished = false; s.doneCelebrated = false; s.prevDir = 1;
      this.resumed = false;
      if (this.pkey) Store.progress.clear('focus', this.pkey);
      const note = Q('#focus-resume');
      if (note) note.hidden = true;
      this.enter(0);
      this.paint();
      return;
    }
    const aiBtn = e.target.closest('[data-focus-ai]');
    if (aiBtn) { this.askAI(aiBtn.dataset.focusAi); return; }
    if (e.target.closest('[data-focus-quiz]')) { this.quiz(); return; }
    if (e.target.closest('[data-focus-teach]')) { this.teachback(); return; }
    const hide = e.target.closest('[data-focus-hide]');
    if (hide) {
      const item = this.s.kb.items[this.s.index];
      this.s.hintHidden[item.id] = true;
      this.paint();
    }
  },
  onSubmit(e) {
    if (!e.target.closest('#focus-ask-form')) return;
    e.preventDefault();
    const input = Q('#focus-ask-input');
    const v = (input.value || '').trim();
    if (!v || this.s.busy) return;
    input.value = '';
    const mode = this.s.pendingMode === 'teachback' ? 'teachback' : 'chat';
    this.s.pendingMode = null;
    this.askAI(mode, v);
  },

  step(delta) {
    const s = this.s;
    const total = s.kb.items.length;
    if (s.finished) {
      if (delta < 0) {
        s.finished = false; s.prevDir = -1;
        this.enter(total - 1);
        this.paint();
      }
      return;
    }
    if (delta > 0 && s.index >= total - 1) {
      s.finished = true;
      this.resumed = false;
      if (this.pkey) Store.progress.clear('focus', this.pkey);
      const note = Q('#focus-resume');
      if (note) note.hidden = true;
      this.paint();
      return;
    }
    const next = clamp(s.index + delta, 0, total - 1);
    if (next === s.index) return;
    s.prevDir = delta >= 0 ? 1 : -1;
    this.enter(next);
    this.paint();
  },

  paint() {
    const s = this.s;
    if (!s) return;
    const total = s.kb.items.length;
    const count = Q('#focus-count');
    const bar = Q('#focus-bar');
    if (count) count.innerHTML = s.finished ? `<b>${total}</b> / ${total}` : `<b>${s.index + 1}</b> / ${total}`;
    if (bar) bar.style.width = (s.finished ? 100 : Math.round(((s.index + 1) / total) * 100)) + '%';
    const stage = Q('#focus-stage');
    if (!stage) return;
    if (s.finished) {
      stage.innerHTML = this.doneHTML();
      if (!s.doneCelebrated) { s.doneCelebrated = true; confetti(16); }
      return;
    }
    const item = s.kb.items[s.index];
    stage.innerHTML = this.pointHTML(item);
    this.renderChat(item);
  },

  pointHTML(item) {
    const s = this.s;
    const dirCls = s.prevDir < 0 ? 'anim-prev' : 'anim-next';
    const views = Number(item.views) || 0;
    const repeat = views >= 2 && !s.hintHidden[item.id];
    return `
      <div class="focus-card ${dirCls}">
        <div class="focus-eyebrow">
          <span>POINT ${String(s.index + 1).padStart(2, '0')}</span>
          ${views ? `<span class="focus-views">已看 ${views} 次${item.lastViewedAt ? ' · ' + esc(relTime(item.lastViewedAt)) : ''}</span>` : ''}
        </div>
        <h1 class="focus-title">${esc(item.title)}</h1>
        <div class="focus-body">${esc(item.body)}</div>
        ${(item.tags && item.tags.length) || item.source ? `<div class="focus-meta">
          ${(item.tags || []).map((t) => `<span class="chip plain">${esc(t)}</span>`).join('')}
          ${item.source ? `<span class="small muted">${esc(item.source)}</span>` : ''}
        </div>` : ''}
      </div>

      ${repeat ? `<div class="focus-prompt">
        <span>这条已经看过 ${views} 次，换个方式巩固一下？</span>
        <button class="focus-link" data-focus-quiz="1">AI 考考我</button>
        <button class="focus-link" data-focus-teach="1">用自己的话讲一遍</button>
        <button class="focus-dismiss" data-focus-hide="1" title="暂时收起">${icon('x')}</button>
      </div>` : ''}

      <div class="focus-ai">
        <div class="focus-ai-head">
          <div class="focus-ai-title">和 AI 一起读 <span>回答直接展开在下面</span></div>
          <div class="focus-ai-actions">
            <button class="focus-link" data-focus-ai="explain">解析这条</button>
            <button class="focus-link" data-focus-ai="example">举个例子</button>
          </div>
        </div>
        <div class="focus-chat" id="focus-chat"></div>
        <form class="focus-ask" id="focus-ask-form">
          <input class="input" id="focus-ask-input" maxlength="300"
            placeholder="${s.pendingMode === 'teachback' ? '用自己的话讲讲这条知识点…' : '继续追问这条知识点…'}" />
          <button class="btn btn-soft btn-sm" type="submit">发送</button>
        </form>
      </div>

      <div class="focus-nav">
        <button class="btn btn-ghost btn-sm" data-focus-nav="prev" ${s.index === 0 ? 'disabled' : ''}>${icon('left')} 上一条</button>
        <span class="focus-nav-hint">← → 切换</span>
        <button class="btn btn-primary btn-sm" data-focus-nav="next">${s.index >= s.kb.items.length - 1 ? '读完这轮' : '下一条'} ${icon('right')}</button>
      </div>`;
  },

  doneHTML() {
    const s = this.s;
    const total = s.kb.items.length;
    const repeated = s.kb.items.filter((it) => (Number(it.views) || 0) >= 2).length;
    return `
      <div class="focus-done">
        <div class="done-ring">${icon('check')}</div>
        <h2>这一轮读完了</h2>
        <p class="focus-done-sub">${total} 条知识点${repeated ? ` · 其中 ${repeated} 条已经看过多次` : ''}</p>
        <div class="row" style="justify-content:center">
          <a class="btn btn-ghost" href="#/kb/${s.kb.id}">回到知识库</a>
          <button class="btn btn-primary" data-focus-restart="1">从头再看</button>
        </div>
        <a class="focus-link mt-16" href="#/kb/${s.kb.id}">去让 AI 用整个知识库出题</a>
      </div>`;
  },

  msgHTML(m) {
    const isAI = m.role === 'assistant';
    return `<div class="fc-msg ${isAI ? 'ai' : 'user'}">
      <div class="fc-bubble">${isAI ? renderMarkdown(m.content) : esc(m.content)}</div>
    </div>`;
  },

  renderChat(item) {
    const log = Q('#focus-chat');
    if (!log) return;
    const msgs = this.s.chats[item.id] || [];
    log.innerHTML = msgs.length
      ? msgs.map((m) => this.msgHTML(m)).join('')
      : `<div class="focus-chat-empty">可以让 AI 讲透这条，或举一个具体例子；也可以直接在下面追问。</div>`;
    log.scrollTop = log.scrollHeight;
  },

  appendMsg(role, content) {
    const log = Q('#focus-chat');
    if (!log) return null;
    const empty = log.querySelector('.focus-chat-empty');
    if (empty) empty.remove();
    const wrap = document.createElement('div');
    wrap.className = 'fc-msg ' + (role === 'assistant' ? 'ai' : 'user');
    wrap.innerHTML = `<div class="fc-bubble">${role === 'assistant' ? renderMarkdown(content || '') : esc(content || '')}</div>`;
    log.appendChild(wrap);
    log.scrollTop = log.scrollHeight;
    return wrap.querySelector('.fc-bubble');
  },

  setBusy(flag) {
    this.s.busy = flag;
    const stage = Q('#focus-stage');
    if (!stage) return;
    stage.querySelectorAll('[data-focus-ai], [data-focus-quiz], [data-focus-teach], #focus-ask-form button')
      .forEach((b) => { b.disabled = flag; });
  },

  async askAI(mode, question) {
    const s = this.s;
    const item = s.kb.items[s.index];
    if (!item) return;
    if (!AI.isConfigured()) { toast('先到设置里配置 AI', 'bad', 3600); return; }
    if (s.busy) { toast('AI 正在回答，稍等一下', 'bad', 2200); return; }
    const modeText = mode === 'explain' ? '请把这条知识点讲透。'
      : mode === 'example' ? '请举一个具体、贴合这条知识点的例子。'
        : question;
    s.pendingMode = null;
    const input = Q('#focus-ask-input');
    if (input) input.placeholder = '继续追问这条知识点…';
    this.appendMsg('user', question || modeText);
    const bubble = this.appendMsg('assistant', '');
    if (bubble) bubble.innerHTML = '<span class="fc-typing"><i></i><i></i><i></i></span>';
    this.setBusy(true);
    const idx = s.index;
    const kbId = s.kb.id;
    try {
      let acc = '';
      const res = await AI.knowledgeChat({
        kbTitle: s.kb.title,
        item,
        mode,
        question: mode === 'chat' || mode === 'teachback' ? question : '',
        history: (s.chats[item.id] || []).slice(-8),
        onDelta: (d) => {
          acc += d || '';
          if (!document.body.contains(bubble)) return;
          bubble.innerHTML = renderMarkdown(acc);
          const log = bubble.closest('.focus-chat');
          if (log) log.scrollTop = log.scrollHeight;
        },
      });
      const text = (acc && acc.trim()) ? acc : res.text;
      if (document.body.contains(bubble)) bubble.innerHTML = renderMarkdown(text);
      if (this.s && this.s.kb.id === kbId && this.s.index === idx) {
        s.chats[item.id].push({ role: 'user', content: question || modeText });
        s.chats[item.id].push({ role: 'assistant', content: text });
      }
    } catch (e) {
      if (document.body.contains(bubble)) {
        bubble.innerHTML = `<span class="fc-error">${esc((e && (e.friendly || e.message)) || '回答失败')}</span>`;
      }
    } finally {
      this.setBusy(false);
    }
  },

  teachback() {
    const s = this.s;
    s.pendingMode = 'teachback';
    const input = Q('#focus-ask-input');
    if (input) {
      input.placeholder = '用自己的话讲讲这条知识点，AI 会指出对在哪、还缺什么…';
      input.focus();
    }
    toast('用自己的话讲一遍，AI 会给出针对性反馈', 'ok', 2600);
  },

  async quiz() {
    const s = this.s;
    const kb = s.kb;
    const item = kb.items[s.index];
    if (!item) return;
    if (!AI.isConfigured()) { toast('先到设置里配置 AI', 'bad', 3600); return; }
    if (s.busy) { toast('AI 正在回答，稍等一下', 'bad', 2200); return; }
    const promptEl = Q('.focus-prompt');
    if (promptEl) {
      promptEl.innerHTML = `<span class="focus-prompt-loading"><span class="spinner" style="width:14px;height:14px;border-width:2px"></span> 正根据这条知识点出题…</span>`;
    }
    this.setBusy(true);
    try {
      const res = await AI.generateQuestions({
        kb: { title: kb.title, items: [item] },
        types: ['single', 'short'],
        count: 2,
        brief: '只针对这一条知识点，题目要具体，能检验是否真正理解，不要考记忆性细节',
      });
      const session = Store.kbSessions.create(kb, res.questions, `${kb.title} · 知识点小测`);
      toast('题目出好了，去答一答', 'ok');
      location.hash = '#/practice/' + session.id;
    } catch (e) {
      toast((e && (e.friendly || e.message)) || '出题失败', 'bad', 4200);
      if (promptEl) promptEl.outerHTML = this.promptHTML(item);
      this.setBusy(false);
    }
  },

  promptHTML(item) {
    const views = Number(item.views) || 0;
    return `<div class="focus-prompt">
      <span>这条已经看过 ${views} 次，换个方式巩固一下？</span>
      <button class="focus-link" data-focus-quiz="1">AI 考考我</button>
      <button class="focus-link" data-focus-teach="1">用自己的话讲一遍</button>
      <button class="focus-dismiss" data-focus-hide="1" title="暂时收起">${icon('x')}</button>
    </div>`;
  },
};
