(() => {
  document.addEventListener('DOMContentLoaded', () => {
    const picker = document.getElementById('file-input'), button = document.getElementById('import-input');
    if (!picker || !button) return;
    const normalChange = picker.onchange;
    button.addEventListener('click', (event) => {
      if (state.tool?.id !== 'image-base64') return;
      event.stopImmediatePropagation(); picker.value = ''; picker.dataset.imageData = '1'; picker.accept = 'image/*'; picker.click();
    }, true);
    picker.onchange = async () => {
      if (picker.dataset.imageData !== '1') { normalChange?.call(picker); return; }
      const file = picker.files?.[0]; picker.dataset.imageData = '';
      if (!file) return;
      try {
        const data = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('图片读取失败')); reader.readAsDataURL(file); });
        $('input').value = String(data); $('status').textContent = `已导入 ${file.name}`; $('status').className = 'status'; await run();
      } catch (error) { $('status').textContent = error.message || '图片读取失败'; $('status').className = 'status error'; }
      picker.accept = '.txt,.json,.yaml,.yml,.xml,.html,.css,.js,.md,.csv,text/*,application/json';
    };
  }, { once: true });
})();
