/* ============================================================
   启动封面 + 今日问候
   每次打开播放完整流程；问候语跟随当前时段
   ============================================================ */
window.Splash = (function () {
  const WEEK = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  const st = { open: false, el: null, timers: [], clockTimer: null };

  const later = (fn, ms) => { const t = setTimeout(fn, ms); st.timers.push(t); return t; };
  const clearTimers = () => { st.timers.forEach(clearTimeout); st.timers = []; };

  function motionOff() {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
  }
  function enabled() {
    const study = (Store.settings.get() || {}).study || {};
    return study.splash !== false;
  }

  /* 时段问候 */
  function greetingWord() {
    const h = new Date().getHours();
    if (h >= 5 && h < 11) return '早上好';
    if (h >= 18 || h < 5) return '晚上好';
    return '下午好';
  }

  /* 从用户画像里尽量取一个称呼：只认显式自我介绍，避免把“一名在职考生”当名字 */
  function userName() {
    const text = Store.profile.text();
    if (!text) return '';
    const m = text.match(/(?:我叫|叫我|名字是|名字叫|称呼我|可以叫我)\s*[“"'「『]?\s*([\u4e00-\u9fa5A-Za-z]{1,10})/);
    if (!m) return '';
    const name = m[1].replace(/^(叫|做|是|为)/, '');
    if (!name) return '';
    if (/^(一|个|名|位|在职|学生|考生|新手|小白|上班|老师|同学)/.test(name)) return '';
    return name.slice(0, 8);
  }

  /* 今天是用这个应用的第几天（按本地自然日） */
  function dayCount() {
    const s = Store.getState();
    const start = new Date(Number(s.createdAt) || Date.now());
    const now = new Date();
    const a = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
    const b = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    return Math.max(1, Math.round((b - a) / 86400000) + 1);
  }

  function bankTitleOf(id) {
    if (!id) return '';
    const session = Store.kbSessions && Store.kbSessions.get ? Store.kbSessions.get(id) : null;
    if (session) return session.title || '';
    const bank = Store.banks.get(id);
    return bank ? bank.title : '';
  }

  /* 最近一次未完成的练习 / 学题 / 知识库记录，纯本地读取 */
  function lastActivity() {
    const s = Store.getState();
    const buckets = s.progress || {};
    let best = null;
    ['practice', 'study', 'focus'].forEach((scope) => {
      const bucket = buckets[scope] || {};
      Object.keys(bucket).forEach((key) => {
        const rec = bucket[key];
        if (!rec || rec.finished || !rec.updatedAt) return;
        if (!best || rec.updatedAt > best.rec.updatedAt) best = { scope, key, rec };
      });
    });

    if (best) {
      const { scope, key, rec } = best;
      const at = Math.round(Number(rec.index) || 0) + 1;
      if (scope === 'focus') {
        const kb = (Store.kbs.list() || []).find((x) => x.id === key);
        if (kb) return { pre: '上次在知识库《', name: kb.title, post: `》看到第 ${at} 条` };
      } else {
        const baseId = rec.bankId || key.split(':')[0];
        const total = Array.isArray(rec.ids) ? rec.ids.length : (Number(rec.total) || 0);
        const tail = total ? `（共 ${total} 题）` : '';
        if (baseId === '__favorites') return { pre: `上次在收藏练习，停在第 ${at} 题${tail}` };
        const title = bankTitleOf(baseId);
        if (title) {
          const what = /:wrong$/.test(key) || rec.fromWrong ? '错题重做'
            : /:fav$/.test(key) ? '收藏练习'
              : scope === 'study' ? '学题' : '答题';
          return { pre: '上次在《', name: title, post: `》${what}，停在第 ${at} 题${tail}` };
        }
      }
    }

    const lastBank = s.lastBankId ? Store.banks.get(s.lastBankId) : null;
    if (lastBank) return { pre: '上次在《', name: lastBank.title, post: '》练过，随时可以接着来' };
    return null;
  }

  /* 今天待复习：错题本与未掌握题合并去重后的实际数量 */
  function reviewCount() {
    const ids = new Set();
    (Store.wrong && Store.wrong.list ? Store.wrong.list() : []).forEach((w) => {
      if (w && w.qid) ids.add(w.qid);
    });
    const stats = (Store.getState() || {}).stats || {};
    (Store.banks.list() || []).forEach((bank) => {
      const mastered = (stats[bank.id] || {}).mastered;
      if (!mastered) return;
      const own = new Set((bank.questions || []).map((q) => q.id));
      Object.keys(mastered).forEach((qid) => {
        if (mastered[qid] === false && own.has(qid)) ids.add(qid);
      });
    });
    return ids.size;
  }

  /* 当前时间：问候页停留期间只在跨分钟时更新一次 */
  function clockText() {
    const d = new Date();
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }
  function startGreetClock(mask) {
    stopGreetClock();
    const el = Q('.greet-time', mask);
    if (!el) return;
    const tick = () => { el.textContent = clockText(); };
    const now = new Date();
    const delay = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
    st.clockTimer = setTimeout(() => {
      tick();
      st.clockTimer = setInterval(tick, 60000);
    }, Math.max(300, delay));
  }
  function stopGreetClock() {
    if (!st.clockTimer) return;
    clearTimeout(st.clockTimer);
    clearInterval(st.clockTimer);
    st.clockTimer = null;
  }

  function isHome() {
    const raw = (location.hash || '').replace(/^#/, '') || '/';
    return raw.split('?')[0] === '/';
  }

  /* ---------- 封面科技感动效（canvas：辐射字符 + 多向流星） ---------- */
  const FX_CHARS = '0123456789ABCDEF#%+*/<>=:;[]{}题学练记答思背考知识错对';
  const MAX_PARTS = 170;
  const MAX_METEORS = 6;
  const MAX_STARS = 160;
  function startFX(canvas, still) {
    if (!canvas || !canvas.getContext) return null;
    const ctx = canvas.getContext('2d');
    const parts = [];
    const meteors = [];
    const stars = [];
    let raf = 0, w = 0, h = 0, last = 0, spawnAt = 0, meteorAt = 0, pendingAt = 0, running = true;

    const reach = () => Math.hypot(w, h) / 2;

    /* 星点：远处细小静止 + 近处缓慢漂移，带轻微明暗呼吸 */
    function buildStars() {
      stars.length = 0;
      const count = Math.max(46, Math.min(MAX_STARS, Math.round((w * h) / 12000)));
      for (let i = 0; i < count; i++) {
        const near = Math.random() < 0.28;
        stars.push({
          x: Math.random() * w,
          y: Math.random() * h,
          r: near ? 1.2 + Math.random() * 0.9 : 0.45 + Math.random() * 0.55,
          a: near ? 0.3 + Math.random() * 0.2 : 0.14 + Math.random() * 0.2,
          ph: Math.random() * Math.PI * 2,
          bs: 0.4 + Math.random() * 0.9,
          vx: near ? (Math.random() - 0.5) * 8 : 0,
          vy: near ? (Math.random() - 0.5) * 8 : 0,
        });
      }
    }

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth || window.innerWidth;
      h = canvas.clientHeight || window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      buildStars();
      if (still) drawStill();
    }

    function drawStars(dt, now, frozen) {
      const t = now / 1000;
      for (let i = 0; i < stars.length; i++) {
        const s = stars[i];
        if (!frozen && (s.vx || s.vy)) {
          s.x += s.vx * dt;
          s.y += s.vy * dt;
          if (s.x < -6) s.x = w + 6; else if (s.x > w + 6) s.x = -6;
          if (s.y < -6) s.y = h + 6; else if (s.y > h + 6) s.y = -6;
        }
        const breath = frozen ? 1 : 1 + Math.sin(t * s.bs + s.ph) * 0.3;
        const alpha = Math.min(0.6, s.a * breath);
        ctx.fillStyle = 'rgba(198,226,242,' + alpha.toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    /* 减少动态效果时的静帧：星点 + 一层静止字符，不跑 RAF */
    function drawStill() {
      const cx = w / 2, cy = h / 2, R = reach();
      ctx.clearRect(0, 0, w, h);
      drawStars(0, 0, true);
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      for (let i = 0; i < 34; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = 56 + Math.random() * R * 0.86;
        ctx.save();
        ctx.translate(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        ctx.rotate(a + (Math.random() - 0.5) * 0.5);
        ctx.font = (10 + Math.random() * 5).toFixed(1) + 'px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
        ctx.fillStyle = 'rgba(160,202,224,' + (0.16 + Math.random() * 0.18).toFixed(3) + ')';
        ctx.fillText(FX_CHARS[(Math.random() * FX_CHARS.length) | 0], 0, 0);
        ctx.restore();
      }
      ctx.textAlign = 'start';
    }

    /* seed=true：直接落在画面任意位置，用于首屏铺满四角；false：从中心向外发射 */
    function spawnParticle(seed) {
      const R = reach();
      const r0 = seed ? Math.random() * R * 0.94 : 34 + Math.random() * 46;
      parts.push({
        a: Math.random() * Math.PI * 2,
        r: r0,
        v: 66 + Math.random() * 85,
        ch: FX_CHARS[(Math.random() * FX_CHARS.length) | 0],
        size: 10 + Math.random() * 5,
        tilt: (Math.random() - 0.5) * 0.5,
        max: R * (1.02 + Math.random() * 0.16),
      });
      if (parts.length > MAX_PARTS) parts.splice(0, parts.length - MAX_PARTS);
    }

    /* 流星：一半从四角斜掠，一半从四边随机射入，方向指向画面内随机点 */
    function makeMeteor() {
      const speed = 240 + Math.random() * 280;
      let ox, oy;
      if (Math.random() < 0.55) {
        const c = (Math.random() * 4) | 0;
        const px = 60 + Math.random() * 80;
        const py = 50 + Math.random() * 70;
        ox = (c === 0 || c === 2) ? -px : w + px;
        oy = (c < 2) ? -py : h + py;
      } else {
        const pad = 50 + Math.random() * 70;
        const side = (Math.random() * 4) | 0;
        if (side === 0) { ox = -pad; oy = h * Math.random(); }
        else if (side === 1) { ox = w + pad; oy = h * Math.random(); }
        else if (side === 2) { ox = w * Math.random(); oy = -pad; }
        else { ox = w * Math.random(); oy = h + pad; }
      }
      const tx = w * (0.15 + Math.random() * 0.7);
      const ty = h * (0.15 + Math.random() * 0.7);
      const dx = tx - ox, dy = ty - oy;
      const len = Math.hypot(dx, dy) || 1;
      return {
        x: ox, y: oy,
        vx: dx / len * speed,
        vy: dy / len * speed,
        tail: 0.15 + Math.random() * 0.09,
      };
    }

    function draw(now) {
      if (!running) return;
      raf = requestAnimationFrame(draw);
      if (!last) { last = now; return; }
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (document.hidden) return;

      ctx.clearRect(0, 0, w, h);
      const cx = w / 2;
      const cy = h / 2;

      drawStars(dt, now, false);

      if (!spawnAt) {
        spawnAt = now + 120;
        meteorAt = now + 700 + Math.random() * 900;
        for (let i = 0; i < 130; i++) spawnParticle(true);
      }
      if (now > spawnAt) {
        spawnParticle(Math.random() < 0.55);
        spawnAt = now + 45 + Math.random() * 70;
      }

      ctx.textBaseline = 'middle';
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.r += p.v * dt;
        p.v *= 1 - 0.13 * dt;
        const out = p.r / p.max;
        if (out >= 1) { parts.splice(i, 1); continue; }
        const fadeIn = Math.min(1, p.r / 64);
        const fadeOut = out > 0.94 ? Math.max(0, (1 - out) / 0.06) : 1;
        const alpha = 0.52 * fadeIn * fadeOut;
        if (alpha < 0.006) continue;
        ctx.save();
        ctx.translate(cx + Math.cos(p.a) * p.r, cy + Math.sin(p.a) * p.r);
        ctx.rotate(p.a + p.tilt);
        ctx.font = p.size.toFixed(1) + 'px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
        ctx.fillStyle = 'rgba(158,200,222,' + alpha.toFixed(3) + ')';
        ctx.fillText(p.ch, 0, 0);
        ctx.restore();
      }

      if (pendingAt && now > pendingAt) {
        if (meteors.length < MAX_METEORS) meteors.push(makeMeteor());
        pendingAt = 0;
      }
      if (now > meteorAt) {
        if (meteors.length < MAX_METEORS) meteors.push(makeMeteor());
        meteorAt = now + 1700 + Math.random() * 1700;
        if (Math.random() < 0.5) pendingAt = now + 110 + Math.random() * 260;
      }
      for (let i = meteors.length - 1; i >= 0; i--) {
        const m = meteors[i];
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        const tx = m.x - m.vx * m.tail;
        const ty = m.y - m.vy * m.tail;
        const g = ctx.createLinearGradient(m.x, m.y, tx, ty);
        g.addColorStop(0, 'rgba(206,230,244,.62)');
        g.addColorStop(1, 'rgba(206,230,244,0)');
        ctx.strokeStyle = g;
        ctx.lineWidth = 1.05;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(m.x, m.y);
        ctx.lineTo(tx, ty);
        ctx.stroke();
        ctx.fillStyle = 'rgba(236,248,255,.8)';
        ctx.beginPath();
        ctx.arc(m.x, m.y, 1.2, 0, Math.PI * 2);
        ctx.fill();
        if (m.x < -240 || m.x > w + 240 || m.y < -240 || m.y > h + 240) meteors.splice(i, 1);
      }
    }

    function stop() {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    }

    resize();
    window.addEventListener('resize', resize);
    if (still) {
      return function stopStatic() { window.removeEventListener('resize', resize); };
    }
    raf = requestAnimationFrame(draw);
    return stop;
  }

  /* ---------- 封面 ---------- */
  function buildSplash() {
    const el = document.createElement('div');
    el.className = 'splash';
    el.id = 'splash';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', '题库启动封面');
    el.innerHTML = `
      <div class="splash-bg-a"></div>
      <div class="splash-bg-b"></div>
      <div class="splash-glow"></div>
      <div class="splash-grid"></div>
      <canvas class="splash-canvas" id="splash-canvas" aria-hidden="true"></canvas>
      <div class="splash-veil"></div>
      <button class="splash-enter" type="button" id="splash-enter" title="直接进入" aria-label="直接进入">${icon('right')}</button>
      <div class="splash-core">
        <div class="splash-logo">
          <svg viewBox="0 0 40 40" aria-hidden="true">
            <defs>
              <linearGradient id="splashGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stop-color="#4C8A80"/><stop offset="1" stop-color="#6A8BA8"/>
              </linearGradient>
            </defs>
            <rect width="40" height="40" rx="11" fill="url(#splashGrad)"/>
            <rect x="10.5" y="10" width="14" height="19" rx="2.6" fill="none" stroke="#EAF2EF" stroke-opacity=".5" stroke-width="1.6"/>
            <rect x="16" y="13.5" width="14" height="18.5" rx="2.6" fill="#FFFFFF" fill-opacity=".08" stroke="#F7FBF9" stroke-width="1.6"/>
            <path d="M19.8 20h6.4M19.8 24h4.6" stroke="#F7FBF9" stroke-opacity=".85" stroke-width="1.6" stroke-linecap="round"/>
            <circle cx="31.6" cy="10.4" r="2.3" fill="#CFE6DA"/>
          </svg>
          <span class="splash-sweep"></span>
        </div>
        <div class="splash-name">题库</div>
        <div class="splash-tag">把零散的题，练成自己的知识</div>
      </div>
      <div class="splash-foot">
        <div class="splash-hint">轻点任意处进入</div>
      </div>`;
    return el;
  }

  function beginOpen(skipGreeting) {
    if (st.open) return;
    st.open = true;
    clearTimers();
    const el = st.el;
    document.body.classList.remove('boot-pending', 'splash-open');
    document.body.classList.add('boot-reveal');

    const finish = () => {
      if (el && el.parentNode) el.remove();
      st.el = null;
      document.body.classList.remove('boot-reveal');
      if (!skipGreeting && isHome()) showGreeting();
      st.open = false;
    };

    if (!el) { finish(); return; }
    if (st.stopFX) { st.stopFX(); st.stopFX = null; }
    el.classList.add('opening');
    document.removeEventListener('keydown', onKey);
    later(finish, motionOff() ? 60 : 460);
  }

  function onKey(e) {
    if (st.open) return;
    if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      beginOpen(e.key === 'Escape');
    }
  }

  /* ---------- 今日问候：银河底 + 全屏太阳系（轴侧视角） ---------- */
  let decoMarkup = '';
  let warmed = false;

  /* 点击之前就把问候页的重活做掉：SVG 字符串、渐变与模糊滤镜各预热一次 */
  function prewarmGreeting() {
    if (warmed) return;
    warmed = true;
    if (Q('#greet-mask')) return;
    if (!decoMarkup) decoMarkup = greetingDecoSvg();
    /* 整块问候结构提前建好，点击时只做插入与动画 */
    if (!st.greetShell) st.greetShell = buildGreetingShell();
    const probe = document.createElement('div');
    probe.className = 'greet-probe';
    probe.setAttribute('aria-hidden', 'true');
    probe.innerHTML = decoMarkup;
    document.body.appendChild(probe);
    void probe.offsetWidth;
    requestAnimationFrame(() => { if (probe.parentNode) probe.remove(); });
  }

  function greetingDecoSvg() {
    let dust = '';
    let seed = 20261117;
    const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    for (let i = 0; i < 180; i++) {
      dust += '<circle cx="' + (rnd() * 100).toFixed(2) + '" cy="' + (rnd() * 100).toFixed(2) +
        '" r="' + (0.07 + rnd() * 0.17).toFixed(2) + '" fill="#CFE4F2" fill-opacity="' +
        (0.18 + rnd() * 0.44).toFixed(2) + '"/>';
    }
    const ORBITS = [
      { rx: 150, w: 0.160, ph: 0.6, pr: 5.0, pi: 0 },
      { rx: 235, w: -0.118, ph: 2.4, pr: 6.2, pi: 1 },
      { rx: 320, w: 0.088, ph: 4.2, pr: 4.0, pi: 2 },
      { rx: 410, w: -0.065, ph: 1.2, pr: 5.8, pi: 3, ring: true },
      { rx: 500, w: 0.041, ph: 3.4, pr: 3.6, pi: 4 },
    ];
    /* 每颗行星自己的色调：黄 / 蓝 / 青 / 紫 / 冷白，避免统一色系 */
    const PLANET_TONES = [
      { light: '#F6E9BE', mid: '#D8BF7B', dark: '#6E5A2C' },
      { light: '#D2E9FA', mid: '#86B4DB', dark: '#2C567C' },
      { light: '#CFF3EC', mid: '#7FC9BE', dark: '#286460' },
      { light: '#E8DDF4', mid: '#A995C9', dark: '#483A69' },
      { light: '#E9F5FB', mid: '#A9C8D8', dark: '#3F5A68' },
    ];
    const planetDefs = PLANET_TONES.map((t, i) =>
      '<radialGradient id="pg' + i + '" cx=".32" cy=".26" r=".92">' +
      '<stop offset="0" stop-color="' + t.light + '"/>' +
      '<stop offset=".56" stop-color="' + t.mid + '"/>' +
      '<stop offset="1" stop-color="' + t.dark + '"/></radialGradient>').join('') +
      '<linearGradient id="pgRing" x1="0" y1="0" x2="1" y2="0">' +
      '<stop offset="0" stop-color="#D9C89A" stop-opacity=".2"/>' +
      '<stop offset=".5" stop-color="#F1E6C6" stop-opacity=".8"/>' +
      '<stop offset="1" stop-color="#C9B67F" stop-opacity=".2"/></linearGradient>';
    const lines = ORBITS.map((o, i) =>
      '<ellipse cx="600" cy="400" rx="' + o.rx + '" ry="' + Math.round(o.rx * 0.34) +
      '" stroke-opacity="' + (0.46 - i * 0.035).toFixed(2) + '"/>').join('');
    const planets = ORBITS.map((o) => {
      const tone = PLANET_TONES[o.pi];
      const ring = o.ring
        ? '<g class="greet-ring" transform="rotate(18)">' +
          '<ellipse rx="' + (o.pr + 10) + '" ry="' + ((o.pr + 10) * 0.3).toFixed(1) +
          '" fill="none" stroke="url(#pgRing)" stroke-width="2.4"/>' +
          '<ellipse rx="' + (o.pr + 6) + '" ry="' + ((o.pr + 6) * 0.3).toFixed(1) +
          '" fill="none" stroke="#E4EFF6" stroke-opacity=".28" stroke-width=".7"/></g>'
        : '';
      return '<g class="greet-planet" data-rx="' + o.rx + '" data-ry="' + Math.round(o.rx * 0.34) +
        '" data-w="' + o.w + '" data-phase="' + o.ph + '">' +
        '<circle r="' + (o.pr + 6) + '" fill="' + tone.mid + '" fill-opacity=".12"/>' +
        '<circle r="' + o.pr + '" fill="url(#pg' + o.pi + ')"/>' +
        '<circle r="' + o.pr + '" fill="none" stroke="' + tone.light + '" stroke-opacity=".38" stroke-width=".7"/>' +
        ring + '</g>';
    }).join('');

    return `
      <div class="greet-galaxy"><svg class="greet-stars" viewBox="0 0 100 100" preserveAspectRatio="none">${dust}</svg></div>
      <svg class="greet-orbits" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <defs>
          ${planetDefs}
          <radialGradient id="greetSun">
            <stop offset="0" stop-color="#EAF8FF" stop-opacity=".62"/>
            <stop offset=".26" stop-color="#C4DFEF" stop-opacity=".27"/>
            <stop offset=".6" stop-color="#8FB4C6" stop-opacity=".09"/>
            <stop offset="1" stop-color="#9FB6C6" stop-opacity="0"/>
          </radialGradient>
        </defs>
        <g class="greet-system" transform="rotate(-14 600 400)">
          <circle class="greet-sun-glow" cx="600" cy="400" r="330" fill="url(#greetSun)" opacity=".9"/>
          <g class="greet-orbits-lines" fill="none" stroke="#9FC2D8" stroke-width="1">${lines}</g>
          <g class="greet-planets">${planets}</g>
          <circle class="greet-sun-core" cx="600" cy="400" r="13" fill="#F2FBFF" fill-opacity=".85"/>
          <g class="greet-dust"></g>
        </g>
      </svg>`;
  }

  /* 太阳系动画：行星公转 + 太阳呼吸；关闭时先散开细碎粒子再停 */
  function startGreetingDeco(mask) {
    const svg = Q('.greet-orbits', mask);
    if (!svg) return { stop() { }, dissolve() { } };
    const planets = Array.from(svg.querySelectorAll('.greet-planet')).map((node) => ({
      node,
      rx: Number(node.dataset.rx),
      ry: Number(node.dataset.ry),
      w: Number(node.dataset.w),
      phase: Number(node.dataset.phase) || 0,
      ox: 0, oy: 0, vx: 0, vy: 0, out: 0,
    }));
    const sun = Q('.greet-sun-glow', svg);
    const system = Q('.greet-system', svg);
    /* 轨道面来回摆：从 -14° 出发，摆到对称的 +14° 再回来，周期 39s，缓入缓出 */
    const ROT0 = -14, ROT_SPEED = (Math.PI * 2) / 39;
    const dustLayer = Q('.greet-dust', svg);
    const dust = [];
    /* 银河散落恒星：各自不同的闪烁周期与相位，不要整齐同步 */
    const stars = Array.from(mask.querySelectorAll('.greet-stars circle')).map((node, i) => ({
      node,
      base: Number(node.getAttribute('fill-opacity')) || 0.25,
      ph: (i * 2.399) % (Math.PI * 2),
      sp: 0.45 + ((i * 37) % 100) / 100 * 1.9,
      amp: 0.3 + ((i * 53) % 100) / 100 * 0.5,
      batch: i % 6,
    }));
    let tick = 0;
    const NS = 'http://www.w3.org/2000/svg';
    let raf = 0, running = true, started = 0, last = 0, dissolving = false, dissolveAt = 0;

    const place = (p, t) => {
      const ang = p.phase + t * p.w;
      return { x: 600 + Math.cos(ang) * p.rx, y: 400 + Math.sin(ang) * p.ry };
    };

    const loop = (now) => {
      if (!running) return;
      raf = requestAnimationFrame(loop);
      if (!started) { started = now; last = now; }
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (document.hidden) return;
      const t = (now - started) / 1000;
      planets.forEach((p) => {
        const pt = place(p, t);
        if (p.out) {
          /* 消散：沿轨道切线方向被甩开，同时淡出 */
          p.ox += p.vx * dt;
          p.oy += p.vy * dt;
          p.vx *= 1 - 0.55 * dt;
          p.vy *= 1 - 0.55 * dt;
          p.out = Math.min(1.2, p.out + dt / 1.15);
          p.node.setAttribute('opacity', Math.max(0, 1 - p.out).toFixed(3));
        }
        p.node.setAttribute('transform', 'translate(' + (pt.x + p.ox).toFixed(2) + ' ' + (pt.y + p.oy).toFixed(2) + ')');
      });
      /* 恒星闪烁分三批轮流更新，降低每帧的 SVG 重绘量 */
      tick = (tick + 1) % 6;
      for (let i = 0; i < stars.length; i++) {
        const s = stars[i];
        if (s.batch !== tick) continue;
        const k = 1 + Math.sin(t * s.sp + s.ph) * s.amp;
        s.node.setAttribute('fill-opacity', Math.max(0.08, Math.min(0.92, s.base * k)).toFixed(3));
      }
      if (system) system.setAttribute('transform', 'rotate(' + (ROT0 * Math.cos(t * ROT_SPEED)).toFixed(3) + ' 600 400)');
      if (sun) sun.setAttribute('opacity', (0.82 + Math.sin(t * 0.55) * 0.14).toFixed(3));
      if (dissolving) {
        for (let i = dust.length - 1; i >= 0; i--) {
          const d = dust[i];
          d.x += d.vx * dt;
          d.y += d.vy * dt;
          d.vx *= 1 - 0.6 * dt;
          d.vy *= 1 - 0.6 * dt;
          d.life += dt;
          d.node.setAttribute('cx', d.x.toFixed(2));
          d.node.setAttribute('cy', d.y.toFixed(2));
          d.node.setAttribute('fill-opacity', Math.max(0, d.a * (1 - d.life / d.max)).toFixed(3));
          if (d.life >= d.max && d.node.parentNode) d.node.parentNode.removeChild(d.node);
          if (d.life >= d.max) dust.splice(i, 1);
        }
        if (!dust.length && now - dissolveAt > 700) {
          running = false;
          cancelAnimationFrame(raf);
        }
      }
    };
    raf = requestAnimationFrame(loop);

    return {
      stop() { running = false; cancelAnimationFrame(raf); },
      dissolve() {
        if (dissolving) return;
        dissolving = true;
        dissolveAt = performance.now();
        if (!dustLayer) return;
        const t = (dissolveAt - (started || dissolveAt)) / 1000;
        planets.forEach((p) => {
          const pt = place(p, t);
          /* 甩开方向 = 当前轨道切线 */
          const ang = p.phase + t * p.w;
          const dir = p.w >= 0 ? 1 : -1;
          const tx = -Math.sin(ang) * p.rx * dir;
          const ty = Math.cos(ang) * p.ry * dir;
          const len = Math.hypot(tx, ty) || 1;
          const speed = 34 + Math.random() * 38;
          p.vx = tx / len * speed;
          p.vy = ty / len * speed;
          p.out = 0.001;
          for (let k = 0; k < 6; k++) {
            const node = document.createElementNS(NS, 'circle');
            const ang = Math.random() * Math.PI * 2;
            const sp = 30 + Math.random() * 95;
            const alpha = 0.22 + Math.random() * 0.3;
            const life = 0.55 + Math.random() * 0.65;
            node.setAttribute('r', (1 + Math.random() * 1.5).toFixed(2));
            node.setAttribute('cx', pt.x.toFixed(2));
            node.setAttribute('cy', pt.y.toFixed(2));
            node.setAttribute('fill', '#CBE4F2');
            node.setAttribute('fill-opacity', alpha.toFixed(2));
            dustLayer.appendChild(node);
            dust.push({ node, x: pt.x, y: pt.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: 0, max: life, a: alpha });
          }
        });
      },
    };
  }

  function buildGreetingShell() {
    const mask = document.createElement('div');
    mask.className = 'greet-mask';
    mask.id = 'greet-mask';
    mask.setAttribute('role', 'dialog');
    mask.setAttribute('aria-modal', 'true');
    mask.setAttribute('aria-label', '今日问候');
    mask.innerHTML = `
      <div class="greet-shade" aria-hidden="true"></div>
      <div class="greet-deco" aria-hidden="true">${decoMarkup || (decoMarkup = greetingDecoSvg())}</div>
      <div class="greet-card"></div>
      <span class="greet-hint">点击空白处或按 Esc 进入</span>`;
    return mask;
  }

  function showGreeting() {
    if (motionOff()) return;
    const old = Q('#greet-mask');
    if (old) old.remove();
    stopGreetClock();

    const now = new Date();
    const date = `${now.getMonth() + 1}月${now.getDate()}日 · ${WEEK[now.getDay()]}`;
    const name = userName();
    const hi = greetingWord() + (name ? '，' + name : '');
    const like = lastActivity();
    const review = reviewCount();
    const lastHTML = like
      ? `<p class="greet-last line"><span class="greet-last-t">${esc(like.pre)}</span>${like.name ? `<span class="greet-last-name" title="${esc(like.name)}">${esc(like.name)}</span>` : ''}${like.post ? `<span class="greet-last-t">${esc(like.post)}</span>` : ''}</p>`
      : '<p class="greet-last muted">还没有练习记录，挑一个题库开始今天的第一题。</p>';
    /* 结构在点击前已经建好，这里只填字并切换可见性 */
    const mask = st.greetShell || buildGreetingShell();
    st.greetShell = null;
    Q('.greet-card', mask).innerHTML = `
        <div class="greet-row">
          <span class="greet-date">${date}</span>
          <span class="greet-time">${clockText()}</span>
          <span class="greet-badge">第 ${dayCount()} 天</span>
        </div>
        <h2 class="greet-hi">${esc(hi)}</h2>
        ${lastHTML}
        <p class="greet-review">${review ? `今天待复习 <b>${review}</b> 题` : '今天没有待复习'}</p>
        <div class="greet-foot">
          <span>今天也留一点时间给不熟的题</span>
        </div>`;
    document.body.appendChild(mask);
    document.body.classList.add('greet-open');
    startGreetClock(mask);
    const deco = startGreetingDeco(mask);
    /* 模糊整层放到下一帧，避开首帧的滤镜编译 */
    requestAnimationFrame(() => document.body.classList.add('greet-backdrop'));

    const onGreetKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); closeGreeting(); }
    };
    document.addEventListener('keydown', onGreetKey);

    mask.addEventListener('mousedown', () => closeGreeting());

    function closeGreeting() {
      document.removeEventListener('keydown', onGreetKey);
      stopGreetClock();
      mask.classList.add('closing');
      /* 轨道先退、行星被甩开；蒙版与银河再错开半拍收 */
      setTimeout(() => deco.dissolve(), 420);
      setTimeout(() => document.body.classList.remove('greet-backdrop'), 1150);
      setTimeout(() => {
        deco.stop();
        document.body.classList.remove('greet-open');
        if (mask.parentNode) mask.remove();
      }, 2350);
    }
  }

  /* ---------- 入口 ---------- */
  function init() {
    if (!enabled()) return false;
    if (Q('#splash')) return true;
    const still = motionOff();
    st.el = buildSplash();
    document.body.appendChild(st.el);
    document.body.classList.add('boot-pending', 'splash-open');
    st.stopFX = startFX(Q('#splash-canvas', st.el), still);
    /* 封面还盖着时，用空闲时间预热问候页 */
    if ('requestIdleCallback' in window) requestIdleCallback(prewarmGreeting, { timeout: 1200 });
    else setTimeout(prewarmGreeting, 320);

    const el = st.el;
    let downY = null;
    let downAt = 0;
    el.addEventListener('pointerdown', (e) => {
      downY = e.clientY;
      downAt = Date.now();
    });
    el.addEventListener('pointerup', (e) => {
      if (st.open) return;
      if (e.target.closest('.splash-enter')) return;
      const dy = downY == null ? 0 : Math.abs(e.clientY - downY);
      const quick = Date.now() - downAt < 700;
      downY = null;
      if (dy > 24 || quick) beginOpen(false);
    });
    Q('#splash-enter', el).onclick = (e) => { e.stopPropagation(); beginOpen(true); };
    document.addEventListener('keydown', onKey);

    return true;
  }

  /* 关闭仪式感：立即清掉封面、问候与所有过渡状态，无残留 */
  function off() {
    clearTimers();
    stopGreetClock();
    if (st.stopFX) { st.stopFX(); st.stopFX = null; }
    document.removeEventListener('keydown', onKey);
    ['#splash', '#greet-mask'].forEach((sel) => {
      const node = Q(sel);
      if (node) node.remove();
    });
    st.el = null;
    st.greetShell = null;
    st.open = false;
    document.body.classList.remove('boot-pending', 'boot-reveal', 'splash-open', 'greet-open', 'greet-backdrop');
  }

  return { init, off };
})();
