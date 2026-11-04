(() => {
  let matches = [], active = -1;
  const box = () => document.getElementById('workspace-search');
  const input = () => document.getElementById('workspace-search-input');
  const count = () => document.getElementById('workspace-search-count');
  function targets() {
    const ids = ['input', 'output', 'secondary-input', 'compare-left', 'compare-right'];
    const result = ids.map((id) => document.getElementById(id)).filter((el) => el && !el.closest('.hidden') && el.offsetParent !== null);
    document.querySelectorAll('.compare-code:not(.hidden)').forEach((el) => result.push(el));
    return result;
  }
  function collect(term) {
    matches = [];
    if (!term) return;
    const needle = term.toLocaleLowerCase();
    for (const element of targets()) {
      const text = 'value' in element ? element.value : element.textContent;
      const source = String(text || '').toLocaleLowerCase(); let start = 0;
      while ((start = source.indexOf(needle, start)) >= 0 && matches.length < 500) { matches.push({ element, start, end: start + term.length }); start += Math.max(1, term.length); }
    }
  }
  function selectElementMatch(match) {
    const element = match.element;
    element.scrollIntoView?.({ block: 'nearest' });
    if ('value' in element) {
      element.focus(); element.setSelectionRange(match.start, match.end);
      const before = element.value.slice(0, match.start), line = before.split('\n').length - 1;
      element.scrollTop = Math.max(0, line * 20 - element.clientHeight / 3);
      return;
    }
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT); let offset = 0, node;
    while ((node = walker.nextNode())) { const end = offset + node.nodeValue.length; if (match.start >= offset && match.start < end) { const range = document.createRange(); range.setStart(node, match.start - offset); range.setEnd(node, Math.min(match.end, end) - offset); const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range); node.parentElement?.scrollIntoView?.({ block: 'nearest' }); return; } offset = end; }
  }
  function update() { count().textContent = matches.length ? `${active + 1}/${matches.length}` : '0/0'; if (matches[active]) selectElementMatch(matches[active]); }
  function search(term, direction = 1) { collect(term); if (!matches.length) { active = -1; update(); return; } active = direction > 0 ? 0 : matches.length - 1; update(); }
  function move(direction) { if (!matches.length) return; active = (active + direction + matches.length) % matches.length; update(); }
  function close() { box()?.classList.add('hidden'); input().value = ''; matches = []; active = -1; count().textContent = '0/0'; }
  function open() {
    if (!state.tool) return;
    box().classList.remove('hidden'); const field = input(); field.focus(); field.select();
  }
  document.addEventListener('DOMContentLoaded', () => {
    const field = input(); if (!field) return;
    field.addEventListener('input', () => search(field.value));
    field.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); move(event.shiftKey ? -1 : 1); } else if (event.key === 'Escape') { event.preventDefault(); close(); } });
    document.getElementById('workspace-search-prev').onclick = () => move(-1);
    document.getElementById('workspace-search-next').onclick = () => move(1);
    document.getElementById('workspace-search-close').onclick = close;
    document.addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f' && state.tool) { event.preventDefault(); event.stopImmediatePropagation(); open(); }
      else if (event.key === 'Escape' && !box().classList.contains('hidden')) close();
    }, true);
    const baseOpenTool = openTool;
    openTool = (id) => { close(); baseOpenTool(id); };
  }, { once: true });
})();
