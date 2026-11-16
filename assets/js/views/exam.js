window.Views = window.Views || {};

/* ============================================================
   考试模式：组卷设置
   ============================================================ */
Views.examSetup = {
  st: null,
  render(ctx) {
    const bank = Store.banks.get(ctx.params.id);
    if (!bank || !bank.questions.length) {
      return `<div class="card">${emptyState({ title: '没有可考试的题目', desc: '这个题库是空的，或已被删除。', action: { href: '#/', label: '返回题库' } })}</div>`;
    }
    const avail = examTypeCounts(bank);
    if (!this.st || this.st.bankId !== bank.id) {
      this.st = {
        bankId: bank.id,
        mode: 'random',
        duration: 30,
        counts: {
          single: Math.min(10, avail.single || 0),
          multiple: Math.min(3, avail.multiple || 0),
          judge: Math.min(5, avail.judge || 0),
          blank: 0,
          short: Math.min(2, avail.short || 0),
        },
      };
    }
    const s = this.st;

    const rows = Object.keys(TYPE_META).filter((t) => avail[t]).map((t) => `
      <div class="type-row">
        <span class="tname"><span class="chip ${typeChip(t)}">${typeLabel(t)}</span></span>
        <span class="have">${avail[t]} 题可用</span>
        <div class="stepper" data-type="${t}">
          <button type="button" data-step="-1" aria-label="减少">−</button>
          <input type="number" data-count="${t}" value="${s.counts[t] || 0}" min="0" max="${avail[t]}" />
          <button type="button" data-step="1" aria-label="增加">+</button>
        </div>
      </div>`).join('');

    const total = this.total();
    const typeRows = Object.keys(s.counts).filter((t) => s.counts[t] > 0)
      .map((t) => `<div class="summary-line"><span>${typeLabel(t)}</span><b>${s.counts[t]} 题</b></div>`).join('');

    return `
      <div class="page-head">
        <div>
          <a class="btn btn-quiet btn-sm" href="#/bank/${bank.id}" style="margin-bottom:10px;margin-left:-8px">${icon('left')} 返回题库</a>
          <h1 class="page-title">考试模式</h1>
          <p class="page-sub">${esc(bank.title)} · 共 ${bank.questions.length} 题</p>
        </div>
      </div>

      <div class="setup-grid" id="exam-setup">
        <div style="display:flex;flex-direction:column;gap:16px">
          <div class="card setup-block">
            <h3>${icon('layers')} 出题方式</h3>
            <p class="sub">随机组卷会按题型从题库中抽取；手动选题可以逐题勾选。</p>
            <div class="segmented" id="mode-seg">
              <button type="button" data-mode="random" class="${s.mode === 'random' ? 'active' : ''}">随机组卷</button>
              <button type="button" data-mode="manual" class="${s.mode === 'manual' ? 'active' : ''}">手动选题</button>
            </div>
          </div>

          <div class="card setup-block" style="${s.mode === 'manual' ? 'opacity:.55;pointer-events:none' : ''}">
            <h3>${icon('list')} 各题型数量</h3>
            <p class="sub">按需要设置每一类抽取多少题，右侧会实时汇总。</p>
            ${rows}
            <div class="total-line">
              <span class="small muted">整卷题数</span>
              <b>${total} 题</b>
            </div>
          </div>

          <div class="card setup-block">
            <h3>${icon('clock')} 考试时长</h3>
            <p class="sub">开始后倒计时，时间到会自动交卷。</p>
            <div class="time-presets" id="time-presets">
              ${[10, 20, 30, 45, 60, 90].map((m) => `<button type="button" data-min="${m}" class="${s.duration === m ? 'active' : ''}">${m} 分钟</button>`).join('')}
            </div>
            <div class="row mt-16">
              <span class="small muted">自定义</span>
              <div class="stepper">
                <button type="button" data-duration="-5">−</button>
                <input type="number" id="duration-input" value="${s.duration}" min="5" max="180" />
                <button type="button" data-duration="5">+</button>
              </div>
              <span class="small muted">分钟</span>
            </div>
          </div>
        </div>

        <div class="card setup-block setup-summary">
          <h3>${icon('trophy')} 本场考试</h3>
          <p class="sub">开考后可以标记不确定的题，交卷后统一复盘。</p>
          <div class="summary-line"><span>出题方式</span><b>${s.mode === 'random' ? '随机组卷' : '手动选题'}</b></div>
          ${typeRows || '<div class="summary-line"><span>尚未选择题目</span><b>—</b></div>'}
          <div class="summary-total"><span class="small muted">共</span><b>${s.mode === 'manual' ? '待选' : total} ${s.mode === 'manual' ? '' : '题'}</b></div>
          <div class="summary-line"><span>考试时长</span><b>${s.duration} 分钟</b></div>
          <button class="btn btn-primary btn-block mt-16" id="start-exam" ${s.mode === 'random' && !total ? 'disabled' : ''}>
            ${s.mode === 'manual' ? '去选题' : '开始考试'} ${icon('right')}
          </button>
          <p class="small muted mt-10" style="text-align:center;line-height:1.8">交卷后逐题复盘，错题可再写一遍</p>
        </div>
      </div>`;
  },

  mount() {
    const wrap = Q('#exam-setup');
    if (!wrap) return;
    const s = this.st;
    const repaint = () => { App.render(); };

    wrap.addEventListener('click', (e) => {
      const mode = e.target.closest('[data-mode]');
      if (mode) { s.mode = mode.dataset.mode; repaint(); return; }
      const step = e.target.closest('[data-step]');
      if (step) {
        const input = Q(`[data-count="${step.closest('[data-type]').dataset.type}"]`);
        if (input) input.value = clamp((+input.value || 0) + (+step.dataset.step), 0, +input.max);
        s.counts[input.dataset.count] = +input.value;
        repaint();
        return;
      }
      const preset = e.target.closest('[data-min]');
      if (preset) { s.duration = +preset.dataset.min; repaint(); return; }
      const dur = e.target.closest('[data-duration]');
      if (dur) { s.duration = clamp(s.duration + (+dur.dataset.duration), 5, 180); repaint(); return; }
      if (e.target.closest('#start-exam')) this.start();
    });

    wrap.addEventListener('change', (e) => {
      const c = e.target.closest('[data-count]');
      if (c) {
        const t = c.dataset.count;
        s.counts[t] = clamp(Math.round(+c.value || 0), 0, +c.max || 0);
        repaint();
      }
      if (e.target.id === 'duration-input') {
        s.duration = clamp(Math.round(+e.target.value || 30), 5, 180);
        repaint();
      }
    });
  },

  total() {
    const c = this.st ? this.st.counts : {};
    return Object.keys(c).reduce((n, k) => n + (c[k] || 0), 0);
  },

  start() {
    const s = this.st;
    const bank = Store.banks.get(s.bankId);
    if (!bank) return;
    if (s.mode === 'manual') { location.hash = '#/exam/pick/' + bank.id; return; }
    const ids = [];
    Object.keys(s.counts).forEach((t) => {
      const n = s.counts[t] || 0;
      if (!n) return;
      const pool = bank.questions.filter((q) => q.type === t).map((q) => q.id);
      ids.push(...shuffle(pool).slice(0, n));
    });
    if (!ids.length) { toast('先设置至少一道题', 'bad'); return; }
    startExamSession(bank, ids, s.duration);
  },
};

