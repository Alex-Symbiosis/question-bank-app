window.Views = window.Views || {};

/* ============================================================
   单个题库的错题本
   ============================================================ */
Views.wrong = {
  s: null,
  render(ctx) {
    const bank = Store.banks.get(ctx.params.id);
    if (!bank) {
      return `<div class="card">${emptyState({ title: '题库不存在', desc: '它可能已被删除。', action: { href: '#/', label: '返回题库' } })}</div>`;
    }
    const list = Store.wrong.list(bank.id);
    this.s = { bank, list };

    if (!list.length) {
      return `<div id="wrong-stage"><div class="page-head">
        <div>
          <a class="btn btn-quiet btn-sm" href="#/bank/${bank.id}" style="margin-bottom:10px;margin-left:-8px">${icon('left')} 返回题库</a>
          <h1 class="page-title">错题本</h1>
          <p class="page-sub">${esc(bank.title)} · 答错的题会自动收进这里</p>
        </div>
      </div>
      <div class="card">${emptyState({
        icon: 'check', title: '这个题库暂时没有错题',
        desc: '在答题或考试中答错的题目会自动记录，方便集中重练。',
        action: { href: '#/practice/' + bank.id, label: '去做一组题' },
      })}</div></div>`;
    }

    return `
      <div id="wrong-stage">
      <div class="page-head">
        <div>
          <a class="btn btn-quiet btn-sm" href="#/bank/${bank.id}" style="margin-bottom:10px;margin-left:-8px">${icon('left')} 返回题库</a>
          <h1 class="page-title">错题本</h1>
          <p class="page-sub">${esc(bank.title)} · ${list.length} 道题待复习</p>
        </div>
        <div class="page-head-actions">
          <a class="btn btn-primary" href="#/practice/${bank.id}?wrong=1">${icon('pen')} 开始重练</a>
        </div>
      </div>

      <div class="mistake-list">
        ${list.map((w, i) => {
          const q = Store.questionById(w.qid);
          if (!q) return '';
          return `<div class="mistake-row">
            <div class="cnt"><b>${w.count || 1}</b><span>错 ${w.count || 1} 次</span></div>
            <div class="grow">
              <div class="mtxt">${esc(q.stem)}</div>
              <div class="msub">
                <span class="chip ${typeChip(q.type)}">${typeLabel(q.type)}</span>
                <span style="margin-left:6px">${esc(q.category || '未分类')}</span>
                ${w.lastAnswer ? `<span style="margin-left:6px">上次作答：${esc(w.lastAnswer)}</span>` : ''}
                <span style="margin-left:6px">${relTime(w.lastAt)}</span>
              </div>
            </div>
            <button class="btn btn-quiet btn-sm" data-view="${q.id}">${icon('eye')} 查看</button>
            <button class="btn btn-soft btn-sm" data-redo="${q.id}">重练</button>
            <button class="icon-btn" data-remove="${q.id}" title="移出错题本">${icon('x')}</button>
          </div>`;
        }).join('')}
      </div>

      <div class="guide-card mt-24">
        <div class="g-orb">${icon('brain')}</div>
        <div><h4>关于错题本</h4><p>答对的题会自动移出；也可以在答题时点「查看答案」后自评。考试交卷后，错题由你决定是否加入。</p></div>
      </div>
      </div>`;
  },

  mount() {
    const s = this.s;
    if (!s) return;
    const stage = Q('#wrong-stage');
    stage.addEventListener('click', async (e) => {
      const view = e.target.closest('[data-view]');
      if (view) {
        const q = Store.questionById(view.dataset.view);
        if (q) Views.showQuestion(q, s.bank);
        return;
      }
      const redo = e.target.closest('[data-redo]');
      if (redo) { location.hash = `#/practice/${s.bank.id}?wrong=1&q=${redo.dataset.redo}`; return; }
      const rm = e.target.closest('[data-remove]');
      if (rm) {
        const ok = await confirmModal({ title: '移出错题本？', body: '这道题会从错题本中移除，但不会删除题目本身。', okText: '移出' });
        if (ok) { Store.wrong.remove(rm.dataset.remove); toast('已移出错题本', 'ok'); App.render(); }
      }
    });
  },
};

/* ============================================================
   全局错题本
   ============================================================ */
