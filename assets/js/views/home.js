window.Views = window.Views || {};

Views.home = {
  render() {
    const banks = Store.banks.list().slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    const totalQ = banks.reduce((s, b) => s + b.questions.length, 0);
    const wrongTotal = Store.wrong.total();
    const today = Store.stats.todayCount();
    const lastBank = banks.find((b) => b.id === Store.getState().lastBankId) || banks[0];

    const typeCounts = (bank) => {
      const m = {};
      bank.questions.forEach((q) => { m[q.type] = (m[q.type] || 0) + 1; });
      return Object.keys(m).slice(0, 3).map((t) => `<span class="chip">${typeLabel(t)} ${m[t]}</span>`).join('');
    };

    const cards = banks.map((b) => {
      const mastered = Store.stats.masteredCount(b.id);
      const pct = b.questions.length ? Math.round((mastered / b.questions.length) * 100) : 0;
      return `<a class="bank-card" href="#/bank/${b.id}" style="${accentStyle(b.accent)}">
        <div class="bank-card-top">
          <div class="bank-emoji">${esc(b.monogram || '题库')}</div>
          <div class="grow">
            <div class="bank-name">${esc(b.title)}</div>
            <div class="bank-meta">${b.questions.length} 题 · ${esc(b.subject || '未分类')}</div>
          </div>
        </div>
        <div class="bank-desc">${esc(b.description || '暂无简介')}</div>
        <div class="bank-tags">${typeCounts(b)}</div>
        <div class="bank-foot">
          <div class="bank-progress">
            <div class="lbl"><span>掌握进度</span><span>${pct}%</span></div>
            <div class="bar"><i style="width:${pct}%"></i></div>
          </div>
          <span class="bank-go">${icon('right')}</span>
        </div>
      </a>`;
    }).join('');

    return `
      <section class="hero">
        <div class="hero-inner">
          <div class="hero-text">
            <div class="hero-greet">LOCAL · AI ASSISTED</div>
            <h1 class="hero-title">把一道题，<em>真正弄懂</em>。</h1>
            <p class="hero-desc">导入 PDF 题库，按答题、学题或考试的方式推进。题目、进度与 AI 配置都保存在本机，随时打开就能继续。</p>
            <div class="hero-actions">
              <a class="btn btn-primary" href="#/import">${icon('upload')}<span class="lbl">导入题库</span></a>
              ${lastBank ? `<a class="btn btn-ghost" href="#/bank/${lastBank.id}">继续上次 · ${esc(lastBank.title)}</a>` : ''}
            </div>
          </div>
          <div class="hero-mascot" aria-hidden="true">
            <svg viewBox="0 0 160 160" fill="none">
              <circle cx="80" cy="80" r="58" stroke="#E3E6DE" stroke-width="1"/>
              <circle cx="80" cy="80" r="41" stroke="#E8EAE3" stroke-width="1"/>
              <circle cx="80" cy="80" r="7" fill="#5C7D6C" opacity=".75"/>
              <circle cx="80" cy="22" r="3" fill="#B07E66" opacity=".7"/>
              <circle cx="138" cy="80" r="2.6" fill="#A98443" opacity=".7"/>
              <circle cx="80" cy="138" r="2.6" fill="#5E7C9B" opacity=".6"/>
              <path d="M80 80 L118 48" stroke="#D4DACF" stroke-width="1"/>
              <rect x="58" y="96" width="44" height="30" rx="4" stroke="#D9DED4"/>
              <path d="M66 105h20M66 112h12" stroke="#D9DED4" stroke-width="1.4" stroke-linecap="round"/>
            </svg>
            <span class="hero-sticker">本地存储</span>
          </div>
        </div>
        <div class="stat-strip">
          <div class="stat-item"><b>${banks.length}</b><span>题库</span></div>
          <div class="stat-item"><b>${totalQ}</b><span>题目总数</span></div>
          <div class="stat-item"><b>${wrongTotal}</b><span>待复习错题</span></div>
          <div class="stat-item"><b>${today}</b><span>今日作答</span></div>
        </div>
      </section>

      <div class="section-head home-head">
        <h2>我的题库<small>${banks.length} 个</small></h2>
        ${banks.length ? `<div class="home-tools">
          ${banks.length >= 2 ? `<button class="btn btn-quiet btn-sm" id="bank-merge">${icon('layers')} 合并题库</button>` : ''}
          <a class="btn btn-quiet btn-sm" href="#/import">${icon('plus')} 新建</a>
          <div class="home-search" id="home-search">
            ${icon('search')}
            <input id="home-search-input" placeholder="搜索题库、题干或知识点…" autocomplete="off" aria-label="搜索题库或题目" />
            <button class="search-clear" id="home-search-clear" type="button" title="清除" hidden>${icon('x')}</button>
            <kbd>/</kbd>
            <div class="search-pop" id="search-pop" hidden></div>
          </div>
        </div>` : ''}
      </div>

      ${banks.length ? `<div class="bank-grid">
        ${cards}
        <a class="new-bank-card" href="#/import">
          <div>
            <div class="plus-orb">${icon('plus')}</div>
            <strong>导入新的题库</strong><br/>
            <span>上传 PDF，自动识别题目</span>
          </div>
        </a>
      </div>` : emptyState({
        icon: 'book',
        title: '还没有题库',
        desc: '上传一份 PDF 题库，或者先看看内置的示例题库。识别后的题目可以直接进入答题、学题与考试模式。',
        action: { href: '#/import', label: '导入第一份题库' },
      })}

      <section class="home-stats" id="stats-block">
        <div class="section-head"><h2>学习数据<small>近 7 天</small></h2></div>
        ${Views.stats.bodyHTML()}
      </section>

      <div class="section-head"><h2>使用方式</h2></div>
      <div class="grid-3">
        <div class="guide-card">
          <div class="g-orb">${icon('upload')}</div>
          <div><h4>导入并校对</h4><p>PDF 自动拆成题干、选项、答案与解析，可逐题修改。</p></div>
        </div>
        <div class="guide-card">
          <div class="g-orb">${icon('pen')}</div>
          <div><h4>三种学习方式</h4><p>答题即时反馈，学题直看解析，考试限时组卷。</p></div>
        </div>
        <div class="guide-card">
          <div class="g-orb">${icon('sparkle')}</div>
          <div><h4>随时问 AI</h4><p>用自己的 API Key，让 AI 讲解、给提示或批改简答。</p></div>
        </div>
      </div>`;
  },
  mount(root, ctx) {
    const btn = Q('#bank-merge');
    if (btn) btn.onclick = () => this.openMerge();
    this.bindSearch();
    /* 旧链接 #/stats 会重定向到 #/?section=stats，落到学习数据区块 */
    if (ctx && ctx.query && ctx.query.section === 'stats') {
      const block = Q('#stats-block');
      if (block) setTimeout(() => block.scrollIntoView({ block: 'start', behavior: 'auto' }), 80);
    }
  },

  destroy() {
    if (this._searchDocKey) document.removeEventListener('keydown', this._searchDocKey);
    if (this._searchDocClick) document.removeEventListener('mousedown', this._searchDocClick);
    this._searchDocKey = null;
    this._searchDocClick = null;
  },

  bindSearch() {
    const wrap = Q('#home-search');
    const input = Q('#home-search-input');
    const pop = Q('#search-pop');
    const clear = Q('#home-search-clear');
    if (!wrap || !input || !pop) return;
    let active = -1;

    const close = () => { pop.hidden = true; active = -1; };
    const syncClear = () => { if (clear) clear.hidden = !input.value; };

    const draw = () => {
      const raw = input.value.trim();
      const kw = raw.toLowerCase();
      if (!kw) { close(); return; }
      const banks = Store.banks.list();
      const bankHits = banks.filter((b) =>
        [b.title, b.subject, b.description].join(' ').toLowerCase().includes(kw)).slice(0, 4);
      const qHits = [];
      banks.forEach((b) => {
        if (qHits.length >= 10) return;
        b.questions.forEach((q) => {
          if (qHits.length >= 10) return;
          const hay = [q.stem, q.category, (q.options || []).map((o) => o.text).join(' '), q.explanation || ''].join(' ').toLowerCase();
          if (hay.includes(kw)) qHits.push({ q, bank: b });
        });
      });
      if (!bankHits.length && !qHits.length) {
        pop.innerHTML = `<div class="search-empty">没有找到「${esc(raw)}」</div>`;
        pop.hidden = false;
        return;
      }
      pop.innerHTML = `
        ${bankHits.length ? `<div class="search-sec">题库</div>${bankHits.map((b) => `<a class="search-item" href="#/bank/${b.id}" data-item>
          <span class="si-ico">${icon('book')}</span>
          <span class="si-main"><b>${esc(b.title)}</b><small>${b.questions.length} 题 · ${esc(b.subject || '未分类')}</small></span>
          <span class="si-kind">题库</span>
        </a>`).join('')}` : ''}
        ${qHits.length ? `<div class="search-sec">题目</div>${qHits.map(({ q, bank }) => `<a class="search-item" href="#/bank/${bank.id}?q=${q.id}" data-item>
          <span class="si-ico">${icon('search')}</span>
          <span class="si-main"><b>${esc(q.stem)}</b><small>${esc(bank.title)} · ${typeLabel(q.type)}</small></span>
          <span class="si-kind">题目</span>
        </a>`).join('')}` : ''}`;
      pop.hidden = false;
      active = -1;
    };

    input.addEventListener('input', () => { syncClear(); });
    input.addEventListener('input', debounce(draw, 120));
    input.addEventListener('focus', draw);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { input.value = ''; syncClear(); close(); input.blur(); return; }
      const items = QA('[data-item]', pop);
      if (!items.length) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        active = e.key === 'ArrowDown' ? (active + 1) % items.length : (active - 1 + items.length) % items.length;
        items.forEach((el, i) => el.classList.toggle('active', i === active));
        items[active].scrollIntoView({ block: 'nearest' });
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        (items[active] || items[0]).click();
      }
    });
    pop.addEventListener('click', () => { input.value = ''; syncClear(); close(); });
    if (clear) clear.onclick = () => {
      input.value = '';
      syncClear();
      close();
      input.focus();
    };

    this._searchDocKey = (e) => {
      const el = document.activeElement;
      const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
      if (!typing && (e.key === '/' || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k'))) {
        e.preventDefault();
        input.focus();
        input.select();
      } else if (e.key === 'Escape') {
        input.value = '';
        syncClear();
        close();
        if (document.activeElement === input) input.blur();
      }
    };
    this._searchDocClick = (e) => { if (!wrap.contains(e.target)) close(); };
    document.addEventListener('keydown', this._searchDocKey);
    document.addEventListener('mousedown', this._searchDocClick);
  },

  openMerge() {
    const banks = Store.banks.list().slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    if (banks.length < 2) { toast('至少需要两个题库才能合并', 'bad'); return; }
    let titleTouched = false;
    const checkedIds = () => QA('#merge-pick input:checked').map((x) => x.value);

    openModal({
      title: '合并题库',
      sub: '选择两个或更多题库，合并成一个新题库；原题库不会改动。',
      wide: true,
      body: `
        <div class="merge-pick" id="merge-pick">
          ${banks.map((b) => `<label class="merge-pick-item" data-id="${b.id}">
            <input type="checkbox" value="${b.id}" />
            <span class="mp-main"><strong>${esc(b.title)}</strong><small>${b.questions.length} 题 · ${esc(b.subject || '未分类')}</small></span>
          </label>`).join('')}
        </div>
        <div class="form-grid mt-16">
          <div class="field span2">
            <label>新题库名称</label>
            <input class="input" id="merge-title" placeholder="合并后的题库名称" />
          </div>
          <div class="field span2">
            <label class="switch"><input type="checkbox" id="merge-dedupe" checked /><span class="track"></span>去掉重复题（题干相同或高度相似）</label>
          </div>
        </div>
        <p class="small muted" id="merge-hint" style="line-height:1.9">至少选择两个题库。</p>`,
      actions: [
        { label: '取消', kind: 'quiet' },
        {
          label: '合并', kind: 'primary', onClick: () => {
            const ids = checkedIds();
            if (ids.length < 2) { toast('至少选择两个题库', 'bad'); return false; }
            const title = (Q('#merge-title').value || '').trim();
            const dedupe = Q('#merge-dedupe').checked;
            const res = Store.banks.merge(ids, { title, dedupe });
            if (!res) { toast('合并失败', 'bad'); return false; }
            toast(`已生成「${res.bank.title}」，共 ${res.kept} 题${res.duplicates ? `，去重 ${res.duplicates} 道` : ''}`, 'ok', 3600);
            App.render();
            window.scrollTo({ top: 0, behavior: 'smooth' });
            return true;
          },
        },
      ],
      onMount() {
        const pick = Q('#merge-pick');
        const titleEl = Q('#merge-title');
        const dedupeEl = Q('#merge-dedupe');
        const hint = Q('#merge-hint');
        const autoTitle = (ids) => {
          const selected = banks.filter((b) => ids.includes(b.id));
          return selected.length
            ? selected.map((b) => b.title).slice(0, 2).join(' + ') + (selected.length > 2 ? ' 等' : '') + ' 合并版'
            : '';
        };
        const update = () => {
          const ids = checkedIds();
          QA('#merge-pick .merge-pick-item').forEach((el) => el.classList.toggle('on', ids.includes(el.dataset.id)));
          if (!titleTouched) titleEl.value = autoTitle(ids);
          if (ids.length < 2) { hint.textContent = '至少选择两个题库。'; return; }
          const st = Store.banks.mergeStats(ids, dedupeEl.checked);
          hint.textContent = `将合并 ${ids.length} 个题库，共 ${st.total} 题；${dedupeEl.checked
            ? `去重后 ${st.kept} 题，合并 ${st.duplicates} 道重复题`
            : '不去重，全部保留'}。`;
        };
        pick.addEventListener('change', update);
        dedupeEl.addEventListener('change', update);
        titleEl.addEventListener('input', () => { titleTouched = true; });
        update();
      },
    });
  },
};
