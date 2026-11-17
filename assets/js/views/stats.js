window.Views = window.Views || {};

/* ============================================================
   学习数据：卡片式布局 + 内联 SVG 趋势图
   ============================================================ */
Views.stats = {
  /* 近 7 天答题量（柱）与正确率（折线），纯手绘 SVG */
  trendSVG(series) {
    const W = 660, H = 178, padL = 34, padR = 14, base = 128, plotH = 100;
    const step = (W - padL - padR) / series.length;
    const bw = Math.min(30, step * 0.42);
    const max = Math.max(1, ...series.map((s) => s.answered));
    const grid = [0, 0.5, 1].map((p) => {
      const y = base - plotH * p;
      return `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="#EFEEE8" stroke-width="1"/>`;
    }).join('');
    const bars = series.map((s, i) => {
      if (!s.answered) return '';
      const h = Math.max(4, (s.answered / max) * plotH);
      const x = padL + step * i + (step - bw) / 2;
      return `<rect x="${x.toFixed(1)}" y="${(base - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="6" fill="#CFDCD2">
        <title>${s.day} · ${s.answered} 题</title></rect>`;
    }).join('');
    const pts = series.map((s, i) => s.accuracy == null ? null : {
      x: padL + step * i + step / 2,
      y: base - (s.accuracy / 100) * plotH,
      s,
    }).filter(Boolean);
    const line = pts.length > 1
      ? `<polyline points="${pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}" fill="none" stroke="#B07E66" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`
      : '';
    const dots = pts.map((p) => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.6" fill="#fff" stroke="#B07E66" stroke-width="2"><title>${p.s.day} · 正确率 ${p.s.accuracy}%</title></circle>`).join('');
    const labels = series.map((s, i) => `<text x="${(padL + step * i + step / 2).toFixed(1)}" y="${base + 22}" text-anchor="middle" font-size="10" fill="#9A9F98">${s.day.slice(5).replace('-', '/')}</text>`).join('');
    return `<svg class="study-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="近 7 天答题量与正确率">
      ${grid}
      <line x1="${padL}" y1="${base}" x2="${W - padR}" y2="${base}" stroke="#E4E3DC" stroke-width="1"/>
      ${bars}${line}${dots}${labels}
    </svg>`;
  },

  emptyTrendSVG() {
    return `<svg class="study-svg" viewBox="0 0 660 178" role="img" aria-label="暂无答题趋势">
      <line x1="34" y1="128" x2="646" y2="128" stroke="#E4E3DC" stroke-width="1" stroke-dasharray="4 6"/>
      <text x="330" y="104" text-anchor="middle" font-size="11" fill="#A6ABA4">做几道题，这里会画出近 7 天的节奏</text>
    </svg>`;
  },

  render() {
    const today = Store.stats.range(1);
    const week = Store.stats.range(7);
    const series = Store.stats.series(7);
    const totalAnswered = Store.stats.totalAnswered();
    const wrongs = Store.wrong.list();
    const favTotal = Store.favorites.list().length;
    const accText = (v) => v == null ? '—' : v + '%';

    const bankRows = Store.banks.list().map((b) => ({
      bank: b,
      answered: Store.stats.answeredOf(b.id),
      acc: Store.stats.accuracyOf(b.id),
    })).filter((r) => r.answered > 0).sort((a, b) => (a.acc == null ? 101 : a.acc) - (b.acc == null ? 101 : b.acc));

    const byType = {};
    const byCat = {};
    wrongs.forEach((w) => {
      const q = Store.questionById(w.qid);
      if (!q) return;
      byType[q.type] = (byType[q.type] || 0) + 1;
      const cat = q.category || '未分类';
      byCat[cat] = (byCat[cat] || 0) + 1;
    });
    const topTypes = Object.keys(byType).map((t) => ({ type: t, n: byType[t] })).sort((a, b) => b.n - a.n).slice(0, 4);
    const topCats = Object.keys(byCat).map((c) => ({ cat: c, n: byCat[c] })).sort((a, b) => b.n - a.n).slice(0, 5);

    let tip;
    if (!totalAnswered) {
      tip = '先做一组题，学习数据会从今天开始积累；收藏的题也可以直接练一组。';
    } else if (!today.answered) {
      tip = '今天还没有开始，花十分钟做一组题，学习数据会立刻更新。';
    } else if (week.accuracy !== null && week.accuracy < 60) {
      tip = `近 7 天正确率 ${week.accuracy}%，建议先去错题本重做${topTypes[0] ? '「' + typeLabel(topTypes[0].type) + '」' : '最近'}错题，把基础分拿稳。`;
    } else if (topCats[0]) {
      tip = `错误最集中在「${topCats[0].cat}」，建议回看这个知识点，再用收藏的题做一次小测。`;
    } else if (favTotal) {
      tip = `收藏夹里还有 ${favTotal} 道题没练，可以做一组收藏专项，把零散的知识点串起来。`;
    } else {
      tip = '节奏不错，保持每天一小组，答错的题当天在错题本里清掉。';
    }

    const empty = !totalAnswered;
    const kpi = (label, num, sub, tone) => `<div class="kpi-card ${tone || ''}">
      <span class="kpi-label">${label}</span>
      <b class="kpi-num">${num}</b>
      <span class="kpi-sub">${sub}</span>
    </div>`;

    return `
      <div class="page-head">
        <div>
          <h1 class="page-title">学习数据</h1>
          <p class="page-sub">答题量、正确率与错题分布，都来自你本地的作答记录。</p>
        </div>
        <div class="page-head-actions">
          <a class="btn btn-ghost" href="#/learn">${icon('layers')} 学习频道</a>
        </div>
      </div>
      ${learnTabs('stats')}

      <div class="kpi-grid">
        ${kpi('今日答题', today.answered, `正确率 ${accText(today.accuracy)}`)}
        ${kpi('近 7 天', week.answered, `正确率 ${accText(week.accuracy)}`)}
        ${kpi('累计作答', totalAnswered, `待复习错题 ${wrongs.length} 道`, 'kpi-soft')}
      </div>

      <div class="study-card">
        <div class="study-head">
          <h3>近 7 天答题趋势</h3>
          <div class="study-legend"><span><i class="lg-bar"></i>答题量</span><span><i class="lg-line"></i>正确率</span></div>
        </div>
        ${empty ? this.emptyTrendSVG() : this.trendSVG(series)}
        ${!empty && week.accuracy == null ? '<p class="study-note">这 7 天的正确率明细还在积累，再答几题就会出现在折线上。</p>' : ''}
      </div>

      <div class="study-card">
        <div class="study-head">
          <h3>按题库正确率</h3>
          <span class="study-hint">从低到高，先看短板</span>
        </div>
        ${bankRows.length ? `<div class="acc-list">
          ${bankRows.map((r) => `<a class="acc-row" href="#/bank/${r.bank.id}">
            <div class="acc-name">${esc(r.bank.title)}</div>
            <div class="acc-bar"><i style="width:${r.acc == null ? 0 : Math.max(3, r.acc)}%;background:${r.acc != null && r.acc < 60 ? 'var(--bad)' : 'var(--accent)'}"></i></div>
            <div class="acc-num"><b>${accText(r.acc)}</b><span>${r.answered} 题</span></div>
          </a>`).join('')}
        </div>` : `<div class="study-empty">
          <p>还没有分题库的作答记录，做一组题后就能看到各题库的强弱对比。</p>
          <a class="btn btn-ghost btn-sm" href="#/">挑一个题库开始</a>
        </div>`}
      </div>

      <div class="study-split">
        <div class="study-card">
          <div class="study-head"><h3>错误题型</h3><span class="study-hint">${wrongs.length ? '按错题数排序' : '暂无错题'}</span></div>
          ${topTypes.length ? `<div class="tag-cloud">${topTypes.map((t) => `<a class="insight-tag" href="#/mistakes"><b>${typeLabel(t.type)}</b><span>${t.n} 题</span></a>`).join('')}</div>`
            : `<div class="study-empty"><p>错题本是空的，暂时看不出题型短板。</p><a class="btn btn-ghost btn-sm" href="#/">去做几道题</a></div>`}
        </div>
        <div class="study-card">
          <div class="study-head"><h3>薄弱知识点</h3><span class="study-hint">${wrongs.length ? '按错题数排序' : '暂无错题'}</span></div>
          ${topCats.length ? `<div class="cat-list">${topCats.map((c) => `<a class="cat-row" href="#/mistakes"><span>${esc(c.cat)}</span><b>${c.n}</b></a>`).join('')}</div>`
            : `<div class="study-empty"><p>答错的题会自动按知识点归到这里。</p><a class="btn btn-ghost btn-sm" href="#/">去做几道题</a></div>`}
        </div>
      </div>

      <div class="study-split">
        <a class="study-card study-link" href="#/mistakes">
          <div class="study-head"><h3>${icon('brain')} 错题本</h3><span class="ov-go">${icon('right')}</span></div>
          <b class="kpi-num">${wrongs.length}</b>
          <p class="study-hint">${wrongs.length ? '待复习，点开按题库重练' : '暂无错题，保持住'}</p>
        </a>
        <a class="study-card study-link" href="#/favorites">
          <div class="study-head"><h3>${icon('star')} 收藏夹</h3><span class="ov-go">${icon('right')}</span></div>
          <b class="kpi-num">${favTotal}</b>
          <p class="study-hint">${favTotal ? '可单题练，也可整组带入组卷' : '还没有收藏题目'}</p>
        </a>
      </div>

      <div class="guide-card mt-24">
        <div class="g-orb">${icon('sparkle')}</div>
        <div><h4>下一步建议</h4><p>${esc(tip)}</p></div>
      </div>`;
  },

  mount() { },
};
