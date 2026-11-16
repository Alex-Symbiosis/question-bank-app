/* ============================================================
   AI 带教：侧边常驻老师
   - 仅在用户主动申请并启用后出现
   - 主动开口：每次打开最多一条，按频率设置
   - 静音为本次会话级，重新打开恢复
   ============================================================ */
(function () {
  const short = (s, n) => {
    const t = String(s || '').replace(/\s+/g, ' ').trim();
    return t.length > n ? t.slice(0, n) + '…' : t;
  };
  const STYLE_LABEL = { coach: '督导型', explain: '讲解型', companion: '陪伴型' };
  const TONE_LABEL = { gentle: '温和', strict: '严格', brisk: '干脆' };
  const FREQ_LABEL = { open: '每次打开', daily: '每天一次', off: '不主动' };

  window.Mentor = {
    inited: false,
    msgs: [],
    actions: [],
    busy: false,
    greeting: false,
    openState: false,
    muted: false,          // 会话级静音，刷新后恢复
    greetedThisOpen: false,

    init() {
      if (this.inited) return;
      this.inited = true;
      const root = Q('#mentor-root');
      if (!root) return;
      root.addEventListener('click', (e) => this.onClick(e));
      root.addEventListener('submit', (e) => this.onSubmit(e));
      this.refresh();
      setTimeout(() => this.maybeGreet(), 1000);
    },

    refresh() {
      const root = Q('#mentor-root');
      if (!root) return;
      const m = Store.mentor.get();
      if (!Store.mentor.isActive()) {
        root.innerHTML = '';
        root.hidden = true;
        this.msgs = [];
        this.actions = [];
        this.openState = false;
        return;
      }
      root.hidden = false;
      if (!this.actions.length) this.actions = this.suggestActions();
      root.innerHTML = this.html();
      this.paintBody();
    },

    html() {
      const m = Store.mentor.get();
      const c = m.config;
      const initial = (c.name || '砚').slice(0, 1);
      return `<div class="mentor-dock" id="mentor-dock" data-open="${this.openState ? 'true' : 'false'}">
        <button type="button" class="mentor-launcher" data-mentor-toggle aria-label="打开 AI 带教">
          <span class="mentor-avatar">${esc(initial)}</span>
          <span class="mentor-launcher-text">${esc(c.name)}<small>AI 带教</small></span>
        </button>
        <section class="mentor-panel" aria-label="AI 带教">
          <header class="mentor-head">
            <div class="mentor-id">
              <span class="mentor-avatar sm">${esc(initial)}</span>
              <div>
                <strong>${esc(c.name)}</strong>
                <small>AI 带教 · ${esc(STYLE_LABEL[c.style] || '督导型')} · ${esc(TONE_LABEL[c.tone] || '温和')}${this.muted ? ' · 已静音' : ''}</small>
              </div>
            </div>
            <div class="mentor-head-acts">
              <button type="button" class="mentor-mini ${this.muted ? 'on' : ''}" data-mentor-mute title="${this.muted ? '取消静音' : '静音：本次打开不再主动发消息'}">${this.muted ? '已静音' : '静音'}</button>
              <a class="icon-btn" href="#/mentor/setup" title="带教设置">${icon('settings')}</a>
              <button type="button" class="icon-btn" data-mentor-close title="收起">${icon('x')}</button>
            </div>
          </header>
          <div class="mentor-body" id="mentor-body"></div>
          <form class="mentor-form" id="mentor-form">
            <input class="input" id="mentor-input" maxlength="300" autocomplete="off"
              placeholder="${this.muted ? '已静音，仍可主动找我聊…' : '跟带教说点什么…'}" />
            <button class="send-btn" type="submit" aria-label="发送">${icon('send')}</button>
          </form>
          <div class="mentor-foot">调用计入「AI 用量」 · 安静模式可在设置里调整</div>
        </section>
      </div>`;
    },

    msgHTML(m) {
      const isAI = m.role === 'assistant';
      const initial = (Store.mentor.config().name || '砚').slice(0, 1);
      if (!isAI) {
        return `<div class="mentor-msg user"><div class="mentor-bubble">${esc(m.content)}</div></div>`;
      }
      let inner;
      if (m.typing) inner = '<span class="fc-typing"><i></i><i></i><i></i></span>';
      else if (m.error) inner = `<span class="mentor-error">${esc(m.content)}</span>`;
      else inner = renderMarkdown(m.content || '');
      if (m.action) {
        inner += `<a class="mentor-inline-link" href="${esc(m.action.href)}">${esc(m.action.label)}${icon('right')}</a>`;
      }
      return `<div class="mentor-msg ai"><span class="mentor-avatar sm">${esc(initial)}</span>
        <div class="mentor-bubble-wrap"><div class="mentor-bubble">${inner}</div>
        ${m.note ? `<div class="mentor-note">${esc(m.note)}</div>` : ''}</div></div>`;
    },

    paintBody() {
      const body = Q('#mentor-body');
      if (!body) return;
      body.innerHTML = (this.msgs.length
        ? this.msgs.map((m) => this.msgHTML(m)).join('')
        : `<div class="mentor-empty">我是你的带教。可以先从${esc(this.firstSuggestion())}开始。</div>`)
        + this.quickHTML();
      body.scrollTop = body.scrollHeight;
    },

    quickHTML() {
      if (!this.actions.length) return '';
      return `<div class="mentor-quick">${this.actions.map((a) =>
        `<button type="button" class="mentor-chip" data-mentor-act="${a.kind}">${esc(a.label)}</button>`).join('')}</div>`;
    },

    firstSuggestion() {
      const c = this.context();
      if (c.topWrong.length) return `「${short(c.topWrong[0].stem, 12)}」这道反复错的题`;
      if (c.recentItem) return `「${short(c.recentItem.title, 12)}」这条知识点`;
      if (c.banks.some((b) => b.count)) return '最近做过的题';
      return '把最近在学的东西讲给我听';
    },

    /* ---------- 学习记录上下文 ---------- */
    context() {
      const st = Store.getState();
      const banks = Store.banks.list().map((b) => ({
        title: b.title,
        count: b.questions.length,
        accuracy: Store.stats.accuracyOf(b.id),
      }));
      const topics = Store.kbs.list().map((k) => ({
        title: k.title,
        count: (k.items || []).length,
        seen: (k.items || []).filter((it) => (Number(it.views) || 0) > 0).length,
      }));
      const recent = [];
      Store.kbs.list().forEach((k) => (k.items || []).forEach((it) => {
        if (it.lastViewedAt) recent.push(Object.assign({ kbTitle: k.title }, it));
      }));
      recent.sort((a, b) => (b.lastViewedAt || 0) - (a.lastViewedAt || 0));

      const topWrong = Store.wrong.list()
        .slice()
        .sort((a, b) => (b.count || 0) - (a.count || 0))
        .slice(0, 3)
        .map((w) => {
          const q = Store.questionById(w.qid);
          if (!q) return null;
          const bank = Store.bankOfQuestion(w.qid);
          return {
            qid: w.qid, count: w.count || 1, stem: q.stem, type: q.type,
            answer: displayAnswer(q), explanation: q.explanation || '',
            bank: bank ? bank.title : '',
          };
        })
        .filter(Boolean);

      const lastExam = (st.exams || [])[0] || null;
      return {
        profile: Store.profile.text(),
        today: Store.stats.todayCount(),
        total: Store.stats.totalAnswered(),
        correct: Store.stats.totalCorrect(),
        accuracy: Store.stats.totalAnswered()
          ? Math.round((Store.stats.totalCorrect() / Store.stats.totalAnswered()) * 100)
          : null,
        banks, topics,
        recentItem: recent[0] || null,
        recentItems: recent.slice(0, 3),
        topWrong,
        wrongTotal: Store.wrong.total(),
        lastExam,
      };
    },

    contextText() {
      const c = this.context();
      const lines = [];
      if (c.profile) lines.push('学生画像：' + c.profile);
      lines.push(`答题进度：今天 ${c.today} 道，累计 ${c.total} 道${c.accuracy != null ? `，正确率 ${c.accuracy}%` : ''}`);
      const usedBanks = c.banks.filter((b) => b.count).slice(0, 3);
      if (usedBanks.length) {
        lines.push('题库：' + usedBanks.map((b) => `${b.title}（${b.count} 题${b.accuracy != null ? '，正确率 ' + b.accuracy + '%' : ''}）`).join('；'));
      }
      const usedTopics = c.topics.filter((t) => t.count).slice(0, 3);
      if (usedTopics.length) {
        lines.push('知识库：' + usedTopics.map((t) => `${t.title}（${t.count} 条，已读 ${t.seen} 条）`).join('；'));
      }
      if (c.recentItem) {
        lines.push(`最近在看的知识点：《${c.recentItem.kbTitle}》· ${c.recentItem.title}（已看 ${c.recentItem.views} 次）`);
      }
      if (c.topWrong.length) {
        lines.push('反复错的题：' + c.topWrong.map((w) =>
          `${short(w.stem, 40)}（错 ${w.count} 次${w.bank ? '，' + w.bank : ''}）`).join('；'));
      } else if (c.wrongTotal) {
        lines.push(`错题本里有 ${c.wrongTotal} 道待复习的题`);
      }
      if (c.lastExam) lines.push(`最近一次考试：${c.lastExam.bankTitle || '考试'} ${c.lastExam.score || 0} 分`);
      return lines.join('\n').slice(0, 1400);
    },

    suggestActions() {
      const c = this.context();
      const acts = [];
      const weak = c.topWrong[0];
      if (weak) acts.push({ kind: 'quiz', label: `就「${short(weak.stem, 10)}」练一道` });
      else if (c.recentItem) acts.push({ kind: 'quiz', label: `就「${short(c.recentItem.title, 10)}」练一道` });
      if (c.topWrong.length || c.banks.some((b) => b.count)) acts.push({ kind: 'paper', label: '组一套小卷' });
      acts.push({ kind: 'extend', label: '拓展一点' });
      if (c.total > 0) acts.push({ kind: 'recap', label: '说说我的进度' });
      return acts.slice(0, 3);
    },

    /* ---------- 主动开口 ---------- */
    async maybeGreet(force) {
      if (this.greeting || this.busy) return;
      if (!Store.mentor.isActive() || this.muted) return;
      if (!force && this.greetedThisOpen) return;
      const m = Store.mentor.get();
      const cfg = m.config;
      if (!force) {
        if (cfg.frequency === 'off') return;
        if (cfg.frequency === 'daily' && m.lastGreetDay === todayKey()) return;
      }
      this.greetedThisOpen = true;

      if (!AI.isConfigured()) {
        this.msgs.push({
          role: 'assistant',
          content: `我是${cfg.name}。先去「设置 · AI 接入」填好 Base URL、API Key 和模型，我就能读你的学习记录，正式开工。`,
          note: 'AI 未配置，本次没有产生调用',
        });
        this.openPanel();
        this.paintBody();
        return;
      }

      this.greeting = true;
      const msg = { role: 'assistant', content: '', typing: true };
      this.msgs.push(msg);
      this.openPanel();
      this.paintBody();
      try {
        const res = await AI.mentorGreeting({ config: cfg, context: this.contextText() });
        msg.typing = false;
        msg.content = res.text;
        Store.mentor.markGreet();
        this.actions = this.suggestActions();
      } catch (e) {
        msg.typing = false;
        msg.error = true;
        msg.content = (e && (e.friendly || e.message)) || '暂时没法开口，稍后再试。';
      } finally {
        this.greeting = false;
        this.paintBody();
      }
    },

    /* ---------- 交互 ---------- */
    onClick(e) {
      if (e.target.closest('[data-mentor-toggle]')) { this.openPanel(); this.paintBody(); return; }
      if (e.target.closest('[data-mentor-close]')) { this.closePanel(); return; }
      if (e.target.closest('[data-mentor-mute]')) { this.toggleMute(); return; }
      const act = e.target.closest('[data-mentor-act]');
      if (act) { this.runAction(act.dataset.mentorAct); }
    },

    onSubmit(e) {
      if (!e.target.closest('#mentor-form')) return;
      e.preventDefault();
      const input = Q('#mentor-input');
      const text = (input.value || '').trim();
      if (!text || this.busy) return;
      input.value = '';
      this.send(text, 'chat');
    },

    openPanel() {
      this.openState = true;
      const dock = Q('#mentor-dock');
      if (dock) dock.dataset.open = 'true';
      const input = Q('#mentor-input');
      if (input) setTimeout(() => input.focus(), 240);
    },

    closePanel() {
      this.openState = false;
      const dock = Q('#mentor-dock');
      if (dock) dock.dataset.open = 'false';
    },

    toggleMute() {
      this.muted = !this.muted;
      const dock = Q('#mentor-dock');
      const open = this.openState;
      this.refresh();
      if (open) this.openPanel();
      if (dock) toast(this.muted ? '已静音：本次打开不再主动发消息' : '已取消静音', 'ok', 2400);
    },

    notice(content, opts) {
      this.msgs.push(Object.assign({ role: 'assistant', content }, opts || {}));
      this.openPanel();
      this.paintBody();
    },

    async send(text, mode) {
      if (this.busy) return;
      const cfg = Store.mentor.config();
      if (!AI.isConfigured()) {
        this.notice('先在「设置 · AI 接入」里配好 API Key 和模型，我才能回答。');
        return;
      }
      if (text) this.msgs.push({ role: 'user', content: text });
      const history = this.msgs.filter((m) => !m.typing && !m.error && m.content)
        .slice(-10)
        .map((m) => ({ role: m.role, content: m.content }));
      const msg = { role: 'assistant', content: '', typing: true };
      this.msgs.push(msg);
      this.busy = true;
      this.openPanel();
      this.paintBody();
      try {
        const res = await AI.mentorChat({
          config: cfg,
          context: this.contextText(),
          history,
          message: text,
          mode,
          onDelta: (d) => {
            msg.typing = false;
            msg.content += d || '';
            this.paintBody();
          },
        });
        if (!msg.content.trim()) msg.content = res.text;
        msg.typing = false;
      } catch (e) {
        msg.typing = false;
        msg.error = true;
        msg.content = (e && (e.friendly || e.message)) || '请求失败，稍后再试。';
      } finally {
        this.busy = false;
        this.paintBody();
      }
    },

    runAction(kind) {
      if (kind === 'quiz') return this.quizFromWeak();
      if (kind === 'paper') return this.makePaper();
      if (kind === 'extend') return this.extend();
      if (kind === 'recap') return this.recap();
    },

    recap() {
      const c = this.context();
      const parts = [`今天做了 ${c.today} 道，累计 ${c.total} 道${c.accuracy != null ? `，整体正确率 ${c.accuracy}%` : ''}。`];
      if (c.topWrong.length) parts.push(`最该回头看的还是「${short(c.topWrong[0].stem, 20)}」，已经错了 ${c.topWrong[0].count} 次。`);
      if (c.recentItem) parts.push(`最近在啃《${c.recentItem.kbTitle}》里的「${short(c.recentItem.title, 16)}」。`);
      if (c.lastExam) parts.push(`上次「${c.lastExam.bankTitle || '考试'}」拿了 ${c.lastExam.score || 0} 分。`);
      this.msgs.push({ role: 'assistant', content: parts.join(''), local: true });
      this.openPanel();
      this.paintBody();
    },

    extend() {
      this.send('帮我拓展一点近期值得了解的方向。', 'extend');
    },

    async quizFromWeak() {
      if (this.busy) return;
      if (!AI.isConfigured()) { this.notice('先在设置里配置 AI，我才能出题。'); return; }
      const c = this.context();
      const items = [];
      c.topWrong.forEach((w) => {
        if (items.length >= 3) return;
        items.push({
          title: short(w.stem, 40),
          body: `题干：${w.stem}\n正确答案：${w.answer}${w.explanation ? '\n解析：' + w.explanation : ''}`,
          source: w.bank,
        });
      });
      c.recentItems.forEach((it) => {
        if (items.length >= 4) return;
        if (items.some((x) => x.title === it.title)) return;
        items.push({ title: it.title, body: it.body, source: it.kbTitle });
      });
      if (!items.length) {
        this.notice('错题本和知识库里还没有可用的内容。先去做几道题或读几条知识点，我再根据你的薄弱处出题。');
        return;
      }
      this.busy = true;
      const msg = { role: 'assistant', content: '', typing: true };
      this.msgs.push(msg);
      this.openPanel();
      this.paintBody();
      try {
        const res = await AI.generateQuestions({
          kb: { title: '带教小测', items },
          types: ['single', 'short'],
          count: 2,
          brief: '针对我反复出错或刚读过的地方出题，题目要具体，能检验是否真正理解，不要照抄原题',
        });
        const session = Store.kbSessions.create(
          { id: 'mentor', title: 'AI 带教 · 错题小测', mentor: true, back: '#/' },
          res.questions,
          'AI 带教 · 错题小测'
        );
        msg.typing = false;
        msg.content = `题出好了，${res.questions.length} 道，去答一答。`;
        msg.action = { href: '#/practice/' + session.id, label: '开始答题' };
        this.paintBody();
        location.hash = '#/practice/' + session.id;
      } catch (e) {
        msg.typing = false;
        msg.error = true;
        msg.content = (e && (e.friendly || e.message)) || '出题失败，稍后再试。';
      } finally {
        this.busy = false;
        this.paintBody();
      }
    },

    async makePaper() {
      if (this.busy) return;
      if (!AI.isConfigured()) { this.notice('先在设置里配置 AI，我才能组卷。'); return; }
      const banks = Store.banks.list().filter((b) => b.questions.length);
      if (!banks.length) { this.notice('还没有可用来组卷的题目。先导入或添加题目再来找我。'); return; }
      const catalog = [];
      banks.forEach((b) => b.questions.forEach((q) => catalog.push({
        qid: q.id, bankId: b.id, type: q.type, typeLabel: typeLabel(q.type),
        category: q.category || '', stem: q.stem,
      })));
      if (!catalog.length) { this.notice('题库里还没有题目。'); return; }
      const c = this.context();
      this.busy = true;
      const msg = { role: 'assistant', content: '', typing: true };
      this.msgs.push(msg);
      this.openPanel();
      this.paintBody();
      try {
        const res = await AI.composePaper({
          catalog: catalog.slice(0, 220),
          brief: `根据我最近的错题（${c.topWrong.map((w) => short(w.stem, 24)).join('；') || '暂无'}）和目标，选 5 道能查漏补缺的题`,
          count: 5,
        });
        const items = res.ids.map((qid) => {
          const b = Store.bankOfQuestion(qid);
          return { qid, bankId: b ? b.id : '' };
        });
        const paper = Store.papers.save({
          title: `带教小卷 · ${todayKey()}`,
          subtitle: (Store.mentor.config().goal || '针对最近的薄弱处'),
          bankIds: banks.map((b) => b.id),
          items,
          source: 'mentor',
          note: res.note || '',
        });
        msg.typing = false;
        msg.content = `挑好了 ${items.length} 题，做成一份小卷。`;
        msg.action = { href: '#/papers/' + paper.id, label: '查看试卷' };
        this.paintBody();
        location.hash = '#/papers/' + paper.id;
      } catch (e) {
        msg.typing = false;
        msg.error = true;
        msg.content = (e && (e.friendly || e.message)) || '组卷失败，稍后再试。';
      } finally {
        this.busy = false;
        this.paintBody();
      }
    },
  };

  /* ============================================================
     申请 / 配置页
     ============================================================ */
  Views.mentorSetup = {
    pending: null,

    render() {
      const m = Store.mentor.get();
      const c = m.config;
      const applied = m.applied;
      this.pending = { style: c.style, tone: c.tone, frequency: c.frequency };
      return `
      <div class="page-head">
        <div>
          <h1 class="page-title">${applied ? '带教设置' : '申请 AI 带教'}</h1>
          <p class="page-sub">${applied
            ? '改完保存即可生效。停用后侧边不再出现带教，也不会产生任何主动调用。'
            : '带教会常驻在界面侧边，读你的答题与学习记录。没有申请就不会出现，也不会调用 AI。'}</p>
        </div>
        <div class="page-actions">
          <a class="btn btn-ghost" href="#/settings">${icon('left')} 返回设置</a>
        </div>
      </div>

      <div class="card set-group">
        <h3>${icon('sparkle')} 带教设定</h3>
        <p class="sub">这些设定会进入每次对话的提示词，决定它怎么称呼你、怎么说话。</p>
        <div class="form-grid">
          <div class="field">
            <label>带教名字 <span class="hint">它会用这个名字介绍自己</span></label>
            <input class="input" id="ms-name" maxlength="12" value="${esc(c.name)}" placeholder="小砚" />
          </div>
          <div class="field">
            <label>它怎么称呼你 <span class="hint">留空就用「你」</span></label>
            <input class="input" id="ms-call" maxlength="12" value="${esc(c.userCall)}" placeholder="比如：老陈 / 阿May" />
          </div>
          <div class="field span2">
            <label>带教风格</label>
            <div class="segmented" id="ms-style">
              ${['coach', 'explain', 'companion'].map((k) =>
                `<button type="button" data-style="${k}" class="${c.style === k ? 'active' : ''}">${STYLE_LABEL[k]}</button>`).join('')}
            </div>
          </div>
          <div class="field span2">
            <label>语气</label>
            <div class="segmented" id="ms-tone">
              ${['gentle', 'strict', 'brisk'].map((k) =>
                `<button type="button" data-tone="${k}" class="${c.tone === k ? 'active' : ''}">${TONE_LABEL[k]}</button>`).join('')}
            </div>
          </div>
          <div class="field span2">
            <label>主动开口频率 <span class="hint">每次打开最多一条，不会连发</span></label>
            <div class="segmented" id="ms-freq">
              ${['open', 'daily', 'off'].map((k) =>
                `<button type="button" data-freq="${k}" class="${c.frequency === k ? 'active' : ''}">${FREQ_LABEL[k]}</button>`).join('')}
            </div>
          </div>
          <div class="field span2">
            <label>目标方向 <span class="hint">它会在拓展内容时参考</span></label>
            <input class="input" id="ms-goal" maxlength="60" value="${esc(c.goal)}" placeholder="比如：年底考过一级建造师 / 补牢结构力学" />
          </div>
          <div class="field span2">
            <label>讲解偏好 <span class="hint">可选，比如：先讲结论再推导 / 多用工程实例</span></label>
            <textarea class="textarea" id="ms-explain" rows="3" maxlength="120" placeholder="你希望它怎么讲，它就会照着调整">${esc(c.explain)}</textarea>
          </div>
        </div>

        <div class="row wrap mt-24">
          <button class="btn btn-primary" id="ms-save">${applied ? '保存设置' : '保存并生成带教'}</button>
          ${applied && m.enabled ? `<button class="btn btn-ghost" id="ms-disable">${icon('x')} 停用带教</button>` : ''}
          ${applied && !m.enabled ? `<button class="btn btn-soft" id="ms-enable">${icon('check')} 重新启用</button>` : ''}
          <span class="grow"></span>
          ${applied ? `<button class="btn btn-danger" id="ms-remove">${icon('trash')} 移除带教</button>` : ''}
        </div>
      </div>

      <div class="guide-card">
        <div class="g-orb">${icon('shield')}</div>
        <div><h4>它会做什么、不会做什么</h4>
          <p>带教只读取本机保存的答题统计、错题、知识库查看记录与画像，用来组织一段具体的开场白；每次打开最多主动说一条，频率可以设为「不主动」。点「静音」只影响本次打开，重新打开会恢复。所有调用都走现有 AI 配置，并计入「AI 用量」。</p>
        </div>
      </div>`;
    },

    mount() {
      const seg = (sel, key, attr) => {
        QA(sel + ' button').forEach((b) => {
          b.onclick = () => {
            this.pending[key] = b.dataset[attr];
            QA(sel + ' button').forEach((x) => x.classList.toggle('active', x === b));
          };
        });
      };
      seg('#ms-style', 'style', 'style');
      seg('#ms-tone', 'tone', 'tone');
      seg('#ms-freq', 'frequency', 'freq');

      const saveBtn = Q('#ms-save');
      if (saveBtn) saveBtn.onclick = () => this.save();
      const disable = Q('#ms-disable');
      if (disable) disable.onclick = () => {
        Store.mentor.setEnabled(false);
        Mentor.refresh();
        toast('带教已停用，侧边不再出现', 'ok');
        App.render();
      };
      const enable = Q('#ms-enable');
      if (enable) enable.onclick = () => {
        Store.mentor.setEnabled(true);
        Mentor.refresh();
        toast('带教已重新启用', 'ok');
        App.render();
      };
      const remove = Q('#ms-remove');
      if (remove) remove.onclick = async () => {
        const ok = await confirmModal({
          title: '移除带教？',
          body: '移除后侧边的带教会消失，之前的设定也会清空。之后仍可以在设置里重新申请。',
          okText: '移除',
          danger: true,
        });
        if (!ok) return;
        Store.mentor.remove();
        Mentor.refresh();
        toast('带教已移除', 'ok');
        location.hash = '#/settings';
      };
    },

    save() {
      const name = (Q('#ms-name').value || '').trim();
      if (!name) { toast('给带教起个名字吧', 'bad'); return; }
      const cfg = {
        name,
        userCall: (Q('#ms-call').value || '').trim(),
        style: this.pending.style,
        tone: this.pending.tone,
        frequency: this.pending.frequency,
        goal: (Q('#ms-goal').value || '').trim(),
        explain: (Q('#ms-explain').value || '').trim(),
      };
      Store.mentor.save(cfg);
      Mentor.refresh();
      toast('带教已生成，就在右下角', 'ok', 2800);
      location.hash = '#/';
      if (cfg.frequency !== 'off') setTimeout(() => Mentor.maybeGreet(true), 700);
    },
  };
})();
