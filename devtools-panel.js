(() => {
  const contextId = new URLSearchParams(location.search).get('context') || '';
  const state = { entries: [], filtered: [], selected: null, content: null, type: 'all', refreshing: false };
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ACTIONS = [
    ['smart', '智能解码/格式化'], ['raw', '原文'], ['base64-decode', 'Base64 解码'], ['base64-encode', 'Base64 编码'],
    ['json-minify', 'JSON 压缩'], ['url-decode', 'URL 解码'],
    ['url-encode', 'URL 编码'], ['unicode-decode', 'Unicode 解码'], ['hex-decode', 'Hex 解码'],
    ['jwt', 'JWT 解析'], ['timestamp', '时间戳格式化'], ['html-decode', 'HTML 实体解码'],
    ['gzip-decode', 'Gzip 解压（Base64）']
  ];
  const TYPE_FILTERS = [
    ['all', '全部'], ['fetch', 'Fetch'], ['xhr', 'XHR'], ['script', 'JS'],
    ['document', '文档'], ['stylesheet', 'CSS'], ['image', '图片'], ['font', '字体'],
    ['websocket', 'WebSocket'], ['other', '其他']
  ];

  function send(type, payload = {}) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ contextId, type, ...payload }, (response) => {
        const error = chrome.runtime.lastError;
        if (error) reject(new Error(error.message));
        else resolve(response || {});
      });
    });
  }

  function formatTime(ms) {
    if (!Number.isFinite(ms) || ms <= 0) return '';
    return `${Math.round(ms)} ms`;
  }

  function renderList() {
    const query = $('search').value.trim().toLowerCase();
    state.filtered = state.entries.filter((entry) => {
      const matchesType = state.type === 'all' || entry.resourceType === state.type;
      const matchesQuery = !query || `${entry.method} ${entry.status} ${entry.url} ${entry.mimeType}`.toLowerCase().includes(query);
      return matchesType && matchesQuery;
    });
    $('count').textContent = `${state.filtered.length} 条请求`;
    $('empty').classList.toggle('hidden', state.filtered.length > 0);
    $('list').innerHTML = state.filtered.slice().reverse().map((entry) => {
      const selected = state.selected === entry.id ? ' selected' : '';
      const bad = entry.status >= 400 || entry.status === 0 ? ' bad' : '';
      return `<div class="request-row${selected}" data-id="${esc(entry.id)}"><div class="row-top"><span class="method">${esc(entry.method)}</span><span class="status${bad}">${esc(entry.status || '—')}</span><span class="resource-type">${esc(typeLabel(entry.resourceType))}</span></div><div class="url" title="${esc(entry.url)}">${esc(entry.url || '(无 URL)')}</div><div class="row-meta">${esc(entry.mimeType || '未知类型')}${entry.time ? ` · ${esc(formatTime(entry.time))}` : ''}</div></div>`;
    }).join('');
    document.querySelectorAll('.request-row').forEach((row) => { row.onclick = () => selectEntry(row.dataset.id); });
  }

  function typeLabel(type) {
    const found = TYPE_FILTERS.find(([value]) => value === type);
    return found ? found[1] : '其他';
  }

  function formatJsonBody(value, mimeType = '', encoding = '') {
    const source = String(value ?? '');
    if (!source.trim() || String(encoding || '').toLowerCase() === 'base64') return source;
    const mime = String(mimeType || '').toLowerCase();
    const likelyJson = mime.includes('json') || /^[\s]*[\[{]/.test(source);
    if (!likelyJson) return source;
    try { return JSON.stringify(JSON.parse(source), null, 2); } catch (_) { return source; }
  }

  const AUTO_MAX_SOURCE = 1000000;
  const AUTO_MAX_STRING = 300000;
  const AUTO_MAX_DEPTH = 6;
  const AUTO_MAX_NODES = 5000;

  function decodeBase64Candidate(value) {
    const source = String(value ?? '').trim();
    const compact = source.replace(/\s/g, '').replace(/-/g, '+').replace(/_/g, '/');
    if (compact.length < 16 || compact.length > AUTO_MAX_STRING || compact.length % 4 === 1 || !/^[A-Za-z0-9+/]*={0,2}$/.test(compact)) return null;
    try {
      const bytes = base64Bytes(compact);
      if (!bytes.length || bytes.length > AUTO_MAX_STRING) return null;
      const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      const text = decoded.trim();
      if (!text) return null;
      let parsed;
      try { parsed = JSON.parse(text); } catch (_) {}
      const visible = [...decoded].filter((char) => char === '\n' || char === '\r' || char === '\t' || char >= ' ').length / Math.max(decoded.length, 1);
      const structured = parsed !== undefined && parsed !== null && typeof parsed === 'object';
      if (!structured && visible < 0.9) return null;
      if (!structured && decoded.length < 8) return null;
      return { text: decoded, parsed, structured };
    } catch (_) { return null; }
  }

  function autoDecodeValue(value, depth = 0, budget = { nodes: 0 }) {
    if (budget.nodes++ >= AUTO_MAX_NODES || depth > AUTO_MAX_DEPTH) return value;
    if (typeof value === 'string') {
      const candidate = decodeBase64Candidate(value);
      if (!candidate) return value;
      if (candidate.structured) return autoDecodeValue(candidate.parsed, depth + 1, budget);
      return candidate.text;
    }
    if (Array.isArray(value)) return value.map((item) => autoDecodeValue(item, depth + 1, budget));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, autoDecodeValue(item, depth + 1, budget)]));
    return value;
  }

  function parseFormPayload(source) {
    const text = String(source ?? '').trim();
    if (!text || text.length > AUTO_MAX_SOURCE || /[\r\n]/.test(text) || !/(?:^|&)[^=&]+=[^&]*/.test(text)) return null;
    const result = {};
    for (const part of text.split('&')) {
      if (!part) continue;
      const index = part.indexOf('=');
      const rawKey = index < 0 ? part : part.slice(0, index);
      const rawValue = index < 0 ? '' : part.slice(index + 1);
      let key, formValue;
      try { key = decodeURIComponent(rawKey.replace(/\+/g, ' ')); } catch (_) { key = rawKey; }
      try { formValue = decodeURIComponent(rawValue.replace(/\+/g, ' ')); } catch (_) { formValue = rawValue; }
      if (formValue.includes(' ')) {
        const repaired = formValue.replace(/ /g, '+');
        if (decodeBase64Candidate(repaired)) formValue = repaired;
      }
      result[key] = key in result ? (Array.isArray(result[key]) ? [...result[key], formValue] : [result[key], formValue]) : formValue;
    }
    return Object.keys(result).length ? result : null;
  }

  function autoFormatPayload(value, mimeType = '', encoding = '') {
    const source = String(value ?? '');
    if (!source.trim() || source.length > AUTO_MAX_SOURCE) return formatJsonBody(source, mimeType, encoding);
    let parsed;
    try { parsed = JSON.parse(source); } catch (_) {
      const form = parseFormPayload(source);
      if (form) return JSON.stringify(convertTimestampFields(autoDecodeValue(form)), null, 2);
      const candidate = decodeBase64Candidate(source);
      if (!candidate) return source;
      if (candidate.structured) return JSON.stringify(convertTimestampFields(autoDecodeValue(candidate.parsed)), null, 2);
      return candidate.text;
    }
    const decoded = autoDecodeValue(parsed);
    const formatted = decoded && typeof decoded === 'object' ? convertTimestampFields(decoded) : decoded;
    return typeof formatted === 'string' ? formatted : JSON.stringify(formatted, null, 2);
  }

  function fillTypeFilters() {
    $('type-filters').innerHTML = TYPE_FILTERS.map(([value, label]) => `<button class="type-filter${state.type === value ? ' active' : ''}" data-type="${value}">${label}</button>`).join('');
    document.querySelectorAll('[data-type]').forEach((button) => {
      button.onclick = () => { state.type = button.dataset.type; fillTypeFilters(); renderList(); };
    });
  }

  function fillActions() {
    const options = ACTIONS.map(([value, label]) => `<option value="${value}">${label}</option>`).join('');
    $('request-action').innerHTML = options;
    $('response-action').innerHTML = options;
    $('request-action').onchange = () => processInto('request-raw', 'request-action', 'request-decoded');
    $('response-action').onchange = () => processInto('response-raw', 'response-action', 'response-decoded');
  }

  const FULL_PAGE_ACTIONS = {
    smart: ['smart-decode', ''],
    'base64-decode': ['base64', 'decode'],
    'base64-encode': ['base64', 'encode'],
    'json-minify': ['json-format', 'min'],
    'url-decode': ['url', 'decode'],
    'url-encode': ['url', 'encode'],
    'unicode-decode': ['unicode', 'decode'],
    'hex-decode': ['hex', 'decode'],
    jwt: ['jwt', ''],
    timestamp: ['timestamp', 'timestamp'],
    'html-decode': ['html', 'decode'],
    'gzip-decode': ['gzip', 'decode']
  };

  function fullPageTool(action, value) {
    if (FULL_PAGE_ACTIONS[action]) return FULL_PAGE_ACTIONS[action];
    // The raw action has no dedicated editor. JSON is the common case in the
    // Network panel, so open it in the JSON formatter; otherwise use the text
    // statistics tool as a safe full-page text workspace.
    try {
      JSON.parse(value);
      return ['json-format', 'format'];
    } catch (_) {
      return ['textstat', ''];
    }
  }

  async function openFullPage(side) {
    if (!state.content) {
      $('selected-meta').textContent = '请先选择一条请求并等待内容读取完成';
      return;
    }
    const rawValue = side === 'request' ? state.content.requestBody : state.content.responseBody;
    if (!rawValue) {
      $('selected-meta').textContent = `当前${side === 'request' ? '请求' : '响应'}没有可处理的文本内容`;
      return;
    }
    const actionId = side === 'request' ? $('request-action').value : $('response-action').value;
    // Keep the original body in the full-page input. The selected tool owns
    // the transformation so input and output remain easy to verify.
    const value = rawValue;
    const [selectedTool, selectedMode] = fullPageTool(actionId, value);
    try {
      await chrome.storage.session.remove(['selection', 'selectedTool', 'selectedMode', 'autoRun']);
      await chrome.storage.session.set({
        draftInput: value,
        draftSecond: side === 'request' ? state.content.responseBody || '' : state.content.requestBody || '',
        selectedTool,
        selectedMode,
        autoRun: true
      });
      const modeParam = selectedMode ? `&mode=${encodeURIComponent(selectedMode)}` : '';
      await chrome.tabs.create({ url: chrome.runtime.getURL(`popup.html?full=1&tool=${encodeURIComponent(selectedTool)}${modeParam}&run=1`) });
    } catch (error) {
      $('selected-meta').textContent = error.message || '无法打开全屏工作区';
    }
  }

  function clearDetails() {
    $('selected-title').textContent = '选择一条请求';
    $('selected-meta').textContent = '请求体和响应体只会在你选择后读取；选择处理方式后手动执行。';
    $('request-info').textContent = '';
    $('response-info').textContent = '';
    $('request-raw').value = '';
    $('request-decoded').value = '';
    $('response-raw').value = '';
    $('response-decoded').value = '';
    $('request-action').value = 'smart';
    $('response-action').value = 'smart';
  }

  async function selectEntry(id) {
    state.selected = String(id);
    renderList();
    const entry = state.entries.find((item) => item.id === state.selected);
    if (!entry) return;
    $('selected-title').textContent = `${entry.method} ${entry.url}`;
    $('selected-meta').textContent = `${entry.status || '无状态'}${entry.mimeType ? ` · ${entry.mimeType}` : ''}${entry.time ? ` · ${formatTime(entry.time)}` : ''}`;
    $('request-raw').value = '读取中…';
    $('response-raw').value = '读取中…';
    try {
      const result = await send('get-content', { id: state.selected });
      if (!result.ok) throw new Error(result.error || '无法读取网络内容');
      state.content = result;
      const requestBody = formatJsonBody(result.requestBody || '', '', result.requestEncoding);
      const responseBody = formatJsonBody(result.responseBody || '', result.mimeType || entry.mimeType, result.responseEncoding);
      $('request-raw').value = requestBody;
      $('response-raw').value = responseBody;
      $('request-info').textContent = requestBody ? `${requestBody.length} 字符` : '无文本请求体';
      $('response-info').textContent = `${responseBody ? `${responseBody.length} 字符` : '无响应内容'}${result.responseEncoding ? ` · ${result.responseEncoding}` : ''}`;
      $('request-decoded').value = autoFormatPayload(requestBody, '', result.requestEncoding);
      $('response-decoded').value = autoFormatPayload(responseBody, result.mimeType || entry.mimeType, result.responseEncoding);
    } catch (error) {
      $('request-raw').value = '读取失败';
      $('response-raw').value = `读取失败：${error.message || '网络内容暂不可用'}`;
      $('request-info').textContent = '';
      $('response-info').textContent = '请保持 DevTools 打开并重新加载页面后重试';
      $('selected-meta').textContent = error.message || '读取失败';
    }
  }

  function base64Bytes(value) {
    const source = String(value || '').trim().replace(/^data:[^,]+,/, '').replace(/\s/g, '').replace(/-/g, '+').replace(/_/g, '/');
    if (!source) return new Uint8Array();
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(source) || source.length % 4 === 1) throw new Error('内容不是有效的 Base64');
    const padded = source + '='.repeat((4 - (source.length % 4)) % 4);
    return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
  }

  function decodeBase64(value) {
    const bytes = base64Bytes(value);
    if (!bytes.length) return '';
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch (_) {
      return `[二进制数据，共 ${bytes.length} 字节]\n${[...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join(' ')}`;
    }
  }

  function encodeBase64(value) {
    const bytes = new TextEncoder().encode(String(value || ''));
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  }

  function decodeHex(value) {
    const source = String(value || '').replace(/0x/gi, '').replace(/[\s,]/g, '');
    if (!source) return '';
    if (source.length % 2 || !/^[0-9a-f]+$/i.test(source)) throw new Error('内容不是有效的十六进制');
    const bytes = Uint8Array.from(source.match(/.{2}/g), (part) => parseInt(part, 16));
    return new TextDecoder().decode(bytes);
  }

  function decodeUnicode(value) {
    return String(value || '').replace(/\\u([\da-f]{4})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16))).replace(/\\x([\da-f]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  }

  function parseJwt(value) {
    const parts = String(value || '').trim().split('.');
    if (parts.length < 2) throw new Error('JWT 至少需要 Header 和 Payload');
    const decodeJson = (part) => JSON.parse(decodeBase64(part));
    return JSON.stringify({ header: decodeJson(parts[0]), payload: decodeJson(parts[1]), signature: parts[2] || '' }, null, 2);
  }

  function formatTimestamp(value) {
    const source = String(value || '').trim();
    if (/^-?\d+(\.\d+)?$/.test(source)) {
      const numeric = Number(source);
      const milliseconds = Math.abs(numeric) < 100000000000 ? numeric * 1000 : numeric;
      return JSON.stringify({ timestamp: numeric, milliseconds, local: new Date(milliseconds).toLocaleString('zh-CN', { hour12: false }), iso: new Date(milliseconds).toISOString() }, null, 2);
    }
    const milliseconds = Date.parse(source);
    if (!Number.isFinite(milliseconds)) throw new Error('请输入时间戳或可识别的日期文本');
    return JSON.stringify({ timestamp: Math.floor(milliseconds / 1000), milliseconds, local: new Date(milliseconds).toLocaleString('zh-CN', { hour12: false }), iso: new Date(milliseconds).toISOString() }, null, 2);
  }

  function isTimestampField(key) {
    const normalized = String(key || '').replace(/[._-]/g, '').toLowerCase();
    return /(?:timestamp|time|date|ts|createdat|updatedat|deletedat|expiredat|starttime|endtime|deadline)$/.test(normalized);
  }

  const timestampLocalFormatter = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const timestampDisplayCache = new Map();

  function timestampValue(value) {
    const numeric = typeof value === 'number' ? value : Number(String(value).trim());
    if (!Number.isFinite(numeric)) return null;
    const absolute = Math.abs(numeric);
    if (absolute !== 0 && absolute < 100000000) return null;
    const milliseconds = absolute >= 100000000000 ? numeric : numeric * 1000;
    if (!Number.isFinite(milliseconds) || milliseconds < -62135596800000 || milliseconds > 4102444800000) return null;
    const cacheKey = String(milliseconds);
    if (timestampDisplayCache.has(cacheKey)) return timestampDisplayCache.get(cacheKey);
    const date = new Date(milliseconds);
    if (Number.isNaN(date.getTime())) return null;
    const formatted = timestampLocalFormatter.format(date);
    if (timestampDisplayCache.size >= 4096) timestampDisplayCache.delete(timestampDisplayCache.keys().next().value);
    timestampDisplayCache.set(cacheKey, formatted);
    return formatted;
  }

  function convertTimestampFields(value, fieldHint = '') {
    if (Array.isArray(value)) return value.map((item) => convertTimestampFields(item, fieldHint));
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => {
        const timestampField = isTimestampField(key);
        const converted = timestampField ? timestampValue(item) : null;
        return [key, converted === null ? convertTimestampFields(item, timestampField ? key : '') : converted];
      }));
    }
    if (fieldHint && isTimestampField(fieldHint)) return timestampValue(value) ?? value;
    return value;
  }

  function formatTimestampPayload(value) {
    let parsed;
    try { parsed = JSON.parse(value); } catch (_) { return formatTimestamp(value); }
    if (parsed === null || typeof parsed !== 'object') return formatTimestamp(String(parsed));
    return JSON.stringify(convertTimestampFields(parsed), null, 2);
  }

  async function transform(value, action) {
    if (action === 'smart') return autoFormatPayload(value);
    if (action === 'raw') return value;
    if (action === 'base64-decode') return decodeBase64(value);
    if (action === 'base64-encode') return encodeBase64(value);
    if (action === 'json-format') return JSON.stringify(JSON.parse(value), null, 2);
    if (action === 'json-minify') return JSON.stringify(JSON.parse(value));
    if (action === 'url-decode') return decodeURIComponent(value);
    if (action === 'url-encode') return encodeURIComponent(value);
    if (action === 'unicode-decode') return decodeUnicode(value);
    if (action === 'hex-decode') return decodeHex(value);
    if (action === 'jwt') return parseJwt(value);
    if (action === 'timestamp') return formatTimestampPayload(value);
    if (action === 'html-decode') return new DOMParser().parseFromString(value, 'text/html').documentElement.textContent;
    if (action === 'gzip-decode') {
      if (!('DecompressionStream' in window)) throw new Error('当前浏览器不支持 Gzip 解压 API');
      const stream = new Blob([base64Bytes(value)]).stream().pipeThrough(new DecompressionStream('gzip'));
      return new TextDecoder().decode(await new Response(stream).arrayBuffer());
    }
    return value;
  }

  async function processInto(sourceId, actionId, outputId) {
    try {
      const source = $(sourceId).value;
      const action = $(actionId).value;
      if (action === 'timestamp' && source.length > 200000) {
        $(outputId).value = '处理中…';
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      $(outputId).value = await transform(source, action);
    }
    catch (error) { $(outputId).value = `处理失败：${error.message || '输入格式无效'}`; }
  }

  async function syncList() {
    if (state.syncing) return;
    state.syncing = true;
    try {
      const result = await send('list-requests');
      state.entries = result.entries || [];
      renderList();
    } catch (error) { $('selected-meta').textContent = error.message || '无法连接到 DevTools'; }
    finally { state.syncing = false; }
  }

  function resetView(message) {
    state.entries = [];
    state.selected = null;
    state.content = null;
    clearDetails();
    if (message) $('selected-meta').textContent = message;
    renderList();
  }

  async function refreshPage() {
    if (state.refreshing) return;
    state.refreshing = true;
    $('refresh').disabled = true;
    $('refresh').textContent = '刷新中…';
    resetView('正在刷新页面并重新捕获请求…');
    try {
      const result = await send('reload-page', { ignoreCache: false });
      if (!result.ok) throw new Error(result.error || '无法刷新当前页面');
      // Request-finished events are streamed as they complete. A delayed sync
      // also covers browsers that do not emit an event for an already-finished
      // document request.
      setTimeout(() => { syncList(); }, 800);
    } catch (error) {
      $('selected-meta').textContent = error.message || '无法刷新当前页面';
    } finally {
      setTimeout(() => {
        state.refreshing = false;
        $('refresh').disabled = false;
        $('refresh').textContent = '刷新页面';
      }, 900);
    }
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (!message || message.contextId !== contextId) return;
    if (message.type === 'network-reset') {
      const text = message.reason === 'clear'
        ? '列表已清空。重新加载页面后会捕获新的请求。'
        : '页面正在刷新，等待新的网络请求…';
      resetView(text);
      return;
    }
    if (message.type === 'request-added' && message.entry) {
      state.entries = [...state.entries.filter((entry) => entry.id !== message.entry.id), message.entry];
      renderList();
    }
  });

  fillActions();
  fillTypeFilters();
  $('search').oninput = renderList;
  $('refresh').onclick = refreshPage;
  $('clear').onclick = async () => {
    try {
      const result = await send('clear-requests');
      if (!result.ok) throw new Error(result.error || '无法清空请求列表');
      resetView('列表已清空。重新加载页面后会捕获新的请求。');
    } catch (error) {
      $('selected-meta').textContent = error.message || '无法清空请求列表';
    }
  };
  $('process-request').onclick = () => processInto('request-raw', 'request-action', 'request-decoded');
  $('process-response').onclick = () => processInto('response-raw', 'response-action', 'response-decoded');
  $('open-request-full').onclick = () => openFullPage('request');
  $('open-response-full').onclick = () => openFullPage('response');
  syncList();
  // Some Chromium-based browsers only deliver onRequestFinished while the
  // built-in Network panel is visible. Keep a lightweight HAR sync as a
  // fallback so requests made after clearing the list are still discoverable
  // while this panel is open.
  setInterval(() => {
    if (!document.hidden) syncList();
  }, 1500);
})();
