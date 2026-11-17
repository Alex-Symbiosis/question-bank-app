window.Views = window.Views || {};

Views.bank = {
  filter: 'all',
  keyword: '',
  limit: 30,
  render(ctx) {
    const bank = Store.banks.get(ctx.params.id);
    if (!bank) return `<div class="card">${emptyState({ title: '题库不存在', desc: '它可能已被删除。', action: { href: '#/', label: '返回题库列表' } })}</div>`;
    Store.setLastBank(bank.id);
    this.focusQid = ctx.query.q || '';
    if (this.focusQid) { this.filter = 'all'; this.keyword = ''; }
    this.limit = 30;

    const total = bank.questions.length;
    const mastered = Store.stats.masteredCount(bank.id);
    const acc = Store.stats.accuracyOf(bank.id);
    const wrongN = Store.wrong.count(bank.id);
    const pct = total ? Math.round((mastered / total) * 100) : 0;

    /* 续做提示：答题、学题、考试都有未完成的现场 */
    const practiceSaved = Store.progress.get('practice', bank.id);
    const practiceAt = practiceSaved && Array.isArray(practiceSaved.ids) && practiceSaved.ids.length
      && ((Number(practiceSaved.index) || 0) > 0 || Object.keys(practiceSaved.judged || {}).length || Object.keys(practiceSaved.answers || {}).length)
      ? clamp(Number(practiceSaved.index) || 0, 0, practiceSaved.ids.length - 1) + 1 : 0;
    const studySaved = Store.progress.get('study', bank.id);
    const studyAt = studySaved && Number(studySaved.index) ? Math.min(Number(studySaved.index) + 1, total) : 0;
    const activeExam = (() => {
      const e = Store.exams.getActive();
      return e && e.bankId === bank.id && !e.submitted ? e : null;
    })();
    let activeAnswered = 0;
    let activeRemain = 0;
    if (activeExam) {
      activeRemain = activeExam.remainingSec != null
        ? Math.max(0, Math.round(activeExam.remainingSec))
        : Math.max(0, Math.round((activeExam.endsAt - Date.now()) / 1000));
      activeAnswered = activeExam.ids.filter((id) => {
        const q = bank.questions.find((x) => x.id === id);
        return q && isAnswered(q.type, activeExam.answers[id]);
      }).length;
    }

    const typeMap = {};
    bank.questions.forEach((q) => { typeMap[q.type] = (typeMap[q.type] || 0) + 1; });
    const filters = ['all'].concat(Object.keys(TYPE_META).filter((t) => typeMap[t]));
    const chips = filters.map((t) => `<span class="chip mode ${t === 'all' ? 'active' : ''}" data-filter="${t}">${t === 'all' ? '全部 ' + total : typeLabel(t) + ' ' + typeMap[t]}</span>`).join('');

    return `
      <div class="page-head">
        <div>
          <a class="btn btn-quiet btn-sm" href="#/" style="margin-bottom:10px;margin-left:-8px">${icon('left')} 全部题库</a>
          <h1 class="page-title">${esc(bank.title)}</h1>
          <p class="page-sub">${esc(bank.subject || '未分类')} · 共 ${total} 题 · 更新于 ${relTime(bank.updatedAt)}</p>
        </div>
        <div class="page-head-actions">
          <button class="btn btn-ghost btn-sm" id="bank-edit">${icon('edit')} 编辑</button>
          <a class="btn btn-primary" href="#/practice/${bank.id}">${icon('pen')}<span class="lbl">${practiceAt ? '继续答题' : '开始答题'}</span></a>
        </div>
      </div>

      ${activeExam ? `<div class="resume-note exam-resume">
        <span class="grow">有一场考试还没交卷 · 已答 ${activeAnswered} / ${activeExam.ids.length} · 剩余 ${formatTime(activeRemain)}</span>
        <a class="btn btn-primary btn-sm" href="#/exam/run/${bank.id}">继续考试</a>
        <button class="btn btn-quiet btn-sm" id="exam-abandon">放弃</button>
      </div>` : ''}

      ${practiceAt ? `<div class="resume-note">
        <span class="grow">答题模式上次停在第 ${practiceAt} 题，进入后会接着上次的进度。</span>
        <a class="btn btn-quiet btn-sm" href="#/practice/${bank.id}">继续答题</a>
      </div>` : ''}

      <section class="bank-hero" style="${accentStyle(bank.accent)}">
        <div class="bank-hero-inner">
          <div class="bank-emoji" style="background:var(--accent-soft);color:var(--accent-deep);border:none">${esc(bank.monogram || '题库')}</div>
          <div class="grow">
            <p class="desc">${esc(bank.description || '这个题库还没有简介。')}</p>
            <div class="bank-hero-stats">
              <div><b>${total}</b>题目</div>
              <div><b>${mastered}</b>已掌握</div>
              <div><b>${acc == null ? '—' : acc + '%'}</b>正确率</div>
              <div><b>${wrongN}</b>错题</div>
            </div>
            <div class="bank-progress-line">
              <div class="bar"><i style="width:${pct}%"></i></div>
              <span>掌握进度 ${pct}%</span>
            </div>
          </div>
        </div>
      </section>

      <div class="section-head"><h2>选择学习方式<small>随时切换，进度互不影响</small></h2></div>
      <div class="mode-grid">
        <a class="mode-card c-pink" href="#/practice/${bank.id}">
          <span class="orb">${icon('pen')}</span>
          <h3>答题模式</h3>
          <p>逐题作答，选完立刻知道对错；卡住时可以查看答案，或让 AI 讲一讲。</p>
          <span class="go">${practiceAt ? `接着上次 · 第 ${practiceAt} 题` : '开始练习'} ${icon('right')}</span>
        </a>
        <a class="mode-card c-lilac" href="#/study/${bank.id}">
          <span class="orb">${icon('eye')}</span>
          <h3>学题模式</h3>
          <p>题目、正确答案与解析一起呈现，适合先过一遍知识点，再进入练习。</p>
          <span class="go">${studyAt ? `继续上次 · 第 ${studyAt} 题` : '开始学题'} ${icon('right')}</span>
        </a>
        <a class="mode-card c-butter" href="${activeExam ? '#/exam/run/' + bank.id : '#/exam/setup/' + bank.id}">
          <span class="orb">${icon('clock')}</span>
          <h3>考试模式</h3>
          <p>自定义题型数量与时长，随机组卷或手动选题，交卷后自动整理错题。</p>
          <span class="go">${activeExam ? `继续考试 · 剩余 ${formatTime(activeRemain)}` : '设置考试'} ${icon('right')}</span>
        </a>
      </div>

      <div class="section-head">
        <h2>错题本 <small>${wrongN} 题待复习</small></h2>
        ${wrongN ? `<a class="btn btn-ghost btn-sm" href="#/wrong/${bank.id}">开始重练 ${icon('right')}</a>` : ''}
      </div>
      ${wrongN ? `<a class="mistake-row" href="#/wrong/${bank.id}" style="text-decoration:none">
          <div class="cnt"><b>${wrongN}</b><span>错题</span></div>
          <div class="grow">
            <div class="mtxt">这些题曾答错，适合趁热再写一遍</div>
            <div class="msub">进入错题本，可逐题重做或移除</div>
          </div>
          <span class="chip bad">去复习</span>
        </a>` : `<div class="guide-card">
          <div class="g-orb">${icon('check')}</div>
          <div><h4>暂时没有错题</h4><p>答题或考试中答错的题目会自动收进这里，方便集中重练。</p></div>
        </div>`}

      <div class="section-head">
        <h2>题目列表 <small>点击任意题目查看完整解析</small></h2>
        <div class="filter-bar" id="bank-filters">${chips}</div>
      </div>
      <div class="row mb-16" style="gap:10px">
        <div class="input-icon grow">
          ${icon('search')}
          <input class="input" id="bank-search" placeholder="搜索题干、选项或分类…" value="${esc(this.keyword)}" />
        </div>
        <span class="small muted" id="bank-count"></span>
      </div>
      <div class="q-list" id="bank-qlist"></div>
      <div class="mt-16" style="text-align:center" id="bank-more-wrap"></div>
    `;
  },

  mount(root, ctx) {
    const bank = Store.banks.get(ctx.params.id);
    if (!bank) return;
    const self = this;

    const renderList = () => {
      const kw = self.keyword.trim().toLowerCase();
      const items = bank.questions.map((q, i) => ({ q, i })).filter(({ q }) => {
        if (self.filter !== 'all' && q.type !== self.filter) return false;
        if (!kw) return true;
        const hay = [q.stem, q.category, (q.options || []).map((o) => o.text).join(' ')].join(' ').toLowerCase();
        return hay.includes(kw);
      });
      const slice = items.slice(0, self.limit);
      const stats = Store.stats.of(bank.id);
      Q('#bank-qlist').innerHTML = slice.length ? slice.map(({ q, i }) => {
        const st = stats.mastered[q.id];
        const mark = st === true ? 'ok' : st === false ? 'bad' : '';
        return `<div class="q-row" data-qid="${q.id}">
          <span class="idx">${String(i + 1).padStart(2, '0')}</span>
          <span class="chip ${typeChip(q.type)}">${typeLabel(q.type)}</span>
          <span class="txt">${esc(q.stem)}</span>
          <span class="chip plain">${esc(q.category || '未分类')}</span>
          <span class="mark ${mark}"></span>
        </div>`;
      }).join('') : `<div class="card flat" style="text-align:center;padding:36px;color:var(--ink-3);font-size:13px">没有符合条件的题目</div>`;
      Q('#bank-count').textContent = `${items.length} 题`;
      Q('#bank-more-wrap').innerHTML = items.length > self.limit
        ? `<button class="btn btn-ghost btn-sm" id="bank-more">加载更多（还有 ${items.length - self.limit} 题）</button>` : '';
      const more = Q('#bank-more');
      if (more) more.onclick = () => { self.limit += 30; renderList(); };
    };

    renderList();
    QA('#bank-filters .chip').forEach((el) => {
      el.onclick = () => {
        self.filter = el.dataset.filter;
        QA('#bank-filters .chip').forEach((x) => x.classList.toggle('active', x === el));
        renderList();
      };
    });
    /* 从全局搜索定位到某道题：必要时扩容列表，滚动并短暂高亮 */
    if (self.focusQid) {
      const idx = bank.questions.findIndex((q) => q.id === self.focusQid);
      if (idx >= self.limit) { self.limit = idx + 5; renderList(); }
      setTimeout(() => {
        const row = Q(`.q-row[data-qid="${self.focusQid}"]`);
        if (!row) return;
        row.classList.add('is-focus');
        row.scrollIntoView({ block: 'center', behavior: 'smooth' });
        setTimeout(() => row.classList.remove('is-focus'), 2400);
      }, 140);
    }

    const search = Q('#bank-search');
    search.oninput = debounce(() => { self.keyword = search.value; renderList(); }, 180);

    Q('#bank-qlist').addEventListener('click', (e) => {
      const row = e.target.closest('[data-qid]');
      if (!row) return;
      const q = bank.questions.find((x) => x.id === row.dataset.qid);
      if (q) Views.showQuestion(q, bank);
    });

    Q('#bank-edit').onclick = () => self.editBank(bank);

    const abandon = Q('#exam-abandon');
    if (abandon) abandon.onclick = async () => {
      const ok = await confirmModal({
        title: '放弃这场考试？',
        body: '当前作答和剩余时间都会被丢弃，之后需要重新组卷。',
        okText: '放弃考试',
        danger: true,
      });
      if (!ok) return;
      Store.exams.clearActive();
      toast('已放弃这场考试', 'ok');
      App.render();
    };
  },

  editBank(bank) {
    const accents = Object.keys(window.ACCENTS);
    openModal({
      title: '编辑题库信息',
      sub: '只影响显示，不会改动题目内容',
      body: `
        <div class="form-grid">
          <div class="field span2"><label>题库名称</label><input class="input" id="eb-title" value="${esc(bank.title)}" /></div>
          <div class="field"><label>学科 / 来源</label><input class="input" id="eb-subject" value="${esc(bank.subject || '')}" /></div>
          <div class="field"><label>标记（2-4 个字符）</label><input class="input" id="eb-mono" maxlength="4" value="${esc(bank.monogram || '')}" /></div>
          <div class="field span2"><label>简介</label><textarea class="textarea" id="eb-desc" rows="3">${esc(bank.description || '')}</textarea></div>
          <div class="field span2"><label>主题色</label>
            <div class="preset-chips" id="eb-accents">
              ${accents.map((a) => `<button type="button" data-accent="${a}" class="${bank.accent === a ? 'active' : ''}" style="border-color:${bank.accent === a ? '#23262A' : ''}">${a}</button>`).join('')}
            </div>
          </div>
        </div>`,
      actions: [
        { label: '删除题库', kind: 'danger', close: false, onClick: async (m) => {
          m.close();
          const ok = await confirmModal({ title: '删除这个题库？', body: `「${bank.title}」与其错题记录将被一并移除，且无法恢复。建议先导出备份。`, okText: '删除', danger: true });
          if (ok) { Store.banks.remove(bank.id); toast('题库已删除', 'ok'); location.hash = '#/'; }
          return false;
        } },
        { label: '取消', kind: 'ghost' },
        { label: '保存', kind: 'primary', onClick: (m) => {
          let accent = bank.accent;
          QA('#eb-accents [data-accent]').forEach((b) => { if (b.style.borderColor) accent = b.dataset.accent; });
          Store.banks.update(bank.id, {
            title: Q('#eb-title').value.trim() || bank.title,
            subject: Q('#eb-subject').value.trim(),
            monogram: Q('#eb-mono').value.trim() || bank.monogram,
            description: Q('#eb-desc').value.trim(),
            accent,
          });
          toast('已保存', 'ok');
          App.render();
        } },
      ],
      onMount(m) {
        QA('#eb-accents [data-accent]', m.el).forEach((b) => {
          b.onclick = () => {
            QA('#eb-accents [data-accent]', m.el).forEach((x) => { x.style.borderColor = ''; });
            b.style.borderColor = '#23262A';
          };
        });
      },
    });
  },
};

