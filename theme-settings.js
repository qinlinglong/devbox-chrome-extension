(() => {
  const apply = (enabled) => { document.body.classList.toggle('dark', Boolean(enabled)); const input = document.getElementById('dark-mode'); if (input) input.checked = Boolean(enabled); };
  window.devboxApplyDarkMode = apply;
  document.addEventListener('DOMContentLoaded', async () => {
    const stored = await chrome.storage.local.get('darkMode');
    apply(Boolean(stored.darkMode));
    const input = document.getElementById('dark-mode');
    input?.addEventListener('change', () => { apply(input.checked); void chrome.storage.local.set({ darkMode: input.checked }); });
  }, { once: true });
})();
(() => {
  let enabledTools = null;
  const manager = () => {
    const list = document.getElementById('tool-manager-list');
    if (!list || !Array.isArray(window.TOOLS || TOOLS)) return;
    const tools = window.TOOLS || TOOLS;
    list.innerHTML = tools.map((tool) => `<label><input type="checkbox" data-enabled-tool="${esc(tool.id)}" ${!Array.isArray(enabledTools) || enabledTools.includes(tool.id) ? 'checked' : ''}>${esc(tool.name)}</label>`).join('');
    list.querySelectorAll('[data-enabled-tool]').forEach((input) => { input.onchange = async () => { const next = new Set(Array.isArray(enabledTools) ? enabledTools : tools.map((tool) => tool.id)); input.checked ? next.add(input.dataset.enabledTool) : next.delete(input.dataset.enabledTool); enabledTools = [...next]; await chrome.storage.local.set({ enabledTools }); renderGrid(); }; });
  };
  document.addEventListener('DOMContentLoaded', async () => {
    const stored = await chrome.storage.local.get('enabledTools'); enabledTools = Array.isArray(stored.enabledTools) ? stored.enabledTools : null;
    const originalVisibleTools = typeof visibleTools === 'function' ? visibleTools : null;
    if (originalVisibleTools) { visibleTools = () => originalVisibleTools().filter((tool) => !Array.isArray(enabledTools) || enabledTools.includes(tool.id)); renderGrid(); }
    document.getElementById('manage-tools')?.addEventListener('click', () => { const panel = document.getElementById('tool-manager'); panel?.classList.toggle('hidden'); if (panel && !panel.classList.contains('hidden')) manager(); });
    document.getElementById('reset-tools')?.addEventListener('click', async () => { enabledTools = null; await chrome.storage.local.remove('enabledTools'); manager(); renderGrid(); });
  }, { once: true });
})();
