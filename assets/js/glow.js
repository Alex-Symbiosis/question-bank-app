/* ============================================================
   跟随指针的柔光：首页题库卡片、主要按钮
   单次 rAF 更新 CSS 变量，不触发布局；触屏与减少动态走静态高光
   ============================================================ */
(function () {
  const SELECTOR = '.bank-card, .btn-primary, .btn-accent';
  let fine = true;
  let still = false;
  try {
    fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (e) { /* 老浏览器按不可用处理 */ }
  if (!fine || still) return;

  let target = null;
  let point = null;
  let raf = 0;

  function paint() {
    raf = 0;
    if (!target || !point) return;
    const rect = target.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    target.style.setProperty('--gx', ((point.x - rect.left) / rect.width * 100).toFixed(2) + '%');
    target.style.setProperty('--gy', ((point.y - rect.top) / rect.height * 100).toFixed(2) + '%');
  }

  function clear() {
    if (target) target.classList.remove('glow-on');
    target = null;
    point = null;
  }

  document.addEventListener('pointermove', (e) => {
    const next = e.target && e.target.closest ? e.target.closest(SELECTOR) : null;
    if (next !== target) {
      if (target) target.classList.remove('glow-on');
      target = next;
      if (target) target.classList.add('glow-on');
    }
    if (!target) { point = null; return; }
    point = { x: e.clientX, y: e.clientY };
    if (!raf) raf = requestAnimationFrame(paint);
  }, { passive: true });

  document.addEventListener('pointerdown', (e) => {
    if (!(e.target && e.target.closest && e.target.closest(SELECTOR))) clear();
  }, { passive: true });
  window.addEventListener('blur', clear);
})();
