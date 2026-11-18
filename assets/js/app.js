/* ============================================================
   应用外壳：hash 路由 + AI 抽屉 + 全局状态
   ============================================================ */

window.App = {
  currentView: null,
  currentCtx: null,
  _lastHash: null,

  routes: [
    { re: /^\/$/, name: 'home', view: () => Views.home, nav: 'home' },
    { re: /^\/import$/, name: 'import', view: () => Views.import, nav: 'import' },
    { re: /^\/bank\/([^/]+)$/, name: 'bank', view: () => Views.bank, nav: 'home', keys: ['id'] },
    { re: /^\/practice\/([^/]+)$/, name: 'practice', view: () => Views.practice, nav: 'home', keys: ['id'] },
    { re: /^\/study\/([^/]+)$/, name: 'study', view: () => Views.study, nav: 'home', keys: ['id'] },
    { re: /^\/exam\/setup\/([^/]+)$/, name: 'examSetup', view: () => Views.examSetup, nav: 'home', keys: ['id'] },
    { re: /^\/exam\/pick\/([^/]+)$/, name: 'examPick', view: () => Views.examPick, nav: 'home', keys: ['id'] },
    { re: /^\/exam\/run\/([^/]+)$/, name: 'examRun', view: () => Views.examRun, nav: 'home', keys: ['id'] },
    { re: /^\/exam\/result\/([^/]+)$/, name: 'examResult', view: () => Views.examResult, nav: 'home', keys: ['id'] },
    { re: /^\/wrong\/([^/]+)$/, name: 'wrong', view: () => Views.wrong, nav: 'mistakes', keys: ['id'] },
    { re: /^\/mistakes$/, name: 'mistakes', view: () => Views.mistakes, nav: 'mistakes' },
    { re: /^\/favorites$/, name: 'favorites', view: () => Views.favorites, nav: 'favorites' },
    { re: /^\/papers$/, name: 'papers', view: () => Views.papers, nav: 'papers' },
    { re: /^\/learn$/, name: 'learn', view: () => Views.learn, nav: 'learn' },
    { re: /^\/learn\/import$/, name: 'kbImport', view: () => Views.kbImport, nav: 'learn' },
    { re: /^\/kb\/([^/]+)$/, name: 'kb', view: () => Views.kb, nav: 'learn', keys: ['id'] },
    { re: /^\/kb\/([^/]+)\/focus$/, name: 'kbFocus', view: () => Views.kbFocus, nav: 'learn', keys: ['id'] },
    { re: /^\/papers\/new$/, name: 'paperNew', view: () => Views.paperNew, nav: 'papers' },
    { re: /^\/papers\/([^/]+)$/, name: 'paperDetail', view: () => Views.paperDetail, nav: 'papers', keys: ['id'] },
    { re: /^\/usage$/, name: 'usage', view: () => Views.usage, nav: 'usage' },
    { re: /^\/mentor\/setup$/, name: 'mentorSetup', view: () => Views.mentorSetup, nav: 'settings' },
    { re: /^\/settings$/, name: 'settings', view: () => Views.settings, nav: 'settings' },
  ],

  parse() {
    const raw = (location.hash || '').replace(/^#/, '') || '/';
    const qi = raw.indexOf('?');
    const path = qi >= 0 ? raw.slice(0, qi) : raw;
    const query = {};
    if (qi >= 0) {
      raw.slice(qi + 1).split('&').forEach((pair) => {
        if (!pair) return;
        const [k, v] = pair.split('=');
        query[decodeURIComponent(k)] = decodeURIComponent(v || '');
      });
    }
    return { path, query };
  },

  resolve(path) {
    for (const r of this.routes) {
      const m = path.match(r.re);
      if (!m) continue;
      const params = {};
      (r.keys || []).forEach((k, i) => { params[k] = m[i + 1]; });
      return { route: r, params };
    }
    return null;
  },

  render() {
    const { path, query } = this.parse();
    /* 旧链接：学习数据已并入「我的题库」，落到首页的学习数据区块 */
    if (path === '/stats') {
      location.replace('#/?section=stats');
      return;
    }
    const hit = this.resolve(path);
    const root = Q('#view');
    if (!root) return;
    /* 只有真正换页才播放入场编排；数据刷新、标签重绘不重复触发 */
    const entering = this._lastHash !== location.hash;

    if (this.currentView && Views[this.currentView] && typeof Views[this.currentView].destroy === 'function') {
      try { Views[this.currentView].destroy(); } catch (e) { /* 忽略清理错误 */ }
    }

    if (!hit) {
      this.currentView = 'notfound';
      root.innerHTML = Views.notfound.render({ params: {}, query });
      App.updateChrome('home');
      return;
    }

    const ctx = { params: hit.params, query };
    const view = hit.route.view();
    this.currentView = hit.route.name;
    this.currentCtx = ctx;

    try {
      const html = view.render ? view.render(ctx) : '';
      root.innerHTML = html;
      if (view.mount) view.mount(root, ctx);
      root.classList.remove('route-enter');
      void root.offsetWidth;
      root.classList.add('route-enter');
      if (entering) this.staggerCards(root);
    } catch (err) {
      console.error('[view]', err);
      root.innerHTML = `<div class="card" style="text-align:center;padding:56px">
        <h3 style="font-size:16px;margin-bottom:8px">这个页面渲染出错了</h3>
        <p class="small muted mb-16">${esc(err.message || String(err))}</p>
        <button class="btn btn-primary" onclick="location.reload()">重新加载</button>
      </div>`;
    }

    if (this._lastHash !== location.hash) {
      this._lastHash = location.hash;
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
    this.updateChrome(hit.route.nav);
  },

  /* 栏目卡片入场编排：列表容器的直接子项依次浮起，索引封顶后整批跟上 */
  staggerCards(root) {
    const boxes = QA('.bank-grid, .kb-grid, .grid-3, .paper-grid, .bank-pick-grid, .mistake-list, .kpi-grid, .acc-list, .cat-list, .usage-list, .mode-grid, .review-list', root);
    boxes.forEach((box) => {
      Array.prototype.forEach.call(box.children, (el, i) => {
        el.style.setProperty('--sd', Math.min(i, 4) * 55 + 'ms');
        el.classList.add('stagger-in');
      });
    });
  },

  updateChrome(nav) {
    const configured = AI.isConfigured();
    const api = Store.settings.api();
    const pill = Q('#ai-pill');
    if (pill) {
      pill.classList.toggle('on', configured);
      const t = pill.querySelector('.ai-pill-text');
      if (t) t.textContent = configured ? `AI 已就绪 · ${api.model || '已配置'}` : 'AI 未配置';
      pill.title = configured ? 'AI 设置' : '点这里配置 API Key';
    }
    const total = Store.wrong.total();
    const badge = Q('#nav-wrong-badge');
    if (badge) {
      badge.textContent = total > 99 ? '99+' : String(total);
      badge.hidden = !total;
    }
    if (nav) {
      QA('#main-nav [data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === nav));
      QA('#tabbar [data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === nav));
    }
  },
};

/* ============================================================
   AI 抽屉
   ============================================================ */
window.AIUI = {
  msgs: [],
  ctx: null,
  packet: null,
  busy: false,
  inited: false,

  init() {
    if (this.inited) return;
    this.inited = true;
    const form = Q('#ai-form');
    const text = Q('#ai-text');
    Q('#ai-close').onclick = () => this.close();
    Q('#ai-mask').onclick = () => this.close();
    Q('#ai-algo-btn').onclick = () => this.toggleAlgo();
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = text.value.trim();
      if (!v) return;
      text.value = '';
      text.style.height = 'auto';
      this.send(v);
    });
    text.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        form.dispatchEvent(new Event('submit', { cancelable: true }));
      }
    });
    text.addEventListener('input', () => {
      text.style.height = 'auto';
      text.style.height = Math.min(132, text.scrollHeight) + 'px';
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !Q('#ai-drawer').hidden) this.close();
    });
    Q('#ai-suggest').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b && !this.busy) this.send(b.textContent.trim());
    });
    Q('#ai-body').addEventListener('click', (e) => {
      if (e.target.closest('[data-go-settings]')) {
        this.close();
        location.hash = '#/settings';
      }
      if (e.target.closest('[data-go-import]')) {
        this.close();
        location.hash = '#/import';
      }
    });
    const pill = Q('#ai-pill');
    if (pill) pill.onclick = () => { location.hash = '#/settings'; this.close(); };
  },

  open(opts) {
    opts = opts || {};
    const same = this.ctx && this.ctx.questionId && this.ctx.questionId === (opts.question && opts.question.id)
      && this.ctx.bankId === (opts.bank && opts.bank.id);
    this.ctx = {
      question: opts.question || null,
      questionId: opts.question ? opts.question.id : null,
      bank: opts.bank || null,
      bankId: opts.bank ? opts.bank.id : null,
      userAnswer: opts.userAnswer || '',
    };
    if (!same) { this.msgs = []; this.packet = null; }

    Q('#ai-mask').hidden = false;
    Q('#ai-drawer').hidden = false;
    const algoCfg = (Store.settings.get() || {}).algo || {};
    Q('#algo-panel').hidden = !algoCfg.showPacket;
    this.paintContext();
    this.paintSuggest();
    this.paint();
    this.paintAlgo();
    setTimeout(() => { const t = Q('#ai-text'); if (t) t.focus(); }, 260);
  },

  close() {
    Q('#ai-mask').hidden = true;
    Q('#ai-drawer').hidden = true;
  },

  paintContext() {
    const el = Q('#ai-context');
    const ctx = this.ctx;
    if (!ctx || (!ctx.question && !ctx.bank)) { el.hidden = true; return; }
    el.hidden = false;
    if (ctx.question) {
      const idx = ctx.bank ? ctx.bank.questions.findIndex((q) => q.id === ctx.question.id) : -1;
      el.innerHTML = `<span class="chip ${typeChip(ctx.question.type)}">${typeLabel(ctx.question.type)}</span>
        <span class="ctx-stem">${idx >= 0 ? '第 ' + (idx + 1) + ' 题 · ' : ''}${esc(ctx.question.stem)}</span>`;
      Q('#ai-sub').textContent = ctx.bank ? ctx.bank.title : '结合当前题目讲解';
    } else {
      el.innerHTML = `<span class="chip plain">${esc(ctx.bank ? ctx.bank.title : '通用')}</span><span class="ctx-stem">没有绑定具体题目，可以直接提问</span>`;
      Q('#ai-sub').textContent = ctx.bank ? ctx.bank.title : 'AI 助手';
    }
  },

  suggestions() {
    const q = this.ctx && this.ctx.question;
    if (!q) return ['怎么整理题库？', '简单介绍一下你的能力', '怎么用 AI 批改简答题？'];
    const list = ['讲讲这道题', '给我一点提示'];
    if (q.options && q.options.length) {
      const right = q.type === 'multiple' ? normalizeAnswer('multiple', q.answer) : [normalizeAnswer('single', q.answer)];
      const wrong = q.options.find((o) => !right.includes(o.key));
      if (wrong) list.push(`为什么不是 ${wrong.key}`);
    }
    if (q.type === 'short') list.push('这类简答题怎么组织答案');
    else list.push('这道题的考点是什么');
    return list.slice(0, 4);
  },

  paintSuggest() {
    const el = Q('#ai-suggest');
    el.innerHTML = this.suggestions().map((s) => `<button type="button">${esc(s)}</button>`).join('');
  },

  paint() {
    const body = Q('#ai-body');
    if (!this.msgs.length) {
      body.innerHTML = `<div class="msg ai">
        <div class="bubble">${this.ctx && this.ctx.question
          ? '我会结合这道题的题干、选项、答案和解析来回答。想问什么，直接说就好。'
          : '把题目带进来，我可以逐题讲解、给提示，也可以帮你批改简答题。'}</div>
        <div class="meta">本地算法层会先把问题拆成结构化片段</div>
      </div>`;
      if (!AI.isConfigured()) {
        body.innerHTML += `<div class="msg ai"><div class="bubble err">还没有配置 AI。去设置里填入 API Key、Base URL 和模型名后就能使用了。
          <div style="margin-top:8px"><button class="btn btn-sm btn-ghost" data-go-settings>去设置</button></div></div></div>`;
      }
      return;
    }
    body.innerHTML = this.msgs.map((m) => {
      if (m.role === 'user') {
        return `<div class="msg user"><div class="bubble">${esc(m.content)}</div></div>`;
      }
      const bubble = m.typing
        ? '<span class="typing"><i></i><i></i><i></i></span>'
        : m.error
          ? `<div class="bubble err">${esc(m.content)}${m.needKey ? '<div style="margin-top:8px"><button class="btn btn-sm btn-ghost" data-go-settings>去设置</button></div>' : ''}</div>`
          : `<div class="bubble">${renderMarkdown(m.content)}</div>`;
      return `<div class="msg ai">${bubble}${m.meta ? `<div class="meta">${esc(m.meta)}</div>` : ''}</div>`;
    }).join('');
    body.scrollTop = body.scrollHeight;
  },

  scroll() {
    const body = Q('#ai-body');
    if (body) body.scrollTop = body.scrollHeight;
  },

  async send(text) {
    if (this.busy) return;
    if (!AI.isConfigured()) {
      this.msgs.push({ role: 'assistant', content: '还没有配置 AI。先在设置里填写 Base URL、API Key 和模型名。', error: true, needKey: true });
      this.paint();
      return;
    }
    const history = this.msgs
      .filter((m) => !m.typing && !m.error && !m.local && m.content)
      .map((m) => ({ role: m.role, content: m.content }));

    this.msgs.push({ role: 'user', content: text });
    const ai = { role: 'assistant', content: '', typing: true };
    this.msgs.push(ai);
    this.busy = true;
    Q('#ai-send').disabled = true;
    this.paint();

    const body = Q('#ai-body');
    const last = body.lastElementChild;
    const bubble = last ? last.querySelector('.bubble') : null;

    try {
      const res = await AI.ask({
        text,
        question: this.ctx && this.ctx.question,
        bank: this.ctx && this.ctx.bank,
        userAnswer: this.ctx && this.ctx.userAnswer,
        history,
        onDelta: (piece) => {
          ai.typing = false;
          ai.content += piece;
          if (bubble) bubble.innerHTML = renderMarkdown(ai.content);
          this.scroll();
        },
      });
      ai.content = res.text || ai.content;
      ai.typing = false;
      ai.packet = res.packet;
      ai.meta = `${res.model || '模型'} · ${ai.content.length} 字`
        + (res.log ? ` · ${res.log.tokens} tokens${res.log.estimated ? '（估）' : ''}` : '')
        + (res.packet ? ` · 算法层 ${res.packet.debug.durationMs}ms` : '');
      this.packet = res.packet;
      this.paint();
      if (!Q('#algo-panel').hidden) this.paintAlgo();
    } catch (err) {
      ai.typing = false;
      ai.error = true;
      ai.needKey = err && err.code === 'NO_KEY';
      ai.content = (err && (err.friendly || err.message)) || '请求失败，请稍后再试';
      this.paint();
    } finally {
      this.busy = false;
      Q('#ai-send').disabled = false;
    }
  },

  toggleAlgo() {
    const panel = Q('#algo-panel');
    panel.hidden = !panel.hidden;
    if (!panel.hidden) this.paintAlgo();
  },

  paintAlgo() {
    const panel = Q('#algo-panel');
    if (!panel || panel.hidden) return;
    const p = this.packet;
    if (!p) {
      panel.innerHTML = `<div class="algo-empty">发送一条消息后，这里会显示算法层如何识别意图、抽取片段并拼成 prompt。</div>`;
      return;
    }
    const stages = p.debug.stages.map((s) => `<span class="algo-step ${s.enabled ? '' : 'off'}">${esc(s.name)}</span>`).join('');
    const frags = p.fragments.slice(0, 6).map((f) => `<div class="algo-frag small">
      <div class="k"><span>${esc(f.label)}</span><span>P${f.priority}${f.truncated ? ' · 压缩' : ''}</span></div>
      <div class="v">${esc(f.content)}</div></div>`).join('');
    panel.innerHTML = `
      <div class="algo-head"><strong>${icon('layers')} 算法层分解</strong>
        <span class="small muted">${esc(p.intentLabel)} · ${Math.round(p.confidence * 100)}% · ${p.debug.durationMs}ms</span></div>
      <div class="algo-flow">${stages}</div>
      ${frags}
      <div class="algo-frag" style="margin-top:8px">
        <div class="k"><span>最终 prompt</span><span>${p.debug.promptChars} 字符</span></div>
        <div class="algo-prompt" style="margin-top:6px">${esc(p.debug.promptText || '')}</div>
      </div>`;
  },
};

/* ============================================================
   启动
   ============================================================ */
function bootApp() {
  Store.init();
  const covered = window.Splash ? Splash.init() : false;
  if (!covered) document.body.classList.remove('boot-pending');
  AIUI.init();
  if (window.Mentor) Mentor.init();
  window.addEventListener('hashchange', () => App.render());
  App.render();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootApp);
else bootApp();
