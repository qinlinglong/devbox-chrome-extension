(() => {
  function valueId(side) { return side === 'left' ? 'compare-left' : 'compare-right'; }
  function refreshResultWithoutReplacingInputs() {
    if (!state.tool || !['json-diff', 'text-diff'].includes(state.tool.id)) return;
    const left = document.getElementById('compare-left')?.value || '';
    const right = document.getElementById('compare-right')?.value || '';
    try {
      const changes = state.tool.id === 'json-diff' ? diffJson(left, right) : diffText(left, right);
      renderCompareResult(changes, state.tool.id);
      const status = document.getElementById('status');
      if (status) { status.textContent = '内容已处理，对比结果已更新'; status.className = 'status'; }
    } catch (error) {
      const status = document.getElementById('status');
      if (status) { status.textContent = error.message || '对比失败'; status.className = 'status error'; }
    }
  }
  async function transform(side, compact) {
    const input = document.getElementById(valueId(side));
    if (!input || !state.tool) return;
    try {
      if (state.tool.id === 'json-diff') input.value = await execute('json-format', input.value, { mode: compact ? 'min' : 'format' });
      else input.value = compact ? input.value.replace(/\s+/g, ' ').trim() : input.value.replace(/\r\n?/g, '\n').split('\n').map((line) => line.trimEnd()).join('\n');
      clearComparePreview();
      // 格式化/压缩属于编辑输入动作，保留两个 textarea 可见，避免 run()
      // 立即切换到只读差异预览，导致用户看不到已经回写的内容。
      refreshResultWithoutReplacingInputs();
    } catch (error) {
      const status = document.getElementById('status'); if (status) { status.textContent = error.message || '内容处理失败'; status.className = 'status error'; }
    }
  }
  document.addEventListener('DOMContentLoaded', () => {
    for (const side of ['left', 'right']) {
      document.getElementById(`compare-format-${side}`)?.addEventListener('click', () => void transform(side, false));
      document.getElementById(`compare-minify-${side}`)?.addEventListener('click', () => void transform(side, true));
      document.getElementById(`compare-edit-${side}`)?.addEventListener('click', () => setComparePreview(side, false));
      const view = document.getElementById(`compare-${side}-view`);
      if (view) { view.tabIndex = 0; view.title = '点击编辑原文'; view.addEventListener('click', () => { setComparePreview(side, false); document.getElementById(valueId(side))?.focus(); }); view.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setComparePreview(side, false); document.getElementById(valueId(side))?.focus(); } }); }
    }
  }, { once: true });
})();
