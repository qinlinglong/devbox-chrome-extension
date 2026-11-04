/* Correctness, structured decoding and performance safeguards for popup tools. */
(() => {
  const MAX_INPUT = 5 * 1024 * 1024;
  const MAX_SMART_INPUT = 1024 * 1024;
  const MAX_SMART_STRING = 300000;
  const MAX_SMART_NODES = 5000;
  const MAX_SMART_DEPTH = 6;
  const MAX_HTTP_BODY = 1024 * 1024;
  const DEEP_TOOLS = new Set(['json-format', 'base64', 'url', 'hex', 'gzip', 'jwt', 'timestamp']);
  const MANUAL_ONLY_TOOLS = new Set(['http', 'postman', 'dns-lookup', 'websocket', 'page-screenshot', 'page-timing', 'qr', 'color-picker', 'page-monkey', 'ai']);
  let deepRunActive = false;
  let runInProgress = false;

  window.devboxCanAutoRun = (id) => !MANUAL_ONLY_TOOLS.has(id);

  if (!TOOLS.some((tool) => tool.id === 'smart-decode')) {
    const iconUrl = (name) => typeof chrome !== 'undefined' && chrome.runtime?.getURL ? chrome.runtime.getURL(`icons/${name}`) : `icons/${name}`;
    const smartTool = { id: 'smart-decode', name: '智能解码', cat: '编解码', desc: '识别表单、URL 编码、Base64、JWT 和嵌套 JSON', icon: iconUrl('ic_escape.svg'), sample: 'param=eyJuYW1lIjoiZXhhbXBsZSIsImNyZWF0ZWRBdCI6MTczNTY4OTYwMH0%3D', run: (source, options) => execute('smart-decode', source, options) };
    const insertAt = Math.max(0, TOOLS.findIndex((tool) => tool.id === 'base64'));
    TOOLS.splice(insertAt, 0, smartTool);
  }
  if (!TOOLS.some((tool) => tool.id === 'page-screenshot')) {
    TOOLS.push({ id: 'page-screenshot', name: '网页截图', cat: '页面', desc: '截取当前页面可视区域', icon: typeof chrome !== 'undefined' && chrome.runtime?.getURL ? chrome.runtime.getURL('icons/ic_http.svg') : 'icons/ic_http.svg', sample: '点击立即截图', run: (source, options) => execute('page-screenshot', source, options) });
  }
  const decodeSamples = {
    base64: 'eyJuYW1lIjoiZXhhbXBsZSIsIm9rIjp0cnVlfQ==',
    url: 'https%3A%2F%2Fexample.test%2Fsearch%3Fq%3Ddevbox',
    unicode: '\\u4f60\\u597d\\uff0c\\u5f00\\u53d1\\u8005',
    hex: 'e4 bd a0 e5 a5 bd',
    escape: 'line 1\\nline 2',
    html: '&lt;div&gt;Hello &amp; bye&lt;/div&gt;',
    gzip: 'H4sIAAAAAAAAA6tWys9WsiopKk2tBQCQX9SnCwAAAA=='
  };
  for (const [id, sample] of Object.entries(decodeSamples)) {
    const tool = TOOLS.find((item) => item.id === id);
    if (tool) tool.sample = sample;
  }

  const controlValue = (id, fallback = '') => document.getElementById(id)?.value ?? fallback;
  const select = (id, label, values) => `<label>${esc(label)}</label><select id="${esc(id)}">${values.map(([value, text]) => `<option value="${esc(value)}">${esc(text)}</option>`).join('')}</select>`;
  const numberInput = (id, label, value, min, max, step = '1') => `<label>${esc(label)}</label><input id="${esc(id)}" type="number" value="${esc(value)}" min="${esc(min)}" max="${esc(max)}" step="${esc(step)}">`;
  const textInput = (id, label, value = '') => `<label>${esc(label)}</label><input id="${esc(id)}" value="${esc(value)}">`;

  const originalOptionsFor = optionsFor;
  optionsFor = (id) => {
    if (id === 'smart-decode') return '';
    if (id === 'qr') return select('opt-qr-mode', '模式', [['generate', '生成 SVG 二维码'], ['decode', '识别图片二维码']]);
    if (id === 'yaml-format') return select('opt-mode', '模式', [['format', '格式化'], ['min', '压缩空行']]);
    if (id === 'json-format') return select('opt-mode', '模式', [['format', '标准格式化'], ['min', '压缩'], ['repair', '修复后格式化']]) + select('opt-indent', '缩进', [['2', '2 空格'], ['4', '4 空格'], ['1', '1 空格']]) + select('opt-sort', '排序', [['none', '保持原顺序'], ['key', '按键名排序']]);
    if (id === 'base64') return select('opt-mode', '模式', [['decode', '解码'], ['encode', '编码']]);
    if (id === 'gzip') return select('opt-mode', '模式', [['decode', '解压'], ['encode', '压缩为 Base64']]);
    if (['url', 'unicode', 'hex', 'escape', 'html'].includes(id)) return select('opt-mode', '模式', [['decode', '解码'], ['encode', '编码']]);
    if (['utf16-encode', 'utf16-decode', 'html-deep', 'html-to-js'].includes(id)) return '';
    if (id === 'timestamp') return select('opt-mode', '模式', [['auto', '自动识别'], ['timestamp', '时间戳转日期'], ['date', '日期转时间戳'], ['filetime', 'FILETIME 转日期']]) + select('opt-unit', '输出/输入单位', [['s', '秒'], ['ms', '毫秒']]) + select('opt-display', '显示', [['local', '本地日期'], ['iso', 'ISO 8601'], ['utc', 'UTC']]);
    if (id === 'uuid') return select('opt-kind', '类型', [['uuid', 'UUID v4'], ['nanoid', 'NanoID'], ['ulid', 'ULID']]);
    if (id === 'page-monkey') return select('opt-script-mode', '模式', [['template', '生成脚本模板'], ['inject', '注入当前页面']]);
    if (id === 'page-screenshot') return select('opt-screenshot-mode', '模式', [['visible', '可视区域'], ['full', '整页滚动截图']]);
    if (id === 'ai') return select('opt-ai-mode', '模式', [['template', '生成请求模板'], ['send', '发送到兼容接口']]) + textInput('opt-ai-url', '接口地址', '') + textInput('opt-ai-model', '模型', '') + '<label>API Key</label><input id="opt-ai-key" type="password" autocomplete="off">';
    if (id === 'websocket') return numberInput('opt-timeout', '等待（秒）', '5', '1', '30') + textInput('opt-message', '发送消息', 'ping');
    if (id === 'notes') return select('opt-note-action', '操作', [['save', '保存当前便签'], ['list', '列出便签'], ['import', '导入便签 JSON'], ['export', '导出便签 JSON'], ['clear', '清空便签']]);
    if (id === 'markdown') return select('opt-markdown-mode', '模式', [['preview', 'Markdown 转 HTML'], ['plain', 'Markdown 转纯文本'], ['html-markdown', 'HTML 转 Markdown'], ['flowchart', 'Mermaid 流程图 SVG']]);
    if (id === 'csv-json' || id === 'excel-json') return select('opt-delimiter', '分隔符', [['auto', '自动识别'], [',', '逗号'], ['tab', '制表符'], [';', '分号']]) + select('opt-infer', '值类型', [['false', '保留文本'], ['true', '推断数字/布尔/空值']]) + select('opt-table-output', '输出', [['json', 'JSON'], ['xml', 'XML'], ['sql', 'SQL INSERT'], ['php', 'PHP 数组']]);
    if (id === 'chart') return select('opt-chart-output', '输出', [['json', '图表配置 JSON'], ['svg', 'SVG 柱状图']]);
    if (id === 'text-filter') return select('opt-mode', '处理', [['unique', '去重并保留顺序'], ['sort-asc', '去重后升序'], ['sort-desc', '去重后降序']]);
    if (id === 'text-process') return select('opt-mode', '处理', [['trim', '整体 Trim'], ['trim-lines', '逐行 Trim'], ['remove-space', '删除全部空白'], ['prefix', '添加前缀'], ['suffix', '添加后缀']]) + textInput('opt-affix', '前缀/后缀');
    if (id === 'loan') return numberInput('opt-rate', '年利率（%）', '4.2', '0', '100', '0.01') + numberInput('opt-months', '期数（月）', '240', '1', '1200');
    if (id === 'svg-converter') return select('opt-mode', '模式', [['encode', 'SVG 转 Data URI'], ['decode', 'Data URI/Base64 转 SVG'], ['format', '格式化 SVG'], ['png', 'SVG 转 PNG'], ['jpeg', 'SVG 转 JPEG'], ['webp', 'SVG 转 WebP']]);
    if (id === 'http' || id === 'postman') return select('opt-method', '请求方法', [['', '使用配置中的方法'], ['GET', 'GET'], ['POST', 'POST'], ['PUT', 'PUT'], ['PATCH', 'PATCH'], ['DELETE', 'DELETE']]) + numberInput('opt-timeout', '超时（秒）', '30', '1', '120');
    return originalOptionsFor(id);
  };

  function bytesToBase64(bytes) {
    let output = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) output += String.fromCharCode(...bytes.subarray(i, i + chunk));
    return btoa(output);
  }

  function base64ToBytes(value) {
    const source = String(value ?? '').trim().replace(/^data:[^,]+,/, '').replace(/\s/g, '').replace(/-/g, '+').replace(/_/g, '/');
    if (!source || source.length % 4 === 1 || !/^[A-Za-z0-9+/]*={0,2}$/.test(source)) throw new Error('内容不是有效的 Base64');
    const binary = atob(source + '='.repeat((4 - source.length % 4) % 4));
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  }

  const encodeBase64Utf8 = (value) => bytesToBase64(new TextEncoder().encode(String(value ?? '')));
  const decodeBase64Utf8 = (value) => new TextDecoder('utf-8', { fatal: true }).decode(base64ToBytes(value));

  function timestampAnnotation(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || (Math.abs(numeric) !== 0 && Math.abs(numeric) < 100000000)) return null;
    const milliseconds = Math.abs(numeric) >= 100000000000 ? numeric : numeric * 1000;
    const date = new Date(milliseconds);
    return Number.isNaN(date.getTime()) ? null : { local: date.toLocaleString('zh-CN', { hour12: false }), iso: date.toISOString() };
  }

  function parseJwtEnhanced(value) {
    const parts = String(value ?? '').trim().split('.');
    if (parts.length < 2 || parts.length > 3) throw new Error('JWT 格式无效');
    const decodePart = (part) => JSON.parse(decodeBase64Utf8(part));
    const header = decodePart(parts[0]);
    const payload = decodePart(parts[1]);
    const times = {};
    for (const key of ['iat', 'nbf', 'exp']) {
      const annotation = timestampAnnotation(payload?.[key]);
      if (annotation) times[key] = annotation;
    }
    return { header, payload, timeClaims: times, signature: parts[2] || '', verification: '仅解析，未验证签名' };
  }

  function decodeCandidate(value) {
    const source = String(value ?? '').trim();
    const compact = source.replace(/\s/g, '').replace(/-/g, '+').replace(/_/g, '/');
    if (compact.length < 16 || compact.length > MAX_SMART_STRING || compact.length % 4 === 1 || !/^[A-Za-z0-9+/]*={0,2}$/.test(compact)) return null;
    try {
      const bytes = base64ToBytes(compact);
      if (!bytes.length || bytes.length > MAX_SMART_STRING) return null;
      const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      const trimmed = decoded.trim();
      if (!trimmed) return null;
      let parsed;
      try { parsed = JSON.parse(trimmed); } catch (_) {}
      const structured = parsed !== undefined && parsed !== null && typeof parsed === 'object';
      const visible = [...decoded].filter((char) => char === '\n' || char === '\r' || char === '\t' || char >= ' ').length / Math.max(decoded.length, 1);
      if (!structured && (visible < 0.9 || decoded.length < 8)) return null;
      return { decoded, parsed, structured };
    } catch (_) { return null; }
  }

  function smartValue(value, depth = 0, budget = { nodes: 0 }) {
    if (budget.nodes++ >= MAX_SMART_NODES || depth > MAX_SMART_DEPTH) return value;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.length <= MAX_SMART_STRING && /^[\[{]/.test(trimmed)) {
        try { return smartValue(JSON.parse(trimmed), depth + 1, budget); } catch (_) {}
      }
      if (trimmed.length <= MAX_SMART_STRING && /^%7B|^%5B/i.test(trimmed)) {
        try { return smartValue(JSON.parse(decodeURIComponent(trimmed)), depth + 1, budget); } catch (_) {}
      }
      if (/^[\w-]+\.[\w-]+(?:\.[\w-]*)?$/.test(trimmed)) {
        try { return parseJwtEnhanced(trimmed); } catch (_) {}
      }
      const candidate = decodeCandidate(value);
      if (!candidate) return value;
      return candidate.structured ? smartValue(candidate.parsed, depth + 1, budget) : candidate.decoded;
    }
    if (Array.isArray(value)) return value.map((item) => smartValue(item, depth + 1, budget));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, smartValue(item, depth + 1, budget)]));
    return value;
  }

  function smartFormValue(source) {
    const text = String(source ?? '').trim();
    if (!text || text.length > MAX_SMART_INPUT || /[\r\n]/.test(text) || !/(?:^|&)[^=&]+=[^&]*/.test(text)) return null;
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
        if (decodeCandidate(repaired)) formValue = repaired;
      }
      result[key] = key in result ? (Array.isArray(result[key]) ? [...result[key], formValue] : [result[key], formValue]) : formValue;
    }
    return Object.keys(result).length ? result : null;
  }

  function smartFormat(value) {
    const source = String(value ?? '');
    if (source.length > MAX_SMART_INPUT) throw new Error('智能格式化最多处理 1 MB 内容，请使用标准格式化或缩小输入');
    let parsed;
    try { parsed = JSON.parse(source); } catch (_) {
      const form = smartFormValue(source);
      if (form) parsed = form;
      else {
      const candidate = decodeCandidate(source);
      if (!candidate) return source;
      parsed = candidate.structured ? candidate.parsed : candidate.decoded;
      }
    }
    const decoded = smartValue(parsed);
    const converted = decoded && typeof decoded === 'object' ? convertTimestampFields(decoded, controlValue('opt-display', 'local')) : decoded;
    return typeof converted === 'string' ? converted : JSON.stringify(converted, null, Number(controlValue('opt-indent', '2')) || 2);
  }

  function formatDecodedText(value) {
    const text = String(value ?? '');
    try {
      const parsed = smartValue(JSON.parse(text));
      return JSON.stringify(parsed && typeof parsed === 'object' ? convertTimestampFields(parsed) : parsed, null, 2);
    } catch (_) { return text; }
  }

  function decodeBase64Relevant(source) {
    try { return formatDecodedText(decodeBase64Utf8(source)); } catch (directError) {
      const form = smartFormValue(source);
      if (form) return JSON.stringify(convertTimestampFields(smartValue(form)), null, 2);
      const matches = String(source).match(/[A-Za-z0-9+/_-]{16,}={0,2}/g) || [];
      const decoded = [];
      for (const match of [...new Set(matches)].slice(0, 100)) {
        const candidate = decodeCandidate(match);
        if (candidate) decoded.push({ source: match, decoded: candidate.structured ? smartValue(candidate.parsed) : candidate.decoded });
      }
      if (!decoded.length) throw directError;
      return decoded.length === 1 ? formatDecodedText(typeof decoded[0].decoded === 'string' ? decoded[0].decoded : JSON.stringify(decoded[0].decoded)) : JSON.stringify(decoded, null, 2);
    }
  }

  function decodeUrlRelevant(source) {
    try { return decodeURIComponent(source); } catch (_) {
      let changed = false;
      const result = String(source).replace(/(?:%[\da-f]{2})+/gi, (part) => {
        try { changed = true; return decodeURIComponent(part); } catch (_) { return part; }
      });
      if (!changed) throw new Error('没有找到可解码的 URL 编码内容');
      return result;
    }
  }

  function decodeHexText(value) {
    const compact = String(value).replace(/0x/gi, '').replace(/[\s,:-]/g, '');
    if (!compact || compact.length % 2 || !/^[\da-f]+$/i.test(compact)) throw new Error('内容不是有效的十六进制文本');
    return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(compact.match(/.{2}/g), (part) => parseInt(part, 16)));
  }

  function decodeHexRelevant(source) {
    try { return formatDecodedText(decodeHexText(source)); } catch (directError) {
      const result = [];
      for (const match of String(source).match(/(?<![\da-z])(?:[\da-f]{8,}|(?:0x)?[\da-f]{2}(?:(?:[\s,:-]+|0x)[\da-f]{2}){3,})(?![\da-z])/gi) || []) {
        try { result.push({ source: match, decoded: decodeHexText(match) }); } catch (_) {}
      }
      if (!result.length) throw directError;
      return result.length === 1 ? result[0].decoded : JSON.stringify(result, null, 2);
    }
  }

  function parseJwtRelevant(source) {
    try { return parseJwtEnhanced(source); } catch (directError) {
      const match = String(source).match(/(?:Bearer\s+)?([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]*)?)/i);
      if (!match) throw directError;
      return parseJwtEnhanced(match[1]);
    }
  }

  function extractJsonValue(source) {
    const text = String(source);
    for (let start = 0; start < text.length; start++) {
      if (text[start] !== '{' && text[start] !== '[') continue;
      const stack = [], opening = text[start];
      let quote = false, escaped = false;
      for (let index = start; index < text.length; index++) {
        const char = text[index];
        if (quote) { if (escaped) escaped = false; else if (char === '\\') escaped = true; else if (char === '"') quote = false; continue; }
        if (char === '"') { quote = true; continue; }
        if (char === '{' || char === '[') stack.push(char);
        else if (char === '}' || char === ']') {
          const expected = char === '}' ? '{' : '[';
          if (stack.pop() !== expected) break;
          if (!stack.length) {
            const candidate = text.slice(start, index + 1);
            try { return JSON.parse(candidate); } catch (_) { break; }
          }
        }
      }
      if (opening && start > MAX_SMART_INPUT) break;
    }
    return null;
  }

  function formatJsonRelevant(source, indent = 2) {
    try { return JSON.stringify(JSON.parse(source), null, indent); } catch (directError) {
      const extracted = extractJsonValue(source);
      if (extracted === null) throw directError;
      return JSON.stringify(extracted, null, indent);
    }
  }
  function jsonLexicalFormat(source, indent = 2, minify = false) {
    const text = String(source), spaces = ' '.repeat(Math.max(1, Math.min(8, Number(indent) || 2))); let output = '', depth = 0, quote = false, escaped = false;
    const newline = () => { output = output.replace(/[ \t]+$/g, ''); if (!minify) output += '\n' + spaces.repeat(depth); };
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (quote) { output += char; if (escaped) escaped = false; else if (char === '\\') escaped = true; else if (char === '"') quote = false; continue; }
      if (char === '"') { quote = true; output += char; continue; }
      if (/\s/.test(char)) continue;
      if (char === '{' || char === '[') { output += char; depth++; if (text[i + 1] !== (char === '{' ? '}' : ']')) newline(); }
      else if (char === '}' || char === ']') { depth--; if (depth < 0) throw new Error('JSON 括号不匹配'); if (!minify) { newline(); output = output.trimEnd() + '\n' + spaces.repeat(depth); } output += char; }
      else if (char === ',') { output += char; if (!minify) newline(); }
      else if (char === ':') output += minify ? ':' : ': ';
      else output += char;
    }
    if (quote || depth !== 0) throw new Error('JSON 格式不完整');
    JSON.parse(text);
    return minify ? output : output.trim();
  }
  function repairJsonSource(source) {
    const text = String(source).replace(/^\uFEFF/, ''); let output = '', quote = false, escaped = false, i = 0;
    while (i < text.length) {
      const char = text[i], next = text[i + 1];
      if (quote) { output += char; if (escaped) escaped = false; else if (char === '\\') escaped = true; else if (char === '"') quote = false; i++; continue; }
      if (char === '"') { quote = true; output += char; i++; continue; }
      if (char === '/' && next === '/') { i += 2; while (i < text.length && text[i] !== '\n') i++; continue; }
      if (char === '/' && next === '*') { i += 2; while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++; i += 2; continue; }
      output += char; i++;
    }
    return output.replace(/,\s*([}\]])/g, '$1').trim();
  }
  function sortJsonValue(value) {
    if (Array.isArray(value)) return value.map(sortJsonValue);
    if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort((a, b) => a.localeCompare(b)).map((key) => [key, sortJsonValue(value[key])]));
    return value;
  }

  function formatTimestampRelevant(source, display = 'local') {
    const text = String(source).trim();
    const direct = timestampAnnotation(text);
    if (direct) return timezoneDate(new Date(Number(text) * (Math.abs(Number(text)) >= 100000000000 ? 1 : 1000)), display);
    const values = [...new Set((text.match(/(?<!\d)-?\d{10,13}(?!\d)/g) || []))].slice(0, 200);
    const result = values.map((value) => ({ source: value, value: timestampAnnotation(value) ? timezoneDate(new Date(Number(value) * (Math.abs(Number(value)) >= 100000000000 ? 1 : 1000)), display) : null })).filter((item) => item.value);
    if (!result.length) throw new Error('没有找到可识别的时间戳');
    return result.length === 1 ? result[0].value : JSON.stringify(result, null, 2);
  }

  function detectDelimiter(source) {
    const firstRecord = String(source).split(/\r?\n/, 1)[0] || '';
    const candidates = [',', '\t', ';'];
    return candidates.sort((a, b) => firstRecord.split(b).length - firstRecord.split(a).length)[0];
  }

  function parseDelimited(source, delimiter) {
    const rows = [];
    let row = [], field = '', quoted = false;
    for (let i = 0; i < source.length; i++) {
      const char = source[i];
      if (quoted) {
        if (char === '"' && source[i + 1] === '"') { field += '"'; i++; }
        else if (char === '"') quoted = false;
        else field += char;
      } else if (char === '"' && field === '') quoted = true;
      else if (char === delimiter) { row.push(field); field = ''; }
      else if (char === '\n' || char === '\r') {
        if (char === '\r' && source[i + 1] === '\n') i++;
        row.push(field); rows.push(row); row = []; field = '';
      } else field += char;
    }
    row.push(field);
    if (row.some(Boolean) || rows.length === 0) rows.push(row);
    return rows;
  }

  function inferCell(value) {
    const source = value.trim();
    if (source === '') return null;
    if (/^(true|false)$/i.test(source)) return source.toLowerCase() === 'true';
    if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(source) && !/^0\d+/.test(source)) return Number(source);
    if (/^null$/i.test(source)) return null;
    return value;
  }

  function delimitedToJson(source) {
    if (source.length > MAX_INPUT) throw new Error('表格内容超过 5 MB，请分批处理');
    let delimiter = controlValue('opt-delimiter', 'auto');
    if (delimiter === 'auto') delimiter = detectDelimiter(source);
    if (delimiter === 'tab') delimiter = '\t';
    const rows = parseDelimited(source, delimiter);
    if (!rows.length) return [];
    const used = new Map();
    const headers = rows[0].map((header, index) => {
      const base = header.trim() || `column_${index + 1}`;
      const count = (used.get(base) || 0) + 1;
      used.set(base, count);
      return count === 1 ? base : `${base}_${count}`;
    });
    const infer = controlValue('opt-infer', 'false') === 'true';
    return rows.slice(1).filter((row) => row.some((cell) => cell !== '')).map((row) => Object.fromEntries(headers.map((header, index) => [header, infer ? inferCell(row[index] ?? '') : row[index] ?? ''])));
  }
  function tableOutput(rows, format = 'json') {
    if (format === 'json') return JSON.stringify(rows, null, 2);
    const headers = rows.length ? Object.keys(rows[0]) : [];
    const xmlEscape = (value) => esc(String(value ?? '')).replace(/'/g, '&apos;');
    if (format === 'xml') return `<rows>${rows.map((row) => `<row>${headers.map((key) => `<${key.replace(/[^\w.-]/g, '_')}>${xmlEscape(row[key])}</${key.replace(/[^\w.-]/g, '_')}>`).join('')}</row>`).join('')}</rows>`;
    if (format === 'sql') {
      const columns = headers.map((key) => `\`${key.replace(/`/g, '``')}\``).join(', ');
      const quote = (value) => value === null || value === undefined || value === '' ? 'NULL' : typeof value === 'number' || typeof value === 'boolean' ? String(value) : `'${String(value).replace(/'/g, "''")}'`;
      return rows.map((row) => `INSERT INTO table_data (${columns}) VALUES (${headers.map((key) => quote(row[key])).join(', ')});`).join('\n');
    }
    if (format === 'php') {
      const exportValue = (value) => { if (value === null) return 'null'; if (typeof value === 'boolean') return value ? 'true' : 'false'; if (typeof value === 'number') return String(value); if (Array.isArray(value)) return `[${value.map(exportValue).join(', ')}]`; if (typeof value === 'object') return `[${Object.entries(value).map(([key, item]) => `'${key.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}' => ${exportValue(item)}`).join(', ')}]`; return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`; };
      return `<?php\nreturn ${exportValue(rows)};`;
    }
    return JSON.stringify(rows, null, 2);
  }
  function chartSvg(source) {
    const rows = delimitedToJson(source), entries = rows.map((row) => { const values = Object.values(row); return { label: String(values[0] ?? ''), value: Number(values[1]) || 0 }; }).slice(0, 100);
    if (!entries.length) throw new Error('请输入至少一行名称和数值');
    const max = Math.max(1, ...entries.map((item) => item.value)), width = 760, height = 420, chartHeight = 300, barWidth = Math.max(8, Math.min(52, 680 / entries.length - 8));
    const bars = entries.map((item, index) => { const x = 50 + index * (680 / entries.length) + 4, barHeight = Math.max(1, item.value / max * chartHeight), y = 350 - barHeight; return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${barHeight.toFixed(1)}" rx="3" fill="#6366f1"><title>${esc(item.label)}: ${item.value}</title></rect><text x="${(x + barWidth / 2).toFixed(1)}" y="370" text-anchor="middle" font-size="11" fill="#475569">${esc(item.label).slice(0, 12)}</text>`; }).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#fff"/><line x1="45" y1="350" x2="735" y2="350" stroke="#94a3b8"/>${bars}</svg>`;
  }

  function paramsToObject(source) {
    const text = source.trim();
    const params = text.includes('://') ? new URL(text).searchParams : new URLSearchParams(text.replace(/^\?/, ''));
    const result = {};
    for (const [key, value] of params) result[key] = key in result ? (Array.isArray(result[key]) ? [...result[key], value] : [result[key], value]) : value;
    return result;
  }

  function cookiesToObject(source) {
    const result = {};
    for (const item of source.split(';')) {
      const part = item.trim();
      if (!part) continue;
      const index = part.indexOf('=');
      const rawKey = index < 0 ? part : part.slice(0, index);
      const rawValue = index < 0 ? '' : part.slice(index + 1);
      let key = rawKey, value = rawValue;
      try { key = decodeURIComponent(rawKey); } catch (_) {}
      try { value = decodeURIComponent(rawValue); } catch (_) {}
      result[key] = key in result ? (Array.isArray(result[key]) ? [...result[key], value] : [result[key], value]) : value;
    }
    return result;
  }

  async function gunzipBase64(source, smart) {
    if (!('DecompressionStream' in window)) throw new Error('当前浏览器不支持 Gzip 解压 API');
    const bytes = base64ToBytes(source);
    if (bytes.length > 2 * 1024 * 1024) throw new Error('压缩数据超过 2 MB，请分批处理');
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    const buffer = await new Response(stream).arrayBuffer();
    if (buffer.byteLength > MAX_INPUT) throw new Error('解压结果超过 5 MB，已停止处理');
    const text = new TextDecoder().decode(buffer);
    return smart ? smartFormat(text) : text;
  }

  async function gzipBase64(source) {
    if (!('CompressionStream' in window)) throw new Error('当前浏览器不支持 Gzip API');
    if (source.length > MAX_INPUT) throw new Error('待压缩内容超过 5 MB，请分批处理');
    const stream = new Blob([source]).stream().pipeThrough(new CompressionStream('gzip'));
    return bytesToBase64(new Uint8Array(await new Response(stream).arrayBuffer()));
  }

  async function gunzipRelevant(source) {
    try { return formatDecodedText(await gunzipBase64(source, false)); } catch (directError) {
      const form = smartFormValue(source);
      if (!form) throw directError;
      let decodedAny = false;
      const decodeItem = async (value) => {
        if (Array.isArray(value)) return Promise.all(value.map(decodeItem));
        if (typeof value !== 'string') return value;
        try { const decoded = await gunzipBase64(value, false); decodedAny = true; try { return JSON.parse(decoded); } catch (_) { return decoded; } } catch (_) { return value; }
      };
      const result = {};
      for (const [key, value] of Object.entries(form)) result[key] = await decodeItem(value);
      if (!decodedAny) throw directError;
      return JSON.stringify(result, null, 2);
    }
  }

  function parseProtoEnhanced(source) {
    const compact = String(source).replace(/0x/gi, '').replace(/[\s,]/g, '');
    if (!compact || compact.length % 2 || !/^[\da-f]+$/i.test(compact)) throw new Error('请输入有效的偶数长度十六进制数据');
    const bytes = Uint8Array.from(compact.match(/.{2}/g), (hex) => parseInt(hex, 16));
    let index = 0;
    const readVarint = () => { let value = 0n, shift = 0n; for (let count = 0; count < 10; count++) { if (index >= bytes.length) throw new Error('Proto Varint 数据不完整'); const byte = bytes[index++]; value |= BigInt(byte & 127) << shift; if (!(byte & 128)) return value; shift += 7n; } throw new Error('Proto Varint 超过 10 字节'); };
    const read = (length) => { if (index + length > bytes.length) throw new Error('Proto 字段长度超出数据范围'); const value = bytes.slice(index, index + length); index += length; return value; };
    const fields = [];
    while (index < bytes.length) {
      const key = readVarint(), field = Number(key >> 3n), wire = Number(key & 7n);
      if (!field) throw new Error('Proto 字段编号不能为 0');
      if (wire === 0) { const value = readVarint(); fields.push({ field, wire, value: value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : value.toString() }); }
      else if (wire === 1) fields.push({ field, wire, hex: [...read(8)].map((byte) => byte.toString(16).padStart(2, '0')).join(' ') });
      else if (wire === 2) { const lengthValue = readVarint(); if (lengthValue > BigInt(MAX_INPUT)) throw new Error('Proto 长度字段过大'); const data = read(Number(lengthValue)); let text = ''; try { text = new TextDecoder('utf-8', { fatal: true }).decode(data); } catch (_) {} fields.push({ field, wire, length: data.length, value: text || undefined, hex: text ? undefined : [...data].map((byte) => byte.toString(16).padStart(2, '0')).join(' ') }); }
      else if (wire === 5) fields.push({ field, wire, hex: [...read(4)].map((byte) => byte.toString(16).padStart(2, '0')).join(' ') });
      else throw new Error(`暂不支持 Proto Wire Type ${wire}`);
    }
    return JSON.stringify(fields, null, 2);
  }

  function formatMarkup(source) {
    const tokens = source.replace(/>\s*</g, '><').match(/<[^>]+>|[^<]+/g) || [];
    let depth = 0;
    return tokens.map((token) => {
      const trimmed = token.trim();
      if (!trimmed) return '';
      if (/^<\//.test(trimmed)) depth = Math.max(0, depth - 1);
      const line = `${'  '.repeat(depth)}${trimmed}`;
      if (/^<[^!?/][^>]*[^/]?>$/.test(trimmed) && !/<\/(?:[^>]+)>$/.test(trimmed) && !/^<(?:area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)\b/i.test(trimmed)) depth++;
      return line;
    }).filter(Boolean).join('\n');
  }

  function scanCode(source, minify = false) {
    let output = '', quote = '', escaped = false, lineComment = false, blockComment = false, pendingSpace = false, depth = 0;
    const newline = () => { output = output.replace(/[ \t]+$/g, ''); if (!output.endsWith('\n')) output += '\n'; if (!minify) output += '  '.repeat(depth); };
    for (let i = 0; i < source.length; i++) {
      const char = source[i], next = source[i + 1];
      if (lineComment) { if (char === '\n') { lineComment = false; if (!minify) newline(); else pendingSpace = true; } else if (!minify) output += char; continue; }
      if (blockComment) { if (char === '*' && next === '/') { blockComment = false; i++; if (!minify) output += '*/'; else pendingSpace = true; } else if (!minify) output += char; continue; }
      if (quote) { output += char; if (escaped) escaped = false; else if (char === '\\') escaped = true; else if (char === quote) quote = ''; continue; }
      if (char === '/' && next === '/') { lineComment = true; i++; if (!minify) output += '//'; continue; }
      if (char === '/' && next === '*') { blockComment = true; i++; if (!minify) output += '/*'; continue; }
      if (char === '"' || char === "'" || char === '`') { if (pendingSpace && /[\w$]$/.test(output)) output += ' '; pendingSpace = false; quote = char; output += char; continue; }
      if (/\s/.test(char)) { pendingSpace = true; continue; }
      if (minify) {
        if (pendingSpace && /[\w$]$/.test(output) && /[\w$]/.test(char)) output += ' ';
        pendingSpace = false; output += char; continue;
      }
      pendingSpace = false;
      if (char === '}') { depth = Math.max(0, depth - 1); newline(); output += char; if (next && next !== ';' && next !== ',' && next !== ')') newline(); }
      else if (char === '{') { output += ' {'; depth++; newline(); }
      else if (char === ';') { output += ';'; newline(); }
      else if (char === '\n') newline();
      else output += char;
    }
    return output.trim();
  }

  function beautifyEnhanced(source) {
    if (source.length > MAX_INPUT) throw new Error('代码超过 5 MB，请分批处理');
    try { return JSON.stringify(JSON.parse(source), null, 2); } catch (_) {}
    if (/^\s*</.test(source)) return formatMarkup(source);
    return scanCode(source, false);
  }

  function regexInWorker(source, pattern, flags) {
    if (source.length > MAX_INPUT) return Promise.reject(new Error('正则输入超过 5 MB，请缩小输入'));
    if (String(pattern).length > 2000) return Promise.reject(new Error('正则表达式过长'));
    return new Promise((resolve, reject) => {
      const worker = new Worker(chrome.runtime.getURL('regex-worker.js'));
      const timer = setTimeout(() => { worker.terminate(); reject(new Error('正则执行超过 1 秒，可能存在灾难性回溯')); }, 1000);
      worker.onmessage = (event) => { clearTimeout(timer); worker.terminate(); event.data?.ok ? resolve(event.data.result) : reject(new Error(event.data?.error || '正则执行失败')); };
      worker.onerror = () => { clearTimeout(timer); worker.terminate(); reject(new Error('正则执行失败')); };
      worker.postMessage({ source, pattern, flags });
    });
  }

  async function readResponseLimited(response) {
    if (!response.body?.getReader) {
      const text = await response.text();
      return { text: text.slice(0, MAX_HTTP_BODY), bytes: new TextEncoder().encode(text).length, truncated: text.length > MAX_HTTP_BODY };
    }
    const reader = response.body.getReader(), decoder = new TextDecoder();
    let text = '', bytes = 0, truncated = false;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_HTTP_BODY) { const overflow = bytes - MAX_HTTP_BODY; text += decoder.decode(value.subarray(0, Math.max(0, value.byteLength - overflow)), { stream: true }); truncated = true; await reader.cancel(); break; }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return { text, bytes, truncated };
  }

  function smartHttpBody(text, contentType) {
    if (!text) return '';
    if (text.length > MAX_SMART_INPUT) return text;
    if (/json|javascript/i.test(contentType) || /^\s*[\[{]/.test(text)) {
      try { return smartValue(JSON.parse(text)); } catch (_) {}
    }
    const candidate = decodeCandidate(text);
    return candidate ? (candidate.structured ? smartValue(candidate.parsed) : candidate.decoded) : text;
  }

  async function httpRequestEnhanced(source, options) {
    const config = JSON.parse(source), method = String(controlValue('opt-method', '') || config.method || 'GET').toUpperCase();
    if (!config.url) throw new Error('请求配置缺少 url');
    await requestHostPermission(config.url);
    const timeout = Math.max(1, Math.min(120, Number(controlValue('opt-timeout', '30')) || 30));
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeout * 1000);
    const headers = new Headers(config.headers || {});
    let body;
    if (!['GET', 'HEAD'].includes(method) && config.body !== undefined) {
      body = typeof config.body === 'string' ? config.body : JSON.stringify(config.body);
      if (typeof config.body === 'object' && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    }
    const started = performance.now();
    try {
      const response = await fetch(config.url, { method, headers, body, signal: controller.signal });
      const contentType = response.headers.get('content-type') || '';
      const content = await readResponseLimited(response);
      return JSON.stringify({ status: response.status, statusText: response.statusText, ok: response.ok, durationMs: Math.round((performance.now() - started) * 100) / 100, contentType, capturedBytes: content.bytes, truncated: content.truncated, headers: Object.fromEntries(response.headers), body: smartHttpBody(content.text, contentType) }, null, 2);
    } catch (error) {
      if (error.name === 'AbortError') throw new Error(`请求超过 ${timeout} 秒，已取消`);
      throw error;
    } finally { clearTimeout(timer); }
  }

  function decodeSvg(source) {
    const value = source.trim();
    if (value.startsWith('<svg')) return formatMarkup(value);
    if (/^data:image\/svg\+xml,/i.test(value)) return formatMarkup(decodeURIComponent(value.slice(value.indexOf(',') + 1)));
    if (/^data:image\/svg\+xml;base64,/i.test(value)) return formatMarkup(decodeBase64Utf8(value.slice(value.indexOf(',') + 1)));
    return formatMarkup(decodeBase64Utf8(value));
  }
  async function svgToRaster(source, format) {
    const svg = String(source).trim(); if (!svg.startsWith('<svg')) throw new Error('请输入 SVG 内容');
    const data = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    return await new Promise((resolve, reject) => { const image = new Image(); image.onload = () => { const canvas = document.createElement('canvas'), scale = Math.min(4, Math.max(1, 1024 / Math.max(image.width, image.height))); canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale)); const context = canvas.getContext('2d'); context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height); resolve(canvas.toDataURL(`image/${format}`, format === 'jpeg' ? .92 : undefined)); }; image.onerror = () => reject(new Error('SVG 无法渲染为图片')); image.src = data; });
  }

  function randomIdBytes(length) {
    const bytes = new Uint8Array(length); crypto.getRandomValues(bytes); return bytes;
  }
  function nanoid(length = 21) {
    const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz-';
    return [...randomIdBytes(length)].map((byte) => alphabet[byte & 63]).join('');
  }
  function ulid() {
    const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    let time = Date.now(), result = '';
    for (let i = 9; i >= 0; i--) { result = alphabet[time % 32] + result; time = Math.floor(time / 32); }
    const random = randomIdBytes(16); let value = 0n;
    for (const byte of random) value = (value << 8n) | BigInt(byte);
    for (let i = 15; i >= 0; i--) { result += alphabet[Number(value & 31n)]; value >>= 5n; }
    return result;
  }
  function timezoneDate(date, display) {
    if (display === 'utc') return date.toISOString().replace('T', ' ').replace('Z', ' UTC');
    if (display === 'iso') return date.toISOString();
    return date.toLocaleString('zh-CN', { hour12: false });
  }
  function filetimeToDate(source, display) {
    const value = BigInt(String(source).trim()), epoch = 116444736000000000n, milliseconds = (value - epoch) / 10000n;
    const date = new Date(Number(milliseconds));
    if (Number.isNaN(date.getTime())) throw new Error('FILETIME 超出可处理日期范围');
    return timezoneDate(date, display);
  }
  function colorDetailed(source) {
    const text = String(source).trim(), hsl = text.match(/^hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%(?:\s*,\s*([\d.]+))?\s*\)$/i), hsv = text.match(/^hsva?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%(?:\s*,\s*([\d.]+))?\s*\)$/i);
    let r, g, b, a = 1;
    if (hsl || hsv) {
      const hue = Number((hsl || hsv)[1]) % 360 / 60, saturation = Number((hsl || hsv)[2]) / 100, third = Number((hsl || hsv)[3]) / 100; a = Number((hsl || hsv)[4] ?? 1);
      if (hsl) { const q = third < .5 ? third * (1 + saturation) : third + saturation - third * saturation, p = 2 * third - q, channel = (value) => { if (value < 0) value += 1; if (value > 1) value -= 1; if (value < 1 / 6) return p + (q - p) * 6 * value; if (value < 1 / 2) return q; if (value < 2 / 3) return p + (q - p) * (2 / 3 - value) * 6; return p; }; r = third === 0 ? 0 : channel(hue / 6 + 1 / 3); g = third === 0 ? 0 : channel(hue / 6); b = third === 0 ? 0 : channel(hue / 6 - 1 / 3); } else { const chroma = third * saturation, x = chroma * (1 - Math.abs((hue % 2) - 1)), m = third - chroma; [[r, g, b] = [chroma, x, 0], [r, g, b] = [x, chroma, 0], [r, g, b] = [0, chroma, x], [r, g, b] = [0, x, chroma], [r, g, b] = [x, 0, chroma], [r, g, b] = [chroma, 0, x]][Math.floor(hue) % 6]; r += m; g += m; b += m; }
    } else { const rgba = text.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)$/i), hex = text.replace(/^#/, ''); if (rgba) { r = Number(rgba[1]) / 255; g = Number(rgba[2]) / 255; b = Number(rgba[3]) / 255; a = Number(rgba[4] ?? 1); } else if (/^[\da-f]{3,8}$/i.test(hex)) { const expanded = hex.length === 3 || hex.length === 4 ? [...hex].map((x) => x + x).join('') : hex; r = parseInt(expanded.slice(0, 2), 16) / 255; g = parseInt(expanded.slice(2, 4), 16) / 255; b = parseInt(expanded.slice(4, 6), 16) / 255; a = expanded.length >= 8 ? parseInt(expanded.slice(6, 8), 16) / 255 : 1; } else throw new Error('请输入 HEX、RGB、RGBA、HSL 或 HSV 颜色'); }
    const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min, light = (max + min) / 2, saturationHsl = delta === 0 ? 0 : delta / (1 - Math.abs(2 * light - 1)), saturationHsv = max === 0 ? 0 : delta / max; let hue = 0; if (delta) hue = (max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4) * 60; if (hue < 0) hue += 360; const round = (value) => Math.round(value * 100) / 100; return JSON.stringify({ hex: `#${[r, g, b, a < 1 ? a : null].filter((value) => value !== null).map((value) => Math.round(value * 255).toString(16).padStart(2, '0')).join('').toUpperCase()}`, rgba: `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${round(a)})`, hsl: `hsl(${round(hue)}, ${round(saturationHsl * 100)}%, ${round(light * 100)}%)`, hsv: `hsv(${round(hue)}, ${round(saturationHsv * 100)}%, ${round(max * 100)}%)` }, null, 2);
  }
  function radixBigInt(source, from, to) {
    const baseFrom = Math.max(2, Math.min(36, Number(from) || 10)), baseTo = Math.max(2, Math.min(36, Number(to) || 16));
    const text = String(source).trim().replace(/^[-+]/, (sign) => sign);
    if (!text) throw new Error('请输入需要转换的数字');
    const negative = text.startsWith('-'), digits = negative || text.startsWith('+') ? text.slice(1) : text;
    if (!digits || !/^[0-9a-z]+$/i.test(digits) || [...digits].some((char) => parseInt(char, 36) >= baseFrom)) throw new Error(`输入内容不是有效的 ${baseFrom} 进制数字`);
    let value = 0n; for (const char of digits.toLowerCase()) value = value * BigInt(baseFrom) + BigInt(parseInt(char, 36));
    if (negative) value = -value;
    return value.toString(baseTo).toUpperCase();
  }
  async function websocketRequest(source, options) {
    const url = String(source).trim();
    if (!/^wss?:\/\//i.test(url)) throw new Error('请输入 ws:// 或 wss:// 地址');
    const timeout = Math.max(1, Math.min(30, Number(options.timeout || controlValue('opt-timeout', '5')) || 5)) * 1000;
    const message = String(options.message ?? controlValue('opt-message', 'ping'));
    return await new Promise((resolve, reject) => {
      const socket = new WebSocket(url), received = [], started = performance.now(); let settled = false;
      const finish = (error) => { if (settled) return; settled = true; clearTimeout(timer); try { socket.close(); } catch (_) {} if (error) reject(error); else resolve(JSON.stringify({ url, sent: message, messages: received, durationMs: Math.round((performance.now() - started) * 100) / 100 }, null, 2)); };
      const timer = setTimeout(() => finish(), timeout);
      socket.onopen = () => { try { socket.send(message); } catch (error) { finish(error); } };
      socket.onmessage = (event) => { if (received.length < 100) received.push(typeof event.data === 'string' ? event.data : '[二进制消息]'); };
      socket.onerror = () => finish(new Error('WebSocket 连接失败或被目标服务器拒绝'));
      socket.onclose = (event) => { if (!settled && event.code !== 1000) finish(new Error(`WebSocket 已关闭（${event.code}）`)); };
    });
  }
  async function decodeQrImage(source) {
    if (typeof BarcodeDetector !== 'function') throw new Error('当前浏览器不支持二维码识别，请使用支持 BarcodeDetector 的 Chrome 版本');
    const value = String(source).trim();
    if (!/^data:image\//i.test(value)) throw new Error('请先导入或粘贴图片 Data URI');
    const response = await fetch(value), bitmap = await createImageBitmap(await response.blob());
    try {
      const detector = new BarcodeDetector({ formats: ['qr_code'] }), results = await detector.detect(bitmap);
      if (!results.length) throw new Error('图片中没有识别到二维码');
      return results.map((item) => item.rawValue).join('\n');
    } finally { bitmap.close(); }
  }
  function loadQrEncoder() {
    if (window.DevboxQRCode) return Promise.resolve(window.DevboxQRCode);
    return new Promise((resolve, reject) => { const script = document.createElement('script'); script.src = chrome.runtime.getURL('vendor/qr-bundle.js'); script.onload = () => window.DevboxQRCode ? resolve(window.DevboxQRCode) : reject(new Error('二维码编码器加载失败')); script.onerror = () => reject(new Error('二维码编码器加载失败')); document.head.appendChild(script); });
  }
  async function generateQrSvg(source) {
    const QRCode = await loadQrEncoder(), bytes = new TextEncoder().encode(String(source)), binary = String.fromCharCode(...bytes), qr = new QRCode(0, 0);
    qr.addData(binary); qr.make(); const count = qr.getModuleCount(), quiet = 4, size = count + quiet * 2, cells = [];
    for (let row = 0; row < count; row++) for (let col = 0; col < count; col++) if (qr.isDark(row, col)) cells.push(`<rect x="${col + quiet}" y="${row + quiet}" width="1" height="1"/>`);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size * 8}" height="${size * 8}" shape-rendering="crispEdges" role="img" aria-label="二维码"><rect width="100%" height="100%" fill="#fff"/><g fill="#000">${cells.join('')}</g></svg>`;
  }
  async function pagePerformance() {
    if (!chrome.tabs?.query || !chrome.scripting?.executeScript) throw new Error('当前浏览器不支持页面性能采集');
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true }), tab = tabs[0];
    if (!tab?.id) throw new Error('没有找到当前活动页面');
    try {
      const result = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => {
        const navigation = performance.getEntriesByType('navigation')[0], resources = performance.getEntriesByType('resource').map((entry) => ({ name: entry.name, initiatorType: entry.initiatorType, duration: Math.round(entry.duration * 100) / 100, transferSize: entry.transferSize || 0 })).sort((a, b) => b.duration - a.duration).slice(0, 100), longTasks = performance.getEntriesByType('longtask').map((entry) => ({ startTime: Math.round(entry.startTime * 100) / 100, duration: Math.round(entry.duration * 100) / 100 })).slice(0, 100); return { url: location.href, title: document.title, navigation: navigation ? { duration: Math.round(navigation.duration * 100) / 100, dns: Math.round((navigation.domainLookupEnd - navigation.domainLookupStart) * 100) / 100, connect: Math.round((navigation.connectEnd - navigation.connectStart) * 100) / 100, ttfb: Math.round((navigation.responseStart - navigation.requestStart) * 100) / 100, domInteractive: Math.round(navigation.domInteractive * 100) / 100, loadEvent: Math.round(navigation.loadEventEnd * 100) / 100 } : null, resources, longTasks, memory: performance.memory ? { usedJSHeapSize: performance.memory.usedJSHeapSize, totalJSHeapSize: performance.memory.totalJSHeapSize, jsHeapSizeLimit: performance.memory.jsHeapSizeLimit } : null }; } });
      return JSON.stringify(result?.[0]?.result || {}, null, 2);
    } catch (error) { throw new Error(`无法采集当前页面：${error.message || '页面可能禁止脚本注入'}`); }
  }
  async function fullPageScreenshot() {
    if (!chrome.tabs?.query || !chrome.scripting?.executeScript) throw new Error('当前浏览器不支持整页截图');
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true }), tab = tabs[0]; if (!tab?.id) throw new Error('没有找到当前活动页面');
    const details = (await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => ({ width: Math.max(document.documentElement.clientWidth, window.innerWidth), height: Math.max(document.body.scrollHeight, document.documentElement.scrollHeight), viewport: window.innerHeight, scrollX: window.scrollX, scrollY: window.scrollY }) }))[0]?.result;
    if (!details) throw new Error('无法读取页面尺寸');
    const images = [], step = Math.max(1, details.viewport - 16);
    try {
      for (let y = 0; y < details.height; y += step) { await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: (top) => window.scrollTo(0, top), args: [y] }); await new Promise((resolve) => setTimeout(resolve, 120)); const dataUrl = await new Promise((resolve, reject) => chrome.tabs.captureVisibleTab({ format: 'png' }, (value) => { const error = chrome.runtime.lastError; error ? reject(new Error(error.message)) : resolve(value); })); images.push({ y, dataUrl }); }
    } finally { await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: (x, y) => window.scrollTo(x, y), args: [details.scrollX, details.scrollY] }).catch(() => {}); }
    const canvas = document.createElement('canvas'); canvas.width = details.width; canvas.height = details.height; const context = canvas.getContext('2d');
    for (const item of images) await new Promise((resolve, reject) => { const image = new Image(); image.onload = () => { context.drawImage(image, 0, item.y); resolve(); }; image.onerror = reject; image.src = item.dataUrl; });
    return canvas.toDataURL('image/png');
  }
  async function notesRequest(source, options) {
    const key = 'devboxNotes'; const stored = await chrome.storage.local.get(key); const notes = Array.isArray(stored[key]) ? stored[key] : [];
    const action = options.noteAction || controlValue('opt-note-action', 'save');
    if (action === 'clear') { await chrome.storage.local.set({ [key]: [] }); return '便签已清空'; }
    if (action === 'list') return JSON.stringify(notes, null, 2);
    if (action === 'export') return JSON.stringify(notes, null, 2);
    if (action === 'import') { let imported; try { imported = JSON.parse(String(source)); } catch (_) { throw new Error('便签文件必须是有效 JSON'); } if (!Array.isArray(imported)) throw new Error('便签文件必须是数组'); const normalized = imported.filter((item) => item && typeof item.content === 'string').map((item) => ({ id: item.id || crypto.randomUUID(), content: item.content, createdAt: item.createdAt || new Date().toISOString() })).slice(0, 200); await chrome.storage.local.set({ [key]: normalized }); return `已导入 ${normalized.length} 条便签`; }
    const note = { id: crypto.randomUUID(), content: String(source), createdAt: new Date().toISOString() };
    const next = [note, ...notes].slice(0, 200); await chrome.storage.local.set({ [key]: next }); return JSON.stringify(note, null, 2);
  }
  function mermaidFlowchartSvg(source) {
    const block = String(source).match(/```mermaid\s*([\s\S]*?)```/i)?.[1] || String(source);
    const lines = block.replace(/\r/g, '').split('\n').map((line) => line.trim()).filter((line) => line && !/^(flowchart|graph)\s+(TD|TB|LR|RL|BT)$/i.test(line) && !/^%%/.test(line));
    const nodes = new Map(), edges = [];
    const ensure = (id, label = id, shape = 'rect') => { if (!nodes.has(id)) nodes.set(id, { id, label, shape }); else if (label !== id) nodes.get(id).label = label; return nodes.get(id); };
    for (const line of lines) {
      const matches = [...line.replace(/\|[^|]*\|/g, '').matchAll(/([A-Za-z][\w-]*)\s*(?:\[([^\]]+)\]|\{([^}]+)\}|\(([^)]+)\))?/g)];
      for (const match of matches) ensure(match[1], match[2] || match[3] || match[4] || match[1], match[3] ? 'diamond' : match[4] ? 'round' : 'rect');
      const edge = line.match(/([A-Za-z][\w-]*)\s*[-.=]+>\s*(?:\|([^|]+)\|\s*)?([A-Za-z][\w-]*)/);
      if (edge) { ensure(edge[1]); ensure(edge[3]); edges.push({ from: edge[1], to: edge[3], label: edge[2] || '' }); }
    }
    if (!nodes.size) throw new Error('未找到 Mermaid 流程图节点');
    const list = [...nodes.values()], width = 760, row = 105, height = Math.max(160, list.length * row + 40), positions = new Map(list.map((node, index) => [node.id, { x: width / 2, y: 35 + index * row }]));
    const marker = '<defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#64748b"/></marker></defs>';
    const edgeSvg = edges.map((edge) => { const a = positions.get(edge.from), b = positions.get(edge.to); return `<line x1="${a.x}" y1="${a.y + 24}" x2="${b.x}" y2="${b.y - 24}" stroke="#64748b" stroke-width="1.5" marker-end="url(#arrow)"/><text x="${a.x + 6}" y="${(a.y + b.y) / 2}" fill="#475569" font-size="12">${esc(edge.label)}</text>`; }).join('');
    const nodeSvg = list.map((node) => { const p = positions.get(node.id), label = esc(node.label).slice(0, 80); if (node.shape === 'diamond') return `<polygon points="${p.x},${p.y - 28} ${p.x + 82},${p.y} ${p.x},${p.y + 28} ${p.x - 82},${p.y}" fill="#fff7ed" stroke="#f59e0b"/><text x="${p.x}" y="${p.y + 4}" text-anchor="middle" fill="#92400e" font-size="13">${label}</text>`; const rx = node.shape === 'round' ? 20 : 6; return `<rect x="${p.x - 82}" y="${p.y - 25}" width="164" height="50" rx="${rx}" fill="#eef2ff" stroke="#6366f1"/><text x="${p.x}" y="${p.y + 4}" text-anchor="middle" fill="#3730a3" font-size="13">${label}</text>`; }).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Mermaid 流程图">${marker}<rect width="100%" height="100%" fill="#fff"/>${edgeSvg}${nodeSvg}</svg>`;
  }
  function markdownEnhanced(source, mode = 'preview') {
    const lines = String(source).replace(/\r\n?/g, '\n').split('\n'), output = [], text = (value) => esc(value).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/`([^`]+)`/g, '<code>$1</code>');
    let inCode = false;
    for (const line of lines) {
      if (/^```/.test(line)) { inCode = !inCode; output.push(inCode ? '<pre><code>' : '</code></pre>'); continue; }
      if (inCode) { output.push(esc(line)); continue; }
      if (!line.trim()) { output.push(''); continue; }
      const heading = line.match(/^(#{1,6})\s+(.+)$/); if (heading) { output.push(`<h${heading[1].length}>${text(heading[2])}</h${heading[1].length}>`); continue; }
      if (/^[-*+]\s+/.test(line)) { output.push(`<li>${text(line.replace(/^[-*+]\s+/, ''))}</li>`); continue; }
      if (/^>\s?/.test(line)) { output.push(`<blockquote>${text(line.replace(/^>\s?/, ''))}</blockquote>`); continue; }
      output.push(`<p>${text(line).replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>')}</p>`);
    }
    const html = output.join('\n');
    if (mode === 'flowchart') return mermaidFlowchartSvg(source);
    if (mode === 'plain') return String(source).replace(/[`*_>#\[\]()]/g, '').replace(/^\s*[-+]\s+/gm, '').trim();
    return `<article class="devbox-markdown">${html}</article>`;
  }
  function htmlToMarkdown(source) {
    const parser = typeof DOMParser === 'function' ? new DOMParser() : null;
    if (!parser) return String(source).replace(/<h([1-6])[^>]*>(.*?)<\/h\1>/gi, (_, level, text) => `${'#'.repeat(Number(level))} ${text}`).replace(/<(strong|b)>(.*?)<\/\1>/gi, '**$2**').replace(/<(em|i)>(.*?)<\/\1>/gi, '*$2*').replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n').replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n').replace(/<[^>]+>/g, '').trim();
    const root = parser.parseFromString(String(source), 'text/html').body;
    const convert = (node, depth = 0) => {
      if (node.nodeType === Node.TEXT_NODE) return node.nodeValue.replace(/\s+/g, ' ');
      if (node.nodeType !== Node.ELEMENT_NODE) return [...node.childNodes].map((child) => convert(child, depth)).join('');
      const content = [...node.childNodes].map((child) => convert(child, depth)).join('').trim();
      const tag = node.tagName.toLowerCase();
      if (/^h[1-6]$/.test(tag)) return `${'#'.repeat(Number(tag.slice(1)))} ${content}\n\n`;
      if (tag === 'p') return `${content}\n\n`;
      if (tag === 'br') return '\n';
      if (tag === 'strong' || tag === 'b') return `**${content}**`;
      if (tag === 'em' || tag === 'i') return `*${content}*`;
      if (tag === 'code' && node.parentElement?.tagName.toLowerCase() !== 'pre') return `\`${content}\``;
      if (tag === 'pre') return `\n\`\`\`\n${node.textContent.trim()}\n\`\`\`\n\n`;
      if (tag === 'a') return `[${content}](${node.getAttribute('href') || ''})`;
      if (tag === 'li') return `${'  '.repeat(depth)}- ${content}\n`;
      if (tag === 'ul' || tag === 'ol') return [...node.children].map((child) => convert(child, depth)).join('') + '\n';
      return content;
    };
    return convert(root).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  const originalExecute = execute;
  execute = async (id, source, options = {}) => {
    const o = { ...options, prefix: controlValue('opt-affix'), suffix: controlValue('opt-affix'), rate: controlValue('opt-rate', '4.2'), months: controlValue('opt-months', '240') };
    if (source.length > MAX_INPUT) throw new Error('输入超过 5 MB，请分批处理');
    if (id === 'smart-decode') return smartFormat(source);
    if (id === 'yaml-format') return yamlFormatSafe(source, o.mode).replace(/: \n/g, ':\n');
    if (id === 'json-format') {
      if (o.mode === 'smart') return smartFormat(source);
      const indent = Number(controlValue('opt-indent', '2')) || 2;
      const repaired = o.mode === 'repair' ? repairJsonSource(source) : source;
      const formatted = o.sort === 'key' ? jsonStableStringify(sortJsonValue(parseJsonLossless(repaired)), o.mode === 'min' ? 0 : indent) : jsonLexicalFormat(repaired, indent, o.mode === 'min');
      return formatted;
    }
    if (id === 'base64') {
      if (o.mode === 'encode') return encodeBase64Utf8(source);
      if (o.mode === 'decode') return deepRunActive ? decodeBase64Relevant(source) : formatDecodedText(decodeBase64Utf8(source));
      return smartFormat(source);
    }
    if (id === 'url' && o.mode === 'decode') return deepRunActive ? decodeUrlRelevant(source) : decodeURIComponent(source);
    if (id === 'hex' && o.mode === 'decode') return deepRunActive ? decodeHexRelevant(source) : formatDecodedText(decodeHexText(source));
    if (id === 'gzip') return o.mode === 'encode' ? gzipBase64(source) : deepRunActive ? gunzipRelevant(source) : formatDecodedText(await gunzipBase64(source, false));
    if (id === 'jwt') return JSON.stringify(deepRunActive ? parseJwtRelevant(source) : parseJwtEnhanced(source), null, 2);
    if (id === 'timestamp' && o.mode === 'auto') {
      if (!deepRunActive) throw new Error('整段内容不是时间戳或 JSON 时间字段');
      return formatTimestampRelevant(source, controlValue('opt-display', 'local'));
    }
    if (id === 'timestamp' && o.mode === 'filetime') return filetimeToDate(source, controlValue('opt-display', 'local'));
    if (id === 'radix') return radixBigInt(source, o.from, o.to);
    if (id === 'color' || id === 'color-picker') return colorDetailed(source);
    if (id === 'csv-json' || id === 'excel-json') return tableOutput(delimitedToJson(source), controlValue('opt-table-output', 'json'));
    if (id === 'chart' && controlValue('opt-chart-output', 'json') === 'svg') return chartSvg(source);
    if (id === 'url-params') return JSON.stringify(smartValue(paramsToObject(source)), null, 2);
    if (id === 'cookie-format') return JSON.stringify(smartValue(cookiesToObject(source)), null, 2);
    if (id === 'proto-hex') return parseProtoEnhanced(source);
    if (id === 'regex') return regexInWorker(source, o.pattern || '', o.flags || 'g');
    if (id === 'code-beautify') return beautifyEnhanced(source);
    if (id === 'code-compress') return scanCode(source, true);
    if (id === 'http' || id === 'postman') return httpRequestEnhanced(source, o);
    if (id === 'uuid' && controlValue('opt-kind', 'uuid') === 'nanoid') return nanoid();
    if (id === 'uuid' && controlValue('opt-kind', 'uuid') === 'ulid') return ulid();
    if (id === 'websocket') return websocketRequest(source, o);
    if (id === 'qr') return controlValue('opt-qr-mode', 'generate') === 'decode' ? decodeQrImage(source) : generateQrSvg(source);
    if (id === 'color-picker') { if (typeof EyeDropper !== 'function') throw new Error('当前浏览器不支持页面取色'); return new EyeDropper().open().then((result) => result.sRGBHex); }
    if (id === 'page-screenshot') return controlValue('opt-screenshot-mode', 'visible') === 'full' ? fullPageScreenshot() : new Promise((resolve, reject) => chrome.tabs.captureVisibleTab({ format: 'png' }, (dataUrl) => { const error = chrome.runtime.lastError; error ? reject(new Error(error.message)) : resolve(dataUrl || '截图失败'); }));
    if (id === 'page-timing') return pagePerformance();
    if (id === 'page-monkey' && controlValue('opt-script-mode', 'template') === 'inject') {
      if (!chrome.tabs?.query || !chrome.scripting?.executeScript) throw new Error('当前浏览器不支持页面脚本注入');
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true }), tab = tabs[0]; if (!tab?.id) throw new Error('没有找到当前活动页面');
      try { await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: (code) => { const runner = new Function(code); return runner(); }, args: [String(source)] }); return '脚本已注入当前页面'; } catch (error) { throw new Error(`脚本注入失败：${error.message || '页面可能禁止脚本注入'}`); }
    }
    if (id === 'ai' && controlValue('opt-ai-mode', 'template') === 'send') {
      const endpoint = controlValue('opt-ai-url').trim(), model = controlValue('opt-ai-model').trim(), key = controlValue('opt-ai-key').trim();
      if (!endpoint || !model || !key) throw new Error('发送模式需要填写接口地址、模型和 API Key');
      await requestHostPermission(endpoint);
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify({ model, messages: [{ role: 'user', content: String(source) }], temperature: 0.2 }) });
      const body = await response.text(); if (!response.ok) throw new Error(`AI 请求失败（${response.status}）：${body.slice(0, 500)}`); return body;
    }
    if (id === 'notes') return notesRequest(source, o);
    if (id === 'markdown') { const mode = controlValue('opt-markdown-mode', 'preview'); return mode === 'html-markdown' ? htmlToMarkdown(source) : markdownEnhanced(source, mode); }
    if (id === 'image-base64') {
      const value = String(source).trim();
      if (/^data:image\//i.test(value)) return value;
      const bytes = base64ToBytes(value);
      return `data:image/png;base64,${bytesToBase64(bytes)}`;
    }
    if (id === 'svg-converter') {
      if (['png', 'jpeg', 'webp'].includes(o.mode)) return svgToRaster(source, o.mode);
      if (o.mode === 'decode' || o.mode === 'format') return decodeSvg(source);
      if (!source.trim().startsWith('<svg')) throw new Error('请输入 SVG 内容');
      return `data:image/svg+xml;base64,${encodeBase64Utf8(source.trim())}`;
    }
    return originalExecute(id, source, o);
  };

  function excessiveJsonNesting(source, limit = 200) {
    let depth = 0, quote = false, escaped = false;
    for (const char of source) {
      if (quote) { if (escaped) escaped = false; else if (char === '\\') escaped = true; else if (char === '"') quote = false; continue; }
      if (char === '"') quote = true;
      else if (char === '{' || char === '[') { if (++depth > limit) return true; }
      else if (char === '}' || char === ']') depth--;
    }
    return false;
  }

  const originalRun = run;
  function actionLabel(id, stateName = 'initial') {
    if (stateName === 'deep') return '深度解析';
    if (stateName === 'deep-again') return '重新解析';
    if (stateName === 'again') {
      if (['http', 'postman'].includes(id)) return '再次发送';
      if (id === 'dns-lookup') return '重新查询';
      if (['uuid', 'snowflake', 'password', 'totp', 'mock', 'qr', 'chart', 'poster', 'grid-ruler'].includes(id)) return '再次生成';
      if (['loan', 'datetime-calc', 'byte-unit', 'radix'].includes(id)) return '重新计算';
      return '重新处理';
    }
    if (['json-diff', 'text-diff'].includes(id)) return '开始对比';
    if (['http', 'postman'].includes(id)) return '发送请求';
    if (id === 'dns-lookup') return '查询 DNS';
    if (['uuid', 'snowflake', 'password', 'totp', 'mock', 'qr', 'chart', 'poster', 'grid-ruler'].includes(id)) return '生成';
    if (['loan', 'datetime-calc', 'byte-unit', 'radix'].includes(id)) return '计算';
    if (id === 'smart-decode') return '深度解析';
    return '立即处理';
  }

  function setRunAction(stateName = 'initial') {
    const button = document.getElementById('run');
    if (!button || !state.tool) return;
    button.dataset.deep = stateName === 'deep' || stateName === 'deep-again' || state.tool.id === 'smart-decode' ? '1' : '0';
    button.innerHTML = `${actionLabel(state.tool.id, stateName)} <span>Ctrl Enter</span>`;
  }

  const enhancedOpenTool = openTool;
  openTool = (id) => { enhancedOpenTool(id); setRunAction('initial'); };

  run = async (deep = false) => {
    if (runInProgress) return;
    const id = state.tool?.id;
    const requestedDeep = deep === true || id === 'smart-decode';
    if (id === 'json-diff') {
      const left = document.getElementById('compare-left')?.value || '', right = document.getElementById('compare-right')?.value || '';
      if (left.length + right.length > MAX_SMART_INPUT) { $('status').textContent = 'JSON 对比总输入不能超过 1 MB'; $('status').className = 'status error'; return; }
      if (excessiveJsonNesting(left) || excessiveJsonNesting(right)) { $('status').textContent = 'JSON 嵌套超过 200 层，已停止对比'; $('status').className = 'status error'; return; }
    }
    const input = compareIsActive() ? '' : document.getElementById('input')?.value || '';
    if (requestedDeep && input.length > MAX_SMART_INPUT) {
      $('status').textContent = '深度解析最多处理 1 MB 内容，请缩小输入或使用标准处理';
      $('status').className = 'status error';
      setRunAction('deep');
      return;
    }
    const button = document.getElementById('run');
    runInProgress = true;
    if (button) button.disabled = true;
    deepRunActive = requestedDeep;
    try { await originalRun(); }
    finally {
      deepRunActive = false;
      runInProgress = false;
      if (button) button.disabled = false;
    }
    if (!state.tool || compareIsActive()) { setRunAction('initial'); return; }
    const output = document.getElementById('output')?.value || '';
    const status = document.getElementById('status');
    const failed = status?.classList.contains('error');
    const unchanged = DEEP_TOOLS.has(id) && output.trim() === input.trim();
    if (DEEP_TOOLS.has(id) && !requestedDeep && (failed || unchanged)) {
      if (status) {
        const reason = failed && status.textContent ? `：${status.textContent}` : '';
        status.textContent = `未直接识别${reason}，可点击“深度解析”`;
        status.className = 'status';
      }
      setRunAction('deep');
    } else setRunAction(requestedDeep ? 'deep-again' : 'again');
  };

  document.addEventListener('DOMContentLoaded', () => {
    const button = document.getElementById('run');
    if (button) button.onclick = () => run(button.dataset.deep === '1');
    document.addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && state.tool) {
        event.preventDefault();
        event.stopImmediatePropagation();
        void run(document.getElementById('run')?.dataset.deep === '1');
      }
    }, true);
  });
})();
