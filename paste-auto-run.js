/* Run a tool after a real paste has completed. Manual typing and sample filling
 * remain non-running so a user can finish editing before processing. */
(() => {
  function scheduleRun() {
    if (typeof run !== 'function' || !state?.tool) return;
    window.setTimeout(() => {
      if (typeof run === 'function' && state?.tool) void run();
    }, 0);
  }

  function installPasteHandling() {
    const input = document.getElementById('input');
    const secondary = document.getElementById('secondary-input');
    [input, secondary].forEach((field) => {
      if (field) field.addEventListener('paste', scheduleRun);
    });

    const pasteButton = document.getElementById('paste');
    if (!pasteButton || !input) return;
    pasteButton.onclick = async () => {
      try {
        input.value = await navigator.clipboard.readText();
        const status = document.getElementById('status');
        if (status) {
          status.textContent = '已粘贴，正在处理…';
          status.className = 'status';
        }
        await run();
      } catch (error) {
        const status = document.getElementById('status');
        if (status) {
          status.textContent = error?.message || '无法读取剪贴板，请使用键盘粘贴';
          status.className = 'status error';
        }
      }
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installPasteHandling, { once: true });
  } else {
    installPasteHandling();
  }
})();
