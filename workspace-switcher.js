/* Keep a compact tool switcher available while a tool workspace is open. */
(() => {
  function fillToolSwitcher() {
    const select = document.getElementById('tool-switch');
    if (!select || !Array.isArray(TOOLS)) return;
    const groups = new Map();
    TOOLS.forEach((tool) => {
      if (!groups.has(tool.cat)) groups.set(tool.cat, []);
      groups.get(tool.cat).push(tool);
    });
    select.innerHTML = [...groups.entries()].map(([category, tools]) => `<optgroup label="${esc(category)}">${tools.map((tool) => `<option value="${esc(tool.id)}">${esc(tool.name)}</option>`).join('')}</optgroup>`).join('');
    select.onchange = () => {
      if (select.value) openTool(select.value);
    };
    if (state?.tool) select.value = state.tool.id;
  }

  const baseOpenTool = openTool;
  openTool = (id) => {
    baseOpenTool(id);
    const select = document.getElementById('tool-switch');
    if (select) select.value = id;
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fillToolSwitcher, { once: true });
  } else {
    fillToolSwitcher();
  }
})();