Views.mistakes = {
  render() {
    const all = Store.wrong.list();
    const banks = Store.banks.list();
    const groups = banks.map((b) => {
      const list = Store.wrong.list(b.id);
      return { bank: b, list };
    }).filter((g) => g.list.length);

    const total = all.length;
    const top = groups.slice().sort((a, b) => b.list.length - a.list.length);

    return `
      <div class="page-head">
        <div>
          <h1 class="page-title">错题本</h1>
          <p class="page-sub">${total ? `共 ${total} 道错题，分布在 ${groups.length} 个题库` : '答错的题目会自动收进这里'}</p>
        </div>
        ${total ? `<div class="page-head-actions"><a class="btn btn-ghost" href="#/">${icon('book')} 我的题库</a></div>` : ''}
      </div>

      ${total ? `
        <div class="stat-strip" style="border-top:0;padding-top:0;margin-top:0">
          <div class="stat-item"><b>${total}</b><span>待复习错题</span></div>
          <div class="stat-item"><b>${groups.length}</b><span>涉及题库</span></div>
          <div class="stat-item"><b>${top[0] ? top[0].list.length : 0}</b><span>最多的一科</span></div>
          <div class="stat-item"><b>${Store.stats.totalAnswered()}</b><span>累计作答</span></div>
        </div>

        <div class="section-head"><h2>按题库复习<small>选一个题库开始重练</small></h2></div>
        <div class="bank-grid">
          ${groups.map((g) => `
            <a class="bank-card" href="#/wrong/${g.bank.id}" style="${accentStyle(g.bank.accent)}">
              <div class="bank-card-top">
                <div class="bank-emoji">${esc(g.bank.monogram || '题库')}</div>
                <div class="grow">
                  <div class="bank-name">${esc(g.bank.title)}</div>
                  <div class="bank-meta">${g.bank.questions.length} 题 · ${esc(g.bank.subject || '未分类')}</div>
                </div>
                <span class="chip bad">${g.list.length} 错题</span>
              </div>
              <div class="bank-desc">${esc(g.list[0] ? g.list[0].qid ? (Store.questionById(g.list[0].qid) || {}).stem || '' : '' : '')}</div>
              <div class="bank-foot">
                <div class="bank-progress">
                  <div class="lbl"><span>最近一次答错</span><span>${relTime(g.list[0].lastAt)}</span></div>
                  <div class="bar"><i style="width:${Math.min(100, g.list.length * 8)}%;background:var(--bad)"></i></div>
                </div>
                <span class="bank-go">${icon('right')}</span>
              </div>
            </a>`).join('')}
        </div>

        <div class="section-head"><h2>最近错题</h2></div>
        <div class="mistake-list">
          ${all.slice(0, 12).map((w) => {
            const q = Store.questionById(w.qid);
            const bank = Store.bankOfQuestion(w.qid);
            if (!q || !bank) return '';
            return `<a class="mistake-row" href="#/practice/${bank.id}?wrong=1&q=${q.id}" style="text-decoration:none">
              <div class="cnt"><b>${w.count || 1}</b><span>错 ${w.count || 1} 次</span></div>
              <div class="grow">
                <div class="mtxt">${esc(q.stem)}</div>
                <div class="msub">${esc(bank.title)} · ${typeLabel(q.type)} · ${relTime(w.lastAt)}</div>
              </div>
              <span class="chip bad">去重练</span>
            </a>`;
          }).join('')}
        </div>
      ` : `<div class="card">${emptyState({
        icon: 'brain', title: '错题本还是空的',
        desc: '做题时答错的题目会自动出现在这里；考试交卷后，也可以手动把题加入错题本。',
        action: { href: '#/', label: '去选一个题库' },
      })}</div>`}`;
  },
  mount() { },
};

/* ============================================================
   AI 调用记录与用量
   ============================================================ */
