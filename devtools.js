(() => {
  const contextId = `devbox-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const records = new Map();
  let sequence = 0;
  let disposed = false;
  let resetGeneration = 0;
  let clearCutoff = 0;
  const inspectedTabId = chrome.devtools.inspectedWindow.tabId;

  function notify(type, payload = {}) {
    if (disposed) return;
    try {
      chrome.runtime.sendMessage({ source: 'devbox-devtools', contextId, type, ...payload }, () => {
        const error = chrome.runtime.lastError;
        if (error && /invalidated|context|closed/i.test(error.message || '')) disposed = true;
      });
    } catch (_) {
      disposed = true;
    }
  }

  function metadata(request, id) {
    const req = request.request || {};
    const response = request.response || {};
    const mimeType = response.content?.mimeType || '';
    return {
      id,
      requestId: String(request.requestId || request._requestId || request.id || ''),
      url: req.url || '',
      method: req.method || 'GET',
      status: Number(response.status || 0),
      mimeType,
      resourceType: classifyType(request.type, mimeType, req.url || ''),
      time: Number(request.time || 0),
      startedAt: parseStartedAt(request.startedDateTime || request.startedAt),
      tabId: inspectedTabId
    };
  }

  function harMetadata(harEntry, id) {
    const req = harEntry.request || {};
    const response = harEntry.response || {};
    const mimeType = response.content?.mimeType || '';
    return {
      id,
      requestId: String(harEntry._requestId || harEntry.requestId || harEntry.id || ''),
      url: req.url || '',
      method: req.method || 'GET',
      status: Number(response.status || 0),
      mimeType,
      resourceType: classifyType(harEntry._resourceType || harEntry.resourceType, mimeType, req.url || ''),
      time: Number(harEntry.time || 0),
      startedAt: parseStartedAt(harEntry.startedDateTime || harEntry.startedAt),
      tabId: inspectedTabId
    };
  }

  function parseStartedAt(value) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.abs(value) < 100000000000 ? value * 1000 : value;
    }
    if (typeof value === 'string' && /^-?\d{10,13}$/.test(value.trim())) {
      const numeric = Number(value);
      return Math.abs(numeric) < 100000000000 ? numeric * 1000 : numeric;
    }
    const parsed = Date.parse(String(value || ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function sameRequest(left, right) {
    return matchScore(left, right) >= 0;
  }

  // DevTools request events and HAR snapshots are produced by different
  // pipelines. Their timestamps can differ slightly, and some browser builds
  // only expose a request id on one side. Match by the strongest signal first,
  // then use a small timestamp window instead of requiring exact equality.
  function matchScore(left, right) {
    if (!left || !right || left.url !== right.url || left.method !== right.method) return -1;
    if (left.status && right.status && left.status !== right.status) return -1;
    if (left.requestId && right.requestId && left.requestId === right.requestId) return 100000;
    if (left.startedAt && right.startedAt) {
      const delta = Math.abs(left.startedAt - right.startedAt);
      // Request and HAR timestamps normally match exactly, but a few
      // Chromium-based browsers report completion time for one side. Keep a
      // bounded window so clear-and-recapture does not create a second,
      // HAR-only row that has no live NetworkRequest object.
      return delta <= 30000 ? 30000 - delta : -1;
    }
    return 100;
  }

  function findBestRecord(entry, predicate = () => true) {
    let best = null;
    let bestScore = -1;
    for (const record of records.values()) {
      if (!predicate(record)) continue;
      const score = matchScore(record.entry, entry);
      if (score > bestScore) {
        best = record;
        bestScore = score;
      }
    }
    return best;
  }

  function latestHarFor(record, done) {
    if (typeof chrome.devtools.network.getHAR !== 'function') {
      done(record.har || null);
      return;
    }
    let completed = false;
    const finish = (har) => {
      if (completed) return;
      completed = true;
      const entries = har?.entries || [];
      let best = null;
      let bestScore = -1;
      entries.forEach((harEntry, index) => {
        const candidate = harMetadata(harEntry, `har-${harEntry._requestId || index}`);
        if (clearCutoff && candidate.startedAt && candidate.startedAt <= clearCutoff) return;
        const score = matchScore(record.entry, candidate);
        if (score > bestScore) {
          best = harEntry;
          bestScore = score;
        }
      });
      if (best) record.har = best;
      done(record.har || null);
    };
    try {
      chrome.devtools.network.getHAR(finish);
      // A few Chromium forks can fail to invoke getHAR after a DevTools
      // reload. Do not block response rendering forever in that case.
      setTimeout(() => finish(null), 1200);
    } catch (_) {
      finish(null);
    }
  }

  function classifyType(rawType, mimeType, url) {
    const type = String(rawType || '').toLowerCase();
    if (type.includes('fetch')) return 'fetch';
    if (type.includes('xhr')) return 'xhr';
    if (type.includes('script')) return 'script';
    if (type.includes('stylesheet')) return 'stylesheet';
    if (type.includes('document')) return 'document';
    if (type.includes('image')) return 'image';
    if (type.includes('font')) return 'font';
    if (type.includes('media')) return 'media';
    if (type.includes('websocket')) return 'websocket';
    const mime = String(mimeType || '').toLowerCase();
    const path = String(url || '').split('?')[0].toLowerCase();
    if (mime.includes('javascript') || /\.(m?js|jsx|ts|tsx)$/.test(path)) return 'script';
    if (mime.includes('css') || path.endsWith('.css')) return 'stylesheet';
    if (mime.startsWith('image/') || /\.(png|jpe?g|gif|svg|webp|ico)$/.test(path)) return 'image';
    if (mime.startsWith('font/') || /\.(woff2?|ttf|otf|eot)$/.test(path)) return 'font';
    if (mime.startsWith('text/html') || /\.(html?|php)$/.test(path)) return 'document';
    return 'other';
  }

  function mergeHar(har) {
    (har?.entries || []).forEach((harEntry, index) => {
      const req = harEntry.request || {};
      const stable = harEntry._requestId || `${harEntry.startedDateTime || ''}|${req.method || ''}|${req.url || ''}|${index}`;
      const provisionalId = `har-${stable}`;
      const entry = harMetadata(harEntry, provisionalId);
      if (clearCutoff && entry.startedAt && entry.startedAt <= clearCutoff) return;
      const existing = findBestRecord(entry);
      if (existing) {
        existing.har = harEntry;
        const resourceType = entry.resourceType === 'other' && existing.entry.resourceType !== 'other'
          ? existing.entry.resourceType
          : entry.resourceType;
        existing.entry = { ...entry, resourceType, id: existing.entry.id };
      } else {
        records.set(provisionalId, { entry, har: harEntry });
      }
    });
    while (records.size > 150) records.delete(records.keys().next().value);
  }

  function onRequestFinished(request) {
    if (disposed) return;
    const id = String(++sequence);
    const entry = metadata(request, id);
    if (clearCutoff && entry.startedAt && entry.startedAt <= clearCutoff) return;
    const existing = findBestRecord(entry, (record) => Boolean(record.har));
    let notificationEntry = entry;
    if (existing) {
      existing.entry = { ...entry, id: existing.entry.id };
      existing.request = request;
      notificationEntry = existing.entry;
    } else {
      records.set(id, { entry, request });
    }
    if (records.size > 150) records.delete(records.keys().next().value);
    notify('request-added', { entry: notificationEntry });
  }
  chrome.devtools.network.onRequestFinished.addListener(onRequestFinished);

  function resetRecords(reason) {
    resetGeneration += 1;
    clearCutoff = Date.now();
    records.clear();
    notify('network-reset', { reason });
  }

  function onNavigated() {
    resetRecords('navigation');
  }

  if (chrome.devtools.network.onNavigated?.addListener) {
    chrome.devtools.network.onNavigated.addListener(onNavigated);
  }

  window.addEventListener('unload', () => {
    disposed = true;
    try { chrome.devtools.network.onRequestFinished.removeListener(onRequestFinished); } catch (_) {}
    try { chrome.devtools.network.onNavigated?.removeListener(onNavigated); } catch (_) {}
  });

  function readRequestContent(record, requestBody, sendResponse) {
    let harContent = record.har?.response?.content || {};
    let harPending = typeof chrome.devtools.network.getHAR === 'function';
    let pendingEmpty = null;
    let finalHarAttempted = false;
    let settled = false;
    let attempts = 0;
    let lastError = '';
    let timeoutId;

    const hasHarText = () => typeof harContent.text === 'string' && harContent.text.length > 0;
    const normalize = (first, second) => {
      let responseBody = first;
      let responseEncoding = second || '';
      if (first && typeof first === 'object') {
        responseBody = first.content ?? first.responseBody ?? first.body ?? '';
        responseEncoding = first.encoding || responseEncoding;
      }
      return {
        body: responseBody == null ? '' : (typeof responseBody === 'string' ? responseBody : String(responseBody)),
        encoding: responseEncoding || ''
      };
    };
    const sendFinal = (body, encoding = '') => {
      if (settled) return;
      settled = true;
      if (timeoutId) clearTimeout(timeoutId);
      sendResponse({ ok: true, requestBody, responseBody: body, responseEncoding: encoding, mimeType: record.entry.mimeType });
    };
    const sendFailure = (error) => {
      if (settled) return;
      settled = true;
      if (timeoutId) clearTimeout(timeoutId);
      sendResponse({ ok: false, error: error || '读取响应体失败' });
    };
    const applyHar = (harEntry) => {
      harPending = false;
      harContent = harEntry?.response?.content || {};
      if (!settled && pendingEmpty) {
        if (hasHarText()) {
          sendFinal(harContent.text, pendingEmpty.encoding || harContent.encoding || '');
        } else if (!finalHarAttempted) {
          finalHarAttempted = true;
          harPending = true;
          latestHarFor(record, applyHar);
        } else {
          sendFinal(pendingEmpty.body, pendingEmpty.encoding);
        }
      }
    };

    // Start HAR refresh in parallel, but never wait for it before calling
    // NetworkRequest.getContent(). Some Chromium variants require that method
    // to be invoked immediately while the request object is still live.
    latestHarFor(record, applyHar);

    const read = () => {
      if (settled) return;
      attempts += 1;
      const finish = (first, second) => {
        if (settled) return;
        const normalized = normalize(first, second);
        if (normalized.body) {
          sendFinal(normalized.body, normalized.encoding);
          return;
        }
        if (hasHarText()) {
          sendFinal(harContent.text, normalized.encoding || harContent.encoding || '');
          return;
        }
        if (attempts < 3) {
          setTimeout(read, attempts * 180);
          return;
        }
        // If HAR is still being generated, let its callback resolve the empty
        // candidate instead of returning an incomplete response immediately.
        if (harPending) {
          pendingEmpty = normalized;
          return;
        }
        if (!finalHarAttempted) {
          finalHarAttempted = true;
          harPending = true;
          pendingEmpty = normalized;
          latestHarFor(record, applyHar);
          return;
        }
        sendFinal(normalized.body, normalized.encoding);
      };
      try {
        const result = record.request.getContent(finish);
        if (result && typeof result.then === 'function') {
          result.then((value) => finish(value, '')).catch((error) => {
            lastError = error?.message || '读取响应体失败';
            if (attempts < 3) setTimeout(read, attempts * 180);
            else sendFailure(lastError);
          });
        }
      } catch (error) {
        lastError = error?.message || '读取响应体失败';
        if (attempts < 3) setTimeout(read, attempts * 180);
        else sendFailure(lastError);
      }
    };

    timeoutId = setTimeout(() => {
      if (hasHarText()) sendFinal(harContent.text, harContent.encoding || '');
      else sendFailure(lastError || '浏览器未返回响应体，请重新加载页面后重试。');
    }, 15000);
    read();
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || message.contextId !== contextId) return undefined;
    if (message.type === 'list-requests') {
      const generation = resetGeneration;
      if (typeof chrome.devtools.network.getHAR === 'function') {
        chrome.devtools.network.getHAR((har) => {
          if (generation === resetGeneration) mergeHar(har);
          sendResponse({ ok: true, entries: [...records.values()].map((x) => x.entry) });
        });
        return true;
      }
      sendResponse({ ok: true, entries: [...records.values()].map((x) => x.entry) });
      return undefined;
    }
    if (message.type === 'clear-requests') {
      resetRecords('clear');
      sendResponse({ ok: true });
      return undefined;
    }
    if (message.type === 'reload-page') {
      resetRecords('reload');
      try {
        chrome.devtools.inspectedWindow.reload({ ignoreCache: Boolean(message.ignoreCache) });
        sendResponse({ ok: true });
      } catch (error) {
        sendResponse({ ok: false, error: error.message || '无法刷新当前页面' });
      }
      return undefined;
    }
    if (message.type === 'get-content') {
      const record = records.get(String(message.id));
      if (!record) {
        sendResponse({ ok: false, error: '网络条目已失效，请重新选择。' });
        return undefined;
      }
      const requestBody = record.request?.request?.postData?.text || record.har?.request?.postData?.text || '';

      if (!record.request?.getContent) {
        latestHarFor(record, (harEntry) => {
          const content = harEntry?.response?.content || {};
          sendResponse({
            ok: true,
            requestBody,
            responseBody: content.text || '',
            responseEncoding: content.encoding || '',
            mimeType: record.entry.mimeType
          });
        });
        return true;
      }
      readRequestContent(record, requestBody, sendResponse);
      return true;
    }
    return undefined;
  });

  chrome.devtools.panels.create(
    '开发匣',
    'icon128.png',
    `devtools-panel.html?context=${encodeURIComponent(contextId)}`
  );
})();
