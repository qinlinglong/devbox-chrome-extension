function openDevBox() {
  try {
    if (typeof chrome.action.openPopup === 'function') {
      const result = chrome.action.openPopup();
      if (result && typeof result.catch === 'function') {
        result.catch(() => chrome.tabs.create({ url: chrome.runtime.getURL('popup.html?full=1') }));
      }
      return;
    }
  } catch (_) {
    // Older Chrome versions do not expose action.openPopup.
  }
  chrome.tabs.create({ url: chrome.runtime.getURL('popup.html?full=1') });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'devbox-selection', title: '打开开发匣处理选中文本', contexts: ['selection'] });
    [
      ['json-format', 'JSON 格式化'],
      ['base64-decode', 'Base64 解码'],
      ['url-decode', 'URL 解码'],
      ['unicode-decode', 'Unicode 解码'],
      ['hex-decode', 'Hex 解码'],
      ['timestamp', '时间戳转可读时间']
    ].forEach(([id, title]) => chrome.contextMenus.create({ id: `devbox-selection-${id}`, title, contexts: ['selection'] }));
  });
});
chrome.contextMenus.onClicked.addListener((info) => {
  const prefix = 'devbox-selection-';
  if (info.menuItemId === 'devbox-selection' || String(info.menuItemId).startsWith(prefix)) {
    const action = info.menuItemId === 'devbox-selection' ? '' : String(info.menuItemId).slice(prefix.length);
    const actionMap = {
      'json-format': ['json-format', 'format'],
      'base64-decode': ['base64', 'decode'],
      'url-decode': ['url', 'decode'],
      'unicode-decode': ['unicode', 'decode'],
      'hex-decode': ['hex', 'decode'],
      timestamp: ['timestamp', 'auto']
    };
    const [selectedTool = '', selectedMode = ''] = actionMap[action] || [];
    const pending = chrome.storage.session.set({ selection: info.selectionText || '', selectedTool, selectedMode, autoRun: Boolean(selectedTool) });
    if (pending && typeof pending.then === 'function') pending.then(openDevBox).catch(openDevBox);
    else openDevBox();
  }
});
chrome.commands.onCommand.addListener((command) => {
  if (command === 'open-toolbox') openDevBox();
});
