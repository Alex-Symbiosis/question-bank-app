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
    const query = ctx.query || {};
    const favAll = ctx.params.id === '__favorites';
    let bank;
    if (favAll) {
      const qs = Store.favorites.list().map((qid) => Store.questionById(qid)).filter(Boolean);
      bank = { id: '__favorites', title: '收藏练习', monogram: '收藏', accent: 'accent', questions: qs, back: '#/favorites' };
    } else {
      bank = Store.banks.get(ctx.params.id) || Store.kbSessions.get(ctx.params.id);
    }
    if (!bank || !bank.questions.length) {
      if (favAll) {
        return `<div class="card">${emptyState({
          icon: 'star', title: '收藏夹里还没有题目',
          desc: '先在题库里收藏几道题，再回来一次性练完。',
          action: { href: '#/favorites', label: '返回收藏夹' },
        })}</div>`;
      }
      return `<div class="card">${emptyState({ title: '没有可练习的题目', desc: '这个题库是空的，或已被删除。', action: { href: '#/', label: '返回题库' } })}</div>`;
    }
    let questions = bank.questions;
    const wrongOnly = !!query.wrong;
    const favOnly = !favAll && !!query.fav;
    if (wrongOnly) {
      const ids = new Set(Store.wrong.list(bank.id).map((w) => w.qid));
      questions = questions.filter((q) => ids.has(q.id));
    }
    if (favOnly) {
      const ids = new Set(Store.favorites.list());
      questions = questions.filter((q) => ids.has(q.id));
    }
    if (query.q) questions = questions.filter((q) => q.id === query.q);
    if (!questions.length) {
      const favScope = favAll || favOnly;
      return `<div class="card">${emptyState({
        icon: favScope ? 'star' : 'check',
        title: favScope ? '这个范围里没有收藏的题目' : '没有需要重练的题目',
        desc: favScope ? '收藏可能已被取消，或题目已被删除。' : '这个题库的错题已经清空，或指定的题目不在错题本里。',
        action: { href: favScope ? '#/favorites' : '#/bank/' + bank.id, label: favScope ? '返回收藏夹' : '返回题库' },
      })}</div>`;
    }
    /* 续做：同一题库（或同一错题/收藏范围）保留上一次的作答现场 */
    const scope = favOnly ? ':fav' : wrongOnly ? ':wrong' : '';
    const pkey = query.q ? '' : bank.id + scope;
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
          revealed: pick(saved.revealed), seen: pick(saved.seen || saved.revealed || {}), grades: pick(saved.grades),
          gradeFail: pick(saved.gradeFail || {}), grading: {},
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
      answers: {}, judged: {}, revealed: {}, seen: {}, grades: {}, gradeFail: {}, grading: {},
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
      /* 简答 / 填空没有选项，提交按钮改为跟随输入内容启用 */
      const submit = Q('[data-act="submit"]', stage);
      if (submit) submit.disabled = !isAnswered(q.type, e.target.value);
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
    const hasWork = s.index > 0 || Object.keys(s.answers).length || Object.keys(s.judged).length || Object.keys(s.revealed).length || Object.keys(s.seen || {}).length;
    if (s.finished || !hasWork) { Store.progress.clear('practice', this.pkey); return; }
    Store.progress.set('practice', this.pkey, {
      bankId: s.bank.id,
      ids: s.ids,
      index: s.index,
      answers: s.answers,
      judged: s.judged,
      revealed: s.revealed,
      seen: s.seen || {},
      grades: s.grades,
      gradeFail: s.gradeFail || {},
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
  /* 收藏合集等虚拟题库：统计与错题仍记到题目真正的来源题库 */
  bankIdFor(q) {
    const real = q ? Store.bankOfQuestion(q.id) : null;
    return (real && real.id) || (this.s && this.s.bank ? this.s.bank.id : '');
  },
  /* 错题本只在「在错题本里重做并答对」时移出；普通练习中当场答对只保留记录 */
  syncWrongbook(q, ok) {
    const s = this.s;
    if (!ok) {
      Store.wrong.add(q.id, this.bankIdFor(q), AnsText(q, s.answers[q.id]));
      return;
    }
    if (s.fromWrong && Store.wrong.has(q.id)) {
      Store.wrong.remove(q.id);
      toast('答对了，已从错题本移除', 'ok', 1800);
    }
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
    /* judged 存的是对错布尔值：答题状态必须用「有没有这个键」判断，否则答错（false）会被当成没答 */
    const answered = s.judged[q.id] !== undefined;
    const isRight = s.judged[q.id] === true;
    const revealed = s.revealed[q.id];
    const grade = s.grades[q.id];
    const gradeFail = s.gradeFail ? s.gradeFail[q.id] : null;
    const grading = !!(s.grading && s.grading[q.id]);
    const seen = !!(s.seen && s.seen[q.id]);
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
      if (selected && !answered) cls += ' is-selected';
      if (answered) {
        cls += ' locked';
        if (isCorrect) cls += ' is-correct';
        else if (selected) cls += ' is-wrong';
        else cls += ' is-dim';
      }
      const mark = answered && (isCorrect || selected)
        ? `<span class="marker show">${isCorrect ? icon('check') : icon('x')}</span>` : '';
      return `<div class="${cls}" data-opt="${o.key}"><span class="key">${o.key}</span><span class="txt">${esc(o.text)}</span>${mark}</div>`;
    }).join('');

    const judgeOptions = q.type === 'judge' ? `
      <div class="options">
        ${['T', 'F'].map((v) => {
          const selected = normalizeAnswer('judge', ans) === v;
          const isCorrect = normalizeAnswer('judge', q.answer) === v;
          let cls = 'opt';
          if (selected && !answered) cls += ' is-selected';
          if (answered) {
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

    /* AI 批改的可见状态：进行中 / 未完成（未配置、请求失败），成功结果在 feedback 里用 gradeHTML 展示 */
    let aiPanelHTML = '';
    if (grading) {
      aiPanelHTML = `<div class="grade-card grade-card-pending" data-grade="pending">
        <div class="grade-head">${icon('sparkle')}<span>AI 批改</span></div>
        <div class="grade-pending"><span class="spinner"></span><span>正在批改你的作答，通常需要几秒…</span></div>
      </div>`;
    } else if (gradeFail) {
      aiPanelHTML = `<div class="grade-card grade-card-fail" data-grade="fail">
        <div class="grade-head">${icon('sparkle')}<span>AI 批改 · 未完成</span></div>
        <div class="grade-msg">${esc(gradeFail.message || '批改没有完成')}</div>
        ${gradeFail.hint ? `<div class="grade-hint">${esc(gradeFail.hint)}</div>` : ''}
        <div class="ans-line">参考答案：<b>${esc(displayAnswer(q))}</b></div>
        <div class="grade-actions">
          ${gradeFail.retry === false ? '' : `<button class="btn btn-sm btn-soft" data-act="submit">重新批改</button>`}
          ${gradeFail.missing ? `<a class="btn btn-sm btn-ghost" href="#/settings">去配置 AI</a>` : ''}
          <button class="btn btn-sm btn-ghost" data-act="self-ok">算我答对</button>
          <button class="btn btn-sm btn-ghost" data-act="self-bad">还需要再练</button>
        </div>
      </div>`;
    }

    let feedbackHTML = '';
    if (answered) {
      const topLabel = q.type === 'short'
        ? (grade ? 'AI 批改完成' : '已按自评记录')
        : (isRight ? '答对了' : '这题答错了');
      feedbackHTML = `<div class="feedback ${isRight ? 'ok' : 'bad'}">
        <div class="feedback-top">${icon(isRight ? 'check' : 'x')} ${topLabel}${q.type === 'short' && grade && grade.score != null ? ` · 得分 ${grade.score}/10` : ''}</div>
        <div class="ans-line">正确答案：<b>${esc(displayAnswer(q))}</b></div>
        ${answered && isRight && Store.wrong.has(q.id) ? `<div class="small muted" style="margin-top:8px">${icon('brain')} 已再次答对；错题记录保留，去错题本重做并答对后才会移出。</div>` : ''}
        ${grade ? gradeHTML(grade) : ''}
        ${q.explanation ? `<div class="explain"><h4>${icon('book')} 解析</h4><div class="body">${esc(q.explanation)}</div></div>` : ''}
        ${q.type === 'short' ? `<div class="redo-actions">
          <button class="btn btn-sm btn-ghost" data-act="redo">${icon('refresh')} 重新作答</button>
        </div>` : ''}
      </div>`;
    }

    /* 查看答案是临时展开的参考答案，不参与判分；收起后本题仍可正常作答 */
    let answerPanelHTML = '';
    if (revealed && !answered) {
      answerPanelHTML = `<div class="reveal-answer">
        <div class="row"><span class="small muted" style="min-width:64px">正确答案</span><span class="ans-big">${esc(displayAnswer(q) || '未填写')}</span></div>
        ${q.explanation ? `<div class="explain" style="background:transparent;padding:12px 0 0"><h4>${icon('book')} 解析</h4><div class="body">${esc(q.explanation)}</div></div>` : ''}
        ${q.type === 'short' ? `<div class="redo-actions">
          <button class="btn btn-sm btn-ghost" data-act="self-ok">这题算我答对</button>
          <button class="btn btn-sm btn-ghost" data-act="self-bad">还需要再练</button>
        </div>` : ''}
      </div>`;
    }

    const needConfirm = (q.type === 'multiple' || q.type === 'blank' || q.type === 'short') && !answered;
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
          ${!answered && seen ? '<span class="chip plain">看过答案</span>' : ''}
        </div>
        <div class="q-stem">${esc(q.stem)}</div>
        ${q.type === 'multiple' ? '<div class="q-tip">多选题：选出所有正确选项后点击「确认答案」</div>' : ''}
        ${judgeOptions || `<div class="options">${optionHTML}</div>`}
        ${blankHTML}
        ${shortHTML}
        ${answerPanelHTML}
        ${aiPanelHTML}
        ${feedbackHTML}

        <div class="session-bar">
          <button class="btn btn-ghost btn-sm" data-act="prev" ${s.index === 0 ? 'disabled' : ''}>${icon('left')} 上一题</button>
          ${!answered ? `<button class="btn btn-ghost btn-sm" data-act="reveal">${icon('eye')} ${revealed ? '收起答案' : '查看答案'}</button>` : ''}
          <button class="btn btn-soft btn-sm" data-act="ai">${icon('sparkle')} 问 AI</button>
          <span class="spacer"></span>
          ${needConfirm && !gradeFail ? `<button class="btn btn-primary btn-sm" data-act="submit" ${canSubmit && !grading ? '' : 'disabled'}>${grading ? '批改中…' : q.type === 'short' ? '提交并批改' : '确认答案'}</button>` : ''}
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
    if (!q || s.judged[q.id] !== undefined) return;
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
    Store.stats.record(this.bankIdFor(q), q.id, ok);
    this.syncWrongbook(q, ok);
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
    if (act === 'reveal') {
      s.revealed[q.id] = !s.revealed[q.id];
      /* 「看过答案」是永久标记，收起只关掉面板，不清除记录 */
      if (s.revealed[q.id]) { if (!s.seen) s.seen = {}; s.seen[q.id] = true; }
      this.paint();
      return;
    }
    if (act === 'redo') { this.redoShort(); return; }
    if (act === 'ai') { AIUI.open({ question: q, bank: s.bank, userAnswer: AnsText(q, s.answers[q.id]), preset: q.type === 'short' ? '看看我的作答' : '讲讲这道题' }); return; }
    if (act === 'submit') {
      if (q.type === 'short') { this.gradeShort(); return; }
      this.gradeNow();
      return;
    }
    if (act === 'self-ok' || act === 'self-bad') {
      const ok = act === 'self-ok';
      if (s.gradeFail) delete s.gradeFail[q.id];
      s.judged[q.id] = ok;
      this.trackStreak(ok);
      Store.stats.record(this.bankIdFor(q), q.id, ok);
      this.syncWrongbook(q, ok);
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
    s.seen = {};
    s.grades = {};
    s.gradeFail = {};
    s.grading = {};
    s.streak = 0;
    s.startedAt = Date.now();
    s.finished = false;
    s.prevDir = 1;
    s.autoAdded = {};
    this.resumed = false;
    this.paint();
  },
  /* 简答题重新作答：只清这道题的作答现场；已计入的统计与错题本不回退 */
  redoShort() {
    const s = this.s, q = this.current();
    if (!s || !q || q.type !== 'short') return;
    delete s.answers[q.id];
    delete s.judged[q.id];
    delete s.revealed[q.id];
    delete s.grades[q.id];
    if (s.gradeFail) delete s.gradeFail[q.id];
    if (s.grading) delete s.grading[q.id];
    this.paint();
    const input = Q('#short-input');
    if (input) { input.focus(); input.setSelectionRange(0, 0); }
  },
  async gradeShort() {
    const s = this.s, q = this.current();
    if (!s || !q) return;
    const ans = s.answers[q.id];
    if (!isAnswered(q.type, ans)) return;
    if (s.grading && s.grading[q.id]) return; /* 防止重复提交 */
    if (!s.gradeFail) s.gradeFail = {};
    if (!s.grading) s.grading = {};
    delete s.gradeFail[q.id];

    /* 情况一：没配 AI，请求根本没有发出 */
    if (!AI.isConfigured()) {
      s.gradeFail[q.id] = {
        code: 'NO_KEY',
        message: '还没有配置 AI，本次批改请求没有发出。',
        hint: '到「设置 · AI 接入」填好 Base URL、API Key 与模型名后就能自动批改；现在可以先对照参考答案自行判定。',
        retry: false,
        missing: true,
      };
      this.paint();
      return;
    }

    /* 情况二：请求已发出，先给出「批改中」占位，避免用户以为没反应 */
    s.grading[q.id] = true;
    this.paint();
    try {
      const { grade } = await AI.gradeShort({ question: q, bank: s.bank, userAnswer: ans });
      if (this.s !== s) return;
      s.grades[q.id] = grade;
      const ok = grade.score != null ? grade.score >= 6 : false;
      s.judged[q.id] = ok;
      delete s.gradeFail[q.id];
      this.trackStreak(ok);
      Store.stats.record(this.bankIdFor(q), q.id, ok);
      this.syncWrongbook(q, ok);
      toast(grade.score != null ? `AI 批改完成：${grade.score}/10` : 'AI 批改完成（未给出分数）', ok ? 'ok' : 'bad', 2600);
    } catch (err) {
      if (this.s !== s) return;
      const noKey = !!err && err.code === 'NO_KEY';
      /* 情况三：请求发出但失败，错误必须落在页面上，不能只弹一个会消失的 toast */
      s.gradeFail[q.id] = {
        code: (err && err.code) || 'ERROR',
        message: noKey ? '还没有配置 AI，本次批改请求没有发出。' : `批改请求失败：${(err && err.message) || '未知错误'}`,
        hint: (err && err.friendly) || '可以先对照参考答案自行判定，或稍后重试。',
        retry: !noKey,
        missing: noKey,
      };
    } finally {
      if (this.s === s) {
        delete s.grading[q.id];
        this.paint();
      }
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
      this.s = { bank: s.bank, ids: wrongIds, index: 0, answers: {}, judged: {}, revealed: {}, seen: {}, grades: {}, gradeFail: {}, grading: {}, startedAt: Date.now(), finished: false, prevDir: 1, orders: {}, streak: 0, fromWrong: true };
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
  return `<div class="grade-card" data-grade="ok">
    <div class="grade-head">${icon('sparkle')}<span>AI 批改</span>${grade.parseError ? '<span class="chip plain">未按格式返回，已展示原文</span>' : ''}</div>
    <div class="between">
      <div class="grade-score"><b>${grade.score == null ? '—' : grade.score}</b><span>/ 10 分</span></div>
      <span class="chip plain">${esc(grade.verdict || '')}</span>
    </div>
    ${grade.comment ? `<div class="grade-comment">${esc(grade.comment)}</div>` : ''}
    ${hit || miss ? `<div class="grade-list">${hit}${miss}</div>` : ''}
    ${grade.suggestion ? `<div class="grade-comment" style="color:var(--ink-3)">建议：${esc(grade.suggestion)}</div>` : ''}
  </div>`;
}
