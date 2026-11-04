/* Auto-run after paste or when edited input loses focus. */
(() => {
  const dirtyFields = new Set();
  let scheduled = 0;

  function fieldIsReady(field) {
    if (!field || !state?.tool) return false;
    if (['json-diff', 'text-diff'].includes(state.tool.id)) {
      return Boolean(document.getElementById('compare-left')?.value.trim() && document.getElementById('compare-right')?.value.trim());
    }
    return Boolean(field.value.trim());
  }

  function canAutoRun() {
    return typeof run === 'function' && state?.tool &&
      (typeof window.devboxCanAutoRun !== 'function' || window.devboxCanAutoRun(state.tool.id));
  }

  function scheduleRun() {
    if (!canAutoRun()) return;
    window.clearTimeout(scheduled);
    scheduled = window.setTimeout(() => {
      scheduled = 0;
      if (canAutoRun()) void run();
    }, 0);
  }

  function scheduleBlurRun(field) {
    if (!canAutoRun() || !fieldIsReady(field)) return;
    window.clearTimeout(scheduled);
    scheduled = window.setTimeout(() => {
      scheduled = 0;
      if (!canAutoRun() || !fieldIsReady(field)) return;
      if (['input', 'secondary-input', 'compare-left', 'compare-right'].includes(document.activeElement?.id)) return;
      const id = field.id;
      if (!dirtyFields.has(id)) return;
      dirtyFields.clear();
      void run();
    }, 80);
  }

  function installPasteHandling() {
    const input = document.getElementById('input');
    const secondary = document.getElementById('secondary-input');
    const compareLeft = document.getElementById('compare-left');
    const compareRight = document.getElementById('compare-right');
    [input, secondary, compareLeft, compareRight].forEach((field) => {
      if (!field) return;
      field.addEventListener('input', () => dirtyFields.add(field.id));
      field.addEventListener('paste', () => {
        dirtyFields.add(field.id);
        scheduleRun();
      });
      field.addEventListener('blur', () => scheduleBlurRun(field));
    });

    const pasteButton = document.getElementById('paste');
    async function pasteInto(field) {
      if (!field) return;
      try {
        field.value = await navigator.clipboard.readText();
        dirtyFields.add(field.id);
        const status = document.getElementById('status');
        if (status) {
          status.textContent = typeof window.devboxCanAutoRun === 'function' && !window.devboxCanAutoRun(state?.tool?.id) ? '已粘贴，请点击下方按钮执行' : '已粘贴，正在处理…';
          status.className = 'status';
        }
        window.clearTimeout(scheduled);
        scheduled = 0;
        dirtyFields.clear();
        if (typeof window.devboxCanAutoRun !== 'function' || window.devboxCanAutoRun(state?.tool?.id)) await run();
      } catch (error) {
        const status = document.getElementById('status');
        if (status) {
          status.textContent = error?.message || '无法读取剪贴板，请使用键盘粘贴';
          status.className = 'status error';
        }
      }
    }
    if (pasteButton && input) pasteButton.onclick = () => pasteInto(state?.tool?.id === 'json-diff' || state?.tool?.id === 'text-diff' ? compareLeft : input);
    const leftButton = document.getElementById('compare-paste-left');
    const rightButton = document.getElementById('compare-paste-right');
    if (leftButton) leftButton.onclick = () => pasteInto(compareLeft);
    if (rightButton) rightButton.onclick = () => pasteInto(compareRight);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installPasteHandling, { once: true });
  } else {
    installPasteHandling();
  }
})();