Views.usage = {
  ERR: {
    UNAUTHORIZED: '密钥无效或没有权限',
    NOT_FOUND: '接口地址或模型名不正确',
    RATE_LIMIT: '频率限制或额度不足',
    SERVER: '服务端异常',
    NETWORK: '网络或跨域失败',
    TIMEOUT: '请求超时',
    EMPTY: '模型未返回内容',
    ABORTED: '已取消',
    BAD_JSON: '返回内容无法解析',
  },

  render() {
    const log = Store.aiUsage.list();
    const t = Store.aiUsage.totals();
    const limit = Store.aiUsage.limit();
    const rate = Store.aiUsage.successRate();
    const fmt = (n) => Number(n || 0).toLocaleString('en-US');

    const row = (r) => `<div class="usage-row ${r.ok ? '' : 'fail'}">
      <span class="u-purpose">${esc(r.purpose || 'AI 调用')}</span>
      <div class="u-body">
        <div class="u-top">${esc(r.model || '未记录模型')}<span class="u-sep">·</span>${formatDate(r.at).slice(5)}</div>
        <div class="u-meta">${r.ok
          ? `耗时 ${(r.ms / 1000).toFixed(1)}s${r.estimated ? ' · token 为估算值' : ''}`
          : `失败 · ${esc(this.ERR[r.error] || r.error || '未知原因')}`}</div>
      </div>
      <div class="u-tokens"><b>${r.tokens ? fmt(r.tokens) : '—'}</b><span>tokens</span></div>
    </div>`;

    return `
      <div class="page-head">
        <div>
          <h1 class="page-title">AI 用量</h1>
          <p class="page-sub">每次调用都会留一条记录：时间、用途、模型、耗时与 token 消耗。</p>
        </div>
        <div class="page-head-actions">
          <button class="btn btn-ghost" id="usage-clear" ${log.length ? '' : 'disabled'}>${icon('trash')} 清空记录</button>
        </div>
      </div>

      <div class="usage-stats">
        <div class="usage-stat"><span>累计调用</span><b>${fmt(t.calls)}</b><small>${t.failed ? `其中失败 ${t.failed} 次` : '暂无失败'}</small></div>
        <div class="usage-stat"><span>累计 tokens</span><b>${fmt(t.tokens)}</b><small>输入 ${fmt(t.prompt)} · 输出 ${fmt(t.completion)}</small></div>
        <div class="usage-stat"><span>成功率</span><b>${rate == null ? '—' : rate + '%'}</b><small>按调用次数统计</small></div>
        <div class="usage-stat"><span>明细保留</span><b>${limit}</b><small>超出后淘汰最旧记录</small></div>
      </div>

      <div class="card usage-panel">
        <div class="between wrap" style="gap:18px">
          <div>
            <h3 class="usage-h">保留上限</h3>
            <p class="usage-sub">只限制明细条数，累计调用与 token 统计不会因此丢失。</p>
          </div>
          <div class="usage-limit" id="usage-limit">
            ${[50, 100, 200, 500].map((n) => `<button type="button" data-limit="${n}" class="${limit === n ? 'active' : ''}">${n}</button>`).join('')}
            <input class="input" id="usage-custom" type="number" min="10" max="1000" step="10" value="${limit}" aria-label="自定义保留条数" />
          </div>
        </div>
      </div>

      <div class="section-head">
        <h2>最近调用<small>${log.length} / ${limit} 条</small></h2>
        <span class="usage-note">标有「估算」表示接口未返回 usage，按文本长度推算</span>
      </div>

      ${log.length ? `<div class="usage-list">${log.map(row).join('')}</div>` : `<div class="card">${emptyState({
        icon: 'chart', title: '还没有调用记录',
        desc: '在答题页点「问 AI」、批改简答题，或导入题库做结构化时，每次调用都会记录在这里。',
        action: { href: '#/', label: '去选一个题库' },
      })}</div>`}`;
  },

  mount() {
    const limitBox = Q('#usage-limit');
    const custom = Q('#usage-custom');
    if (limitBox) {
      limitBox.addEventListener('click', (e) => {
        const b = e.target.closest('[data-limit]');
        if (!b) return;
        Store.aiUsage.setLimit(b.dataset.limit);
        App.render();
      });
    }
    if (custom) {
      custom.onchange = () => {
        const v = clamp(Math.round(+custom.value || 100), 10, 1000);
        custom.value = v;
        Store.aiUsage.setLimit(v);
        App.render();
      };
    }
    const clear = Q('#usage-clear');
    if (clear) {
      clear.onclick = async () => {
        const ok = await confirmModal({
          title: '清空调用记录？',
          body: '调用明细与累计用量统计都会被清零，题库、作答记录和 AI 配置不受影响。',
          okText: '清空',
          danger: true,
        });
        if (!ok) return;
        Store.aiUsage.clear();
        toast('调用记录已清空', 'ok');
        App.render();
      };
    }
  },
};

/* ============================================================
   404
   ============================================================ */
Views.notfound = {
  render() {
    return `<div class="card">${emptyState({
      icon: 'search', title: '页面走丢了',
      desc: '这个地址没有对应的页面，回到题库列表继续吧。',
      action: { href: '#/', label: '回到首页' },
    })}</div>`;
  },
  mount() { },
};