/* ============================================================
   考试模式：手动选题
   ============================================================ */
Views.examPick = {
  s: null,
  render(ctx) {
    const bank = Store.banks.get(ctx.params.id);
    if (!bank) return `<div class="card">${emptyState({ title: '题库不存在', action: { href: '#/', label: '返回题库' } })}</div>`;
    const setup = (Views.examSetup.st && Views.examSetup.st.bankId === bank.id)
      ? Views.examSetup.st : { bankId: bank.id, duration: 30, mode: 'manual' };
    this.s = { bank, setup, selected: new Set(), filter: 'all', kw: '' };

    const counts = examTypeCounts(bank);
    const chips = ['all'].concat(Object.keys(TYPE_META).filter((t) => counts[t]))
      .map((t) => `<span class="chip mode ${t === 'all' ? 'active' : ''}" data-filter="${t}">${t === 'all' ? '全部 ' + bank.questions.length : typeLabel(t) + ' ' + counts[t]}</span>`).join('');

    return `
      <div class="page-head">
        <div>
          <a class="btn btn-quiet btn-sm" href="#/exam/setup/${bank.id}" style="margin-bottom:10px;margin-left:-8px">${icon('left')} 返回设置</a>
          <h1 class="page-title">手动选题</h1>
          <p class="page-sub">${esc(bank.title)} · 逐题勾选本次考试的题目</p>
        </div>
        <div class="page-head-actions">
          <span class="chip plain" id="pick-count">已选 0 题</span>
        </div>
      </div>

      <div class="row wrap mb-16" style="gap:8px">
        <div class="filter-bar" id="pick-filters">${chips}</div>
        <span class="grow"></span>
        <div class="input-icon" style="width:230px">
          ${icon('search')}
          <input class="input" id="pick-search" placeholder="搜索题干…" />
        </div>
      </div>

      <div class="q-list" id="pick-list"></div>

      <div class="card mt-24" style="padding:18px 22px;position:sticky;bottom:14px;box-shadow:var(--sh-3)">
        <div class="between wrap">
          <div class="row">
            <span class="small muted">考试时长</span>
            <div class="stepper">
              <button type="button" data-duration="-5">−</button>
              <input type="number" id="pick-duration" value="${this.s.setup.duration || 30}" min="5" max="180" />
              <button type="button" data-duration="5">+</button>
            </div>
            <span class="small muted">分钟</span>
          </div>
          <div class="row">
            <button class="btn btn-ghost btn-sm" id="pick-all">全选当前</button>
            <button class="btn btn-ghost btn-sm" id="pick-none">清空</button>
            <button class="btn btn-primary" id="pick-start">开始考试</button>
          </div>
        </div>
      </div>`;
  },

  mount() {
    const s = this.s;
    if (!s) return;
    this.paintList();
    const list = Q('#pick-list');
    list.addEventListener('click', (e) => {
      const row = e.target.closest('[data-pick]');
      if (!row) return;
      const id = row.dataset.pick;
      if (s.selected.has(id)) s.selected.delete(id); else s.selected.add(id);
      this.paintList();
    });
    QA('#pick-filters .chip').forEach((el) => {
      el.onclick = () => {
        s.filter = el.dataset.filter;
        QA('#pick-filters .chip').forEach((x) => x.classList.toggle('active', x === el));
        this.paintList();
      };
    });
    const search = Q('#pick-search');
    search.oninput = debounce(() => { s.kw = search.value; this.paintList(); }, 160);
    Q('#pick-all').onclick = () => { this.visible().forEach((q) => s.selected.add(q.id)); this.paintList(); };
    Q('#pick-none').onclick = () => { s.selected.clear(); this.paintList(); };
    Q('#pick-duration').onchange = (e) => { s.setup.duration = clamp(Math.round(+e.target.value || 30), 5, 180); };
    QA('[data-duration]').forEach((b) => {
      b.onclick = () => {
        s.setup.duration = clamp((s.setup.duration || 30) + (+b.dataset.duration), 5, 180);
        Q('#pick-duration').value = s.setup.duration;
      };
    });
    Q('#pick-start').onclick = () => {
      if (!s.selected.size) { toast('至少选择一道题', 'bad'); return; }
      const ids = s.bank.questions.filter((q) => s.selected.has(q.id)).map((q) => q.id);
      startExamSession(s.bank, ids, s.setup.duration || 30);
    };
  },

  visible() {
    const s = this.s;
    const kw = (s.kw || '').trim().toLowerCase();
    return s.bank.questions.filter((q) => {
      if (s.filter !== 'all' && q.type !== s.filter) return false;
      if (!kw) return true;
      return (q.stem + ' ' + (q.category || '')).toLowerCase().includes(kw);
    });
  },

  paintList() {
    const s = this.s;
    const items = this.visible();
    Q('#pick-list').innerHTML = items.length ? items.map((q, i) => `
      <div class="q-row ${s.selected.has(q.id) ? 'picked' : ''}" data-pick="${q.id}" style="cursor:pointer">
        <span class="idx">${s.selected.has(q.id) ? icon('check') : String(i + 1).padStart(2, '0')}</span>
        <span class="chip ${typeChip(q.type)}">${typeLabel(q.type)}</span>
        <span class="txt">${esc(q.stem)}</span>
        <span class="chip plain">${esc(q.category || '未分类')}</span>
      </div>`).join('') : `<div class="card flat" style="text-align:center;padding:36px;color:var(--ink-3);font-size:13px">没有符合条件的题目</div>`;
    Q('#pick-count').textContent = `已选 ${s.selected.size} 题`;
    Q('#pick-start').textContent = s.selected.size ? `开始考试（${s.selected.size} 题）` : '开始考试';
  },
};

