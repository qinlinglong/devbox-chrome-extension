(() => {
  function bindIcons(root = document) {
    root.querySelectorAll?.('.tool-card .tool-icon img').forEach((img) => {
      const holder = img.parentElement;
      if (!holder || holder.dataset.iconBound) return;
      holder.dataset.iconBound = '1';
      const card = img.closest('.tool-card');
      holder.dataset.fallback = card?.querySelector('.tool-name')?.textContent?.trim()?.slice(0, 2) || '工具';
      const fallback = () => { img.hidden = true; holder.classList.add('icon-fallback'); };
      img.addEventListener('error', fallback, { once: true });
      if (img.complete && img.naturalWidth === 0) fallback();
    });
  }
  document.addEventListener('DOMContentLoaded', () => {
    bindIcons();
    new MutationObserver(() => bindIcons()).observe(document.getElementById('tool-grid') || document.body, { childList: true, subtree: true });
  }, { once: true });
})();
