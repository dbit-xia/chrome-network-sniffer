// injected.js - 运行在页面的 JS 世界（非 content script 隔离环境）
// 用于 monkey-patch fetch 和 XMLHttpRequest

(function () {
  if (window.__netSniffPageInjected) return;
  window.__netSniffPageInjected = true;

  function postRequest(req) {
    window.postMessage({ type: '__NETSNIFF_REQUEST__', request: req }, '*');
  }

  function safeStringify(obj) {
    try {
      if (typeof obj === 'string') return obj;
      return JSON.stringify(obj);
    } catch {
      return String(obj);
    }
  }

  function tryParseJSON(text) {
    try { return JSON.parse(text); } catch { return null; }
  }

  // ─── Patch fetch ──────────────────────────────────────────────────────
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const startTime = Date.now();
    let url = '';
    let method = 'GET';
    let requestBody = null;
    let requestHeaders = {};

    try {
      const input = args[0];
      const init = args[1] || {};
      url = typeof input === 'string' ? input : (input?.url || String(input));
      method = (init.method || (input?.method) || 'GET').toUpperCase();
      requestBody = init.body ? safeStringify(init.body) : null;

      if (init.headers) {
        try {
          requestHeaders = Object.fromEntries(new Headers(init.headers).entries());
        } catch {}
      }
    } catch {}

    let response, responseText = '', status = 0, responseHeaders = {};

    try {
      response = await originalFetch.apply(this, args);
      status = response.status;

      try {
        responseHeaders = Object.fromEntries(response.headers.entries());
      } catch {}

      // clone 以不消耗原始 body
      const clone = response.clone();
      try {
        responseText = await clone.text();
      } catch {}

      postRequest({
        id: `fetch_${startTime}_${Math.random().toString(36).slice(2, 7)}`,
        type: 'fetch',
        url,
        method,
        status,
        requestHeaders,
        requestBody,
        responseHeaders,
        responseText,
        responseParsed: tryParseJSON(responseText),
        startTime,
        duration: Date.now() - startTime,
        timestamp: startTime
      });

      return response;
    } catch (err) {
      postRequest({
        id: `fetch_err_${startTime}`,
        type: 'fetch',
        url, method, status: 0,
        requestHeaders, requestBody,
        responseText: '',
        responseParsed: null,
        startTime,
        duration: Date.now() - startTime,
        timestamp: startTime,
        error: err?.message || String(err)
      });
      throw err;
    }
  };

  // ─── Patch XMLHttpRequest ─────────────────────────────────────────────
  const OriginalXHR = window.XMLHttpRequest;
  window.XMLHttpRequest = function () {
    const xhr = new OriginalXHR();
    let _method = 'GET';
    let _url = '';
    let _requestBody = null;
    let _startTime = Date.now();
    const _requestHeaders = {};

    const originalOpen = xhr.open.bind(xhr);
    xhr.open = function (method, url, ...rest) {
      _method = (method || 'GET').toUpperCase();
      _url = url || '';
      _startTime = Date.now();
      return originalOpen(method, url, ...rest);
    };

    const originalSetHeader = xhr.setRequestHeader.bind(xhr);
    xhr.setRequestHeader = function (name, value) {
      _requestHeaders[name] = value;
      return originalSetHeader(name, value);
    };

    const originalSend = xhr.send.bind(xhr);
    xhr.send = function (body) {
      _requestBody = body ? safeStringify(body) : null;
      _startTime = Date.now();

      xhr.addEventListener('loadend', function () {
        let responseText = '';
        try { responseText = xhr.responseText || ''; } catch {}

        let responseHeaders = {};
        try {
          const raw = xhr.getAllResponseHeaders() || '';
          raw.trim().split('\r\n').forEach(line => {
            const idx = line.indexOf(': ');
            if (idx > 0) {
              responseHeaders[line.slice(0, idx).toLowerCase()] = line.slice(idx + 2);
            }
          });
        } catch {}

        postRequest({
          id: `xhr_${_startTime}_${Math.random().toString(36).slice(2, 7)}`,
          type: 'xhr',
          url: _url,
          method: _method,
          status: xhr.status,
          requestHeaders: _requestHeaders,
          requestBody: _requestBody,
          responseHeaders,
          responseText,
          responseParsed: tryParseJSON(responseText),
          startTime: _startTime,
          duration: Date.now() - _startTime,
          timestamp: _startTime
        });
      });

      return originalSend(body);
    };

    return xhr;
  };

  // 复制静态属性
  Object.setPrototypeOf(window.XMLHttpRequest, OriginalXHR);
  Object.assign(window.XMLHttpRequest, OriginalXHR);
})();
