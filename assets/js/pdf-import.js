/* PDF 文本提取 + 题目结构化识别 */
window.PDFImport = (function () {
  const TYPE_KEYS = [
    { type: 'single', re: /单项选择|单选/ },
    { type: 'multiple', re: /多项选择|多选|不定项/ },
    { type: 'judge', re: /判断题|判断/ },
    { type: 'blank', re: /填空题|填空/ },
    { type: 'short', re: /简答题|简答|论述|名词解释|问答题|计算题|案例分析|综合题/ },
  ];

  /* ---------- PDF 文本提取 ---------- */
  function buildLines(items) {
    const rows = [];
    items.forEach((it) => {
      const str = (it.str || '').replace(/\u00a0/g, ' ');
      if (!str.trim()) return;
      const y = it.transform[5];
      const x = it.transform[4];
      const h = it.height || Math.abs(it.transform[3]) || 10;
      let row = rows.find((r) => Math.abs(r.y - y) <= Math.max(2.2, h * 0.45));
      if (!row) { row = { y, h, items: [] }; rows.push(row); }
      row.items.push({ x, str, w: it.width || 0, h });
      row.h = Math.max(row.h, h);
    });
    rows.sort((a, b) => b.y - a.y);
    return rows.map((r) => {
      r.items.sort((a, b) => a.x - b.x);
      let out = '', lastEnd = null;
      r.items.forEach((it) => {
        if (lastEnd != null) {
          const gap = it.x - lastEnd;
          const prev = out.slice(-1), next = it.str.slice(0, 1);
          const cjk = /[\u4e00-\u9fa5]/.test(prev) || /[\u4e00-\u9fa5]/.test(next);
          if (!cjk && gap > Math.max(2, (it.h || 10) * 1.1)) out += ' ';
        }
        out += it.str;
        lastEnd = it.x + (it.w || 0);
      });
      return out.replace(/\s+/g, ' ').trim();
    }).filter(Boolean);
  }

  function loadScriptOnce(src) {
    return new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = src;
      el.onload = () => resolve();
      el.onerror = () => reject(new Error('无法加载 PDF 工作线程脚本，请确认 vendor 目录完整'));
      document.head.appendChild(el);
    });
  }

  /* file:// 下浏览器禁止创建 Worker，也无法动态 import 本地脚本；
     改为主线程直接加载 worker 脚本，pdf.js 会复用其 WorkerMessageHandler。 */
  async function ensureEngine() {
    if (!window.pdfjsLib) throw new Error('PDF 解析组件未加载，请确认 vendor 目录完整');
    const workerUrl = new URL('vendor/pdf.worker.min.js', document.baseURI).href;
    if (location.protocol === 'file:') {
      if (!window.pdfjsWorker) await loadScriptOnce(workerUrl);
      return;
    }
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
  }

  async function extract(file, onProgress) {
    if (!/\.pdf$/i.test(file.name)) throw new Error('请选择 PDF 文件');
    await ensureEngine();
    const buffer = await readFile(file, 'buffer');
    const task = pdfjsLib.getDocument({
      data: new Uint8Array(buffer),
      isEvalSupported: false,
      useSystemFonts: true,
      disableFontFace: true,
    });
    const pages = [];
    let pdf;
    try {
      pdf = await task.promise;
    } catch (e) {
      if (e && e.name === 'PasswordException') throw new Error('这个 PDF 有密码保护，请先解除密码再导入');
      throw new Error('无法解析该 PDF：' + (e && e.message ? e.message : '文件可能已损坏'));
    }
    let emptyPages = 0;
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const lines = buildLines(content.items || []);
      if (!lines.length) emptyPages++;
      pages.push({ page: i, lines });
      if (onProgress) onProgress(i / pdf.numPages, i, pdf.numPages);
    }
    const text = pages.map((p) => p.lines.join('\n')).join('\f');
    return {
      pages, text, pageCount: pdf.numPages,
      chars: text.replace(/\s/g, '').length,
      emptyPages,
      scanned: emptyPages >= Math.ceil(pdf.numPages * 0.6),
    };
  }

  /* ---------- 文本清洗 ---------- */
  function cleanLines(lines) {
    return lines.map((l) => l
      .replace(/\u3000/g, ' ')
      .replace(/[\uFF10-\uFF19]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
      .replace(/[\uFF21-\uFF3A\uFF41-\uFF5A]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
      .replace(/[ \t]+/g, ' ')
      .replace(/．/g, '.')
      .trim())
      .filter((l) => {
        if (!l) return false;
        if (/^[-—–_·.\s]*\d{1,4}[-—–_·.\s]*$/.test(l)) return false;
        if (/^第\s*\d+\s*页(\s*[,，/]?\s*共\s*\d+\s*页)?$/i.test(l)) return false;
        if (/^[-—–\s]*\d+\s*\/\s*\d+[-—–\s]*$/.test(l)) return false;
        return true;
      });
  }

  function stripRunning(pages) {
    if (pages.length < 3) return pages;
    const counter = {};
    const contentLike = /(答案|解析|分析|^\s*\d{1,3}\s*[.、)]|^\s*[A-H]\s*[.、)])/;
    pages.forEach((p) => {
      const cand = new Set(p.lines.slice(0, 2).concat(p.lines.slice(-2)));
      cand.forEach((l) => {
        if (l.length > 48 || contentLike.test(l)) return;
        counter[l] = (counter[l] || 0) + 1;
      });
    });
    // 至少在 3 页重复才算页眉页脚，避免把重复的「答案：A、B、D」误删
    const threshold = Math.max(3, Math.ceil(pages.length * 0.6));
    const running = new Set(Object.keys(counter).filter((l) => counter[l] >= threshold));
    return pages.map((p) => Object.assign({}, p, { lines: p.lines.filter((l) => !running.has(l)) }));
  }

  /* ---------- 结构性识别 ---------- */
  function joinText(a, b) {
    if (!a) return b || '';
    if (!b) return a;
    const prev = a.slice(-1), next = b.slice(0, 1);
    if (/[\u4e00-\u9fa5]/.test(prev) || /[\u4e00-\u9fa5]/.test(next)) return a + b;
    if (/[A-Za-z0-9]$/.test(prev) && /^[A-Za-z0-9]/.test(next)) return a + ' ' + b;
    return a + b;
  }

  function detectSection(line) {
    if (line.length > 52) return null;
    const head = /^(第\s*[一二三四五六七八九十百\d]+\s*[章节部分篇]|[一二三四五六七八九十]+\s*[、.]|[（(]\s*[一二三四五六七八九十]+\s*[）)]|Part\s*\d)/i;
    if (!head.test(line)) return null;
    if (/[。？！?]$/.test(line) && line.length > 30) return null;
    const hit = TYPE_KEYS.find((t) => t.re.test(line));
    const isChapter = /^第\s*[一二三四五六七八九十百\d]+\s*[章节篇]/.test(line);
    return { line: line.replace(/[（(]\s*[^）)]*分[^）)]*[）)]/g, '').trim(), type: hit ? hit.type : null, isChapter };
  }

  const Q_START = [
    /^(\d{1,3})\s*[.、)]\s*(?!\d)(.{2,})$/,
    /^[（(]\s*(\d{1,3})\s*[）)]\s*(.{2,})$/,
    /^(\d{1,3})\s+(?!\d)(.{4,})$/, // 少数 PDF 用空格分隔
  ];

  function matchQuestionStart(line) {
    for (const re of Q_START) {
      const m = line.match(re);
      if (m) {
        const num = parseInt(m[1], 10);
        const rest = m[2].trim();
        if (!rest) return null;
        if (/^[A-H]\s*[.、)]/.test(rest)) return null;
        return { num, rest };
      }
    }
    return null;
  }

  const OPT_START = /^\s*([A-H])\s*[.、)]\s*/;

  function splitOptions(text) {
    const re = /(^|[^A-Za-z0-9])([A-H])\s*[.、)]\s*/g;
    const marks = [];
    let m;
    while ((m = re.exec(text))) {
      const start = m.index + m[1].length;
      if (!marks.length && start > 0) return null;
      marks.push({ key: m[2], start, contentStart: re.lastIndex });
      if (marks.length > 8) break;
    }
    if (!marks.length) return null;
    const out = [];
    marks.forEach((mk, i) => {
      const end = i + 1 < marks.length ? marks[i + 1].start : text.length;
      const content = text.slice(mk.contentStart, end).trim();
      if (content) out.push({ key: mk.key, text: content });
    });
    return out.length ? out : null;
  }

  /* 题干与选项挤在同一行：A.xx B.xx C.xx D.xx */
  function splitInlineOptions(text) {
    const re = /(^|[^A-Za-z0-9])([A-H])\s*[.、)]\s*/g;
    const marks = [];
    let m;
    while ((m = re.exec(text))) {
      marks.push({ key: m[2], start: m.index + m[1].length, contentStart: re.lastIndex });
      if (marks.length > 8) break;
    }
    if (marks.length < 2) return null;
    const stem = text.slice(0, marks[0].start).trim();
    if (stem.length < 2) return null;
    const out = [];
    marks.forEach((mk, i) => {
      const end = i + 1 < marks.length ? marks[i + 1].start : text.length;
      const content = text.slice(mk.contentStart, end).trim();
      if (content) out.push({ key: mk.key, text: content });
    });
    return out.length >= 2 ? { stem, options: out } : null;
  }

  function extractMeta(line) {
    let text = line, answer = null, explain = null;
    const ansRe = /(?:【\s*(?:参考|正确|标准)?答案\s*】|(?:参考|正确|标准)?答案\s*[：:])\s*/;
    const expRe = /(?:【\s*(?:答案)?解析\s*】|【\s*分析\s*】|(?:答案)?解析\s*[：:]|分析\s*[：:])\s*/;
    const am = text.match(ansRe);
    if (am) {
      const before = text.slice(0, am.index);
      let after = text.slice(am.index + am[0].length);
      const em = after.match(expRe);
      if (em) {
        explain = after.slice(em.index + em[0].length).trim();
        after = after.slice(0, em.index);
      }
      answer = after.trim();
      text = before;
    } else {
      const em = text.match(expRe);
      if (em) {
        explain = text.slice(em.index + em[0].length).trim();
        text = text.slice(0, em.index);
      }
    }
    return { text, answer, explain };
  }

  function isProseAnswer(raw) {
    const t = String(raw || '').trim();
    if (t.length < 10) return false;
    if (/^[A-H、,，;；\s]+$/i.test(t)) return false;
    if (/^(对|错|正确|错误|是|否|√|×|T|F|TRUE|FALSE)$/i.test(t)) return false;
    if (/^\d+(\.\d+)?$/.test(t)) return false;
    return true;
  }

  function normalizeAnswerByType(type, raw) {
    const s = String(raw || '').replace(/^[：:\s]+/, '').replace(/[。；;\s]+$/, '').trim();
    if (!s) return '';
    if (type === 'single') {
      const m = s.toUpperCase().match(/[A-H]/);
      return m ? m[0] : s;
    }
    if (type === 'multiple') {
      const letters = s.toUpperCase().replace(/[^A-H]/g, '').split('');
      if (letters.length) return Array.from(new Set(letters)).sort();
      return s;
    }
    if (type === 'judge') {
      if (/^(对|正确|是|√|T|TRUE|Y|YES)/i.test(s)) return 'T';
      if (/^(错|错误|否|×|F|FALSE|N|NO)/i.test(s)) return 'F';
      return s;
    }
    return s.replace(/^(答|参考答案)\s*[：:]/, '').trim();
  }

  function inferType(q, sectionType) {
    const letters = String(q.answerRaw || '').toUpperCase().replace(/[^A-H]/g, '');
    const judgeLike = /^(对|错|正确|错误|√|×|T|F|TRUE|FALSE|是|否)$/i.test(String(q.answerRaw || '').trim());
    if (q.options.length >= 2) return letters.length > 1 ? 'multiple' : 'single';
    if (judgeLike && !q.options.length) return 'judge';
    if (sectionType === 'judge') return 'judge';
    if (sectionType) return sectionType;
    if (/_{2,}|（\s*）|\(\s*\)/.test(q.stem)) return 'blank';
    if (/^(简答|简述|论述|试述|说明|解释|分析|为什么|如何|谈谈|比较)/.test(q.stem)) return 'short';
    return 'short';
  }

  function finalizeQuestion(q, sectionType, defaultCategory, pageNo) {
    let stem = q.stem.replace(/\s+/g, ' ').trim();
    let options = q.options;
    if (!options.length) {
      const inline = splitInlineOptions(stem);
      if (inline) { stem = inline.stem; options = inline.options; }
    }
    const type = inferType({ stem, options, answerRaw: q.answerRaw }, sectionType);
    if (type === 'judge') stem = stem.replace(/^判断\s*[：:]\s*/, '');
    const answer = normalizeAnswerByType(type, q.answerRaw);
    const explanation = (q.explanation || '').replace(/^(?:解析|分析|答案解析)\s*[：:]\s*/, '');
    const issues = [];
    let conf = 0.92;
    if (!answer) { conf -= 0.36; issues.push('缺少答案'); }
    if ((type === 'single' || type === 'multiple') && options.length < 2) { conf -= 0.28; issues.push('选项不足'); }
    if (stem.length < 6) { conf -= 0.22; issues.push('题干过短'); }
    if (options.some((o) => !o.text)) { conf -= 0.12; issues.push('选项内容为空'); }
    if (type === 'single' && Array.isArray(answer)) { conf -= 0.18; issues.push('答案格式异常'); }
    conf = Math.max(0.2, Math.min(0.98, Math.round(conf * 100) / 100));
    return {
      id: uid('q'),
      type,
      stem,
      options: options.map((o) => ({ key: o.key, text: o.text.replace(/\s+/g, ' ').trim() })),
      answer,
      explanation: explanation.replace(/\s+/g, ' ').trim(),
      category: q.category || defaultCategory || '未分类',
      difficulty: 2,
      meta: {
        page: pageNo,
        number: q.number,
        confidence: conf,
        issues,
        raw: q.rawText,
        source: 'pdf',
      },
    };
  }

  /* ---------- 主解析 ---------- */
  function parse(rawText, opts) {
    const options = opts || {};
    const defaultCategory = options.defaultCategory || '导入题库';
    const rawPages = String(rawText || '').split('\f');
    let pages = rawPages.map((txt, i) => ({ page: i + 1, lines: cleanLines(String(txt).split(/\n/)) }));
    pages = stripRunning(pages);

    const questions = [];
    const warnings = [];
    let current = null;
    let sectionType = null;
    let category = defaultCategory;
    let lastNo = 0;
    let rawBuffer = [];

    const flush = () => {
      if (!current) return;
      if (!current.stem.trim() && !current.options.length) { current = null; rawBuffer = []; return; }
      const q = finalizeQuestion(current, sectionType, category, current.page);
      if (q.stem.length >= 2) questions.push(q);
      current = null;
      rawBuffer = [];
    };

    pages.forEach((p) => {
      p.lines.forEach((line) => {
        const sec = detectSection(line);
        if (sec) {
          const isTypeHeader = !!sec.type;
          const looksLikeChapter = sec.isChapter;
          if (looksLikeChapter || isTypeHeader) {
            flush();
            if (isTypeHeader) sectionType = sec.type;
            if (looksLikeChapter) {
              category = sec.line.replace(/^第\s*[一二三四五六七八九十百\d]+\s*[章节篇]\s*/, '').trim() || sec.line;
              sectionType = sec.type || null;
            }
            if (qCount(questions) > 0) rawBuffer = [];
            return;
          }
        }

        const start = matchQuestionStart(line);
        if (start) {
          if (start.num !== lastNo + 1 && start.num > lastNo + 1 && lastNo > 0) {
            // 编号跳变：仍作为新题处理，但记录提示
            warnings.push(`第 ${start.num} 题之前编号不连续（上一题为第 ${lastNo} 题），已按新题处理`);
          }
          flush();
          lastNo = start.num;
          current = {
            number: start.num, page: p.page,
            stem: '', options: [], answerRaw: '', explanation: '',
            category, rawText: line,
          };
          let rest = start.rest;
          const meta = extractMeta(rest);
          if (meta.answer != null) current.answerRaw = meta.answer;
          if (meta.explain) current.explanation = meta.explain;
          rest = meta.text;
          current.stem = rest;
          rawBuffer = [line];
          return;
        }

        if (!current) return;

        if (current.answerRaw && !current.explanation && !/^\s*[A-H]\s*[.、)]/.test(line) && !extractMeta(line).answer) {
          if (!/^\s*[A-H]\s*[.、)]/.test(line)) {
            const tail = extractMeta(line);
            if (tail.explain) {
              current.explanation = joinText(current.explanation, tail.explain);
              rawBuffer.push(line);
              return;
            }
            // 简答题答案可能换行续写；客观题答案后的文字归入解析
            if (isProseAnswer(current.answerRaw) && !splitOptions(line)) {
              current.answerRaw = joinText(current.answerRaw, line);
              rawBuffer.push(line);
              return;
            }
            const isOption = !!splitOptions(line);
            if (!isOption) current.explanation = joinText(current.explanation, line);
            return;
          }
        }

        const meta = extractMeta(line);
        if (meta.answer != null) {
          current.answerRaw = meta.answer;
          if (meta.explain) current.explanation = joinText(current.explanation, meta.explain);
          rawBuffer.push(line);
          if (!meta.text.trim()) return;
        }
        if (meta.explain && meta.answer == null) {
          current.explanation = joinText(current.explanation, meta.explain);
          rawBuffer.push(line);
          return;
        }

        let text = meta.text;
        if (!text.trim()) { rawBuffer.push(line); return; }

        const optionMatch = text.match(OPT_START);
        if (optionMatch) {
          const optsList = splitOptions(text);
          if (optsList) {
            current.options = current.options.concat(optsList);
          } else {
            current.options.push({ key: optionMatch[1], text: text.slice(optionMatch[0].length).trim() });
          }
          rawBuffer.push(line);
          return;
        }

        if (current.explanation) {
          current.explanation = joinText(current.explanation, text);
        } else if (current.answerRaw && !current.options.length) {
          // 简答题答案之后的补充说明
          current.explanation = joinText(current.explanation, text);
        } else if (current.options.length && /[。？！.?!]$/.test(text) === false && text.length < 60) {
          const last = current.options[current.options.length - 1];
          last.text = joinText(last.text, text);
        } else {
          current.stem = joinText(current.stem, text);
        }
        rawBuffer.push(line);
        current.rawText = rawBuffer.join('\n');
      });
    });
    flush();

    // 去重
    const seen = new Set();
    const uniq = questions.filter((q) => {
      const key = q.stem.replace(/\s/g, '');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    if (!uniq.length) {
      warnings.push('没有识别到明显的题号结构，已按段落切分为草稿，请逐题检查。');
      return {
        questions: fallbackSplit(rawPages, defaultCategory),
        warnings,
        sectionType: null,
        stats: { total: 0, combined: true },
      };
    }

    if (uniq.length < 3 && String(rawText).length > 3000) {
      warnings.push('识别出的题目较少，PDF 可能使用了特殊排版，建议核对后再保存。');
    }

    const counts = {};
    uniq.forEach((q) => { counts[q.type] = (counts[q.type] || 0) + 1; });
    const lowConf = uniq.filter((q) => (q.meta.confidence || 0) < 0.6).length;
    return {
      questions: uniq,
      warnings,
      sectionType,
      stats: { total: uniq.length, counts, lowConf, pages: pages.length },
    };
  }

  function qCount(list) { return list.length; }

  function fallbackSplit(rawPages, defaultCategory) {
    const text = rawPages.join('\n');
    const blocks = text.split(/\n{2,}/).map((s) => s.replace(/\n/g, ' ').trim()).filter((s) => s.length >= 12);
    return blocks.slice(0, 200).map((block, i) => ({
      id: uid('q'),
      type: /_{2,}|（\s*）/.test(block) ? 'blank' : 'short',
      stem: block.replace(/^\d{1,3}\s*[.、)]\s*/, '').slice(0, 600),
      options: [],
      answer: '',
      explanation: '',
      category: defaultCategory,
      difficulty: 2,
      meta: { confidence: 0.25, issues: ['需手动补充答案'], raw: block, source: 'pdf-fallback', number: i + 1 },
    }));
  }

  return { extract, parse, cleanLines, splitOptions };
})();