/* ============================================================
   考试模式：限时作答
   ============================================================ */
Views.examRun = {
  s: null,
  timer: null,
  saveTimer: null,
  render(ctx) {
    this.s = null;
    const bank = Store.banks.get(ctx.params.id);
    const exam = Store.exams.getActive();
    if (!bank || !exam || exam.bankId !== bank.id || exam.submitted) {
      return `<div class="card" style="text-align:center;padding:56px">
        <h3 style="font-size:16px;margin-bottom:8px">没有进行中的考试</h3>
        <p class="small muted mb-16">可能已交卷，或这场考试被新的一场替换了。</p>
        <a class="btn btn-primary" href="#/exam/setup/${bank ? bank.id : ''}">重新组卷</a>
      </div>`;
    }
    this.s = { bank, exam };
    /* 续考：退出时暂停并保存剩余时间，回来接着倒计时 */
    if (exam.paused) {
      const remain = exam.remainingSec != null
        ? Math.max(0, Number(exam.remainingSec) || 0)
        : Math.max(0, Math.round((exam.endsAt - Date.now()) / 1000));
      exam.endsAt = Date.now() + Math.max(1, Math.round(remain)) * 1000;
      exam.remainingSec = null;
      exam.paused = false;
      Store.exams.setActive(exam);
    }
    return '<div id="exam-stage"></div>';
  },

  mount() {
    if (!this.s) return;
    this.paint();
    const stage = Q('#exam-stage');
    stage.addEventListener('click', (e) => this.onClick(e));
    stage.addEventListener('input', (e) => {
      const q = this.current();
      if (!q) return;
      if (e.target.id === 'exam-blank' || e.target.id === 'exam-short') {
        this.s.exam.answers[q.id] = e.target.value;
        this.updateAnswered();
        this.persistSoon();
      }
    });
    this.onHide = () => this.pause();
    window.addEventListener('pagehide', this.onHide);
    this.timer = setInterval(() => this.tick(), 1000);
    this.tick();
  },

  destroy() {
    if (this.timer) clearInterval(this.timer);
    if (this.saveTimer) clearTimeout(this.saveTimer);
    if (this.onHide) window.removeEventListener('pagehide', this.onHide);
    this.timer = null;
    this.saveTimer = null;
    this.onHide = null;
    this.pause();
  },

  /* 暂停考试：记录剩余秒数，下次进入时从这里继续 */
  pause() {
    const s = this.s;
    if (!s || !s.exam || s.exam.submitted || s.submitting) return;
    const exam = s.exam;
    exam.remainingSec = Math.max(0, Math.round((exam.endsAt - Date.now()) / 1000));
    exam.paused = true;
    Store.exams.setActive(exam);
  },

  current() {
    const s = this.s;
    if (!s) return null;
    const id = s.exam.ids[s.exam.index];
    return s.bank.questions.find((q) => q.id === id) || null;
  },

  displayOptions(q) {
    const s = this.s;
    const origin = q.options || [];
    if (!s || !Store.settings.get().study.shuffleOptions || origin.length < 2) return origin;
    s.orders = s.orders || {};
    if (!s.orders[q.id]) {
      const arr = origin.slice();
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
      }
      s.orders[q.id] = arr;
    }
    return s.orders[q.id];
  },

  persistSoon() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => { if (this.s && !this.s.exam.submitted) Store.exams.setActive(this.s.exam); }, 320);
  },

  answeredCount() {
    const s = this.s;
    return s.exam.ids.filter((id) => {
      const q = s.bank.questions.find((x) => x.id === id);
      return q && isAnswered(q.type, s.exam.answers[id]);
    }).length;
  },

  updateAnswered() {
    const el = Q('#exam-answered');
    if (el) el.textContent = `${this.answeredCount()} / ${this.s.exam.ids.length}`;
  },

  tick() {
    const s = this.s;
    if (!s || s.exam.submitted) return;
    const left = Math.max(0, Math.round((s.exam.endsAt - Date.now()) / 1000));
    const pill = Q('#exam-timer');
    if (pill) {
      pill.textContent = formatTime(left);
      pill.classList.toggle('warn', left <= 300 && left > 60);
      pill.classList.toggle('danger', left <= 60);
    }
    if (left <= 0) { clearInterval(this.timer); this.submit(true); }
  },

  paint() {
    const s = this.s, exam = s.exam, bank = s.bank;
    const q = this.current();
    if (!q) return;
    const idx = exam.index;
    const val = exam.answers[q.id];
    const flagged = exam.flagged.indexOf(q.id) >= 0;
    const left = Math.max(0, Math.round((exam.endsAt - Date.now()) / 1000));
    const showTimer = (Store.settings.get().study || {}).showTimer !== false;

    const optHTML = this.displayOptions(q).map((o) => {
      const selected = q.type === 'multiple'
        ? Array.isArray(val) && val.includes(o.key)
        : normalizeAnswer(q.type, val) === o.key;
      return `<div class="opt ${selected ? 'is-selected' : ''}" data-opt="${o.key}">
        <span class="key">${o.key}</span><span class="txt">${esc(o.text)}</span>
      </div>`;
    }).join('');

    const judgeHTML = q.type === 'judge' ? `<div class="options">${['T', 'F'].map((v) => {
      const selected = normalizeAnswer('judge', val) === v;
      return `<div class="opt ${selected ? 'is-selected' : ''}" data-opt="${v}">
        <span class="key">${v === 'T' ? '对' : '错'}</span>
        <span class="txt">${v === 'T' ? '该说法正确' : '该说法错误'}</span></div>`;
    }).join('')}</div>` : '';

    const inputHTML = q.type === 'blank' ? `
      <div class="short-answer">
        <div class="head"><span>填写答案</span><span>多个空可用 / 分隔</span></div>
        <input class="input" id="exam-blank" value="${esc(val || '')}" placeholder="在这里输入…" />
      </div>` : q.type === 'short' ? `
      <div class="short-answer">
        <div class="head"><span>你的作答</span><span>交卷后由 AI 依据参考答案批改</span></div>
        <textarea class="textarea" id="exam-short" rows="6" placeholder="写下你的答案…">${esc(val || '')}</textarea>
      </div>` : '';

    const navHTML = exam.ids.map((id, i) => {
      const qq = bank.questions.find((x) => x.id === id);
      const done = qq && isAnswered(qq.type, exam.answers[id]);
      const flag = exam.flagged.indexOf(id) >= 0;
      return `<button type="button" data-nav="${i}" class="${flag ? 'flag' : done ? 'done' : ''} ${i === idx ? 'current' : ''}">${i + 1}</button>`;
    }).join('');

    Q('#exam-stage').innerHTML = `
      <div class="exam-top">
        <button class="icon-btn" data-act="leave" title="保存并退出">${icon('left')}</button>
        <div class="grow">
          <div class="session-title">${esc(bank.title)} · 考试中</div>
          <div class="session-sub">已答 <span id="exam-answered">${this.answeredCount()} / ${exam.ids.length}</span></div>
        </div>
        ${showTimer ? `<span class="timer-pill ${left <= 60 ? 'danger' : left <= 300 ? 'warn' : ''}" id="exam-timer">${formatTime(left)}</span>` : ''}
        <button class="btn btn-ghost btn-sm ${flagged ? 'exam-flag on' : 'exam-flag'}" data-act="flag">${icon('flag')} ${flagged ? '已标记' : '标记'}</button>
        <button class="btn btn-primary btn-sm" data-act="submit">交卷</button>
      </div>

      <div class="exam-shell">
        <div class="q-card">
          <div class="q-top">
            <span class="q-index">QUESTION ${String(idx + 1).padStart(2, '0')}</span>
            <span class="chip ${typeChip(q.type)}">${typeLabel(q.type)}</span>
            <span class="chip plain">${esc(q.category || '未分类')}</span>
            ${flagged ? `<span class="chip amber">已标记</span>` : ''}
          </div>
          <div class="q-stem">${esc(q.stem)}</div>
          ${q.type === 'multiple' ? '<div class="q-tip">多选题：选出所有正确选项，交卷后统一判分</div>' : ''}
          ${judgeHTML || (optHTML ? `<div class="options">${optHTML}</div>` : '')}
          ${inputHTML}
          <div class="session-bar">
            <button class="btn btn-ghost btn-sm" data-act="prev" ${idx === 0 ? 'disabled' : ''}>${icon('left')} 上一题</button>
            <button class="btn btn-ghost btn-sm" data-act="flag">${icon('flag')} ${flagged ? '取消标记' : '标记'}</button>
            <span class="spacer"></span>
            <button class="btn btn-primary btn-sm" data-act="next" ${idx === exam.ids.length - 1 ? 'disabled' : ''}>下一题 ${icon('right')}</button>
          </div>
        </div>

        <aside class="card exam-nav-panel">
          <div class="between">
            <strong style="font-size:12px">答题卡</strong>
            <span class="small muted">${exam.ids.length} 题</span>
          </div>
          <div class="qnav-grid">${navHTML}</div>
          <div class="qnav-legend">
            <span><i style="background:var(--ok-soft)"></i>已答</span>
            <span><i style="background:var(--amber-soft)"></i>标记</span>
            <span><i style="background:#fff;border:1px solid var(--line-2)"></i>未答</span>
          </div>
          <button class="btn btn-ghost btn-sm btn-block mt-16" data-act="submit">交卷并查看结果</button>
        </aside>
      </div>`;
  },

  onClick(e) {
    const s = this.s;
    if (!s) return;
    const opt = e.target.closest('[data-opt]');
    if (opt) {
      if (s.exam.submitted) return;
      const q = this.current();
      if (!q) return;
      if (q.type === 'multiple') {
        const cur = Array.isArray(s.exam.answers[q.id]) ? s.exam.answers[q.id].slice() : [];
        const i = cur.indexOf(opt.dataset.opt);
        if (i >= 0) cur.splice(i, 1); else cur.push(opt.dataset.opt);
        s.exam.answers[q.id] = cur.sort();
      } else if (q.type === 'judge') {
        s.exam.answers[q.id] = opt.dataset.opt;
      } else {
        s.exam.answers[q.id] = opt.dataset.opt;
      }
      Store.exams.setActive(s.exam);
      this.paint();
      return;
    }
    const nav = e.target.closest('[data-nav]');
    if (nav) { s.exam.index = +nav.dataset.nav; Store.exams.setActive(s.exam); this.paint(); return; }
    const act = e.target.closest('[data-act]');
    if (!act) return;
    const a = act.dataset.act;
    if (a === 'prev') { s.exam.index = Math.max(0, s.exam.index - 1); Store.exams.setActive(s.exam); this.paint(); return; }
    if (a === 'next') { s.exam.index = Math.min(s.exam.ids.length - 1, s.exam.index + 1); Store.exams.setActive(s.exam); this.paint(); return; }
    if (a === 'flag') {
      const q = this.current();
      const i = s.exam.flagged.indexOf(q.id);
      if (i >= 0) s.exam.flagged.splice(i, 1); else s.exam.flagged.push(q.id);
      Store.exams.setActive(s.exam);
      this.paint();
      return;
    }
    if (a === 'leave') { this.leave(); return; }
    if (a === 'submit') { this.submit(false); return; }
  },

  async leave() {
    const ok = await confirmModal({
      title: '保存并退出考试？',
      body: '当前作答和剩余考试时间都会保留，下次回到这个题库可以接着做。',
      okText: '保存退出',
    });
    if (!ok) return;
    Store.exams.setActive(this.s.exam);
    this.destroy();
    location.hash = '#/bank/' + this.s.bank.id;
  },

  async submit(auto) {
    const s = this.s;
    if (!s || s.submitting) return;
    const exam = s.exam, bank = s.bank;
    const unanswered = exam.ids.filter((id) => {
      const q = bank.questions.find((x) => x.id === id);
      return q && !isAnswered(q.type, exam.answers[id]);
    }).length;
    if (!auto && unanswered > 0) {
      const ok = await confirmModal({
        title: '还有未作答的题目',
        body: `还有 ${unanswered} 道题没有作答，确定现在交卷吗？`,
        okText: '仍然交卷',
      });
      if (!ok) return;
    }
    s.submitting = true;
    if (this.timer) clearInterval(this.timer);
    this.paintSubmitting('正在判分', auto ? '考试时间结束，自动交卷…' : '整理作答记录…');

    const results = {};
    const qOf = (id) => bank.questions.find((x) => x.id === id);

    exam.ids.forEach((id) => {
      const q = qOf(id);
      if (!q) return;
      const val = exam.answers[id];
      if (!isAnswered(q.type, val)) {
        results[id] = { status: 'skip', points: 0, answer: val, correct: null };
        return;
      }
      if (q.type === 'single' || q.type === 'multiple' || q.type === 'judge') {
        const ok = judgeObjective(q, val);
        results[id] = { status: ok ? 'ok' : 'bad', points: ok ? 1 : 0, answer: val, correct: ok };
      } else if (q.type === 'blank') {
        const ok = answersEqual(q, val, q.answer);
        results[id] = { status: ok ? 'ok' : 'bad', points: ok ? 1 : 0, answer: val, correct: ok };
      } else {
        results[id] = { status: 'pend', points: 0, answer: val, correct: null };
      }
    });

    const shorts = exam.ids.filter((id) => {
      const q = qOf(id);
      return q && q.type === 'short' && results[id] && results[id].status === 'pend';
    });

    if (shorts.length && !AI.isConfigured()) {
      toast('没有配置 AI，简答题交卷后可在结果页自评', 'bad', 4200);
    }

    for (let i = 0; i < shorts.length; i++) {
      if (!AI.isConfigured()) break;
      const q = qOf(shorts[i]);
      this.paintSubmitting('AI 正在批改简答题', `第 ${i + 1} / ${shorts.length} 题 · 依据参考答案评分`);
      try {
        const { grade } = await AI.gradeShort({ question: q, bank, userAnswer: AnsText(q, exam.answers[q.id]) });
        const pts = grade.score == null ? 0 : clamp(grade.score, 0, 10) / 10;
        results[q.id] = {
          status: pts >= 0.6 ? 'ok' : 'bad',
          points: pts, answer: exam.answers[q.id], correct: pts >= 0.6, grade,
        };
      } catch (err) {
        results[q.id] = {
          status: 'pend', points: 0, answer: exam.answers[q.id], correct: null,
          error: err.friendly || err.message,
        };
      }
    }

    exam.results = results;
    exam.submitted = true;
    exam.finishedAt = Date.now();
    exam.usedSec = Math.max(1, Math.round((Date.now() - exam.startedAt) / 1000));
    recalcExam(exam);

    exam.ids.forEach((id) => {
      const q = qOf(id);
      const r = results[id];
      if (q && r && (r.status === 'ok' || r.status === 'bad')) {
        Store.stats.record(bank.id, id, r.status === 'ok');
      }
    });

    Store.exams.save(exam);
    Store.exams.clearActive();
    Views.examResult.pending = exam;
    s.submitting = false;
    location.hash = '#/exam/result/' + bank.id;
  },

  paintSubmitting(title, sub) {
    const stage = Q('#exam-stage');
    if (stage) {
      stage.innerHTML = `<div class="card result-card" style="padding:64px 32px">
        <div class="spinner" style="width:30px;height:30px;border-width:3px;margin:0 auto 22px"></div>
        <h2 class="result-title">${esc(title)}</h2>
        <p class="result-sub">${esc(sub || '')}</p>
      </div>`;
    }
  },
};

