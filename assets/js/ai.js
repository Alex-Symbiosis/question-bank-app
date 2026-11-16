/* AI 接入层：OpenAI 兼容接口（/chat/completions），流式输出，统一错误处理 */
window.AI = (function () {
  let currentController = null;

  class AIError extends Error {
    constructor(code, message, detail) {
      super(message);
      this.code = code;
      this.detail = detail || '';
      this.friendly = friendlyOf(code, message);
    }
  }

  function friendlyOf(code, msg) {
    const map = {
      NO_KEY: '还没有配置 AI。请到「设置 · AI 接入」填写 Base URL、API Key 与模型名。',
      UNAUTHORIZED: 'API Key 无效或没有权限（401/403），请检查密钥与账户状态。',
      NOT_FOUND: '接口地址或模型名不正确（404）。请确认 Base URL 是否需要包含 /v1。',
      RATE_LIMIT: '请求过于频繁或额度不足（429），稍后再试或检查账户余额。',
      SERVER: 'AI 服务暂时异常（5xx），请稍后重试。',
      NETWORK: '网络请求失败。可能是 Base URL 有误、网络不通，或服务商不允许浏览器跨域（CORS）调用。',
      TIMEOUT: '请求超时。可以换一个更快的模型，或稍后重试。',
      ABORTED: '已取消本次请求。',
      EMPTY: '模型没有返回内容，请重试或换一个模型。',
      BAD_JSON: '模型返回的内容不是有效 JSON，已保留原文供参考。',
    };
    return map[code] || (msg || 'AI 请求失败');
  }

  function endpoint(base) {
    let u = String(base || '').trim().replace(/\/+$/, '');
    if (!u) throw new AIError('NO_KEY', '缺少 Base URL');
    if (/\/chat\/completions$/.test(u)) return u;
    if (/\/v1$/.test(u)) return u + '/chat/completions';
    return u + '/v1/chat/completions';
  }

  function isConfigured() {
    const api = Store.settings.api();
    return !!(api.baseUrl && api.apiKey && api.model);
  }

  async function rawRequest(opts) {
    const api = Store.settings.api();
    if (!api.apiKey || !api.baseUrl || !api.model) {
      throw new AIError('NO_KEY', 'AI 未配置');
    }
    const useStream = opts.stream !== undefined ? opts.stream : !!api.stream;
    const url = endpoint(api.baseUrl);
    const body = {
      model: api.model,
      messages: opts.messages,
      stream: useStream,
    };
    if (opts.temperature !== null) body.temperature = opts.temperature != null ? opts.temperature : Number(api.temperature);
    if (opts.maxTokens) body.max_tokens = opts.maxTokens;

    const controller = new AbortController();
    currentController = controller;
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, opts.timeout || 120000);

    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + api.apiKey,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (e) {
      clearTimeout(timer);
      currentController = null;
      if (timedOut) throw new AIError('TIMEOUT', '请求超时');
      if (e && e.name === 'AbortError') throw new AIError('ABORTED', '已取消');
      throw new AIError('NETWORK', e && e.message, String(e));
    }

    if (!res.ok) {
      clearTimeout(timer);
      currentController = null;
      let detail = '';
      try { detail = await res.text(); } catch (e) { }
      let code = 'SERVER';
      if (res.status === 401 || res.status === 403) code = 'UNAUTHORIZED';
      else if (res.status === 404) code = 'NOT_FOUND';
      else if (res.status === 429) code = 'RATE_LIMIT';
      else if (res.status === 400) code = 'BAD_JSON';
      throw new AIError(code, `HTTP ${res.status}`, detail.slice(0, 600));
    }

    const ctype = (res.headers.get('content-type') || '').toLowerCase();
    let text = '';
    let usage = null;
    try {
      if (useStream && res.body && /text\/event-stream|text\/plain|application\/x-ndjson/.test(ctype)) {
        const out = await readStream(res, opts.onDelta);
        text = out.text; usage = out.usage;
      } else if (useStream && res.body && !ctype.includes('application/json')) {
        const out = await readStream(res, opts.onDelta);
        text = out.text; usage = out.usage;
      } else {
        const data = await res.json();
        text = (data.choices && data.choices[0] && (data.choices[0].message ? data.choices[0].message.content : data.choices[0].text)) || '';
        usage = data.usage || null;
        if (opts.onDelta && text) opts.onDelta(text);
      }
    } catch (e) {
      clearTimeout(timer);
      currentController = null;
      if (e instanceof AIError) throw e;
      if (timedOut) throw new AIError('TIMEOUT', '请求超时');
      if (e && e.name === 'AbortError') throw new AIError('ABORTED', '已取消');
      throw new AIError('NETWORK', e && e.message, String(e));
    }
    clearTimeout(timer);
    currentController = null;
    if (!text || !String(text).trim()) throw new AIError('EMPTY', '模型未返回内容');
    return { text: String(text), model: api.model, url, usage };
  }

  async function readStream(res, onDelta) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let full = '';
    let usage = null;
    const handle = (rawEvent) => {
      const lines = rawEvent.split('\n');
      for (const line of lines) {
        const l = line.trim();
        if (!l.startsWith('data:')) continue;
        const data = l.slice(5).trim();
        if (!data || data === '[DONE]') continue;
        try {
          const json = JSON.parse(data);
          if (json.usage) usage = json.usage;
          const choice = json.choices && json.choices[0];
          if (!choice) continue;
          const piece = (choice.delta && (choice.delta.content || '')) || (choice.message && choice.message.content) || choice.text || '';
          if (piece) { full += piece; if (onDelta) onDelta(piece); }
        } catch (e) { /* 忽略不完整分片 */ }
      }
    };
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
      let idx;
      while ((idx = buffer.indexOf('\n\n')) >= 0) {
        const evt = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        handle(evt);
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) {
      if (buffer.trim().startsWith('{')) {
        try {
          const data = JSON.parse(buffer);
          if (data.usage) usage = data.usage;
          const c = data.choices && data.choices[0];
          const piece = c && ((c.delta && c.delta.content) || (c.message && c.message.content) || c.text);
          if (piece) { full += piece; if (onDelta) onDelta(piece); }
        } catch (e) { }
      } else {
        handle(buffer.replace(/\r\n/g, '\n'));
      }
    }
    return { text: full, usage };
  }

  /* ---------- 用量估算与调用记录 ---------- */
  function estimateTokens(input) {
    const s = String(input || '');
    if (!s) return 0;
    const cjk = (s.match(/[\u4e00-\u9fa5]/g) || []).length;
    const rest = s.length - cjk;
    return Math.max(1, Math.round(cjk / 1.4 + rest / 4));
  }

  function recordUsage(entry) {
    if (!window.Store || !Store.aiUsage) return null;
    try { return Store.aiUsage.add(entry); } catch (e) { return null; }
  }

  /* 统一出口：真实请求 + 用量记录（失败也记录） */
  async function request(opts) {
    const started = Date.now();
    try {
      const res = await rawRequest(opts);
      let prompt = 0, completion = 0, estimated = false;
      const u = res.usage;
      if (u && (u.total_tokens || u.prompt_tokens || u.completion_tokens)) {
        prompt = u.prompt_tokens || 0;
        completion = u.completion_tokens || 0;
      } else {
        prompt = estimateTokens((opts.messages || []).map((m) => m.content).join('\n'));
        completion = estimateTokens(res.text);
        estimated = true;
      }
      const rec = recordUsage({
        purpose: opts.purpose || 'AI 调用',
        model: res.model,
        ms: Date.now() - started,
        ok: true,
        prompt,
        completion,
        tokens: (u && u.total_tokens) || prompt + completion,
        estimated,
      });
      res.log = rec;
      return res;
    } catch (e) {
      if (!e || e.code !== 'NO_KEY') {
        recordUsage({
          purpose: opts.purpose || 'AI 调用',
          model: Store.settings.api().model || '',
          ms: Date.now() - started,
          ok: false,
          prompt: 0,
          completion: 0,
          tokens: 0,
          estimated: false,
          error: (e && (e.code || e.message)) || 'ERROR',
        });
      }
      throw e;
    }
  }

  /* 组合：算法层 → AI 接入层 */
  async function ask(opts) {
    const packet = Algo.run({
      text: opts.text,
      question: opts.question,
      bank: opts.bank,
      userAnswer: opts.userAnswer,
      history: opts.history,
      profile: Store.profile ? Store.profile.text() : '',
      mode: opts.mode,
      intentHint: opts.intentHint,
    });
    const res = await request({
      messages: packet.messages,
      onDelta: opts.onDelta,
      stream: opts.stream,
      temperature: opts.temperature,
      purpose: packet.intentLabel || '题目讲解',
    });
    return { text: res.text, packet, model: res.model, log: res.log || null };
  }

  /* ---------- 知识库陪读：页面内解析 / 举例 / 追问 ---------- */
  const KC_TASKS = {
    explain: '把这条知识点讲透：它到底在说什么、为什么成立、成立的条件是什么、最容易和什么混淆。不要只把原文换一种说法，也不要列教科书目录。',
    example: '为这条知识点举一个具体的实例。实例必须包含明确的对象、场景、数字或操作过程，让人一看就知道它对应的是这条知识点；不要用「比如在学习中」「例如生活中」这类空泛例子，也不要用比喻代替真实例子。最后用一句话落回这条知识点。',
    chat: '回答学生的问题。如果问题超出这条知识点的范围，可以补充，但要说明是补充内容。',
    teachback: '下面是学生用自己的话复述这条知识点。请针对他的复述给出反馈：先具体指出说对、说得准确的部分；再指出含糊、不准确或遗漏的地方；最后告诉他该补什么。不要打分，不要笼统表扬，也不要长篇复述原文。',
  };

  async function knowledgeChat(opts) {
    const item = opts.item || {};
    const mode = KC_TASKS[opts.mode] ? opts.mode : 'chat';
    const history = (opts.history || []).filter((m) => m && m.content).slice(-8);
    const profile = Store.profile ? Store.profile.text() : '';
    const sys = `你是一位陪学生精读资料的老师。学生正在逐条阅读《${opts.kbTitle || '知识库'}》，你只围绕当前这条知识点讲解。
说话像面对面聊天：句子不长，先给结论再解释，不端着，不套「首先/其次/综上所述」，不用固定小标题，不讲空话。回答必须准确；不确定时直接说不确定。
${profile ? '【学生画像】\n' + profile + '\n' : ''}【回答篇幅】以说清为准：解析通常 3–6 句，举例讲完即可，追问按问题深浅回答。`;
    const user = `【知识点】\n${item.title || ''}\n${item.body || ''}${item.source ? '\n来源：' + item.source : ''}${(item.tags && item.tags.length) ? '\n标签：' + item.tags.join(' / ') : ''}\n\n【这次的任务】\n${KC_TASKS[mode]}${opts.question ? '\n\n【学生的问题】\n' + opts.question : ''}`;
    const messages = [{ role: 'system', content: sys }]
      .concat(history.map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content).slice(0, 800) })))
      .concat([{ role: 'user', content: user }]);
    const res = await request({
      messages,
      onDelta: opts.onDelta,
      temperature: mode === 'example' ? 0.7 : 0.5,
      purpose: mode === 'example' ? '知识举例' : '知识解析',
    });
    return { text: res.text, model: res.model, log: res.log || null };
  }

  /* ---------- AI 带教：侧边常驻老师 ---------- */
  const MENTOR_STYLE = {
    coach: '督导型：会盯进度、点出薄弱处，语气不绕弯',
    explain: '讲解型：先把原理讲清楚，再让学生自己说一遍',
    companion: '陪伴型：像一起自习的同伴，多鼓励，少施压',
  };
  const MENTOR_TONE = {
    gentle: '温和、不打击人',
    strict: '严格、就事论事',
    brisk: '干脆、不寒暄',
  };
  const MENTOR_TASK = {
    chat: '',
    extend: '给我推荐一点与我的目标方向相关、近期值得了解的新东西，帮我拓展眼界。给出 2–3 个具体方向或话题，每个用一两句说明为什么值得看、我可以从哪一步开始。不要编造具体的新闻标题、日期或数据；不确定是不是近期的事，就直接说不确定。',
  };

  function mentorSystem(config) {
    const c = config || {};
    const name = c.name || '小砚';
    const profile = Store.profile ? Store.profile.text() : '';
    return `你是${name}，一位常驻在学生旁边的老师，不是客服。${c.userCall ? `你称呼学生为「${c.userCall}」。` : '称呼学生为「你」。'}
带教风格：${MENTOR_STYLE[c.style] || MENTOR_STYLE.coach}。
说话语气：${MENTOR_TONE[c.tone] || MENTOR_TONE.gentle}。
${c.explain ? '讲解偏好：' + c.explain + '\n' : ''}${c.goal ? '学生的目标方向：' + c.goal + '\n' : ''}${profile ? '学生对自我的描述（画像）：' + profile + '\n' : ''}规则：
- 只依据给出的学习记录说话，不编造学生没做过的题或没学过的内容；记录里没有的不要提。
- 像面对面聊天：句子短，先给结论，不套「首先/其次/综上所述」，不用小标题，不列空洞清单。
- 需要出题、组卷或补充资料时，用一句话提议即可，具体动作由界面上的按钮完成。`;
  }

  async function mentorGreeting(opts) {
    const config = (opts && opts.config) || {};
    const context = String((opts && opts.context) || '');
    const messages = [
      { role: 'system', content: mentorSystem(config) + '\n现在你要主动开口，只说一次，不要连发。' },
      {
        role: 'user',
        content: `【最近学习记录】\n${context || '（暂时没有记录）'}\n\n请主动说一段话（2–4 句）：先点出我最近具体在学什么、哪里反复错、进度如何其中的一两点，再给一个很小的下一步建议，或问我一句最近学了什么。不要罗列数据清单，不要复述记录原文，不要客套。`,
      },
    ];
    const res = await request({
      messages, stream: false, temperature: 0.7, maxTokens: 320, purpose: 'AI 带教',
    });
    return { text: String(res.text || '').trim(), model: res.model, log: res.log || null };
  }

  async function mentorChat(opts) {
    opts = opts || {};
    const config = opts.config || {};
    const mode = MENTOR_TASK[opts.mode] ? opts.mode : 'chat';
    const history = (opts.history || []).filter((m) => m && m.content).slice(-10)
      .map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content).slice(0, 1200) }));
    const task = MENTOR_TASK[mode];
    const user = `【最近学习记录】\n${opts.context || '（暂时没有记录）'}\n\n【这次】\n${task || '回答学生的问题。'}${opts.message ? '\n\n【学生说】\n' + opts.message : ''}`;
    const res = await request({
      messages: [{ role: 'system', content: mentorSystem(config) }, ...history, { role: 'user', content: user }],
      onDelta: opts.onDelta,
      stream: true,
      temperature: 0.65,
      timeout: 120000,
      purpose: 'AI 带教',
    });
    return { text: res.text, model: res.model, log: res.log || null, mode };
  }

  function parseGradeJSON(raw) {
    let s = String(raw || '').trim();
    s = s.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    const a = s.indexOf('{'), b = s.lastIndexOf('}');
    if (a >= 0 && b > a) s = s.slice(a, b + 1);
    const obj = JSON.parse(s);
    let score = Number(obj.score);
    if (!isFinite(score)) score = null;
    if (score != null) score = clamp(score, 0, 10);
    return {
      score,
      fullScore: 10,
      verdict: obj.verdict || '',
      comment: obj.comment || '',
      hit: Array.isArray(obj.hit) ? obj.hit : [],
      miss: Array.isArray(obj.miss) ? obj.miss : [],
      suggestion: obj.suggestion || '',
    };
  }

  async function gradeShort(opts) {
    const packet = Algo.run({
      text: '请批改我的作答',
      question: opts.question,
      bank: opts.bank,
      userAnswer: opts.userAnswer,
      profile: Store.profile ? Store.profile.text() : '',
      intentHint: 'grade',
      mode: 'grade',
    });
    const res = await request({ messages: packet.messages, stream: false, temperature: 0.2, purpose: '简答批改' });
    let grade;
    try {
      grade = parseGradeJSON(res.text);
      grade.raw = res.text;
    } catch (e) {
      grade = { score: null, fullScore: 10, verdict: '自动解析失败', comment: res.text, hit: [], miss: [], suggestion: '', raw: res.text, parseError: true };
    }
    return { grade, packet, model: res.model, log: res.log || null };
  }

  async function testConnection() {
    const started = Date.now();
    const res = await request({
      messages: [
        { role: 'system', content: '你是一个连接测试助手。' },
        { role: 'user', content: '请只回复四个字：连接成功' },
      ],
      stream: false,
      temperature: 0,
      maxTokens: 24,
      timeout: 45000,
      purpose: '连接测试',
    });
    return { text: res.text.trim(), ms: Date.now() - started, model: res.model };
  }

  /* ---------- AI 认识你 ---------- */
  async function personaChat(opts) {
    const packet = Algo.persona({
      phase: 'chat',
      history: (opts && opts.history) || [],
      existing: Store.profile ? Store.profile.text() : '',
    });
    const res = await request({
      messages: packet.messages,
      stream: true,
      onDelta: opts && opts.onDelta,
      temperature: 0.8,
      timeout: 120000,
      purpose: '认识你',
    });
    return { text: res.text, model: res.model, log: res.log || null };
  }

  async function personaSummary(opts) {
    const packet = Algo.persona({
      phase: 'summary',
      history: (opts && opts.history) || [],
      existing: Store.profile ? Store.profile.text() : '',
    });
    const res = await request({
      messages: packet.messages,
      stream: false,
      temperature: 0.5,
      timeout: 120000,
      purpose: '画像归纳',
    });
    let text = String(res.text || '').trim().replace(/^```[\s\S]*?\n|```$/g, '').trim();
    text = text.replace(/^["“「『]/, '').replace(/["”」』]$/, '').trim();
    if (text.length > 300) text = text.slice(0, 300);
    return { text, model: res.model, log: res.log || null };
  }

  /* ---------- AI 结构化：把原始题库文本拆解为题目数据 ---------- */
  function chunkText(text, size) {
    const lines = String(text || '').replace(/\f/g, '\n').split(/\n/);
    const chunks = [];
    let buf = [], len = 0;
    const qStart = /^\s*(?:\d{1,3}\s*[.、)]|[（(]\s*\d{1,3}\s*[）)]|[一二三四五六七八九十]+\s*[、.])/;
    lines.forEach((line) => {
      if (len + line.length > size && buf.length) {
        // 优先在题号处断开
        let cut = buf.length;
        for (let i = buf.length - 1; i >= Math.max(0, buf.length - 12); i--) {
          if (qStart.test(buf[i])) { cut = i; break; }
        }
        if (cut <= 0) cut = buf.length;
        chunks.push(buf.slice(0, cut).join('\n'));
        buf = buf.slice(cut);
        len = buf.reduce((s, l) => s + l.length + 1, 0);
      }
      buf.push(line);
      len += line.length + 1;
    });
    if (buf.length) chunks.push(buf.join('\n'));
    return chunks.filter((c) => c.trim().length > 20);
  }

  const STRUCTURE_SYSTEM = `你是一个题库结构化引擎。你的唯一任务是把用户提供的原始题库文本拆解、重构成结构化数据。
严格要求：
1. 忠实原文，不增删题目，不编造答案或解析；缺失的字段留空字符串。
2. 逐题输出：题型、题干、选项、答案、解析、分类。
3. 题型取值：single（单选）、multiple（多选）、judge（判断）、blank（填空）、short（简答/论述/名词解释等主观题）。
4. 选项仅用于单选题与多选题，格式 [{"key":"A","text":"..."}]；其他题型返回 []。
5. 答案格式：单选 "A"；多选 ["A","C"]；判断 "T" 或 "F"；填空与简答填参考答案原文。
6. 如果原文把多个选项挤在一行，请拆开；如果题干跨行，请合并成一段。
7. 只输出 JSON，不要 Markdown 代码块，不要任何解释。
输出格式：{"questions":[{"type":"single","stem":"...","options":[{"key":"A","text":"..."}],"answer":"A","explanation":"...","category":"..."}]}`;

  function parseQuestionsJSON(raw) {
    let s = String(raw || '').trim();
    s = s.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    let start = s.indexOf('{');
    const arrStart = s.indexOf('[');
    if (arrStart >= 0 && (start < 0 || arrStart < start)) {
      const end = s.lastIndexOf(']');
      if (end > arrStart) return JSON.parse(s.slice(arrStart, end + 1));
    }
    if (start >= 0) {
      const end = s.lastIndexOf('}');
      if (end > start) {
        const obj = JSON.parse(s.slice(start, end + 1));
        if (Array.isArray(obj.questions)) return obj.questions;
        if (Array.isArray(obj.data)) return obj.data;
        if (obj.question) return [obj.question];
      }
    }
    throw new Error('模型没有返回可解析的题目 JSON');
  }

  async function structureQuestions(opts) {
    const maxChunks = opts.maxChunks || 12;
    const chunkSize = opts.chunkSize || 5000;
    const chunks = chunkText(opts.text, chunkSize);
    if (!chunks.length) throw new AIError('EMPTY', '没有可结构化的文本');
    const use = chunks.slice(0, maxChunks);
    const questions = [];
    const errors = [];
    for (let i = 0; i < use.length; i++) {
      if (opts.isCancelled && opts.isCancelled()) throw new AIError('ABORTED', '已取消');
      const prompt = `请把下面这段原始题库文本结构化。\n${opts.hint ? '补充说明：' + opts.hint + '\n' : ''}\n----- 原文开始 -----\n${use[i]}\n----- 原文结束 -----`;
      try {
        const res = await request({
          messages: [
            { role: 'system', content: STRUCTURE_SYSTEM },
            { role: 'user', content: prompt },
          ],
          stream: false,
          temperature: 0.1,
          timeout: 180000,
          purpose: '题库结构化',
        });
        const list = parseQuestionsJSON(res.text);
        list.forEach((q) => questions.push(Object.assign({}, q, { __chunk: i + 1 })));
      } catch (e) {
        if (e instanceof AIError && (e.code === 'ABORTED' || e.code === 'NO_KEY')) throw e;
        errors.push({ chunk: i + 1, message: e.message });
      }
      if (opts.onProgress) opts.onProgress({ done: i + 1, total: use.length, count: questions.length });
    }
    if (!questions.length) {
      throw new AIError('EMPTY', 'AI 没有返回有效题目', errors.map((e) => `第${e.chunk}段：${e.message}`).join('；'));
    }
    return { questions, errors, chunks: use.length, truncated: chunks.length > maxChunks };
  }

  /* ---------- 知识库结构化：把资料拆成一条条知识点 ---------- */
  function splitLongParagraph(p, size) {
    const out = [];
    let s = String(p || '');
    while (s.length > size) {
      let cut = s.lastIndexOf('。', size);
      if (cut < size * 0.4) cut = s.lastIndexOf('\n', size);
      if (cut < size * 0.4) cut = size;
      out.push(s.slice(0, cut + 1));
      s = s.slice(cut + 1);
    }
    if (s.trim()) out.push(s);
    return out;
  }

  function chunkParagraphs(text, size) {
    const paras = String(text || '').replace(/\f/g, '\n')
      .split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    const chunks = [];
    let buf = [], len = 0;
    const push = () => {
      if (!buf.length) return;
      const t = buf.join('\n\n').trim();
      if (t.length > 20) chunks.push(t);
      buf = []; len = 0;
    };
    paras.forEach((p) => {
      const pieces = p.length > size ? splitLongParagraph(p, size) : [p];
      pieces.forEach((piece) => {
        if (len + piece.length > size && buf.length) push();
        buf.push(piece);
        len += piece.length + 2;
      });
    });
    push();
    return chunks;
  }

  const KNOWLEDGE_SYSTEM = `你是一个知识库结构化引擎。你的唯一任务是把用户提供的学习资料拆解成一条条独立、可检索的知识点。
严格要求：
1. 忠实原文，不编造、不补充资料中没有的结论；可以合并同一主题的零散句子，但要保留原意。
2. 每个知识点只讲清一个概念、结论、公式、步骤或要点，标题简短明确（不超过 24 字）。
3. body 用 1–4 句完整的话讲清这个知识点；原文有公式、数字、限定条件时必须保留。
4. tags 是 0–3 个主题标签；source 填资料中出现的章节/页码/来源线索，没有就留空字符串。
5. 忽略目录、页眉页脚、无意义的重复内容。
6. 只输出 JSON，不要 Markdown 代码块，不要任何解释。
输出格式：{"items":[{"title":"...","body":"...","tags":["..."],"source":"..."}]}`;

  function parseItemsJSON(raw) {
    let s = String(raw || '').trim();
    s = s.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    const arrStart = s.indexOf('[');
    const objStart = s.indexOf('{');
    if (arrStart >= 0 && (objStart < 0 || arrStart < objStart)) {
      const end = s.lastIndexOf(']');
      if (end > arrStart) return JSON.parse(s.slice(arrStart, end + 1));
    }
    if (objStart >= 0) {
      const end = s.lastIndexOf('}');
      if (end > objStart) {
        const obj = JSON.parse(s.slice(objStart, end + 1));
        if (Array.isArray(obj.items)) return obj.items;
        if (Array.isArray(obj.data)) return obj.data;
        if (obj.item) return [obj.item];
      }
    }
    throw new Error('模型没有返回可解析的知识点 JSON');
  }

  async function structureKnowledge(opts) {
    const maxChunks = opts.maxChunks || 14;
    const chunkSize = opts.chunkSize || 4200;
    const chunks = chunkParagraphs(opts.text, chunkSize);
    if (!chunks.length) throw new AIError('EMPTY', '没有可结构化的文本');
    const use = chunks.slice(0, maxChunks);
    const items = [];
    const errors = [];
    for (let i = 0; i < use.length; i++) {
      if (opts.isCancelled && opts.isCancelled()) throw new AIError('ABORTED', '已取消');
      const prompt = `请把下面这段学习资料拆成结构化的知识点条目。${opts.title ? '\n资料名称：' + opts.title : ''}${opts.hint ? '\n补充说明：' + opts.hint : ''}\n\n----- 原文开始 -----\n${use[i]}\n----- 原文结束 -----`;
      try {
        const res = await request({
          messages: [
            { role: 'system', content: KNOWLEDGE_SYSTEM },
            { role: 'user', content: prompt },
          ],
          stream: false,
          temperature: 0.2,
          timeout: 180000,
          purpose: '知识库结构化',
        });
        parseItemsJSON(res.text).forEach((it) => {
          if (it && (it.title || it.body || it.content)) items.push(it);
        });
      } catch (e) {
        if (e instanceof AIError && (e.code === 'ABORTED' || e.code === 'NO_KEY')) throw e;
        errors.push({ chunk: i + 1, message: e.message });
      }
      if (opts.onProgress) opts.onProgress({ done: i + 1, total: use.length, count: items.length });
    }
    if (!items.length) {
      throw new AIError('EMPTY', 'AI 没有返回有效知识点', errors.map((e) => `第${e.chunk}段：${e.message}`).join('；'));
    }
    return { items, errors, chunks: use.length, truncated: chunks.length > maxChunks };
  }

  /* ---------- 知识库出题 ---------- */
  const TYPE_LABEL = { single: '单选题', multiple: '多选题', judge: '判断题', blank: '填空题', short: '简答题' };

  const QGEN_SYSTEM = `你是一个出题引擎。你会拿到一份知识库的知识点清单，请严格依据这些内容出题。
严格要求：
1. 所有题目必须能由给定知识点直接回答，不引入外部知识；题干要具体，不要出「以下哪项正确」这类空泛题。
2. 题型只使用用户指定的类型，取值：single（单选）、multiple（多选）、judge（判断）、blank（填空）、short（简答/论述）。
3. 单选必须 4 个选项且只有 1 个正确答案；多选 4 个选项且 2–3 个正确答案；选项格式 [{"key":"A","text":"..."}]。
4. 答案格式：单选 "A"；多选 ["A","C"]；判断 "T" 或 "F"；填空与简答填参考答案原文（简答题 2–4 句）。
5. 每题都给出 explanation（解析），说明依据的是哪条知识点；难度 difficulty 取 1–3。
6. 同一知识点可以出多道不同角度的题，但不要重复同一道题。
7. 只输出 JSON，不要 Markdown 代码块，不要任何解释。
输出格式：{"questions":[{"type":"single","stem":"...","options":[{"key":"A","text":"..."}],"answer":"A","explanation":"...","category":"...","difficulty":2}]}`;

  async function generateQuestions(opts) {
    const kb = opts.kb || {};
    const items = (kb.items || []).slice(0, 120);
    if (!items.length) throw new AIError('EMPTY', '这个知识库还没有知识点');
    const types = (opts.types && opts.types.length ? opts.types : ['single']).filter((t) => TYPE_LABEL[t]);
    const count = clamp(Number(opts.count) || 8, 1, 30);
    const knowledge = items.map((it, i) => `${i + 1}. ${it.title}\n${it.body}${it.source ? '\n来源：' + it.source : ''}`).join('\n\n');
    const typeText = types.map((t) => TYPE_LABEL[t] + '(' + t + ')').join('、');
    const prompt = `知识库：${kb.title || '未命名'}
需要出 ${count} 道题，题型：${typeText}。${opts.brief ? '\n用户要求：' + opts.brief : ''}
${items.length < (kb.items || []).length ? '\n（知识点较多，本次只使用了前 120 条）' : ''}

----- 知识点开始 -----
${knowledge}
----- 知识点结束 -----`;
    const res = await request({
      messages: [
        { role: 'system', content: QGEN_SYSTEM },
        { role: 'user', content: prompt },
      ],
      stream: false,
      temperature: 0.5,
      timeout: 180000,
      purpose: '知识库出题',
    });
    let list;
    try {
      list = parseQuestionsJSON(res.text);
    } catch (e) {
      throw new AIError('BAD_JSON', 'AI 返回的题目无法解析', res.text.slice(0, 200));
    }
    const questions = list.filter((q) => q && q.stem).map((q) => {
      const type = TYPE_LABEL[q.type] ? q.type : types[0];
      return Object.assign({}, q, {
        type,
        category: q.category || kb.title || '知识库',
        options: type === 'single' || type === 'multiple' ? (q.options || []) : [],
      });
    });
    if (!questions.length) throw new AIError('EMPTY', 'AI 没有返回有效题目', res.text.slice(0, 200));
    return { questions, model: res.model, log: res.log || null, truncated: (kb.items || []).length > 120 };
  }

  function cancel() {
    if (currentController) { currentController.abort(); currentController = null; }
  }

  function parseIdsJSON(raw) {
    let s = String(raw || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    const a = s.indexOf('{'), b = s.lastIndexOf('}');
    if (a >= 0 && b > a) s = s.slice(a, b + 1);
    const obj = JSON.parse(s);
    const ids = Array.isArray(obj.ids) ? obj.ids : Array.isArray(obj.questionIds) ? obj.questionIds : [];
    return { ids: ids.map((x) => String(x)), note: obj.note || '' };
  }

  async function composePaper(opts) {
    const all = (opts && opts.catalog) || [];
    const max = 220;
    const catalog = all.slice(0, max);
    const packet = Algo.compose({
      brief: opts.brief,
      count: opts.count,
      catalog,
    });
    const res = await request({
      messages: packet.messages,
      stream: false,
      temperature: 0.3,
      timeout: 150000,
      purpose: 'AI 组卷',
    });
    let parsed;
    try {
      parsed = parseIdsJSON(res.text);
    } catch (e) {
      throw new AIError('BAD_JSON', 'AI 返回的选卷结果无法解析', res.text.slice(0, 200));
    }
    const valid = new Set(catalog.map((q) => q.qid));
    const ids = parsed.ids.filter((id, i) => valid.has(id) && parsed.ids.indexOf(id) === i);
    if (!ids.length) throw new AIError('BAD_JSON', 'AI 没有返回有效题目', res.text.slice(0, 200));
    return {
      ids,
      note: parsed.note,
      model: res.model,
      log: res.log || null,
      truncated: all.length > max,
      catalogSize: all.length,
      usedCatalog: catalog.length,
    };
  }

  return { isConfigured, ask, gradeShort, composePaper, personaChat, personaSummary, structureQuestions, structureKnowledge, generateQuestions, knowledgeChat, mentorGreeting, mentorChat, testConnection, cancel, request, AIError, endpoint, chunkText };
})();
