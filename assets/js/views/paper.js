/* ============================================================
   组卷系统：试卷列表 / 组卷 / 预览与导出
   ============================================================ */
(function () {
  const TYPES = ['single', 'multiple', 'judge', 'blank', 'short'];
  const TYPE_NO = ['一', '二', '三', '四', '五'];
  const CN = { single: '单选题', multiple: '多选题', judge: '判断题', blank: '填空题', short: '简答题' };

  let D = null; // 组卷草稿

  const blankDraft = () => ({
    fromId: '', id: null, title: '', subtitle: '', brief: '', count: 20,
    mode: 'manual', bankIds: [], sel: new Set(), search: '', type: 'all',
    note: '', source: 'manual',
    layout: { showAnswer: true, showExplanation: true, showScore: true, columns: 1 },
  });

  const safeName = (s) => String(s || '试卷').replace(/[\\/:*?"<>|]/g, '_').slice(0, 40);

  const paperQuestions = (paper) => (paper.items || [])
    .map((it) => Store.questionById(it.qid))
    .filter(Boolean);

  function grouped(questions) {
    const map = {};
    questions.forEach((q) => { (map[q.type] = map[q.type] || []).push(q); });
    return TYPES.filter((t) => map[t] && map[t].length).map((t) => ({ type: t, list: map[t] }));
  }

  function optionsHTML(q, showAnswer) {
    if (!q.options || !q.options.length) return '';
    return `<div class="p-options">${q.options.map((o) => {
      const isAns = q.type === 'multiple'
        ? normalizeAnswer('multiple', q.answer).includes(o.key)
        : o.key === normalizeAnswer(q.type === 'judge' ? 'judge' : 'single', q.answer);
      return `<div class="p-opt${showAnswer && isAns ? ' correct' : ''}"><span class="k">${o.key}</span><span>${esc(o.text)}</span></div>`;
    }).join('')}</div>`;
  }

  function sheetHTML(paper) {
    const qs = paperQuestions(paper);
    const L = paper.layout || {};
    let no = 0;
    const body = grouped(qs).map((sec, si) => {
      const items = sec.list.map((q) => {
        no += 1;
        return `<div class="p-q">
          <div class="p-stem"><span class="p-no">${no}.</span><span>${esc(q.stem)}</span><span class="p-type">（${CN[q.type] || '题目'}）</span></div>
          ${optionsHTML(q, L.showAnswer)}
          ${L.showAnswer ? `<div class="p-ans"><b>答案</b>${esc(displayAnswer(q) || '未填写')}</div>` : ''}
          ${L.showAnswer && L.showExplanation && q.explanation ? `<div class="p-expl"><b>解析</b>${esc(q.explanation)}</div>` : ''}
        </div>`;
      }).join('');
      return `<section class="p-section"><h3 class="p-sec">${TYPE_NO[si] || '·'}、${CN[sec.type]}（共 ${sec.list.length} 题）</h3>${items}</section>`;
    }).join('');

    return `<div class="paper-sheet ${L.columns === 2 ? 'two-col' : ''}">
      <header class="p-head">
        <h1>${esc(paper.title || '未命名试卷')}</h1>
        ${paper.subtitle ? `<p class="p-sub">${esc(paper.subtitle)}</p>` : ''}
        <div class="p-meta">
          <span>共 ${qs.length} 题</span>
          <span>姓名 ____________</span>
          ${L.showScore ? '<span>得分 ____________</span>' : ''}
        </div>
      </header>
      <div class="p-body">${body || '<p class="p-empty">这份试卷还没有题目。</p>'}</div>
    </div>`;
  }

  /* ---------- 列表 ---------- */
  Views.papers = {
    render() {
      const list = Store.papers.list();
      const card = (p) => {
        const qs = paperQuestions(p);
        const banks = (p.bankIds || []).map((id) => (Store.banks.get(id) || {}).title).filter(Boolean);
        return `<div class="paper-card">
          <a class="paper-card-main" href="#/papers/${p.id}">
            <div class="paper-badge">${icon('list')}</div>
            <div class="paper-card-title">${esc(p.title)}</div>
            <div class="paper-card-meta">${qs.length} 题 · ${banks.length} 个题库</div>
            <div class="paper-card-sub">${esc(banks.slice(0, 2).join(' / ') || '手动选题')}${banks.length > 2 ? ' 等' : ''}</div>
          </a>
          <div class="paper-card-foot">
            <span class="paper-date">${formatDate(p.updatedAt || p.createdAt).slice(5)}</span>
            <div class="row gap-4">
              <button class="icon-btn" data-copy="${p.id}" title="复制">${icon('plus')}</button>
              <button class="icon-btn" data-del="${p.id}" title="删除">${icon('trash')}</button>
            </div>
          </div>
        </div>`;
      };

      return `<div class="page-head">
        <div>
          <h1 class="page-title">组卷</h1>
          <p class="page-sub">从单个或多个题库里选题，排好版就能打印或导出。</p>
        </div>
        <div class="page-head-actions">
          <button class="btn btn-primary" id="paper-new">${icon('plus')} 新建试卷</button>
        </div>
      </div>
      ${list.length ? `<div class="paper-grid">${list.map(card).join('')}</div>`
        : `<div class="card">${emptyState({
          icon: 'list', title: '还没有试卷',
          desc: '可以自己勾选题目，也可以把要求告诉 AI，让它从你选的题库里组一套卷。',
          action: { href: '#/papers/new', label: '开始组卷' },
        })}</div>`}`;
    },

    mount() {
      const neu = Q('#paper-new');
      if (neu) neu.onclick = () => { D = null; location.hash = '#/papers/new'; };
      const empty = Q('.empty a[href="#/papers/new"]');
      if (empty) empty.onclick = () => { D = null; };
      QA('[data-copy]').forEach((b) => {
        b.onclick = () => {
          const p = Store.papers.duplicate(b.dataset.copy);
          if (p) { toast('已复制试卷', 'ok'); App.render(); }
        };
      });
      QA('[data-del]').forEach((b) => {
        b.onclick = async () => {
          const ok = await confirmModal({ title: '删除这份试卷？', body: '只删除试卷本身，题库和作答记录不受影响。', okText: '删除', danger: true });
          if (!ok) return;
          Store.papers.remove(b.dataset.del);
          toast('试卷已删除', 'ok');
          App.render();
        };
      });
    },
  };

  /* ---------- 新建 / 编辑 ---------- */
  Views.paperNew = {
    render(ctx) {
      const from = ctx.query.from || '';
      if (!D || (D.fromId || '') !== from) {
        const p = from ? Store.papers.get(from) : null;
        D = blankDraft();
        D.fromId = from;
        if (p) {
          D.id = p.id; D.title = p.title; D.subtitle = p.subtitle || '';
          D.bankIds = (p.bankIds || []).slice();
          D.note = p.note || '';
          D.source = p.source || 'manual';
          D.sel = new Set((p.items || []).map((it) => it.qid));
          D.layout = Object.assign(D.layout, p.layout || {});
          D.mode = 'manual';
        } else {
          D.bankIds = Store.banks.list().map((b) => b.id);
        }
      }

      const banks = Store.banks.list();
      const bankList = banks.length ? banks.map((b) => `<label class="bank-pick">
          <input type="checkbox" data-bank="${b.id}" ${D.bankIds.includes(b.id) ? 'checked' : ''}/>
          <span class="bp-name">${esc(b.title)}</span>
          <span class="bp-count">${b.questions.length} 题</span>
        </label>`).join('')
        : `<p class="small muted">还没有题库，先去导入一个。</p>`;

      const seg = (items, cur, key) => `<div class="segmented" data-seg="${key}">${items.map((it) =>
        `<button type="button" data-val="${it[0]}" class="${String(cur) === String(it[0]) ? 'active' : ''}">${it[1]}</button>`).join('')}</div>`;

      return `<div class="page-head">
        <div>
          <h1 class="page-title">${D.id ? '编辑试卷' : '新建试卷'}</h1>
          <p class="page-sub">先定范围和方式，再挑题；排版随时可以改。</p>
        </div>
        <div class="page-head-actions">
          <a class="btn btn-quiet" href="#/papers">返回列表</a>
          <button class="btn btn-primary" id="paper-save">保存试卷</button>
        </div>
      </div>

      <div class="card set-group">
        <h3>${icon('pen')} 卷头信息</h3>
        <div class="form-grid">
          <div class="field">
            <label>试卷名称</label>
            <input class="input" id="paper-title" placeholder="例如：计算机网络 · 期中模拟卷" value="${esc(D.title)}"/>
          </div>
          <div class="field">
            <label>副标题 <span class="hint">可留空</span></label>
            <input class="input" id="paper-subtitle" placeholder="例如：第 1—3 章 · 闭卷 90 分钟" value="${esc(D.subtitle)}"/>
          </div>
        </div>
      </div>

      <div class="card set-group">
        <h3>${icon('book')} 选择题库</h3>
        <p class="sub">可以多选；跨题库组卷时，题目会按题库分布自动穿插。</p>
        <div class="bank-pick-grid">${bankList}</div>
      </div>

      <div class="card set-group">
        <h3>${icon('sparkle')} 组卷方式</h3>
        <p class="sub">手动挑题更可控；AI 组卷适合先出一版草稿，再自己微调。</p>
        ${seg([['manual', '手动选题'], ['ai', 'AI 组卷']], D.mode, 'mode')}
        <div class="mt-24" id="paper-panel">${D.mode === 'ai' ? this.aiPanel() : this.manualPanel()}</div>
      </div>

      <div class="card set-group">
        <h3>${icon('list')} 排版</h3>
        <p class="sub">只影响预览与导出，不改变题库内容。</p>
        <div class="form-grid">
          <div class="field">
            <label>分栏</label>
            ${seg([['1', '单栏'], ['2', '双栏']], D.layout.columns, 'columns')}
          </div>
          <div class="field">
            <label>卷面内容</label>
            <div class="stack-8">
              <label class="switch"><input type="checkbox" id="lay-answer" ${D.layout.showAnswer ? 'checked' : ''}/><span class="track"></span>附答案</label>
              <label class="switch"><input type="checkbox" id="lay-expl" ${D.layout.showExplanation ? 'checked' : ''}/><span class="track"></span>附解析</label>
              <label class="switch"><input type="checkbox" id="lay-score" ${D.layout.showScore ? 'checked' : ''}/><span class="track"></span>卷头留得分栏</label>
            </div>
          </div>
        </div>
      </div>

      <div class="paper-save-bar">
        <span class="small muted" id="paper-count">已选 ${D.sel.size} 题</span>
        <span class="grow"></span>
        <button class="btn btn-ghost" id="paper-clear">清空已选</button>
        <button class="btn btn-primary" id="paper-save2">保存试卷</button>
      </div>`;
    },

    manualPanel() {
      const types = ['all'].concat(TYPES);
      const chips = types.map((t) => `<button type="button" class="chip mode ${D.type === t ? 'active' : ''}" data-type="${t}">${t === 'all' ? '全部' : CN[t]}</button>`).join('');
      return `<div class="pick-toolbar">
          <div class="field" style="flex:1;min-width:180px">
            <input class="input" id="paper-search" placeholder="搜题干或分类…" value="${esc(D.search)}"/>
          </div>
          <div class="filter-bar">${chips}</div>
        </div>
        <div id="paper-q-list" class="pick-list"></div>`;
    },

    aiPanel() {
      return `<div class="ai-compose">
        <div class="field">
          <label>告诉 AI 你的组卷要求</label>
          <textarea class="textarea" id="ai-brief" rows="4" placeholder="例如：覆盖第 1—3 章，以单选为主，穿插 2 道简答，难度中等偏基础，重点考协议分层。">${esc(D.brief)}</textarea>
        </div>
        <div class="row mt-16 wrap">
          <div class="field" style="width:150px">
            <label>题目数量</label>
            <input class="input" id="ai-count" type="number" min="1" max="100" value="${D.count}"/>
          </div>
          <span class="grow"></span>
          <button class="btn btn-accent" id="ai-compose">${icon('sparkle')} 让 AI 选题</button>
        </div>
        ${D.note ? `<div class="ai-note">${icon('brain')} <span>${esc(D.note)}</span></div>` : ''}
        <p class="hint mt-16">AI 只会从你勾选的题库里挑题；选完后会切到手动列表，方便你增减。</p>
      </div>`;
    },

    listHTML() {
      const banks = Store.banks.list().filter((b) => D.bankIds.includes(b.id));
      const kw = (D.search || '').trim().toLowerCase();
      let total = 0;
      const groups = banks.map((b) => {
        const qs = b.questions.filter((q) => {
          if (D.type !== 'all' && q.type !== D.type) return false;
          if (!kw) return true;
          return (q.stem + ' ' + (q.category || '')).toLowerCase().includes(kw);
        });
        total += qs.length;
        if (!qs.length) return '';
        return `<div class="pick-group">
          <div class="pick-group-head"><span>${esc(b.title)}</span><small>${qs.length} 题</small><span class="grow"></span>
            <button class="btn btn-quiet btn-sm" data-bank-all="${b.id}">全选本库</button>
          </div>
          ${qs.map((q) => `<label class="pick-row ${D.sel.has(q.id) ? 'picked' : ''}" data-row="${q.id}">
            <input type="checkbox" data-q="${q.id}" ${D.sel.has(q.id) ? 'checked' : ''}/>
            <span class="chip ${typeChip(q.type)}">${typeLabel(q.type)}</span>
            <span class="txt">${esc(q.stem)}</span>
            ${q.category ? `<span class="cat">${esc(q.category)}</span>` : ''}
          </label>`).join('')}
        </div>`;
      }).join('');
      return groups || `<div class="empty-mini">这个范围里没有题目，换个题库或关键词试试。</div>`;
    },

    paintList() {
      const box = Q('#paper-q-list');
      if (box) box.innerHTML = this.listHTML();
      const cnt = Q('#paper-count');
      if (cnt) cnt.textContent = `已选 ${D.sel.size} 题`;
    },

    mount(root) {
      const title = Q('#paper-title');
      if (title) title.oninput = () => { D.title = title.value; };
      const sub = Q('#paper-subtitle');
      if (sub) sub.oninput = () => { D.subtitle = sub.value; };

      root.querySelectorAll('[data-bank]').forEach((cb) => {
        cb.onchange = () => {
          const id = cb.dataset.bank;
          if (cb.checked) { if (!D.bankIds.includes(id)) D.bankIds.push(id); }
          else { D.bankIds = D.bankIds.filter((x) => x !== id); }
          App.render();
        };
      });

      root.querySelectorAll('[data-seg]').forEach((box) => {
        box.addEventListener('click', (e) => {
          const b = e.target.closest('[data-val]');
          if (!b) return;
          const key = box.dataset.seg;
          if (key === 'mode') { D.mode = b.dataset.val; App.render(); }
          if (key === 'columns') { D.layout.columns = +b.dataset.val; App.render(); }
        });
      });

      const lay = (sel, key) => { const el = Q(sel); if (el) el.onchange = () => { D.layout[key] = el.checked; }; };
      lay('#lay-answer', 'showAnswer');
      lay('#lay-expl', 'showExplanation');
      lay('#lay-score', 'showScore');

      if (D.mode === 'manual') {
        this.paintList();
        const search = Q('#paper-search');
        if (search) search.oninput = () => { D.search = search.value; this.paintList(); };
        const typeBar = Q('.filter-bar');
        if (typeBar) typeBar.addEventListener('click', (e) => {
          const c = e.target.closest('[data-type]');
          if (!c) return;
          D.type = c.dataset.type;
          typeBar.querySelectorAll('[data-type]').forEach((x) => x.classList.toggle('active', x === c));
          this.paintList();
        });
        const list = Q('#paper-q-list');
        list.addEventListener('change', (e) => {
          const cb = e.target.closest('[data-q]');
          if (!cb) return;
          const qid = cb.dataset.q;
          if (cb.checked) D.sel.add(qid); else D.sel.delete(qid);
          const row = cb.closest('[data-row]');
          if (row) row.classList.toggle('picked', cb.checked);
          const cnt = Q('#paper-count');
          if (cnt) cnt.textContent = `已选 ${D.sel.size} 题`;
        });
        list.addEventListener('click', (e) => {
          const all = e.target.closest('[data-bank-all]');
          if (!all) return;
          e.preventDefault();
          const b = Store.banks.get(all.dataset.bankAll);
          if (!b) return;
          const ids = b.questions.filter((q) => (D.type === 'all' || q.type === D.type)).map((q) => q.id);
          const allOn = ids.every((id) => D.sel.has(id));
          ids.forEach((id) => { if (allOn) D.sel.delete(id); else D.sel.add(id); });
          this.paintList();
        });
      } else {
        const brief = Q('#ai-brief');
        if (brief) brief.oninput = () => { D.brief = brief.value; };
        const count = Q('#ai-count');
        if (count) count.oninput = () => { D.count = clamp(+count.value || 20, 1, 100); };
        const btn = Q('#ai-compose');
        if (btn) btn.onclick = () => this.composeWithAI(btn);
      }

      const clear = Q('#paper-clear');
      if (clear) clear.onclick = () => { D.sel.clear(); App.render(); };

      const save = () => this.save();
      const s1 = Q('#paper-save');
      const s2 = Q('#paper-save2');
      if (s1) s1.onclick = save;
      if (s2) s2.onclick = save;
    },

    async composeWithAI(btn) {
      if (!AI.isConfigured()) { toast('先在设置里填好 API Key', 'warn'); return; }
      const banks = Store.banks.list().filter((b) => D.bankIds.includes(b.id));
      if (!banks.length) { toast('先勾选至少一个题库', 'warn'); return; }
      const catalog = [];
      banks.forEach((b) => b.questions.forEach((q) => catalog.push({
        qid: q.id, bankId: b.id, type: q.type, typeLabel: typeLabel(q.type),
        category: q.category || '', stem: q.stem,
      })));
      if (!catalog.length) { toast('这些题库里还没有题目', 'warn'); return; }
      const old = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = `${icon('refresh')} 正在选题…`;
      try {
        const r = await AI.composePaper({ catalog, brief: D.brief, count: D.count });
        D.sel = new Set(r.ids);
        D.note = r.note || '';
        D.mode = 'manual';
        toast(`AI 选了 ${r.ids.length} 题${r.truncated ? '（候选题较多，只分析了前 220 题）' : ''}`, 'ok', 3200);
        App.render();
      } catch (e) {
        toast((e && e.friendly) || (e && e.message) || 'AI 组卷失败', 'bad', 3600);
        btn.disabled = false;
        btn.innerHTML = old;
      }
    },

    save() {
      if (!D.sel.size) { toast('至少选一道题', 'warn'); return; }
      const items = [...D.sel].map((qid) => {
        const b = Store.bankOfQuestion(qid);
        return { qid, bankId: b ? b.id : '' };
      });
      const paper = Store.papers.save({
        id: D.id, title: D.title, subtitle: D.subtitle, bankIds: D.bankIds,
        items, layout: D.layout, source: D.source, note: D.note,
      });
      D = null;
      toast('试卷已保存', 'ok');
      location.hash = '#/papers/' + paper.id;
    },
  };

  /* ---------- 预览与导出 ---------- */
  Views.paperDetail = {
    render(ctx) {
      const paper = Store.papers.get(ctx.params.id);
      if (!paper) return `<div class="card">${emptyState({ icon: 'alert', title: '试卷不存在', desc: '它可能已经被删除。', action: { href: '#/papers', label: '返回组卷' } })}</div>`;
      const qs = paperQuestions(paper);
      const L = paper.layout;
      const seg = (items, cur, key) => `<div class="segmented" data-seg="${key}">${items.map((it) =>
        `<button type="button" data-val="${it[0]}" class="${String(cur) === String(it[0]) ? 'active' : ''}">${it[1]}</button>`).join('')}</div>`;

      return `<div class="page-head">
        <div>
          <h1 class="page-title">${esc(paper.title)}</h1>
          <p class="page-sub">${qs.length} 题 · ${(paper.bankIds || []).length} 个题库 · 更新于 ${formatDate(paper.updatedAt)}</p>
        </div>
        <div class="page-head-actions">
          <a class="btn btn-quiet" href="#/papers">返回列表</a>
          <a class="btn btn-ghost" href="#/papers/new?from=${paper.id}">继续编辑</a>
          <button class="btn btn-primary" id="paper-print">${icon('upload')} 打印 / 存为 PDF</button>
        </div>
      </div>

      <div class="card paper-toolbar">
        <div class="row wrap gap-12">
          <span class="small muted">分栏</span>
          ${seg([['1', '单栏'], ['2', '双栏']], L.columns, 'columns')}
          <span class="grow"></span>
          <label class="switch"><input type="checkbox" id="d-answer" ${L.showAnswer ? 'checked' : ''}/><span class="track"></span>答案</label>
          <label class="switch"><input type="checkbox" id="d-expl" ${L.showExplanation ? 'checked' : ''}/><span class="track"></span>解析</label>
          <span class="divider-v"></span>
          <button class="btn btn-ghost btn-sm" id="exp-html">导出 HTML</button>
          <button class="btn btn-ghost btn-sm" id="exp-md">导出 Markdown</button>
          <button class="btn btn-ghost btn-sm" id="exp-json">导出 JSON</button>
          <button class="icon-btn" id="paper-del" title="删除试卷">${icon('trash')}</button>
        </div>
        ${paper.note ? `<div class="ai-note mt-16">${icon('brain')} <span>${esc(paper.note)}</span></div>` : ''}
      </div>

      ${sheetHTML(paper)}`;
    },

    mount(root, ctx) {
      const paper = Store.papers.get(ctx.params.id);
      if (!paper) return;
      const saveLayout = (patch) => {
        Store.papers.save(Object.assign({}, paper, { layout: Object.assign({}, paper.layout, patch) }));
        App.render();
      };
      const segBox = Q('.paper-toolbar [data-seg]');
      if (segBox) segBox.addEventListener('click', (e) => {
        const b = e.target.closest('[data-val]');
        if (b) saveLayout({ columns: +b.dataset.val });
      });
      const a = Q('#d-answer'), ex = Q('#d-expl');
      if (a) a.onchange = () => saveLayout({ showAnswer: a.checked });
      if (ex) ex.onchange = () => saveLayout({ showExplanation: ex.checked });

      const print = Q('#paper-print');
      if (print) print.onclick = () => window.print();

      const dl = (name, content, mime) => downloadFile(name, content, mime);
      Q('#exp-html').onclick = () => dl(safeName(paper.title) + '.html', this.exportHTML(paper), 'text/html;charset=utf-8');
      Q('#exp-md').onclick = () => dl(safeName(paper.title) + '.md', this.exportMarkdown(paper), 'text/markdown;charset=utf-8');
      Q('#exp-json').onclick = () => dl(safeName(paper.title) + '.json', JSON.stringify(this.exportJSON(paper), null, 2), 'application/json;charset=utf-8');

      const del = Q('#paper-del');
      if (del) del.onclick = async () => {
        const ok = await confirmModal({ title: '删除这份试卷？', body: '只删除试卷本身，题库与作答记录不受影响。', okText: '删除', danger: true });
        if (!ok) return;
        Store.papers.remove(paper.id);
        location.hash = '#/papers';
      };
    },

    exportJSON(paper) {
      return {
        title: paper.title, subtitle: paper.subtitle, layout: paper.layout,
        createdAt: paper.createdAt, exportedAt: Date.now(),
        questions: paperQuestions(paper).map((q) => ({
          type: q.type, stem: q.stem, options: q.options, answer: q.answer,
          explanation: q.explanation, category: q.category,
        })),
      };
    },

    exportMarkdown(paper) {
      const L = paper.layout;
      const lines = [`# ${paper.title}`, ''];
      if (paper.subtitle) lines.push(`> ${paper.subtitle}`, '');
      let no = 0;
      grouped(paperQuestions(paper)).forEach((sec, si) => {
        lines.push(`## ${TYPE_NO[si] || '·'}、${CN[sec.type]}（共 ${sec.list.length} 题）`, '');
        sec.list.forEach((q) => {
          no += 1;
          lines.push(`${no}. ${q.stem}`);
          (q.options || []).forEach((o) => lines.push(`   - ${o.key}. ${o.text}`));
          if (L.showAnswer) lines.push(`   **答案**：${displayAnswer(q) || '未填写'}`);
          if (L.showAnswer && L.showExplanation && q.explanation) lines.push(`   **解析**：${q.explanation}`);
          lines.push('');
        });
      });
      return lines.join('\n');
    },

    exportHTML(paper) {
      const L = paper.layout;
      return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"/>
<title>${esc(paper.title)}</title>
<style>
  body{margin:0;background:#F7F6F2;font-family:"PingFang SC","Microsoft YaHei UI",system-ui,sans-serif;color:#23262A;line-height:1.9}
  .sheet{max-width:820px;margin:32px auto;background:#fff;padding:56px 60px;border-radius:4px;box-shadow:0 10px 40px -30px rgba(0,0,0,.3)}
  .sheet.two-col .body{column-count:2;column-gap:36px}
  h1{font-size:24px;margin:0;text-align:center;letter-spacing:.02em}
  .sub{text-align:center;color:#5D6469;font-size:13px;margin:8px 0 0}
  .meta{display:flex;gap:28px;justify-content:center;font-size:12px;color:#969CA0;border-bottom:1px solid #E2E1D9;padding:18px 0;margin-bottom:28px}
  h3{font-size:15px;margin:26px 0 12px}
  .q{margin:0 0 20px;break-inside:avoid;font-size:13.5px}
  .stem{margin-bottom:6px}
  .opt{display:flex;gap:8px;padding:2px 0 2px 14px;font-size:13px;color:#3A3F44}
  .k{color:#969CA0;min-width:16px}
  .ans{background:#F6F7F3;border-radius:8px;padding:8px 12px;font-size:12.5px;margin-top:8px}
  .ans b,.expl b{color:#476454;margin-right:6px}
  .expl{margin-top:6px;font-size:12.5px;color:#5D6469}
  @media print{body{background:#fff}.sheet{margin:0;box-shadow:none;max-width:none;padding:0 6mm}}
</style></head><body>
<div class="sheet${L.columns === 2 ? ' two-col' : ''}">
  <h1>${esc(paper.title)}</h1>
  ${paper.subtitle ? `<p class="sub">${esc(paper.subtitle)}</p>` : ''}
  <div class="meta"><span>共 ${paperQuestions(paper).length} 题</span><span>姓名 ____________</span>${L.showScore ? '<span>得分 ____________</span>' : ''}</div>
  <div class="body">${grouped(paperQuestions(paper)).map((sec, si) => {
    let inner = '';
    sec.list.forEach((q) => {
      inner += `<div class="q"><div class="stem">${esc(q.stem)}</div>`;
      (q.options || []).forEach((o) => { inner += `<div class="opt"><span class="k">${o.key}</span><span>${esc(o.text)}</span></div>`; });
      if (L.showAnswer) inner += `<div class="ans"><b>答案</b>${esc(displayAnswer(q) || '未填写')}</div>`;
      if (L.showAnswer && L.showExplanation && q.explanation) inner += `<div class="expl"><b>解析</b>${esc(q.explanation)}</div>`;
      inner += '</div>';
    });
    return `<h3>${TYPE_NO[si] || '·'}、${CN[sec.type]}（共 ${sec.list.length} 题）</h3>${inner}`;
  }).join('')}</div>
</div></body></html>`;
    },
  };
})();