/* ============================================================
   考试结果 + 错题重做
   ============================================================ */
Views.examResult = {
  pending: null,
  s: null,
  render(ctx) {
    const bank = Store.banks.get(ctx.params.id);
    if (!bank) return `<div class="card">${emptyState({ title: '题库不存在', action: { href: '#/', label: '返回题库' } })}</div>`;
    const exam = this.pending || Store.exams.list(bank.id)[0];
    this.pending = null;
    if (!exam) {
      return `<div class="card" style="text-align:center;padding:56px">
        <h3 style="font-size:16px;margin-bottom:8px">还没有考试记录</h3>
        <p class="small muted mb-16">先组一份卷子，交卷后这里会显示得分与逐题复盘。</p>
        <a class="btn btn-primary" href="#/exam/setup/${bank.id}">去组卷</a>
      </div>`;
    }
    this.celebrated = false;
    this.s = { bank, exam, filter: 'all', open: new Set(), redo: {} };
    exam.ids.forEach((id) => {
      const r = exam.results && exam.results[id];
      if (r && (r.status === 'bad' || r.status === 'pend')) this.s.open.add(id);
    });
    return '<div id="result-stage"></div>';
  },

  mount() {
    if (!this.s) return;
    this.paint();
    const stage = Q('#result-stage');
    stage.addEventListener('click', (e) => this.onClick(e));
    stage.addEventListener('input', (e) => {
      const id = e.target.dataset.redoInput;
      if (!id) return;
      const st = this.s.redo[id];
      if (st) st.val = e.target.value;
    });
  },

  counts() {
    const exam = this.s.exam;
    const c = { all: exam.ids.length, ok: 0, bad: 0, skip: 0, pend: 0 };
    exam.ids.forEach((id) => {
      const r = (exam.results || {})[id];
      if (!r) c.skip += 1; else c[r.status] = (c[r.status] || 0) + 1;
    });
    return c;
  },

  paint() {
    const s = this.s, exam = s.exam, bank = s.bank;
    const score = exam.score || 0;
    const c = this.counts();
    const used = exam.usedSec || Math.max(1, Math.round(((exam.finishedAt || Date.now()) - exam.startedAt) / 1000));
    if (score >= 80 && !this.celebrated) { this.celebrated = true; confetti(); }
    const filters = [['all', '全部'], ['bad', '答错'], ['skip', '未答'], ['pend', '待批改'], ['ok', '答对']]
      .map(([k, label]) => `<span class="chip mode ${s.filter === k ? 'active' : ''}" data-filter="${k}">${label} ${c[k] || 0}</span>`).join('');

    Q('#result-stage').innerHTML = `
      <div class="session-top">
        <a class="icon-btn" href="#/bank/${bank.id}" title="返回题库">${icon('left')}</a>
        <div><div class="session-title">考试结果</div><div class="session-sub">${esc(bank.title)} · ${formatDate(exam.finishedAt || Date.now())}</div></div>
      </div>

      <div class="card result-card">
        <div class="result-ring" style="--p:${score};--ring-color:${score >= 80 ? 'var(--ok)' : score >= 60 ? 'var(--amber)' : 'var(--bad)'}">
          <div class="ring-bg"></div>
          <div class="ring-text"><b>${score}<small style="font-size:15px">%</small></b><span>总分</span></div>
        </div>
        <h2 class="result-title">${score >= 80 ? '发挥很稳，继续保持' : score >= 60 ? '基本过关，错题再收一遍' : '先把错题重做一遍'}</h2>
        <p class="result-sub">用时 ${formatTime(used)} · 共 ${exam.ids.length} 题 · 满分按每题 1 分折算</p>
        <div class="result-stats">
          <div><b style="color:var(--ok)">${c.ok || 0}</b>答对</div>
          <div><b style="color:var(--bad)">${c.bad || 0}</b>答错</div>
          <div><b>${c.skip || 0}</b>未答</div>
          <div><b style="color:var(--amber)">${c.pend || 0}</b>待批改</div>
        </div>
        <div class="session-bar" style="justify-content:center;margin-top:22px">
          <a class="btn btn-ghost" href="#/bank/${bank.id}">返回题库</a>
          ${c.bad ? `<a class="btn btn-soft" href="#/practice/${bank.id}?wrong=1">练这一批错题</a>` : ''}
          <a class="btn btn-primary" href="#/exam/setup/${bank.id}">再考一次</a>
        </div>
      </div>

      <div class="section-head">
        <h2>逐题复盘<small>错题可以直接再写一遍</small></h2>
        <div class="filter-bar">${filters}</div>
      </div>
      <div class="review-list" id="review-list">${this.reviewHTML()}</div>`;
  },

  reviewHTML() {
    const s = this.s, exam = s.exam, bank = s.bank;
    const ids = exam.ids.filter((id) => {
      const r = (exam.results || {})[id];
      const status = r ? r.status : 'skip';
      return s.filter === 'all' || status === s.filter;
    });
    if (!ids.length) return `<div class="card flat" style="text-align:center;padding:40px;color:var(--ink-3);font-size:13px">这个分类下暂时没有题目</div>`;
    return ids.map((id, i) => this.itemHTML(id, i)).join('');
  },

  itemHTML(id, i) {
    const s = this.s, exam = s.exam, bank = s.bank;
    const q = bank.questions.find((x) => x.id === id);
    if (!q) return '';
    const r = (exam.results || {})[id] || { status: 'skip', answer: '' };
    const open = s.open.has(id);
    const stIcon = r.status === 'ok' ? 'check' : r.status === 'bad' ? 'x' : r.status === 'pend' ? 'clock' : 'skip';
    const stLabel = r.status === 'ok' ? '答对' : r.status === 'bad' ? '答错' : r.status === 'pend' ? '待批改' : '未作答';
    const myAns = this.answerText(q, r.answer);
    const rightAns = displayAnswer(q);
    const canRedo = r.status === 'bad' || r.status === 'pend';

    return `<div class="review-item">
      <div class="review-head" data-toggle="${id}">
        <span class="st ${r.status}">${icon(stIcon)}</span>
        <div class="rt">
          <div>${esc(q.stem)}</div>
          <div class="sub">第 ${exam.ids.indexOf(id) + 1} 题 · ${typeLabel(q.type)} · ${stLabel}${myAns ? ' · 你的答案：' + esc(myAns) : ''}</div>
        </div>
        <span class="chip ${r.status === 'ok' ? 'ok' : r.status === 'bad' ? 'bad' : r.status === 'pend' ? 'amber' : 'plain'}">${stLabel}</span>
      </div>
      ${open ? `<div class="review-body">
        <div class="q-stem" style="font-size:15px">${esc(q.stem)}</div>
        ${this.optionsHTML(q, r.answer)}
        <div class="reveal-answer" style="margin-top:14px">
          <div class="row"><span class="small muted" style="min-width:64px">正确答案</span><span class="ans-big">${esc(rightAns || '未填写')}</span></div>
          ${myAns ? `<div class="row"><span class="small muted" style="min-width:64px">你的答案</span><span class="small">${esc(myAns)}</span></div>` : ''}
          ${q.explanation ? `<div class="explain" style="background:#fff"><h4>${icon('book')} 解析</h4><div class="body">${esc(q.explanation)}</div></div>` : ''}
          ${r.grade ? gradeHTML(r.grade) : ''}
          ${r.error ? `<div class="small" style="color:var(--bad);margin-top:8px">AI 批改失败：${esc(r.error)}</div>` : ''}
        </div>
        ${canRedo ? this.redoHTML(q, r) : ''}
      </div>` : ''}
    </div>`;
  },

  optionsHTML(q, myAnswer) {
    if (!q.options || !q.options.length) return '';
    return `<div class="options study-options" style="margin-top:14px">${q.options.map((o) => {
      const isRight = q.type === 'multiple'
        ? normalizeAnswer('multiple', q.answer).includes(o.key)
        : o.key === normalizeAnswer('single', q.answer);
      const mine = q.type === 'multiple'
        ? Array.isArray(myAnswer) && myAnswer.includes(o.key)
        : normalizeAnswer(q.type, myAnswer) === o.key;
      let cls = 'opt locked';
      if (isRight) cls += ' is-correct';
      else if (mine) cls += ' is-wrong';
      else cls += ' is-dim';
      return `<div class="${cls}"><span class="key">${o.key}</span><span class="txt">${esc(o.text)}</span>
        ${isRight ? `<span class="marker show" style="color:var(--ok)">${icon('check')}</span>` : mine ? `<span class="marker show" style="color:var(--bad)">${icon('x')}</span>` : ''}</div>`;
    }).join('')}</div>`;
  },

  redoHTML(q, r) {
    const st = this.s.redo[q.id];
    if (r.status === 'pend' && !st) {
      return `<div class="redo-box">
        <div class="between wrap">
          <span class="small muted">这题还没有批改，可以对照参考答案自评：</span>
          <div class="redo-actions" style="margin-top:0">
            <button class="btn btn-sm btn-ghost" data-self="ok" data-qid="${q.id}">算我答对</button>
            <button class="btn btn-sm btn-ghost" data-self="bad" data-qid="${q.id}">算我答错</button>
          </div>
        </div>
      </div>`;
    }
    if (!st) {
      return `<div class="redo-box">
        <div class="between wrap">
          <span class="small muted">这道题要不要再写一遍？</span>
          <div class="redo-actions" style="margin-top:0">
            <button class="btn btn-sm btn-soft" data-redo-start="${q.id}">${icon('pen')} 再写一遍</button>
            <button class="btn btn-sm btn-ghost" data-redo-skip="${q.id}">跳过</button>
            <button class="btn btn-sm btn-ghost" data-redo-add="${q.id}">加入错题本</button>
          </div>
        </div>
      </div>`;
    }
    if (st.mode === 'edit') return this.redoEditHTML(q, st);
    if (st.mode === 'done') {
      if (st.ok === null) {
        return `<div class="redo-box"><div class="row">${icon('book')}<span class="small muted">已对照参考答案，请自行判断是否掌握。可以点「加入错题本」留待以后练。</span>
          <button class="btn btn-sm btn-ghost" data-redo-add="${q.id}" style="margin-left:auto">加入错题本</button></div></div>`;
      }
      return `<div class="redo-box"><div class="row">${icon(st.ok ? 'check' : 'x')}<span class="small" style="color:${st.ok ? 'var(--ok)' : 'var(--bad)'}">${st.ok ? '这次写对了' : '这次仍然不正确，已加入错题本'}</span></div>
        ${st.grade ? gradeHTML(st.grade) : ''}</div>`;
    }
    if (st.mode === 'added') return `<div class="redo-box"><div class="row">${icon('brain')}<span class="small muted">已加入错题本，之后可以在错题本里继续练。</span></div></div>`;
    if (st.mode === 'skip') return `<div class="redo-box"><div class="row">${icon('skip')}<span class="small muted">已跳过这道题。</span></div></div>`;
    return '';
  },

  redoEditHTML(q, st) {
    let input = '';
    if (q.type === 'short') {
      input = `<textarea class="textarea" rows="4" data-redo-input="${q.id}" placeholder="重新写一遍你的答案…">${esc(st.val || '')}</textarea>`;
    } else if (q.type === 'blank') {
      input = `<input class="input" data-redo-input="${q.id}" value="${esc(st.val || '')}" placeholder="输入答案…" />`;
    } else {
      const opts = q.type === 'judge'
        ? [['T', '正确'], ['F', '错误']]
        : (q.options || []).map((o) => [o.key, o.text]);
      input = `<div class="options" style="margin-top:0">${opts.map(([key, text]) => {
        const selected = q.type === 'multiple'
          ? Array.isArray(st.val) && st.val.includes(key)
          : normalizeAnswer(q.type, st.val) === key;
        return `<div class="opt ${selected ? 'is-selected' : ''}" data-redo-opt="${q.id}" data-key="${key}">
          <span class="key">${key === 'T' ? '对' : key === 'F' ? '错' : key}</span><span class="txt">${esc(text)}</span></div>`;
      }).join('')}</div>`;
    }
    return `<div class="redo-box">
      <div class="small muted mb-10">再写一遍</div>
      ${input}
      <div class="redo-actions">
        <button class="btn btn-sm btn-primary" data-redo-submit="${q.id}" ${st.busy ? 'disabled' : ''}>${st.busy ? '批改中…' : q.type === 'short' && AI.isConfigured() ? '提交并批改' : '提交'}</button>
        <button class="btn btn-sm btn-ghost" data-redo-cancel="${q.id}">取消</button>
      </div>
    </div>`;
  },

  answerText(q, val) {
    if (!isAnswered(q.type, val)) return '';
    return displayAnswer(q, val);
  },

  onClick(e) {
    const s = this.s;
    const toggle = e.target.closest('[data-toggle]');
    if (toggle && !e.target.closest('[data-redo-start],[data-redo-skip],[data-redo-add],[data-redo-opt],[data-redo-submit],[data-redo-cancel],[data-self]')) {
      const id = toggle.dataset.toggle;
      if (s.open.has(id)) s.open.delete(id); else s.open.add(id);
      this.paint();
      return;
    }
    const filter = e.target.closest('[data-filter]');
    if (filter) { s.filter = filter.dataset.filter; this.paint(); return; }

    const start = e.target.closest('[data-redo-start]');
    if (start) {
      const q = s.bank.questions.find((x) => x.id === start.dataset.redoStart);
      if (q) s.redo[q.id] = { mode: 'edit', val: q.type === 'multiple' ? [] : '' };
      this.paint();
      return;
    }
    const skip = e.target.closest('[data-redo-skip]');
    if (skip) { s.redo[skip.dataset.redoSkip] = { mode: 'skip' }; this.paint(); return; }
    const add = e.target.closest('[data-redo-add]');
    if (add) {
      const id = add.dataset.redoAdd;
      const r = (s.exam.results || {})[id] || {};
      Store.wrong.add(id, s.bank.id, this.answerText(s.bank.questions.find((x) => x.id === id), r.answer));
      s.redo[id] = { mode: 'added' };
      toast('已加入错题本', 'ok');
      this.paint();
      return;
    }
    const opt = e.target.closest('[data-redo-opt]');
    if (opt) {
      const id = opt.dataset.redoOpt, key = opt.dataset.key;
      const q = s.bank.questions.find((x) => x.id === id);
      const st = s.redo[id];
      if (!q || !st) return;
      if (q.type === 'multiple') {
        const cur = Array.isArray(st.val) ? st.val.slice() : [];
        const i = cur.indexOf(key);
        if (i >= 0) cur.splice(i, 1); else cur.push(key);
        st.val = cur.sort();
      } else {
        st.val = key;
      }
      this.paint();
      return;
    }
    const cancel = e.target.closest('[data-redo-cancel]');
    if (cancel) { delete s.redo[cancel.dataset.redoCancel]; this.paint(); return; }
    const submit = e.target.closest('[data-redo-submit]');
    if (submit) { this.redoSubmit(submit.dataset.redoSubmit); return; }
    const self = e.target.closest('[data-self]');
    if (self) { this.selfJudge(self.dataset.qid, self.dataset.self === 'ok'); return; }
  },

  async redoSubmit(id) {
    const s = this.s;
    const q = s.bank.questions.find((x) => x.id === id);
    const st = s.redo[id];
    if (!q || !st) return;
    if (!isAnswered(q.type, st.val)) { toast('先写下答案', 'bad'); return; }
    if (q.type === 'short') {
      if (!AI.isConfigured()) {
        st.mode = 'done'; st.ok = null; st.val = st.val;
        this.paint();
        toast('没有配置 AI，请对照参考答案自评', 'bad', 3600);
        return;
      }
      st.busy = true;
      this.paint();
      try {
        const { grade } = await AI.gradeShort({ question: q, bank: s.bank, userAnswer: AnsText(q, st.val) });
        const ok = grade.score != null && grade.score >= 6;
        s.redo[id] = { mode: 'done', ok, grade, val: st.val };
        if (ok) { Store.wrong.remove(id); toast('这次写对了', 'ok'); }
        else { Store.wrong.add(id, s.bank.id, AnsText(q, st.val)); toast('还需再练，已加入错题本', 'bad'); }
        this.paint();
      } catch (err) {
        st.busy = false;
        this.paint();
        toast(err.friendly || err.message, 'bad', 4800);
      }
      return;
    }
    const ok = q.type === 'blank' ? answersEqual(q, st.val, q.answer) : judgeObjective(q, st.val);
    s.redo[id] = { mode: 'done', ok, val: st.val };
    if (ok) { Store.wrong.remove(id); toast('这次写对了', 'ok'); }
    else { Store.wrong.add(id, s.bank.id, AnsText(q, st.val)); toast('仍然不正确，已加入错题本', 'bad'); }
    this.paint();
  },

  selfJudge(id, ok) {
    const s = this.s;
    const exam = s.exam;
    const r = exam.results[id];
    if (!r) return;
    r.status = ok ? 'ok' : 'bad';
    r.points = ok ? 1 : 0;
    r.correct = ok;
    recalcExam(exam);
    Store.exams.save(exam);
    if (ok) Store.wrong.remove(id); else Store.wrong.add(id, s.bank.id, this.answerText(s.bank.questions.find((x) => x.id === id), r.answer));
    this.paint();
    toast(ok ? '已记为答对' : '已记为答错', ok ? 'ok' : 'bad');
  },
};

/* ============================================================
   辅助
   ============================================================ */
function examTypeCounts(bank) {
  const m = {};
  bank.questions.forEach((q) => { m[q.type] = (m[q.type] || 0) + 1; });
  return m;
}

function startExamSession(bank, ids, minutes) {
  const now = Date.now();
  const session = {
    id: uid('exam'),
    bankId: bank.id,
    bankTitle: bank.title,
    ids: ids.slice(),
    answers: {},
    flagged: [],
    index: 0,
    duration: Math.max(1, minutes) * 60,
    startedAt: now,
    endsAt: now + Math.max(1, minutes) * 60000,
    paused: false,
    remainingSec: null,
    submitted: false,
    results: null,
    score: 0,
  };
  Store.exams.setActive(session);
  location.hash = '#/exam/run/' + bank.id;
}

function recalcExam(exam) {
  let sum = 0;
  (exam.ids || []).forEach((id) => {
    const r = (exam.results || {})[id];
    if (r) sum += (r.points || 0);
  });
  exam.score = exam.ids.length ? Math.round((sum / exam.ids.length) * 100) : 0;
  return exam.score;
}
