/* ============================================================
   算法层：把用户的自然语言指令预分解、结构化，再编排成 prompt
   - 阶段式流水线，可注册 / 可开关 / 可扩展
   - 每个阶段只做一件事，输出结构化上下文（fragments / slots）
   ============================================================ */
window.Algo = (function () {
  const stages = [];
  const templates = {};
  const RULES = [
    { intent: 'grade', weight: 3.2, kws: ['批改', '评分', '打分', '判分', '给我几分', '几分', '看看我写的', '答得怎么样', '这样答对吗', '能得多少分'] },
    { intent: 'hint', weight: 2.9, kws: ['提示', '思路', '别告诉我答案', '不要直接给答案', '引导', '线索', '怎么想', '从哪下手'] },
    { intent: 'compare', weight: 2.6, kws: ['区别', '对比', '异同', '不同点', '差别'] },
    { intent: 'summarize', weight: 2.5, kws: ['总结', '归纳', '考点', '重点', '梳理', '知识框架', '考什么'] },
    { intent: 'example', weight: 2.3, kws: ['举个例子', '举例', '例子', '应用场景', '实际中', '生活里'] },
    { intent: 'quiz', weight: 2.3, kws: ['出题', '考考我', '再出一道', '变式题', '练习一下'] },
    { intent: 'explain', weight: 2.0, kws: ['讲讲', '讲解', '解释', '为什么', '怎么理解', '看不懂', '没懂', '原理', '什么意思', '分析', '说一下', '说明', '详细', '再讲'] },
  ];

  const NUM_MAP = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 十一: 11, 十二: 12, 十三: 13, 十四: 14, 十五: 15, 十六: 16, 十七: 17, 十八: 18, 十九: 19, 二十: 20 };

  const STYLE = {
    brief: { maxChars: 2600, label: '精炼', rule: '两三句话点透：这题考什么、为什么这么选。不铺垫、不展开，简单题尤其要短。' },
    balanced: { maxChars: 6000, label: '自然', rule: '像当面讲题：先用一句话点出思路，再顺着思路讲到关键处，遇到易错点补一句提醒。' },
    deep: { maxChars: 9000, label: '详细', rule: '难的地方多讲几句：把推理过程、容易混淆的概念和典型坑讲透；但不要重复题干，也不要为了长而长。' },
  };

  const INTENT_LABEL = {
    explain: '题目讲解', hint: '思路提示', grade: '答案批改', compare: '概念辨析',
    summarize: '考点归纳', example: '举例说明', quiz: '变式出题', chat: '自由问答',
  };

  /* ---------- 注册 ---------- */
  function registerStage(stage) {
    if (!stage || !stage.id || typeof stage.run !== 'function') throw new Error('阶段定义不合法');
    const i = stages.findIndex((s) => s.id === stage.id);
    if (i >= 0) stages[i] = stage; else stages.push(stage);
    stages.sort((a, b) => a.order - b.order);
  }
  function registerTemplate(intent, fn) { templates[intent] = fn; }
  function getStages() { return stages.slice(); }
  function getTemplates() { return Object.keys(templates); }

  const frag = (id, label, content, priority) => ({
    id, label, content: String(content == null ? '' : content).trim(), priority: priority || 3, truncated: false,
  });

  /* ---------- 阶段 1：归一化 ---------- */
  registerStage({
    id: 'normalize', name: '归一化清洗', order: 10,
    desc: '去除多余空白与不可见字符，约束输入长度',
    run(ctx) {
      let t = String(ctx.input.text || '').replace(/[\u200b-\u200f\ufeff]/g, '').replace(/\s+/g, ' ').trim();
      if (t.length > 1200) { t = t.slice(0, 1200); ctx.notes.push('输入过长，已截断至 1200 字'); }
      if (!t) {
        t = ctx.input.intentHint === 'grade' ? '请批改我的作答' : (ctx.input.question ? '请讲解这道题' : '你好');
      }
      ctx.text = t;
      ctx.slots.language = /[a-zA-Z]{4,}/.test(t) && !/[\u4e00-\u9fa5]/.test(t) ? 'en' : 'zh';
      ctx.slots.inputChars = t.length;
    },
  });

  /* ---------- 阶段 2：意图识别 ---------- */
  registerStage({
    id: 'intent', name: '意图识别', order: 20,
    desc: '关键词加权打分，判定讲解 / 提示 / 批改等意图',
    run(ctx) {
      if (ctx.input.intentHint === 'grade') {
        ctx.intent = 'grade';
        ctx.confidence = 0.99;
        ctx.slots.intentScores = { grade: 9 };
        return;
      }
      const text = ctx.text;
      const scores = {};
      RULES.forEach((r) => {
        let s = 0;
        r.kws.forEach((kw) => { if (text.includes(kw)) s += r.weight; });
        if (s > 0) scores[r.intent] = +(s).toFixed(2);
      });
      // 以疑问词开头的追问更可能是讲解
      if (/^(为什么|为啥|怎么|如何|是不是|能不能|可以)/.test(text)) scores.explain = (scores.explain || 0) + 1.6;
      if (/^\s*[A-H]\s*(选项)?[，。]?(为什么|为啥)/.test(text)) scores.explain = (scores.explain || 0) + 2;

      let best = 'chat', bestScore = 0;
      Object.keys(scores).forEach((k) => { if (scores[k] > bestScore) { best = k; bestScore = scores[k]; } });
      if (bestScore < 1 && ctx.input.question && /[？?]|吗|呢/.test(text)) { best = 'explain'; bestScore = 1.2; }
      ctx.intent = best;
      ctx.confidence = best === 'chat' ? 0.35 : Math.min(0.96, 0.48 + bestScore * 0.1);
      ctx.slots.intentScores = scores;
      ctx.slots.intentLabel = INTENT_LABEL[best];
    },
  });

  /* ---------- 阶段 3：指代解析 ---------- */
  registerStage({
    id: 'reference', name: '指代解析', order: 30,
    desc: '识别「第 3 题」「选项 B」等指代，定位具体题目',
    run(ctx) {
      const text = ctx.text;
      let num = null;
      let m = text.match(/第\s*([0-9]{1,3})\s*(?:道)?\s*题/);
      if (m) num = parseInt(m[1], 10);
      if (num == null) {
        m = text.match(/第\s*([一二三四五六七八九十]{1,3})\s*(?:道)?\s*题/);
        if (m) num = NUM_MAP[m[1]] || null;
      }
      let option = null;
      m = text.match(/(?:选项|选)\s*([A-Ha-h])\b/);
      if (m) option = m[1].toUpperCase();
      if (!option) {
        m = text.match(/([A-H])\s*(?:选项|错在哪|哪不对)/);
        if (m) option = m[1].toUpperCase();
      }
      if (!option) {
        m = text.match(/(?:为什么|为啥)(?:不是|不选|排除)\s*([A-Ha-h])\b/);
        if (m) option = m[1].toUpperCase();
      }

      ctx.slots.questionNumber = num;
      ctx.slots.optionFocus = option;

      let q = ctx.input.question || null;
      if (num != null && ctx.input.bank) {
        const target = ctx.input.bank.questions[num - 1];
        if (target) {
          ctx.referencedQuestion = target;
          ctx.slots.questionIndex = num;
          if (!q || q.id !== target.id) {
            q = target;
            ctx.notes.push(`按指代定位到第 ${num} 题`);
          }
        } else {
          ctx.notes.push(`题库中没有第 ${num} 题，已回退到当前题`);
        }
      }
      ctx.focusQuestion = q;
      if (q) {
        ctx.slots.questionId = q.id;
        ctx.slots.questionType = q.type;
        ctx.slots.questionCategory = q.category;
      }
      if (option && q && Array.isArray(q.options)) {
        const op = q.options.find((o) => o.key === option);
        if (op) ctx.slots.optionText = op.text;
      }
    },
  });

  /* ---------- 阶段 4：上下文片段抽取 ---------- */
  registerStage({
    id: 'context', name: '片段抽取', order: 40,
    desc: '把题干、选项、答案、解析、作答等拆成结构化片段',
    run(ctx) {
      const q = ctx.focusQuestion;
      const list = [];
      if (ctx.input.bank) {
        list.push(frag('bank', '题库', `${ctx.input.bank.title}｜${ctx.input.bank.subject || '未分类'}`, 1));
      }
      if (q) {
        list.push(frag('stem', '题干', q.stem, 5));
        if (q.options && q.options.length) {
          list.push(frag('options', '选项', q.options.map((o) => `${o.key}. ${o.text}`).join('\n'), 5));
        }
        if (ctx.slots.optionFocus) {
          const t = ctx.slots.optionText ? `选项 ${ctx.slots.optionFocus}：${ctx.slots.optionText}` : `选项 ${ctx.slots.optionFocus}`;
          list.push(frag('focusOption', '关注选项', t, 4));
        }
        if (ctx.intent !== 'hint') {
          const ans = q.type === 'judge' ? (normalizeAnswer('judge', q.answer) === 'T' ? '正确' : '错误') : (Array.isArray(q.answer) ? q.answer.join('、') : q.answer);
          list.push(frag('answer', '正确答案', ans, 5));
        }
        if (q.explanation && ctx.intent !== 'hint') list.push(frag('explanation', '参考解析', q.explanation, 3));
        if (ctx.input.userAnswer && String(ctx.input.userAnswer).trim()) {
          list.push(frag('userAnswer', '我的作答', String(ctx.input.userAnswer), 5));
        }
        if (q.category) list.push(frag('category', '知识分类', q.category, 2));
        if (q.tags && q.tags.length) list.push(frag('tags', '标签', q.tags.join(' / '), 1));
      }
      list.push(frag('userQuestion', '用户疑问', ctx.text, 5));
      ctx.fragments = list.filter((f) => f.content);
      ctx.slots.fragmentCount = ctx.fragments.length;
    },
  });

  /* ---------- 阶段 5：约束构造 ---------- */
  registerStage({
    id: 'constraints', name: '约束构造', order: 50,
    desc: '根据设置生成篇幅、语气、输出格式等约束',
    run(ctx) {
      const algo = ctx.settings.algo || {};
      const style = STYLE[algo.explainStyle] || STYLE.balanced;
      const c = {
        style: algo.explainStyle || 'balanced',
        maxChars: Math.min(algo.maxChars || style.maxChars, style.maxChars),
        language: '中文',
        rules: [
          '只使用题目与解析中出现的信息，不要编造事实或题外数据。',
          '像一位会聊天的老师在讲题：口语化短句，语气自然、有起伏，不要端着。',
          '不要用「首先 / 其次 / 最后 / 综上所述 / 总的来说」这类模板连接词，也不要用固定段落标题。',
          '简单题直接说透，不要为了凑篇幅展开；真正难的地方再停下来细讲。',
          '如果题目信息不足，明确指出缺什么，再给出合理推断。',
        ],
      };
      if (ctx.intent === 'explain') c.rules.push(style.rule);
      if (ctx.intent === 'hint') c.rules.push('只提供 1～3 步思路提示，不要直接说出正确选项或完整答案。');
      if (ctx.intent === 'grade') {
        c.rules = [
          '你是在卷面上写批注的老师：先看学生答到了什么，再指出漏掉的关键点。',
          '评分范围 0～10 分，允许 0.5 分粒度；要点齐全且表述准确才给高分。',
          '评语要具体，点出学生原话里哪句对、哪句含糊，不要写「基本正确，继续努力」这类套话。',
          '必须只输出 JSON，不要输出 Markdown 代码块或额外说明。',
        ];
        c.maxChars = 4000;
      }
      if (ctx.intent === 'compare') c.rules.push('用对照的方式说明差异，先一句话给出核心区别，再展开两三个方面。');
      if (ctx.intent === 'summarize') c.rules.push('按考点罗列，标注易错点；最多 5 条，每条一句话，不要写成教科书目录。');
      if (ctx.intent === 'example') c.rules.push('给出一个贴近日常或工程实践的具体例子，并说明它与考点的对应关系。');
      if (ctx.intent === 'quiz') c.rules.push('基于当前知识点出一道同难度的变式题，先不给答案，等用户作答。');
      if (ctx.slots.optionFocus) c.rules.push(`重点解释选项 ${ctx.slots.optionFocus} 为什么对或为什么错。`);
      if (ctx.intent === 'grade' && !ctx.input.userAnswer) {
        c.rules.push('用户尚未提供作答内容，请在 JSON 的 comment 中说明无法评分。');
      }
      const profileText = String(ctx.input.profile || '').trim().slice(0, 300);
      if (profileText) {
        c.profile = profileText;
        c.rules.push(`学生画像：${profileText} 讲解深浅、举例场景和语气要贴着这个学生来调整，但不要把画像内容念出来。`);
      }
      ctx.constraints = c;
    },
  });

  /* ---------- 阶段 6：片段压缩 ---------- */
  registerStage({
    id: 'budget', name: '片段压缩', order: 60,
    desc: '按优先级与字符预算裁剪上下文，避免无谓的 token 消耗',
    run(ctx) {
      const limit = (ctx.constraints && ctx.constraints.maxChars) || 6000;
      let total = ctx.fragments.reduce((s, f) => s + f.content.length, 0);
      if (total <= limit) { ctx.slots.contextChars = total; return; }
      const order = ctx.fragments.slice().sort((a, b) => a.priority - b.priority);
      for (const f of order) {
        if (total <= limit) break;
        if (f.id === 'stem' || f.id === 'userQuestion' || f.id === 'userAnswer') continue;
        const room = Math.max(60, limit - (total - f.content.length));
        if (f.content.length > room) {
          f.content = f.content.slice(0, Math.max(40, room - 2)) + '…';
          f.truncated = true;
        }
        total = ctx.fragments.reduce((s, x) => s + x.content.length, 0);
      }
      ctx.slots.contextChars = total;
      ctx.notes.push('上下文超出预算，已按优先级压缩片段');
    },
  });

  /* ---------- 阶段 7：模板编排 ---------- */
  registerStage({
    id: 'template', name: '模板编排', order: 70,
    desc: '将结构化片段填入对应意图的 prompt 模板',
    run(ctx) {
      const tpl = templates[ctx.intent] || templates.chat;
      const built = tpl(ctx);
      ctx.templateId = ctx.intent + (templates[ctx.intent] ? '' : '(fallback)');
      const history = (ctx.input.history || []).filter((m) => m && m.content).slice(-6);
      const messages = [{ role: 'system', content: built.system }];
      if (ctx.intent !== 'grade') {
        history.forEach((m) => messages.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content).slice(0, 800) }));
      }
      messages.push({ role: 'user', content: built.user });
      ctx.messages = messages;
      ctx.slots.historyTurns = ctx.intent === 'grade' ? 0 : history.length;
      ctx.promptSections = built.sections || [];
    },
  });

  /* ---------- 阶段 8：组装校验 ---------- */
  registerStage({
    id: 'finalize', name: '组装校验', order: 80,
    desc: '生成最终请求体与调试信息',
    run(ctx) {
      const promptText = ctx.messages.map((m) => `### ${m.role}\n${m.content}`).join('\n\n');
      ctx.packet = {
        intent: ctx.intent,
        intentLabel: INTENT_LABEL[ctx.intent] || '问答',
        confidence: ctx.confidence,
        slots: ctx.slots,
        fragments: ctx.fragments,
        constraints: ctx.constraints,
        messages: ctx.messages,
        templateId: ctx.templateId,
        question: ctx.focusQuestion || null,
        bank: ctx.input.bank || null,
        debug: {
          stages: ctx.stages,
          notes: ctx.notes,
          promptText,
          promptChars: promptText.length,
          durationMs: 0,
          mode: ctx.input.mode,
        },
      };
    },
  });

  /* ---------- 模板 ---------- */
  function sections(ctx, opts) {
    const skip = (opts && opts.skip) || [];
    return ctx.fragments.filter((f) => !skip.includes(f.id))
      .map((f) => `【${f.label}】\n${f.content}`).join('\n\n');
  }
  function constraintBlock(ctx) {
    const c = ctx.constraints;
    const tail = ctx.intent === 'grade' ? '' : '\n- 直接进入正题，不要用「好的」「当然可以」开头，也不要在结尾反问「还需要我做什么吗」。';
    return `【回答要求】\n${c.rules.map((r) => '- ' + r).join('\n')}\n- 使用${c.language}回答。${tail}`;
  }

  registerTemplate('explain', (ctx) => ({
    system: '你是一位讲课很自然的老师，习惯先看出这道题在考什么，再顺着学生的疑问往下讲。你说话像聊天，句子不长，不端着，也不套模板；但答案和依据必须准确。',
    user: `${sections(ctx)}\n\n【你的任务】\n就这道题回答学生：开头直接切入——这题真正考的是什么、思路该落在哪。然后顺着这条思路讲到答案、讲清其他选项为什么不对，遇到容易踩的坑顺手提醒一句。不要用固定段落标题，不要复述题干，也不要用「首先/其次/综上所述」。这题要是很简单，几句话讲完就好；学生问到难点时再展开。\n\n${constraintBlock(ctx)}`,
  }));

  registerTemplate('hint', (ctx) => ({
    system: '你是一位引导式家教，喜欢用一个关键问题把学生推到正确的思路上，而不是替他作答。',
    user: `${sections(ctx, { skip: ['answer', 'explanation'] })}\n\n【你的任务】\n不要公布答案。用一两句口语化的提示，指出该看题目的哪一部分、该想起哪个知识点；最后可以抛一个问题让他接着想。不要写成步骤清单。\n\n${constraintBlock(ctx)}`,
  }));

  registerTemplate('grade', (ctx) => ({
    system: '你是在卷面上写批注的老师：先看学生答到了什么，再指出漏掉的关键点。评语要具体，不写套话，也不为了鼓励而虚高给分。',
    user: `${sections(ctx)}\n\n【你的任务】\n批改学生的作答，依据「正确答案 / 参考解析」判断要点覆盖情况并给出分数。\nverdict 用一句话说清整体印象；comment 用两三句自然的话，指出具体哪句答得好、哪里含糊或漏了；suggestion 给一句可执行的改进建议。\n\n输出格式（严格 JSON，不要代码块）：\n{"score": 0到10的数字, "verdict": "一句话总评", "comment": "两三句具体点评", "hit": ["答到的要点"], "miss": ["遗漏或错误的要点"], "suggestion": "一句下一步建议"}\n\n${constraintBlock(ctx)}`,
  }));

  registerTemplate('compare', (ctx) => ({
    system: '你是一位喜欢把相似概念摆在一起对照的老师，能一句话说清关键差别。',
    user: `${sections(ctx)}\n\n【你的任务】\n围绕学生的问题做辨析：先用一句话给出核心差别，再按两三个方面讲清楚，最后点一句考试里最容易混的地方。\n\n${constraintBlock(ctx)}`,
  }));

  registerTemplate('summarize', (ctx) => ({
    system: '你是一位擅长把零散题目归纳成复习线索的老师，说话简洁，不堆术语。',
    user: `${sections(ctx)}\n\n【你的任务】\n用几句话归纳这题涉及的考点：核心概念是什么、常见考法怎么变、容易错在哪。最多 5 条，每条一句话，不要写成教科书目录。\n\n${constraintBlock(ctx)}`,
  }));

  registerTemplate('example', (ctx) => ({
    system: '你是一位善于用生活化例子讲抽象概念的老师，例子讲完一定会落回考点。',
    user: `${sections(ctx)}\n\n【你的任务】\n用一个具体例子说明这道题背后的概念，并明确指出例子与考点的对应关系；不要用空泛的比喻代替解释。\n\n${constraintBlock(ctx)}`,
  }));

  registerTemplate('quiz', (ctx) => ({
    system: '你是一位出题老师，擅长基于同一知识点设计难度相近的变式题。',
    user: `${sections(ctx)}\n\n【你的任务】\n基于上面的知识点出一道变式题（题型与难度接近），只给出题目和选项，不要公布答案；最后用一句话告诉学生「作答后我可以帮你批改」。\n\n${constraintBlock(ctx)}`,
  }));

  registerTemplate('chat', (ctx) => ({
    system: '你是一位可靠、说话自然的学习助手，会先弄明白对方到底在问什么，再直接回答；不确定的地方会说明。',
    user: `${sections(ctx)}\n\n${constraintBlock(ctx)}`,
  }));

  /* ---------- 组卷：把要求与候选题目预包装成选卷指令 ---------- */
  function compose(opts) {
    const started = Date.now();
    const brief = String((opts && opts.brief) || '').trim() || '按覆盖面均衡、难度适中来选。';
    const count = Math.max(1, Math.round((opts && opts.count) || 20));
    const catalog = (opts && opts.catalog) || [];
    const lines = catalog.map((q) => `${q.qid}｜${q.typeLabel || q.type}｜${q.category || '未分类'}｜${String(q.stem || '').replace(/\s+/g, ' ').slice(0, 70)}`).join('\n');
    const system = '你是一位命题组卷老师，会根据老师给的范围和要求，从候选题目里挑出一套结构合理的试卷。你只从候选题目中选，不编造题目 ID。';
    const user = `【组卷要求】\n${brief}\n\n【题量】\n共 ${count} 题。\n\n【候选题目（ID｜题型｜分类｜题干摘要）】\n${lines}\n\n【输出要求】\n只输出 JSON，不要代码块：{"ids":["题目ID", ...], "note":"一两句说明选卷思路"}\n从候选题里选 ${count} 道；候选题不够时就全选。尽量贴合要求的题型比例与难度，同一题库的题均衡覆盖不同章节，避免同一考点重复。`;
    return {
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      debug: { catalogSize: catalog.length, promptChars: user.length, durationMs: Date.now() - started },
    };
  }

  /* ---------- 认识你：引导对话与画像归纳 ---------- */
  function persona(opts) {
    const started = Date.now();
    const o = opts || {};
    const history = (o.history || []).filter((m) => m && m.content && m.role !== 'system');
    const turns = history.filter((m) => m.role === 'user').length;
    const transcript = history
      .map((m) => `${m.role === 'assistant' ? '我' : '学生'}：${String(m.content).replace(/\s+/g, ' ').slice(0, 400)}`)
      .join('\n');
    const existing = String(o.existing || '').trim().slice(0, 300);
    let messages;

    if (o.phase === 'summary') {
      messages = [
        { role: 'system', content: '你是一位很会看人的老师，能从几句闲聊里归纳出学生的真实情况。你写的画像会交给其他老师用来调整讲法，所以要具体、可用，不写空话。' },
        {
          role: 'user',
          content: `【聊天记录】\n${transcript || '（没有对话内容）'}\n\n【已有画像】\n${existing || '（暂无）'}\n\n【任务】\n把了解到的信息归纳成一段中文人物画像，不超过 300 字。用第三人称写：这个学生是谁、在学什么或准备什么、平时怎么学、喜欢什么样的讲解、容易在哪卡住。只写聊天里能看出来的，不要编造，不要客套。不要分点、不要标题、不要「综上所述」，就是一段自然的话。\n\n只输出画像正文。`,
        },
      ];
    } else {
      messages = [
        { role: 'system', content: '你是一位刚认识学生的老师，想先了解他是谁、怎么学、喜欢怎么被讲解，好让之后的讲题更贴合他。你像聊天一样发问，一次只问一两个，语气自然，不像问卷，也不连着追问。' },
        ...history.map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content).slice(0, 800) })),
        {
          role: 'user',
          content: turns === 0
            ? '（开始认识一下）先自然地打个招呼，说一句你想了解他什么，然后问一两个最简单的问题，比如他怎么称呼、在学什么或准备什么考试。'
            : `【接下来的要求】\n顺着上面的对话继续：先接一句他说的话，再问一两个还没聊到的问题（学习习惯、喜欢的讲解方式、容易卡住的地方、身份或年龄段）。一共不要超过 3 轮提问，别问太细。如果已经聊得差不多，就自然收尾，并告诉他可以生成画像了。`,
        },
      ];
    }

    return {
      messages,
      phase: o.phase === 'summary' ? 'summary' : 'chat',
      debug: { turns, promptChars: messages.reduce((s, m) => s + m.content.length, 0), durationMs: Date.now() - started },
    };
  }

  /* ---------- 执行 ---------- */
  function run(input) {
    const started = Date.now();
    const settings = Store.settings.get();
    const disabled = new Set((settings.algo && settings.algo.disabledStages) || []);
    const ctx = {
      input: {
        text: (input && input.text) || '',
        question: (input && input.question) || null,
        bank: (input && input.bank) || null,
        history: (input && input.history) || [],
        userAnswer: (input && input.userAnswer) || '',
        profile: (input && input.profile) || '',
        intentHint: (input && input.intentHint) || null,
        mode: (input && input.mode) || 'chat',
      },
      settings,
      text: '', slots: {}, fragments: [], constraints: {}, notes: [],
      intent: 'chat', confidence: 0, stages: [],
      focusQuestion: null, referencedQuestion: null, messages: [],
    };
    stages.forEach((st) => {
      const enabled = !disabled.has(st.id);
      ctx.stages.push({ id: st.id, name: st.name, enabled });
      if (!enabled) return;
      try { st.run(ctx); } catch (e) {
        console.error('[algo] stage failed', st.id, e);
        ctx.notes.push(`阶段「${st.name}」执行异常：${e.message}`);
      }
    });
    const packet = ctx.packet || {
      intent: ctx.intent, intentLabel: INTENT_LABEL[ctx.intent] || '问答', confidence: ctx.confidence,
      slots: ctx.slots, fragments: ctx.fragments, constraints: ctx.constraints,
      messages: ctx.messages, templateId: ctx.templateId, question: ctx.focusQuestion,
      bank: ctx.input.bank, debug: { stages: ctx.stages, notes: ctx.notes, promptText: '', promptChars: 0, durationMs: 0 },
    };
    packet.debug.durationMs = Date.now() - started;
    return packet;
  }

  function describe() {
    return stages.map((s) => ({ id: s.id, name: s.name, order: s.order, desc: s.desc }));
  }

  return { run, compose, persona, registerStage, registerTemplate, getStages, getTemplates, describe, STYLE, INTENT_LABEL };
})();
