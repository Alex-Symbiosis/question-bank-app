window.Views = window.Views || {};

/* 题库或智库临时练习会话都能进入答题；返回链接按来源区分 */
function practiceBack(bank) {
  if (bank && bank.back) return bank.back;
  if (bank && bank.kbId) return '#/kb/' + bank.kbId;
  return '#/bank/' + (bank ? bank.id : '');
}

/* ============================================================
   答题模式
   ============================================================ */
Views.practice = {
  s: null,
  render(ctx) {
    const bank = Store.banks.get(ctx.params.id) || Store.kbSessions.get(ctx.params.id);
    if (!bank || !bank.questions.length) {
      return `<div class="card">${emptyState({ title: '没有可练习的题目', desc: '这个题库是空的，或已被删除。', action: { href: '#/', label: '返回题库' } })}</div>`;
    }
    let questions = bank.questions;
    const query = ctx.query || {};
    const wrongOnly = !!query.wrong;
    if (wrongOnly) {
      const ids = new Set(Store.wrong.list(bank.id).map((w) => w.qid));
      questions = questions.filter((q) => ids.has(q.id));
    }
    if (query.q) questions = questions.filter((q) => q.id === query.q);
    if (!questions.length) {
      return `<div class="card">${emptyState({
        icon: 'check', title: '没有需要重练的题目',
        desc: '这个题库的错题已经清空，或指定的题目不在错题本里。',
        action: { href: '#/bank/' + bank.id, label: '返回题库' },
      })}</div>`;
    }
    /* 续做：同一题库（或同一错题范围）保留上一次的作答现场 */
    const pkey = query.q ? '' : bank.id + (wrongOnly ? ':wrong' : '');
    this.pkey = pkey;
    const saved = pkey ? Store.progress.get('practice', pkey) : null;
    let restored = null;
    if (saved && !saved.finished && Array.isArray(saved.ids) && saved.ids.length) {
      const exist = new Set(bank.questions.map((q) => q.id));
      const ids = saved.ids.filter((id) => exist.has(id));
      if (ids.length) {
        const pick = (obj) => {
          const out = {};
          if (obj && typeof obj === 'object') ids.forEach((id) => { if (obj[id] !== undefined && obj[id] !== null) out[id] = obj[id]; });
          return out;
        };
        restored = {
          bank, ids, index: clamp(Number(saved.index) || 0, 0, ids.length - 1),
          answers: pick(saved.answers), judged: pick(saved.judged),
          revealed: pick(saved.revealed), grades: pick(saved.grades),
          startedAt: Number(saved.startedAt) || Date.now(), finished: false,
          prevDir: 1, autoAdded: {}, streak: Number(saved.streak) || 0,
          fromWrong: !!saved.fromWrong,
          orders: saved.orders && typeof saved.orders === 'object' ? saved.orders : {},
        };
      }
    }
    this.resumed = !!restored && (restored.index > 0 || Object.keys(restored.judged).length > 0);
    this.s = restored || {
      bank, ids: questions.map((q) => q.id), index: 0,
      answers: {}, judged: {}, revealed: {}, grades: {},
      startedAt: Date.now(), finished: false, prevDir: 1, autoAdded: {}, streak: 0,
      fromWrong: wrongOnly, orders: {},
    };
    return `<div id="practice-stage"></div>`;
  },
  mount() {
    if (this.onKey) document.removeEventListener('keydown', this.onKey);
    this.step(0);
    const stage = Q('#practice-stage');
    stage.addEventListener('click', (e) => this.onClick(e));
    stage.addEventListener('input', (e) => {
      const q = this.current();
      if (!q) return;
      if (e.target.id === 'blank-input') this.s.answers[q.id] = e.target.value;
      if (e.target.id === 'short-input') this.s.answers[q.id] = e.target.value;
      this.persistSoon();
    });
    document.addEventListener('keydown', this.onKey = (e) => {
      if (App.currentView !== 'practice') return;
      const q = this.current();
      if (!q) return;
      if (/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) return;
      const k = e.key.toUpperCase();
      if (q.type === 'single' || q.type === 'multiple' || q.type === 'judge') {
        if (/^[A-H]$/.test(k)) { const i = k.charCodeAt(0) - 65; const shown = this.displayOptions(q); if (shown[i]) this.choose(shown[i].key); }
        if (q.type === 'judge' && (k === '1' || k === '2')) this.choose(k === '1' ? 'T' : 'F');
      }
    });
    this.onHide = () => this.persist();
    window.addEventListener('pagehide', this.onHide);
  },
  destroy() {
    if (this.onKey) document.removeEventListener('keydown', this.onKey);
    if (this.onHide) window.removeEventListener('pagehide', this.onHide);
    this.onKey = null;
    this.onHide = null;
    if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = null; }
    this.persist();
    this.pkey = '';
    this.s = null;
  },
  persist() {
    const s = this.s;
    if (!s || !this.pkey) return;
    const hasWork = s.index > 0 || Object.keys(s.answers).length || Object.keys(s.judged).length || Object.keys(s.revealed).length;
    if (s.finished || !hasWork) { Store.progress.clear('practice', this.pkey); return; }
    Store.progress.set('practice', this.pkey, {
      bankId: s.bank.id,
      ids: s.ids,
      index: s.index,
      answers: s.answers,
      judged: s.judged,
      revealed: s.revealed,
      grades: s.grades,
      orders: s.orders,
      streak: s.streak,
      startedAt: s.startedAt,
      fromWrong: !!s.fromWrong,
      finished: false,
    });
  },
  persistSoon() {
    if (!this.pkey) return;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => { this.saveTimer = null; this.persist(); }, 260);
  },
  onKey: null,
  current() {
    if (!this.s) return null;
    const id = this.s.ids[this.s.index];
    return this.s.bank.questions.find((q) => q.id === id) || null;
  },
  displayOptions(q) {
    const s = this.s;
    const origin = q.options || [];
    if (!s || !Store.settings.get().study.shuffleOptions || origin.length < 2) return origin;
    if (!s.orders) s.orders = {};
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
  step(delta) {
    const s = this.s;
    if (!s) return;
    if (s.index + delta >= s.ids.length) { this.finish(); return; }
    s.index = clamp(s.index + delta, 0, s.ids.length - 1);
    s.prevDir = delta >= 0 ? 1 : -1;
    if (delta !== 0) this.resumed = false;
    this.paint();
  },
  paint() {
    const s = this.s;
    if (s.finished) { this.paintSummary(); return; }
    const q = this.current();
    if (!q) { this.finish(); return; }
    const idx = s.index;
    const answered = s.judged[q.id];
    const revealed = s.revealed[q.id];
    const ans = s.answers[q.id];
    const pct = Math.round(((idx + 1) / s.ids.length) * 100);
    const cardAnim = s.prevDir < 0 ? 'prev-anim' : '';

    const optionHTML = this.displayOptions(q).map((o) => {
      let cls = 'opt';
      const selected = q.type === 'multiple'
        ? Array.isArray(ans) && ans.includes(o.key)
        : normalizeAnswer(q.type, ans) === o.key;
      const isCorrect = q.type === 'multiple'
        ? normalizeAnswer('multiple', q.answer).includes(o.key)
        : o.key === normalizeAnswer('single', q.answer);
      if (selected && !answered && !revealed) cls += ' is-selected';
      if (answered || revealed) {
        cls += ' locked';
        if (isCorrect) cls += ' is-correct';
        else if (selected) cls += ' is-wrong';
        else cls += ' is-dim';
      }
      const mark = (answered || revealed) && (isCorrect || selected)
        ? `<span class="marker show">${isCorrect ? icon('check') : icon('x')}</span>` : '';
      return `<div class="${cls}" data-opt="${o.key}"><span class="key">${o.key}</span><span class="txt">${esc(o.text)}</span>${mark}</div>`;
    }).join('');

    const judgeOptions = q.type === 'judge' ? `
      <div class="options">
        ${['T', 'F'].map((v) => {
          const selected = normalizeAnswer('judge', ans) === v;
          const isCorrect = normalizeAnswer('judge', q.answer) === v;
          let cls = 'opt';
          if (selected && !answered && !revealed) cls += ' is-selected';
          if (answered || revealed) {
            cls += ' locked';
            if (isCorrect) cls += ' is-correct';
            else if (selected) cls += ' is-wrong';
            else cls += ' is-dim';
          }
          return `<div class="${cls}" data-opt="${v}"><span class="key">${v === 'T' ? '对' : '错'}</span><span class="txt">${v === 'T' ? '该说法正确' : '该说法错误'}</span></div>`;
        }).join('')}
      </div>` : '';

    const shortHTML = q.type === 'short' ? `
      <div class="short-answer">
        <div class="head"><span>你的作答</span><span>AI 会依据参考答案评分，可多次修改</span></div>
        <textarea class="textarea" id="short-input" rows="5" placeholder="先自己写一遍，再让 AI 看看能得几分…" ${answered ? 'readonly' : ''}>${esc(ans || '')}</textarea>
      </div>` : '';

    const blankHTML = q.type === 'blank' ? `
      <div class="short-answer">
        <div class="head"><span>填写答案</span><span>多个空可用 / 分隔</span></div>
        <input class="input" id="blank-input" placeholder="在这里输入…" value="${esc(ans || '')}" ${answered ? 'readonly' : ''} />
      </div>` : '';

    let feedbackHTML = '';
    if (answered) {
      const isRight = s.judged[q.id];
      const grade = s.grades[q.id];
      feedbackHTML = `<div class="feedback ${isRight ? 'ok' : 'bad'}">
        <div class="feedback-top">${icon(isRight ? 'check' : 'x')} ${isRight ? '答对了' : '这题答错了'}${q.type === 'short' && grade && grade.score != null ? ` · 得分 ${grade.score}/10` : ''}</div>
        <div class="ans-line">正确答案：<b>${esc(displayAnswer(q))}</b></div>
        ${grade ? gradeHTML(grade) : ''}
        ${q.explanation ? `<div class="explain"><h4>${icon('book')} 解析</h4><div class="body">${esc(q.explanation)}</div></div>` : ''}
      </div>`;
    } else if (revealed) {
      feedbackHTML = `<div class="feedback info">
        <div class="feedback-top">${icon('eye')} 已展示答案</div>
        <div class="ans-line">正确答案：<b>${esc(displayAnswer(q))}</b></div>
        ${q.explanation ? `<div class="explain"><h4>${icon('book')} 解析</h4><div class="body">${esc(q.explanation)}</div></div>` : ''}
        ${q.type === 'short' ? `<div class="redo-actions">
          <button class="btn btn-sm btn-ghost" data-act="self-ok">这题算我答对</button>
          <button class="btn btn-sm btn-ghost" data-act="self-bad">还需要再练</button>
        </div>` : ''}
      </div>`;
    }

    const needConfirm = (q.type === 'multiple' || q.type === 'blank' || q.type === 'short') && !answered && !revealed;
    const canSubmit = needConfirm && isAnswered(q.type, ans);

    Q('#practice-stage').innerHTML = `
      <div class="session-top">
        <a class="icon-btn" href="${practiceBack(s.bank)}" title="返回">${icon('left')}</a>
        <div>
          <div class="session-title">${esc(s.bank.title)} · 答题模式</div>
          <div class="session-sub">${s.bank.mentor ? '由 AI 带教临时生成 · 不写入错题本' : s.bank.kbId ? '由知识库临时生成 · 不写入错题本' : '答错会自动收进错题本'}${s.streak >= 2 ? `<span class="streak-badge">连对 ${s.streak}</span>` : ''}</div>
        </div>
        <div class="session-progress">
          <div class="bar"><i style="width:${pct}%"></i></div>
        </div>
        <div class="session-count"><b>${s.index + 1}</b> / ${s.ids.length}</div>
        ${s.index > 0 || Object.keys(s.judged).length ? `<button class="btn btn-quiet btn-sm" data-act="restart" title="清空进度，从第一题重新开始">${icon('refresh')}<span class="lbl">从头再来</span></button>` : ''}
      </div>

      ${this.resumed ? `<div class="resume-note">
        <span class="grow">已接着上次的进度，从第 ${s.index + 1} 题继续；之前答过的题都保留着。</span>
        <button class="btn btn-quiet btn-sm" data-act="restart">从头再来</button>
      </div>` : ''}

      <div class="q-card ${cardAnim}">
        <div class="q-top">
          <span class="q-index">QUESTION ${String(s.index + 1).padStart(2, '0')}</span>
          <span class="chip ${typeChip(q.type)}">${typeLabel(q.type)}</span>
          <span class="chip plain">${esc(q.category || '未分类')}</span>
          ${Store.favorites.has(q.id) ? `<span class="chip amber">已收藏</span>` : ''}
        </div>
        <div class="q-stem">${esc(q.stem)}</div>
        ${q.type === 'multiple' ? '<div class="q-tip">多选题：选出所有正确选项后点击「确认答案」</div>' : ''}
        ${judgeOptions || `<div class="options">${optionHTML}</div>`}
        ${blankHTML}
        ${shortHTML}
        ${feedbackHTML}

        <div class="session-bar">
          <button class="btn btn-ghost btn-sm" data-act="prev" ${s.index === 0 ? 'disabled' : ''}>${icon('left')} 上一题</button>
          ${!answered && !revealed ? `<button class="btn btn-ghost btn-sm" data-act="reveal">${icon('eye')} 查看答案</button>` : ''}
          <button class="btn btn-soft btn-sm" data-act="ai">${icon('sparkle')} 问 AI</button>
          <span class="spacer"></span>
          ${needConfirm ? `<button class="btn btn-primary btn-sm" data-act="submit" ${canSubmit ? '' : 'disabled'}>${q.type === 'short' ? '提交并批改' : '确认答案'}</button>` : ''}
          ${answered || revealed ? `<button class="btn btn-primary btn-sm" data-act="next">${s.index === s.ids.length - 1 ? '查看结果' : '下一题'} ${icon('right')}</button>` : ''}
        </div>
      </div>`;
    this.persistSoon();
  },
  trackStreak(ok) {
    const s = this.s;
    if (!s) return;
    if (ok) {
      s.streak = (s.streak || 0) + 1;
      if (s.streak >= 3 && s.streak % 3 === 0) confetti(12);
    } else {
      s.streak = 0;
    }
  },
  choose(key) {
    const s = this.s, q = this.current();
    if (!q || s.judged[q.id] || s.revealed[q.id]) return;
    if (q.type === 'multiple') {
      const cur = Array.isArray(s.answers[q.id]) ? s.answers[q.id].slice() : [];
      const i = cur.indexOf(key);
      if (i >= 0) cur.splice(i, 1); else cur.push(key);
      s.answers[q.id] = cur.sort();
      this.paint();
      return;
    }
    s.answers[q.id] = key;
    this.gradeNow();
  },
  gradeNow() {
    const s = this.s, q = this.current();
    const ans = s.answers[q.id];
    if (!isAnswered(q.type, ans)) return;
    const ok = judgeObjective(q, ans);
    s.judged[q.id] = ok;
    this.trackStreak(ok);
    Store.stats.record(s.bank.id, q.id, ok);
    if (!ok) {
      Store.wrong.add(q.id, s.bank.id, AnsText(q, ans));
    } else if (Store.wrong.has(q.id)) {
      Store.wrong.remove(q.id);
      toast('答对了，已从错题本移除', 'ok', 1800);
    }
    if (ok && Store.settings.get().study.autoNext && q.type !== 'short') {
      setTimeout(() => { if (this.s === s && s.judged[q.id]) this.step(1); }, Store.settings.get().study.autoNextDelay);
    }
    this.paint();
  },
  onClick(e) {
    const opt = e.target.closest('[data-opt]');
    if (opt) { this.choose(opt.dataset.opt); return; }
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    const s = this.s, q = this.current();
    if (act === 'prev') { this.step(-1); return; }
    if (act === 'next') { this.step(1); return; }
    if (act === 'restart') { this.restart(); return; }
    if (act === 'reveal') { s.revealed[q.id] = true; this.paint(); return; }
    if (act === 'ai') { AIUI.open({ question: q, bank: s.bank, userAnswer: AnsText(q, s.answers[q.id]), preset: q.type === 'short' ? '看看我的作答' : '讲讲这道题' }); return; }
    if (act === 'submit') {
      if (q.type === 'short') { this.gradeShort(); return; }
      this.gradeNow();
      return;
    }
    if (act === 'self-ok' || act === 'self-bad') {
      const ok = act === 'self-ok';
      s.judged[q.id] = ok;
      this.trackStreak(ok);
      Store.stats.record(s.bank.id, q.id, ok);
      if (ok) Store.wrong.remove(q.id); else Store.wrong.add(q.id, s.bank.id, AnsText(q, s.answers[q.id]));
      this.paint();
      return;
    }
  },
  async restart() {
    const s = this.s;
    if (!s) return;
    const dirty = s.index > 0 || Object.keys(s.judged).length || Object.keys(s.answers).length;
    if (dirty) {
      const ok = await confirmModal({
        title: '从头再来？',
        body: '这次练习的作答进度会清空，从第一题重新开始；题库里的错题本不受影响。',
        okText: '从头开始',
      });
      if (!ok) return;
    }
    if (this.pkey) Store.progress.clear('practice', this.pkey);
    s.index = 0;
    s.answers = {};
    s.judged = {};
    s.revealed = {};
    s.grades = {};
    s.streak = 0;
    s.startedAt = Date.now();
    s.finished = false;
    s.prevDir = 1;
    s.autoAdded = {};
    this.resumed = false;
    this.paint();
  },
  async gradeShort() {
    const s = this.s, q = this.current();
    const ans = s.answers[q.id];
    if (!isAnswered(q.type, ans)) return;
    if (!AI.isConfigured()) {
      toast('还没有配置 AI，先展示参考答案', 'bad');
      s.revealed[q.id] = true;
      this.paint();
      return;
    }
    const stage = Q('#practice-stage');
    const btn = Q('[data-act="submit"]', stage);
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner on-primary"></span> AI 批改中'; }
    try {
      const { grade } = await AI.gradeShort({ question: q, bank: s.bank, userAnswer: ans });
      s.grades[q.id] = grade;
      const ok = grade.score != null ? grade.score >= 6 : false;
      s.judged[q.id] = ok;
      this.trackStreak(ok);
      Store.stats.record(s.bank.id, q.id, ok);
      if (ok) Store.wrong.remove(q.id); else Store.wrong.add(q.id, s.bank.id, ans);
      this.paint();
    } catch (err) {
      toast(err.friendly || err.message, 'bad', 5200);
      if (btn) { btn.disabled = false; btn.textContent = '重新批改'; }
    }
  },
  finish() {
    const s = this.s;
    if (s.finished) return;
    s.finished = true;
    this.resumed = false;
    if (this.pkey) Store.progress.clear('practice', this.pkey);
    this.paint();
  },
  paintSummary() {
    const s = this.s;
    const answeredIds = s.ids.filter((id) => s.judged[id] !== undefined);
    const right = answeredIds.filter((id) => s.judged[id] === true);
    const wrongIds = s.ids.filter((id) => s.judged[id] === false);
    const rate = answeredIds.length ? Math.round((right.length / answeredIds.length) * 100) : 0;
    const mins = Math.max(1, Math.round((Date.now() - s.startedAt) / 60000));
    if (rate >= 80 && answeredIds.length >= 3) confetti();
    Q('#practice-stage').innerHTML = `
      <div class="session-top">
        <a class="icon-btn" href="${practiceBack(s.bank)}">${icon('left')}</a>
        <div><div class="session-title">练习结果</div><div class="session-sub">${esc(s.bank.title)}</div></div>
      </div>
      <div class="card result-card">
        <div class="result-ring" style="--p:${rate};--ring-color:${rate >= 80 ? 'var(--ok)' : rate >= 60 ? 'var(--amber)' : 'var(--bad)'}">
          <div class="ring-bg"></div>
          <div class="ring-text"><b>${rate}<small style="font-size:15px">%</small></b><span>正确率</span></div>
        </div>
        <h2 class="result-title">${rate >= 80 ? '这一组掌握得不错' : rate >= 60 ? '基础还可以，再稳一点' : '别急，把错题再过一遍'}</h2>
        <p class="result-sub">用时约 ${mins} 分钟 · 已作答 ${answeredIds.length} / ${s.ids.length} 题</p>
        <div class="result-stats">
          <div><b style="color:var(--ok)">${right.length}</b>答对</div>
          <div><b style="color:var(--bad)">${wrongIds.length}</b>答错</div>
          <div><b>${s.ids.length - answeredIds.length}</b>未作答</div>
        </div>
        <div class="session-bar" style="justify-content:center;margin-top:26px">
          <a class="btn btn-ghost" href="${practiceBack(s.bank)}">${s.bank.mentor ? '返回' : s.bank.kbId ? '返回知识库' : '返回题库'}</a>
          ${wrongIds.length ? `<button class="btn btn-soft" id="redo-wrong">只练这 ${wrongIds.length} 道错题</button>` : ''}
          <button class="btn btn-primary" id="again">再来一组</button>
        </div>
      </div>`;
    const again = Q('#again');
    if (again) again.onclick = () => { this.render({ params: { id: s.bank.id } }); this.mount(); };
    const redo = Q('#redo-wrong');
    if (redo) redo.onclick = () => {
      this.pkey = s.bank.id + ':redo';
      this.resumed = false;
      this.s = { bank: s.bank, ids: wrongIds, index: 0, answers: {}, judged: {}, revealed: {}, grades: {}, startedAt: Date.now(), finished: false, prevDir: 1, orders: {}, streak: 0, fromWrong: true };
      this.paint();
    };
  },
};