/* 题目详情弹窗（列表与学题共用） */
Views.showQuestion = function (q, bank) {
  const ans = q.type === 'judge'
    ? (normalizeAnswer('judge', q.answer) === 'T' ? '正确' : '错误')
    : (Array.isArray(q.answer) ? q.answer.join('、') : q.answer);
  const options = (q.options || []).map((o) => {
    const isAns = q.type === 'multiple' ? normalizeAnswer('multiple', q.answer).includes(o.key) : o.key === normalizeAnswer('single', q.answer);
    return `<div class="opt ${isAns ? 'is-correct' : ''} locked">
      <span class="key">${o.key}</span><span class="txt">${esc(o.text)}</span>
      ${isAns ? `<span class="marker show" style="color:var(--ok)">${icon('check')}</span>` : ''}
    </div>`;
  }).join('');
  const fav = Store.favorites.has(q.id);
  const meta = q.meta || {};
  openModal({
    title: '题目详情',
    sub: [typeLabel(q.type), q.category, bank ? bank.title : ''].filter(Boolean).join(' · '),
    wide: true,
    body: `
      <div class="q-stem" style="font-size:16px">${esc(q.stem)}</div>
      ${options ? `<div class="options study-options">${options}</div>` : ''}
      <div class="reveal-answer">
        <div class="row"><span class="small muted" style="min-width:64px">正确答案</span><span class="ans-big">${esc(ans || '未填写')}</span></div>
        <div class="row" style="align-items:flex-start"><span class="small muted" style="min-width:64px">解析</span><span class="small" style="line-height:1.95;white-space:pre-wrap">${esc(q.explanation || '暂无解析')}</span></div>
        ${meta.page ? `<div class="row"><span class="small muted" style="min-width:64px">来源</span><span class="small muted">PDF 第 ${meta.page} 页${meta.number ? ' · 原题号 ' + meta.number : ''}</span></div>` : ''}
        ${Array.isArray(meta.origins) && meta.origins.length ? `<div class="row" style="align-items:flex-start"><span class="small muted" style="min-width:64px">合并自</span><span class="small muted">${esc([...new Set(meta.origins.map((o) => o.bankTitle).filter(Boolean))].join('、'))}${meta.origins[0].questionId ? ' · 原题号 ' + esc(String(meta.origins[0].questionId)) : ''}</span></div>` : ''}
      </div>`,
    actions: [
      { label: fav ? '取消收藏' : '收藏', kind: 'quiet', close: false, onClick: () => { Store.favorites.toggle(q.id); toast(fav ? '已取消收藏' : '已收藏', 'ok'); } },
      { label: '问 AI', kind: 'soft', close: false, onClick: () => AIUI.open({ question: q, bank, preset: '讲讲这道题' }) },
      { label: '关闭', kind: 'primary' },
    ],
  });
};
