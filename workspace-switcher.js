/* Keep a compact tool switcher available while a tool workspace is open. */
(() => {
  let filtered = [], activeIndex = 0;
  function fillToolSwitcher() {
    const input = document.getElementById('tool-switch'), results = document.getElementById('tool-switch-results');
    if (!input || !results || !Array.isArray(TOOLS)) return;
    const render = () => {
      const query = input.value.trim().toLowerCase();
      filtered = TOOLS.filter((tool) => !query || `${tool.name} ${tool.desc} ${tool.cat}`.toLowerCase().includes(query)).slice(0, 30);
      activeIndex = Math.min(activeIndex, Math.max(0, filtered.length - 1));
      results.innerHTML = filtered.map((tool, index) => `<button type="button" class="tool-switch-option${index === activeIndex ? ' active' : ''}" data-tool-id="${esc(tool.id)}"><span>${esc(tool.name)}</span><small>${esc(tool.cat)}</small></button>`).join('');
      results.classList.toggle('hidden', !input.matches(':focus') || !filtered.length);
      results.querySelectorAll('[data-tool-id]').forEach((button) => { button.onclick = () => { input.value = ''; results.classList.add('hidden'); openTool(button.dataset.toolId); }; });
    };
    input.oninput = () => { activeIndex = 0; render(); };
    input.onfocus = () => render();
    input.onkeydown = (event) => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); activeIndex = (activeIndex + (event.key === 'ArrowDown' ? 1 : -1) + filtered.length) % Math.max(1, filtered.length); render(); return; }
      if (event.key === 'Enter' && filtered[activeIndex]) { event.preventDefault(); const id = filtered[activeIndex].id; input.value = ''; results.classList.add('hidden'); openTool(id); return; }
      if (event.key === 'Escape') { input.value = ''; results.classList.add('hidden'); input.blur(); }
    };
    input.onblur = () => window.setTimeout(() => results.classList.add('hidden'), 120);
    if (state?.tool) input.placeholder = `切换工具 · ${state.tool.name}`;
  }

  const baseOpenTool = openTool;
  openTool = (id) => {
    baseOpenTool(id);
    const input = document.getElementById('tool-switch');
    if (input) { input.value = ''; input.placeholder = `切换工具 · ${state.tool?.name || ''}`; }
    // A switched tool should be immediately useful with its current input.
    window.setTimeout(() => {
      if (state?.tool && typeof run === 'function' && (typeof window.devboxCanAutoRun !== 'function' || window.devboxCanAutoRun(state.tool.id))) void run();
    }, 0);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fillToolSwitcher, { once: true });
  } else {
    fillToolSwitcher();
  }
})();
