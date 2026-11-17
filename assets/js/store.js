/* 本地数据层：全部数据保存在浏览器 localStorage */
window.Store = (function () {
  const KEY = 'quizapp.v1';
  const listeners = new Set();
  let state = null;

  const defaultSettings = () => ({
    api: {
      baseUrl: 'https://api.openai.com/v1',
      apiKey: '',
      model: 'gpt-4o-mini',
      temperature: 0.5,
      stream: true,
    },
    algo: {
      disabledStages: [],
      explainStyle: 'balanced', // brief | balanced | deep
      maxChars: 6000,
      showPacket: true,
    },
    study: {
      autoNext: true,
      autoNextDelay: 1400,
      wrongAutoAdd: true,
      shuffleOptions: false,
      showTimer: true,
      splash: true, // 启动封面与今日问候
    },
    usage: {
      limit: 100, // 保留最近多少条 AI 调用记录
    },
    ai: {
      autoPersona: true, // 保存 API 配置成功后是否自动发起「AI 认识你」对话
    },
  });

  const defaultMentor = () => ({
    applied: false,      // 用户是否已申请
    enabled: true,       // 停用后不再出现、不再调用
    config: {
      name: '小砚',
      userCall: '',
      style: 'coach',    // coach 督导 | explain 讲解 | companion 陪伴
      tone: 'gentle',    // gentle 温和 | strict 严格 | brisk 干脆
      explain: '',
      frequency: 'open', // open 每次打开 | daily 每天一次 | off 不主动
      goal: '',
    },
    createdAt: 0,
    updatedAt: 0,
    lastGreetAt: 0,
    lastGreetDay: '',
  });

  const defaultState = () => ({
    version: 1,
    settings: defaultSettings(),
    banks: [],
    wrong: {},
    stats: {},
    favorites: [],
    exams: [],
    activeExam: null,
    lastBankId: null,
    papers: [],
    kbs: [],
    kbSessions: {},
    progress: { practice: {}, study: {}, focus: {} },
    profile: { text: '', onboarded: false, updatedAt: 0 },
    mentor: defaultMentor(),
    aiLog: [],
    aiTotals: { calls: 0, tokens: 0, prompt: 0, completion: 0, failed: 0 },
    createdAt: Date.now(),
  });

  function mergeSettings(saved) {
    const d = defaultSettings();
    if (!saved) return d;
    return {
      api: Object.assign(d.api, saved.api || {}),
      algo: Object.assign(d.algo, saved.algo || {}),
      study: Object.assign(d.study, saved.study || {}),
      usage: Object.assign(d.usage, saved.usage || {}),
      ai: Object.assign(d.ai, saved.ai || {}),
    };
  }

  function normalizeMentor(raw) {
    const d = defaultMentor();
    const src = raw && typeof raw === 'object' ? raw : {};
    const cfg = src.config && typeof src.config === 'object' ? src.config : {};
    return {
      applied: !!src.applied,
      enabled: src.enabled !== false,
      config: {
        name: String(cfg.name || d.config.name).trim().slice(0, 12) || d.config.name,
        userCall: String(cfg.userCall || '').trim().slice(0, 12),
        style: ['coach', 'explain', 'companion'].includes(cfg.style) ? cfg.style : d.config.style,
        tone: ['gentle', 'strict', 'brisk'].includes(cfg.tone) ? cfg.tone : d.config.tone,
        explain: String(cfg.explain || '').trim().slice(0, 120),
        frequency: ['open', 'daily', 'off'].includes(cfg.frequency) ? cfg.frequency : d.config.frequency,
        goal: String(cfg.goal || '').trim().slice(0, 60),
      },
      createdAt: Number(src.createdAt) || 0,
      updatedAt: Number(src.updatedAt) || 0,
      lastGreetAt: Number(src.lastGreetAt) || 0,
      lastGreetDay: String(src.lastGreetDay || ''),
    };
  }

  function normalizeProgress(raw) {
    const d = { practice: {}, study: {}, focus: {} };
    const src = raw && typeof raw === 'object' ? raw : {};
    ['practice', 'study', 'focus'].forEach((scope) => {
      const bucket = src[scope];
      if (bucket && typeof bucket === 'object' && !Array.isArray(bucket)) d[scope] = bucket;
    });
    return d;
  }

  /* 清理某个题库 / 会话 / 知识库关联的所有续做记录 */
  function clearProgressFor(id) {
    if (!state.progress || !id) return;
    ['practice', 'study', 'focus'].forEach((scope) => {
      const bucket = state.progress[scope];
      if (!bucket) return;
      Object.keys(bucket).forEach((key) => {
        if (key === id || key.indexOf(id + ':') === 0) delete bucket[key];
      });
    });
  }

  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      console.error('[store] 保存失败', e);
      if (typeof toast === 'function') toast('本地空间不足，请先导出备份并清理部分题库', 'bad', 4200);
      return false;
    }
  }

  function emit() { listeners.forEach((fn) => { try { fn(state); } catch (e) { console.error(e); } }); }

  function save() { persist(); emit(); }

  /* 收藏只保留仍存在的题目：删题、删库、合并或导入旧备份后都不会留下死链 */
  function normalizeFavorites() {
    if (!Array.isArray(state.favorites)) state.favorites = [];
    const seen = new Set();
    state.favorites = state.favorites.filter((qid) => {
      if (typeof qid !== 'string' || !qid || seen.has(qid)) return false;
      seen.add(qid);
      return !!questionById(qid);
    });
  }

  function init() {
    let raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) { console.warn('localStorage 不可用', e); }
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        state = Object.assign(defaultState(), parsed);
        state.settings = mergeSettings(parsed.settings);
        if (!Array.isArray(state.banks)) state.banks = [];
      } catch (e) {
        console.error('数据解析失败，使用初始数据', e);
        state = defaultState();
      }
    } else {
      state = defaultState();
      state.banks = (window.buildSeedBanks ? window.buildSeedBanks() : []);
      persist();
    }
    // 兼容早期字段
    if (!state.wrong || typeof state.wrong !== 'object') state.wrong = {};
    if (!state.stats || typeof state.stats !== 'object') state.stats = {};
    if (!Array.isArray(state.exams)) state.exams = [];
    if (!Array.isArray(state.papers)) state.papers = [];
    if (!Array.isArray(state.kbs)) state.kbs = [];
    if (!state.kbSessions || typeof state.kbSessions !== 'object') state.kbSessions = {};
    state.progress = normalizeProgress(state.progress);
    normalizeFavorites();
    if (!state.profile || typeof state.profile !== 'object') {
      state.profile = { text: '', onboarded: false, updatedAt: 0 };
    }
    state.mentor = normalizeMentor(state.mentor);
    if (!Array.isArray(state.aiLog)) state.aiLog = [];
    if (!state.aiTotals || typeof state.aiTotals !== 'object') {
      state.aiTotals = { calls: 0, tokens: 0, prompt: 0, completion: 0, failed: 0 };
    }
    return state;
  }

  const getState = () => state;
  const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

  /* ---------- 设置 ---------- */
  const settings = {
    get: () => state.settings,
    patch(section, patch) {
      state.settings[section] = Object.assign({}, state.settings[section], patch);
      save();
    },
    api: () => state.settings.api,
    isAIConfigured() {
      const a = state.settings.api;
      return !!(a && a.baseUrl && a.apiKey && a.model);
    },
  };

  /* ---------- 题库 ---------- */
  function stemKey(stem) {
    return String(stem || '')
      .toLowerCase()
      .replace(/[\s\u3000]/g, '')
      .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
      .replace(/[，。！？、；：""''（）()【】\[\]「」《》<>…—\-·,.!?;:'"`~]/g, '')
      .slice(0, 120);
  }
  function bigrams(s) {
    const set = new Set();
    for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
    return set;
  }
  function similarStem(key, grams, other) {
    if (!key || !other.key) return false;
    if (key === other.key) return true;
    const longer = key.length >= other.key.length ? key : other.key;
    const shorter = key.length >= other.key.length ? other.key : key;
    if (shorter.length / longer.length < 0.6) return false;
    if (longer.includes(shorter) && shorter.length / longer.length >= 0.7) return true;
    const A = grams;
    const B = other.grams;
    if (!A.size || !B.size) return false;
    let inter = 0;
    A.forEach((g) => { if (B.has(g)) inter += 1; });
    return (2 * inter) / (A.size + B.size) >= 0.74;
  }
  function collectMerge(list, dedupe) {
    const items = [];
    const keys = new Set();
    let total = 0;
    let duplicates = 0;
    list.forEach((bank) => {
      (bank.questions || []).forEach((q) => {
        total += 1;
        const key = stemKey(q.stem);
        const grams = key ? bigrams(key) : null;
        let dup = false;
        if (dedupe && key) {
          if (keys.has(key)) dup = true;
          else {
            for (const it of items) {
              if (it.type !== q.type) continue;
              if (similarStem(key, grams, it)) { dup = true; break; }
            }
          }
        }
        if (dup) { duplicates += 1; return; }
        if (key) keys.add(key);
        items.push({ q, bank, key, grams, type: q.type });
      });
    });
    return { total, duplicates, items };
  }

  const banks = {
    list: () => state.banks,
    get: (id) => state.banks.find((b) => b.id === id) || null,
    create(data) {
      const bank = {
        id: uid('bank'),
        title: data.title || '未命名题库',
        monogram: data.monogram || '题库',
        subject: data.subject || '自定义',
        description: data.description || '',
        accent: data.accent || 'accent',
        source: data.source || { type: 'manual' },
        createdAt: Date.now(),
        updatedAt: Date.now(),
        questions: (data.questions || []).map((q) => normalizeQuestion(q)),
      };
      state.banks.unshift(bank);
      state.stats[bank.id] = { answered: 0, correct: 0, days: {}, mastered: {} };
      save();
      return bank;
    },
    update(id, patch) {
      const b = banks.get(id);
      if (!b) return null;
      Object.assign(b, patch, { updatedAt: Date.now() });
      save();
      return b;
    },
    remove(id) {
      state.banks = state.banks.filter((b) => b.id !== id);
      delete state.stats[id];
      Object.keys(state.wrong).forEach((qid) => {
        if (state.wrong[qid] && state.wrong[qid].bankId === id) delete state.wrong[qid];
      });
      state.favorites = state.favorites.filter((qid) => {
        const q = questionById(qid);
        return !!q;
      });
      if (state.activeExam && state.activeExam.bankId === id) state.activeExam = null;
      clearProgressFor(id);
      save();
    },
    addQuestions(bankId, questions) {
      const b = banks.get(bankId);
      if (!b) return 0;
      const list = questions.map((q) => normalizeQuestion(q));
      b.questions = b.questions.concat(list);
      b.updatedAt = Date.now();
      save();
      return list.length;
    },
    updateQuestion(bankId, qid, patch) {
      const b = banks.get(bankId);
      if (!b) return;
      const q = b.questions.find((x) => x.id === qid);
      if (!q) return;
      Object.assign(q, patch);
      b.updatedAt = Date.now();
      save();
    },
    removeQuestion(bankId, qid) {
      const b = banks.get(bankId);
      if (!b) return;
      b.questions = b.questions.filter((x) => x.id !== qid);
      delete state.wrong[qid];
      state.favorites = state.favorites.filter((x) => x !== qid);
      b.updatedAt = Date.now();
      save();
    },
    /* 合并预览：返回总题数、去重后题数与重复数 */
    mergeStats(ids, dedupe) {
      const list = state.banks.filter((b) => (ids || []).includes(b.id));
      const r = collectMerge(list, dedupe !== false);
      return { total: r.total, kept: r.items.length, duplicates: r.duplicates };
    },
    /* 合并题库：生成新题库，原题库不动 */
    merge(ids, opts) {
      opts = opts || {};
      const list = state.banks.filter((b) => (ids || []).includes(b.id));
      if (list.length < 2) return null;
      const dedupe = opts.dedupe !== false;
      const r = collectMerge(list, dedupe);
      const now = Date.now();
      const usedIds = new Set();
      const questions = r.items.map(({ q, bank }) => {
        const copy = normalizeQuestion(JSON.parse(JSON.stringify(q)));
        if (usedIds.has(copy.id)) copy.id = uid('q');
        usedIds.add(copy.id);
        const meta = Object.assign({}, copy.meta || {});
        const prev = Array.isArray(meta.origins) ? meta.origins : [];
        meta.origins = prev.concat([{ bankId: bank.id, bankTitle: bank.title, questionId: q.id }]);
        meta.mergedAt = now;
        copy.meta = meta;
        return copy;
      });
      const autoTitle = list.map((b) => b.title).slice(0, 2).join(' + ') + (list.length > 2 ? ' 等' : '') + ' 合并版';
      const bank = {
        id: uid('bank'),
        title: String(opts.title || '').trim() || autoTitle,
        monogram: '合并',
        subject: '合并题库',
        description: `由 ${list.length} 个题库合并${dedupe ? `，去除 ${r.duplicates} 道重复题` : ''}，共 ${questions.length} 题。原题库保持不变。`,
        accent: list[0].accent || 'accent',
        source: {
          type: 'merge',
          bankIds: list.map((b) => b.id),
          bankTitles: list.map((b) => b.title),
          dedupe,
          total: r.total,
          duplicates: r.duplicates,
          at: now,
        },
        createdAt: now,
        updatedAt: now,
        questions,
      };
      state.banks.unshift(bank);
      state.stats[bank.id] = { answered: 0, correct: 0, days: {}, mastered: {} };
      save();
      return { bank, total: r.total, kept: questions.length, duplicates: r.duplicates };
    },
  };

  /* ---------- 智库（知识库） ---------- */
  function normalizeItem(it) {
    const raw = it || {};
    return {
      id: raw.id || uid('kp'),
      title: String(raw.title || '').trim().slice(0, 80) || '未命名知识点',
      body: String(raw.body || raw.content || '').trim(),
      tags: Array.isArray(raw.tags) ? raw.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 6) : [],
      source: String(raw.source || '').trim().slice(0, 120),
      views: Number(raw.views) || 0,
      lastViewedAt: Number(raw.lastViewedAt) || 0,
      createdAt: Number(raw.createdAt) || Date.now(),
    };
  }

  const kbs = {
    list: () => state.kbs,
    get: (id) => state.kbs.find((k) => k.id === id) || null,
    create(data) {
      const kb = {
        id: uid('kb'),
        title: data.title || '未命名知识库',
        subject: data.subject || '综合',
        description: data.description || '',
        source: data.source || { type: 'manual' },
        createdAt: Date.now(),
        updatedAt: Date.now(),
        items: (data.items || []).map(normalizeItem),
      };
      state.kbs.unshift(kb);
      save();
      return kb;
    },
    update(id, patch) {
      const kb = kbs.get(id);
      if (!kb) return null;
      Object.assign(kb, patch, { updatedAt: Date.now() });
      save();
      return kb;
    },
    remove(id) {
      state.kbs = state.kbs.filter((k) => k.id !== id);
      Object.keys(state.kbSessions).forEach((sid) => {
        if (state.kbSessions[sid].kbId === id) {
          delete state.kbSessions[sid];
          delete state.stats[sid];
          clearProgressFor(sid);
        }
      });
      clearProgressFor(id);
      save();
    },
    addItems(id, items) {
      const kb = kbs.get(id);
      if (!kb) return 0;
      const list = items.map(normalizeItem);
      kb.items = kb.items.concat(list);
      kb.updatedAt = Date.now();
      save();
      return list.length;
    },
    removeItem(kbId, itemId) {
      const kb = kbs.get(kbId);
      if (!kb) return;
      kb.items = kb.items.filter((x) => x.id !== itemId);
      kb.updatedAt = Date.now();
      save();
    },
    /* 专注模式：记录知识点被查看的次数与最近时间 */
    touchView(kbId, itemId) {
      const kb = kbs.get(kbId);
      if (!kb) return null;
      const it = kb.items.find((x) => x.id === itemId);
      if (!it) return null;
      it.views = (Number(it.views) || 0) + 1;
      it.lastViewedAt = Date.now();
      save();
      return it;
    },
  };

  /* 由智库临时生成的练习会话（不进题库列表，只供答题页读取） */
  const kbSessions = {
    get: (id) => state.kbSessions[id] || null,
    list: () => Object.keys(state.kbSessions).map((id) => state.kbSessions[id]),
    create(kb, questions, title) {
      const id = uid('kbs');
      state.kbSessions[id] = {
        id,
        kbId: kb.id || '',
        mentor: !!kb.mentor,
        back: kb.back || '',
        title: title || `${kb.title} · AI 出题`,
        questions: questions.map((q) => normalizeQuestion(q)),
        createdAt: Date.now(),
      };
      const keys = Object.keys(state.kbSessions).sort((a, b) => state.kbSessions[b].createdAt - state.kbSessions[a].createdAt);
      keys.slice(8).forEach((k) => {
        delete state.kbSessions[k];
        delete state.stats[k];
        clearProgressFor(k);
      });
      save();
      return state.kbSessions[id];
    },
    remove(id) {
      delete state.kbSessions[id];
      delete state.stats[id];
      clearProgressFor(id);
      save();
    },
  };

  function normalizeQuestion(q) {
    const type = q.type || 'single';
    const out = {
      id: q.id || uid('q'),
      type,
      stem: (q.stem || '').trim(),
      options: Array.isArray(q.options) ? q.options : [],
      answer: normalizeAnswer(type, q.answer),
      explanation: q.explanation || '',
      category: q.category || '未分类',
      difficulty: q.difficulty || 1,
      tags: q.tags || [],
      meta: q.meta || {},
    };
    if (type === 'judge' || type === 'blank' || type === 'short') out.options = [];
    return out;
  }

  function questionById(qid) {
    for (const b of state.banks) {
      const q = b.questions.find((x) => x.id === qid);
      if (q) return q;
    }
    return null;
  }
  function bankOfQuestion(qid) {
    for (const b of state.banks) {
      if (b.questions.some((x) => x.id === qid)) return b;
    }
    return null;
  }
  function questionByIndex(bankId, index) {
    const b = banks.get(bankId);
    if (!b) return null;
    return b.questions[index] || null;
  }

  /* ---------- 统计 ---------- */
  const stats = {
    of(bankId) {
      if (!state.stats[bankId]) state.stats[bankId] = { answered: 0, correct: 0, days: {}, mastered: {} };
      const s = state.stats[bankId];
      if (!s.days) s.days = {};
      if (!s.mastered) s.mastered = {};
      return s;
    },
    record(bankId, qid, correct) {
      const s = stats.of(bankId);
      s.answered += 1;
      if (correct) s.correct += 1;
      const day = todayKey();
      const prev = s.days[day];
      let cell;
      if (prev && typeof prev === 'object') {
        cell = prev;
      } else {
        /* 兼容旧数据：只有当天总量、没有对错明细，正确率分母先排除这部分 */
        const n = Number(prev) || 0;
        cell = { answered: n, correct: 0, unknown: n };
      }
      cell.answered += 1;
      if (correct) cell.correct += 1;
      s.days[day] = cell;
      if (qid) s.mastered[qid] = !!correct;
      save();
    },
    dayKey(offset) {
      const d = new Date();
      d.setDate(d.getDate() - (offset || 0));
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    },
    todayCount() {
      const day = todayKey();
      return Object.values(state.stats).reduce((sum, s) => {
        const c = s.days && s.days[day];
        return sum + (c && typeof c === 'object' ? (c.answered || 0) : (Number(c) || 0));
      }, 0);
    },
    /* 近 N 天汇总（含今天）；accuracy 只在有对错明细时返回 */
    range(days) {
      const keys = {};
      for (let i = 0; i < days; i++) keys[stats.dayKey(i)] = true;
      let answered = 0, correct = 0, known = 0;
      Object.values(state.stats).forEach((s) => {
        const d = s.days || {};
        Object.keys(d).forEach((k) => {
          if (!keys[k]) return;
          const c = d[k];
          if (c && typeof c === 'object') {
            answered += c.answered || 0;
            correct += c.correct || 0;
            known += Math.max(0, (c.answered || 0) - (c.unknown || 0));
          } else {
            answered += Number(c) || 0;
          }
        });
      });
      return { answered, correct, known, accuracy: known ? Math.round((correct / known) * 100) : null };
    },
    series(n) {
      const out = [];
      for (let i = n - 1; i >= 0; i--) {
        const key = stats.dayKey(i);
        let answered = 0, correct = 0, known = 0;
        Object.values(state.stats).forEach((s) => {
          const c = (s.days || {})[key];
          if (!c) return;
          if (c && typeof c === 'object') {
            answered += c.answered || 0;
            correct += c.correct || 0;
            known += Math.max(0, (c.answered || 0) - (c.unknown || 0));
          } else {
            answered += Number(c) || 0;
          }
        });
        out.push({ day: key, answered, accuracy: known ? Math.round((correct / known) * 100) : null });
      }
      return out;
    },
    totalAnswered() {
      return Object.values(state.stats).reduce((sum, s) => sum + (s.answered || 0), 0);
    },
    accuracyOf(bankId) {
      const s = stats.of(bankId);
      if (!s.answered) return null;
      return Math.round((s.correct / s.answered) * 100);
    },
    answeredOf(bankId) {
      const s = state.stats[bankId];
      return s ? (s.answered || 0) : 0;
    },
    masteredCount(bankId) {
      const s = stats.of(bankId);
      return Object.values(s.mastered || {}).filter(Boolean).length;
    },
    totalCorrect() {
      return Object.values(state.stats).reduce((sum, s) => sum + (s.correct || 0), 0);
    },
  };

  /* ---------- 错题本 ---------- */
  const wrong = {
    add(qid, bankId, lastAnswer, delta) {
      // 只收集真实题库的错题；智库临时练习不写入错题本
      if (bankId && !state.banks.some((b) => b.id === bankId)) return null;
      const cur = state.wrong[qid] || { qid, bankId, count: 0, firstAt: Date.now() };
      cur.bankId = bankId;
      cur.count = (cur.count || 0) + (delta || 1);
      cur.lastAt = Date.now();
      cur.lastAnswer = lastAnswer;
      state.wrong[qid] = cur;
      save();
      return cur;
    },
    remove(qid) {
      delete state.wrong[qid];
      save();
    },
    has: (qid) => !!state.wrong[qid],
    get: (qid) => state.wrong[qid] || null,
    list(bankId) {
      return Object.values(state.wrong)
        .filter((w) => !bankId || w.bankId === bankId)
        .filter((w) => questionById(w.qid))
        .sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0));
    },
    count(bankId) { return wrong.list(bankId).length; },
    total() { return wrong.list().length; },
  };

  /* ---------- 续做记录（答题 / 学题 / 专注模式） ---------- */
  const progress = {
    get(scope, id) {
      const bucket = state.progress && state.progress[scope];
      return (bucket && bucket[id]) || null;
    },
    set(scope, id, data) {
      if (!id) return null;
      if (!state.progress) state.progress = normalizeProgress();
      if (!state.progress[scope]) state.progress[scope] = {};
      state.progress[scope][id] = Object.assign({ updatedAt: Date.now() }, data);
      save();
      return state.progress[scope][id];
    },
    clear(scope, id) {
      const bucket = state.progress && state.progress[scope];
      if (bucket && bucket[id]) { delete bucket[id]; save(); }
    },
    clearFor(id) { clearProgressFor(id); save(); },
  };

  /* ---------- 考试记录 ---------- */
  const exams = {
    save(session) {
      const idx = state.exams.findIndex((e) => e.id === session.id);
      if (idx >= 0) state.exams[idx] = session; else state.exams.unshift(session);
      state.exams = state.exams.slice(0, 30);
      save();
      return session;
    },
    get: (id) => state.exams.find((e) => e.id === id) || null,
    list: (bankId) => state.exams.filter((e) => !bankId || e.bankId === bankId),
    setActive(session) { state.activeExam = session; save(); },
    getActive: () => state.activeExam,
    clearActive() { state.activeExam = null; save(); },
  };

  /* ---------- 收藏 ---------- */
  const favorites = {
    toggle(qid) {
      const i = state.favorites.indexOf(qid);
      if (i >= 0) state.favorites.splice(i, 1); else state.favorites.push(qid);
      save();
      return i < 0;
    },
    has: (qid) => state.favorites.includes(qid),
    list() {
      const seen = new Set();
      return state.favorites.filter((qid) => {
        if (seen.has(qid)) return false;
        seen.add(qid);
        return !!questionById(qid);
      });
    },
  };

  /* ---------- 人物画像 ---------- */
  const profile = {
    get: () => state.profile,
    text: () => state.profile.text || '',
    set(text) {
      state.profile.text = String(text || '').trim().slice(0, 300);
      state.profile.updatedAt = Date.now();
      state.profile.onboarded = true;
      save();
    },
    clear() {
      state.profile = { text: '', onboarded: false, updatedAt: Date.now() };
      save();
    },
    markOnboarded() {
      state.profile.onboarded = true;
      save();
    },
  };

  /* ---------- 试卷（组卷） ---------- */
  const paperLayout = () => ({
    showAnswer: true,
    showExplanation: true,
    showScore: true,
    columns: 1,
    shuffle: false,
  });

  const papers = {
    layout: paperLayout,
    list: () => state.papers.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)),
    get: (id) => state.papers.find((p) => p.id === id) || null,
    save(data) {
      const now = Date.now();
      let p = data.id ? papers.get(data.id) : null;
      if (!p) {
        p = { id: uid('paper'), createdAt: now, items: [] };
        state.papers.push(p);
      }
      p.title = String(data.title || '未命名试卷').trim() || '未命名试卷';
      p.subtitle = String(data.subtitle || '').trim();
      p.bankIds = (data.bankIds || []).slice();
      p.items = (data.items || []).map((it) => ({ qid: it.qid, bankId: it.bankId })).filter((it) => it.qid);
      p.layout = Object.assign(paperLayout(), p.layout, data.layout || {});
      p.source = data.source || p.source || 'manual';
      p.note = data.note || p.note || '';
      p.updatedAt = now;
      save();
      return p;
    },
    remove(id) {
      state.papers = state.papers.filter((p) => p.id !== id);
      save();
    },
    duplicate(id) {
      const src = papers.get(id);
      if (!src) return null;
      const copy = JSON.parse(JSON.stringify(src));
      copy.id = uid('paper');
      copy.title = src.title + '（副本）';
      copy.createdAt = copy.updatedAt = Date.now();
      state.papers.push(copy);
      save();
      return copy;
    },
    questionIds(p) {
      return (p.items || []).map((it) => it.qid).filter((qid) => Store.questionById(qid));
    },
  };

  /* ---------- AI 调用记录 ---------- */
  const aiUsage = {
    limit() {
      const n = Number((state.settings.usage || {}).limit);
      return [50, 100, 200, 500].includes(n) ? n : 100;
    },
    setLimit(n) {
      const v = clamp(Math.round(Number(n) || 100), 10, 1000);
      Store.settings.patch('usage', { limit: v });
      state.aiLog = state.aiLog.slice(0, v);
      save();
    },
    list: () => state.aiLog,
    totals: () => state.aiTotals,
    add(entry) {
      const rec = {
        id: uid('ai'),
        at: entry.at || Date.now(),
        purpose: entry.purpose || 'AI 调用',
        model: entry.model || '',
        ms: Math.max(0, Math.round(entry.ms || 0)),
        ok: entry.ok !== false,
        error: entry.error || '',
        prompt: Math.max(0, Math.round(entry.prompt || 0)),
        completion: Math.max(0, Math.round(entry.completion || 0)),
        tokens: Math.max(0, Math.round(entry.tokens || 0)),
        estimated: !!entry.estimated,
      };
      const t = state.aiTotals;
      t.calls += 1;
      t.tokens += rec.tokens;
      t.prompt += rec.prompt;
      t.completion += rec.completion;
      if (!rec.ok) t.failed += 1;
      state.aiLog.unshift(rec);
      const limit = aiUsage.limit();
      if (state.aiLog.length > limit) state.aiLog = state.aiLog.slice(0, limit);
      save();
      return rec;
    },
    clear() {
      state.aiLog = [];
      state.aiTotals = { calls: 0, tokens: 0, prompt: 0, completion: 0, failed: 0 };
      save();
    },
    successRate() {
      const t = state.aiTotals;
      if (!t.calls) return null;
      return Math.round(((t.calls - t.failed) / t.calls) * 100);
    },
  };

  /* ---------- AI 带教 ---------- */
  const mentor = {
    get: () => state.mentor,
    config: () => state.mentor.config,
    isActive() { return !!(state.mentor.applied && state.mentor.enabled); },
    save(config) {
      const m = state.mentor;
      m.config = normalizeMentor({ config: Object.assign({}, m.config, config || {}) }).config;
      m.applied = true;
      m.enabled = true;
      m.updatedAt = Date.now();
      if (!m.createdAt) m.createdAt = Date.now();
      save();
      return m;
    },
    setEnabled(v) {
      state.mentor.enabled = !!v;
      state.mentor.updatedAt = Date.now();
      save();
      return state.mentor;
    },
    markGreet() {
      state.mentor.lastGreetAt = Date.now();
      state.mentor.lastGreetDay = todayKey();
      save();
    },
    remove() {
      state.mentor = defaultMentor();
      save();
    },
  };

  /* ---------- 备份 ---------- */
  function exportAll() {
    return JSON.stringify({
      app: 'quizapp',
      exportedAt: Date.now(),
      data: state,
    }, null, 2);
  }

  function importAll(json) {
    const parsed = typeof json === 'string' ? JSON.parse(json) : json;
    const data = parsed && parsed.data ? parsed.data : parsed;
    if (!data || !Array.isArray(data.banks)) throw new Error('备份文件格式不正确');
    state = Object.assign(defaultState(), data);
    state.settings = mergeSettings(data.settings);
    state.mentor = normalizeMentor(data.mentor);
    state.progress = normalizeProgress(data.progress);
    normalizeFavorites();
    save();
    return state;
  }

  function reset(keepSettings) {
    const s = keepSettings ? state.settings : defaultSettings();
    state = defaultState();
    state.settings = s;
    state.banks = window.buildSeedBanks ? window.buildSeedBanks() : [];
    save();
  }

  function setLastBank(id) {
    state.lastBankId = id;
    persist();
  }

  return {
    init, save, getState, subscribe,
    settings, banks, kbs, kbSessions, progress, stats, wrong, exams, favorites, papers, profile, mentor, aiUsage,
    questionById, bankOfQuestion, questionByIndex,
    normalizeQuestion, exportAll, importAll, reset, setLastBank,
  };
})();