/* ============================================================
   学题模式
   ============================================================ */
Views.study = {
  s: null,
  render(ctx) {
    const bank = Store.banks.get(ctx.params.id);
    if (!bank || !bank.questions.length) {
      return `<div class="card">${emptyState({ title: '没有可学习的题目', desc: '这个题库是空的，或已被删除。', action: { href: '#/', label: '返回题库' } })}</div>`;
    }
    const ids = bank.questions.map((q) => q.id);
    const saved = Store.progress.get('study', bank.id);
    let index = 0;
    if (saved && saved.index != null) index = clamp(Number(saved.index) || 0, 0, ids.length - 1);
    this.pkey = bank.id;
    this.resumed = index > 0;
    this.s = {
      bank, ids, index, prevDir: 1,
      hide: saved && saved.hide && typeof saved.hide === 'object' ? saved.hide : {},
    };
    return '<div id="study-stage"></div>';
  },
  mount() {
    this.paint();
    Q('#study-stage').addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const s = this.s;
      if (b.dataset.act === 'prev') { this.resumed = false; s.prevDir = -1; s.index = clamp(s.index - 1, 0, s.ids.length - 1); this.persist(); this.paint(); }
      if (b.dataset.act === 'next') { this.resumed = false; s.prevDir = 1; s.index = clamp(s.index + 1, 0, s.ids.length - 1); this.persist(); this.paint(); }
      if (b.dataset.act === 'toggle') { s.hide[s.ids[s.index]] = !s.hide[s.ids[s.index]]; this.persist(); this.paint(); }
      if (b.dataset.act === 'restart') {
        s.index = 0;
        s.hide = {};
        s.prevDir = 1;
        this.resumed = false;
        Store.progress.clear('study', this.pkey);
        this.paint();
      }
      if (b.dataset.act === 'ai') {
        const q = this.current();
        AIUI.open({ question: q, bank: s.bank, preset: '讲讲这道题' });
      }
    });
  },
  persist() {
    const s = this.s;
    if (!s || !this.pkey) return;
    if (s.index === 0) { Store.progress.clear('study', this.pkey); return; }
    Store.progress.set('study', this.pkey, { index: s.index, hide: s.hide, total: s.ids.length });
  },
  current() {
    const s = this.s;
    return s.bank.questions.find((q) => q.id === s.ids[s.index]);
  },
  paint() {
    const s = this.s, q = this.current();
    const hidden = !!s.hide[q.id];
    const pct = Math.round(((s.index + 1) / s.ids.length) * 100);
    const ans = q.type === 'judge' ? (normalizeAnswer('judge', q.answer) === 'T' ? '正确' : '错误')
      : Array.isArray(q.answer) ? q.answer.join('、') : q.answer;
    const opts = (q.options || []).map((o) => {
      const isAns = q.type === 'multiple' ? normalizeAnswer('multiple', q.answer).includes(o.key) : o.key === normalizeAnswer('single', q.answer);
      return `<div class="opt ${isAns ? 'is-correct' : ''}"><span class="key">${o.key}</span><span class="txt">${esc(o.text)}</span>${isAns ? `<span class="marker show">${icon('check')}</span>` : ''}</div>`;
    }).join('');

    Q('#study-stage').innerHTML = `
      <div class="session-top">
        <a class="icon-btn" href="#/bank/${s.bank.id}">${icon('left')}</a>
        <div><div class="session-title">${esc(s.bank.title)} · 学题模式</div><div class="session-sub">答案与解析已展开</div></div>
        <div class="session-progress"><div class="bar blue"><i style="width:${pct}%"></i></div></div>
        <div class="session-count"><b>${s.index + 1}</b> / ${s.ids.length}</div>
      </div>
      ${this.resumed ? `<div class="resume-note">
        <span class="grow">已回到上次学到的第 ${s.index + 1} 题。</span>
        <button class="btn btn-quiet btn-sm" data-act="restart">从头开始</button>
      </div>` : ''}
      <div class="q-card ${s.prevDir < 0 ? 'prev-anim' : ''}">
        <div class="q-top">
          <span class="q-index">QUESTION ${String(s.index + 1).padStart(2, '0')}</span>
          <span class="chip ${typeChip(q.type)}">${typeLabel(q.type)}</span>
          <span class="chip plain">${esc(q.category || '未分类')}</span>
        </div>
        <div class="q-stem">${esc(q.stem)}</div>
        ${opts ? `<div class="options study-options">${opts}</div>` : ''}
        <div class="reveal-answer" style="${hidden ? 'text-align:center;padding:28px' : ''}">
          ${hidden ? `<button class="btn btn-ghost btn-sm" data-act="toggle">${icon('eye')} 先自己想想，显示答案</button>` : `
            <div class="row"><span class="small muted" style="min-width:64px">正确答案</span><span class="ans-big">${esc(ans || '未填写')}</span></div>
            ${q.explanation ? `<div class="explain" style="background:transparent;padding:12px 0 0"><h4>${icon('book')} 解析</h4><div class="body">${esc(q.explanation)}</div></div>` : ''}
          `}
        </div>
        <div class="session-bar">
          <button class="btn btn-ghost btn-sm" data-act="prev" ${s.index === 0 ? 'disabled' : ''}>${icon('left')} 上一题</button>
          <button class="btn btn-ghost btn-sm" data-act="toggle">${hidden ? '显示答案' : '隐藏答案'}</button>
          ${s.index > 0 ? `<button class="btn btn-quiet btn-sm" data-act="restart">从第一题开始</button>` : ''}
          <button class="btn btn-soft btn-sm" data-act="ai">${icon('sparkle')} 问 AI</button>
          <span class="spacer"></span>
          <button class="btn btn-primary btn-sm" data-act="next" ${s.index === s.ids.length - 1 ? 'disabled' : ''}>下一题 ${icon('right')}</button>
        </div>
      </div>`;
  },
};

function AnsText(q, ans) {
  if (ans == null) return '';
  if (Array.isArray(ans)) return ans.join('、');
  return String(ans);
}

function gradeHTML(grade) {
  if (!grade) return '';
  const hit = (grade.hit || []).map((t) => `<span class="chip ok">${esc(t)}</span>`).join('');
  const miss = (grade.miss || []).map((t) => `<span class="chip bad">${esc(t)}</span>`).join('');
  return `<div class="grade-card">
    <div class="between">
      <div class="grade-score"><b>${grade.score == null ? '—' : grade.score}</b><span>/ 10 分 · AI 批改</span></div>
      <span class="chip plain">${esc(grade.verdict || '')}</span>
    </div>
    ${grade.comment ? `<div class="grade-comment">${esc(grade.comment)}</div>` : ''}
    ${hit || miss ? `<div class="grade-list">${hit}${miss}</div>` : ''}
    ${grade.suggestion ? `<div class="grade-comment" style="color:var(--ink-3)">建议：${esc(grade.suggestion)}</div>` : ''}
  </div>`;
}
