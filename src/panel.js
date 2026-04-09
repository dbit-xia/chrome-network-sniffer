// panel.js

const state = {
  requests: [],        // 所有捕获的请求
  selectionText: '',   // 当前选中文本
  selectionTime: 0,    // 选中时间戳
  filter: 'all',       // all | matched | fetch | xhr
  urlSearch: '',       // URL过滤关键词
  selectedId: null,    // 当前查看详情的请求ID
};

// ── DOM refs ──────────────────────────────────────────────────────────────────
const listEl = document.getElementById('request-list');
const detailEl = document.getElementById('detail-panel');
const selectionDisplayEl = document.getElementById('selection-display');
const matchCountEl = document.getElementById('match-count');
const totalCountEl = document.getElementById('total-count');
const timeRangeStatEl = document.getElementById('time-range-stat');
const timeRangeTextEl = document.getElementById('time-range-text');
const urlSearchEl = document.getElementById('url-search');

// ── Matching ──────────────────────────────────────────────────────────────────

/**
 * 文本内容匹配：在请求响应体中查找选中文本
 */
function matchByContent(request, text) {
  if (!text || text.length < 2) return false;
  const lower = text.toLowerCase();
  if (request.responseText && request.responseText.toLowerCase().includes(lower)) return true;
  if (request.requestBody && request.requestBody.toLowerCase().includes(lower)) return true;
  return false;
}

/**
 * 时间轴匹配：选中发生后 3 秒内触发的请求，或选中前 500ms 内的请求
 */
function matchByTime(request, selectionTime) {
  if (!selectionTime) return false;
  const diff = request.timestamp - selectionTime;
  return diff >= -500 && diff <= 3000;
}

function getMatchType(request) {
  const byContent = matchByContent(request, state.selectionText);
  const byTime = matchByTime(request, state.selectionTime);
  if (byContent && byTime) return 'both';
  if (byContent) return 'content';
  if (byTime) return 'time';
  return null;
}

// ── Filtering ────────────────────────────────────────────────────────────────

function getFilteredRequests() {
  return state.requests.filter(req => {
    const matchType = getMatchType(req);

    // tab filter
    if (state.filter === 'matched' && !matchType) return false;
    if (state.filter === 'fetch' && req.type !== 'fetch') return false;
    if (state.filter === 'xhr' && req.type !== 'xhr') return false;

    // url search
    if (state.urlSearch && !req.url.toLowerCase().includes(state.urlSearch.toLowerCase())) return false;

    return true;
  });
}

// ── Rendering ────────────────────────────────────────────────────────────────

function formatUrl(url) {
  try {
    const u = new URL(url);
    const origin = u.origin;
    const path = u.pathname + u.search;
    return { origin, path };
  } catch {
    const idx = url.indexOf('/', 8);
    if (idx > 0) return { origin: url.slice(0, idx), path: url.slice(idx) };
    return { origin: '', path: url };
  }
}

function formatTime(ts) {
  const d = new Date(ts);
  return d.toTimeString().slice(0, 8) + '.' + String(d.getMilliseconds()).padStart(3, '0');
}

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function getMethodClass(method) {
  const m = method?.toUpperCase();
  if (['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(m)) return `method-${m}`;
  return 'method-OTHER';
}

function getStatusClass(status) {
  if (status >= 200 && status < 300) return 'status-2xx';
  if (status >= 300 && status < 400) return 'status-3xx';
  if (status >= 400 && status < 500) return 'status-4xx';
  if (status >= 500) return 'status-5xx';
  return 'status-0';
}

function getMatchBadgeHTML(matchType) {
  if (!matchType) return '';
  const map = {
    content: ['match-content', '内容匹配'],
    time:    ['match-time', '时间匹配'],
    both:    ['match-both', '双重匹配 ★'],
  };
  const [cls, label] = map[matchType];
  return `<span class="match-badge ${cls}">${label}</span>`;
}

function renderList() {
  const filtered = getFilteredRequests();
  const matchedCount = state.requests.filter(r => getMatchType(r)).length;

  matchCountEl.textContent = matchedCount;
  totalCountEl.textContent = state.requests.length;

  // time range hint
  if (state.selectionTime && state.selectionText) {
    timeRangeStatEl.style.display = 'flex';
    timeRangeTextEl.textContent = `±3s 窗口`;
  } else {
    timeRangeStatEl.style.display = 'none';
  }

  if (filtered.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📡</div>
        <div>${state.requests.length === 0 ? '等待网络请求...' : '无匹配结果'}</div>
      </div>
    `;
    return;
  }

  // 排序：匹配的在前，其次按时间倒序
  const sorted = [...filtered].sort((a, b) => {
    const ma = getMatchType(a) ? 1 : 0;
    const mb = getMatchType(b) ? 1 : 0;
    if (ma !== mb) return mb - ma;
    return b.timestamp - a.timestamp;
  });

  listEl.innerHTML = sorted.map(req => {
    const matchType = getMatchType(req);
    const { origin, path } = formatUrl(req.url);
    const isSelected = req.id === state.selectedId;

    return `
      <div class="request-item ${matchType ? 'matched' : ''} ${isSelected ? 'selected-item' : ''}"
           data-id="${req.id}">
        <div class="req-top">
          <span class="req-method ${getMethodClass(req.method)}">${req.method}</span>
          <span class="req-status ${getStatusClass(req.status)}">${req.status || '—'}</span>
          <span class="req-type">${req.type}</span>
          ${getMatchBadgeHTML(matchType)}
        </div>
        <div class="req-url">
          <span style="color:var(--text-dim)">${origin}</span><span class="url-path">${path}</span>
        </div>
        <div class="req-meta">
          <span>${formatTime(req.timestamp)}</span>
          <span>${formatDuration(req.duration)}</span>
          ${req.responseText ? `<span>${formatSize(req.responseText.length)}</span>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

// ── Detail Panel ──────────────────────────────────────────────────────────────

function highlightText(text, keyword) {
  if (!keyword || keyword.length < 2) return escapeHTML(text);
  const escaped = escapeHTML(text);
  const escapedKeyword = escapeHTML(keyword).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return escaped.replace(new RegExp(escapedKeyword, 'gi'), m => `<mark>${m}</mark>`);
}

function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatJSON(text) {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

function showDetail(req) {
  state.selectedId = req.id;
  const matchType = getMatchType(req);
  const { origin, path } = formatUrl(req.url);

  listEl.style.display = 'none';
  detailEl.classList.add('visible');

  const responseFormatted = formatJSON(req.responseText || '');
  const requestBodyFormatted = req.requestBody ? formatJSON(req.requestBody) : null;

  const highlightedResponse = state.selectionText
    ? highlightText(responseFormatted, state.selectionText)
    : escapeHTML(responseFormatted);

  const headersHTML = (headers) => {
    if (!headers || Object.keys(headers).length === 0) return '<div class="detail-row"><span class="detail-key" style="color:var(--text-dim)">（空）</span></div>';
    return Object.entries(headers).map(([k, v]) => `
      <div class="detail-row">
        <span class="detail-key">${escapeHTML(k)}</span>
        <span class="detail-val">${escapeHTML(v)}</span>
      </div>
    `).join('');
  };

  detailEl.innerHTML = `
    <div class="detail-header">
      <button class="detail-back" id="detail-back">← 返回</button>
      <div class="detail-title">${escapeHTML(origin + path)}</div>
      ${matchType ? getMatchBadgeHTML(matchType) : ''}
    </div>

    <div class="detail-section">
      <div class="detail-section-title">基本信息</div>
      <div class="detail-kv">
        <div class="detail-row">
          <span class="detail-key">URL</span>
          <span class="detail-val" style="word-break:break-all">${escapeHTML(req.url)}</span>
        </div>
        <div class="detail-row">
          <span class="detail-key">方法</span>
          <span class="detail-val"><span class="req-method ${getMethodClass(req.method)}" style="display:inline">${req.method}</span></span>
        </div>
        <div class="detail-row">
          <span class="detail-key">状态码</span>
          <span class="detail-val"><span class="req-status ${getStatusClass(req.status)}" style="display:inline">${req.status || '—'}</span></span>
        </div>
        <div class="detail-row">
          <span class="detail-key">类型</span>
          <span class="detail-val">${req.type}</span>
        </div>
        <div class="detail-row">
          <span class="detail-key">时间</span>
          <span class="detail-val">${formatTime(req.timestamp)}</span>
        </div>
        <div class="detail-row">
          <span class="detail-key">耗时</span>
          <span class="detail-val">${formatDuration(req.duration)}</span>
        </div>
        ${state.selectionTime ? `
        <div class="detail-row">
          <span class="detail-key">距选中</span>
          <span class="detail-val ${Math.abs(req.timestamp - state.selectionTime) <= 3000 ? 'highlight' : ''}">
            ${req.timestamp >= state.selectionTime ? '+' : ''}${req.timestamp - state.selectionTime}ms
          </span>
        </div>` : ''}
      </div>
    </div>

    ${requestBodyFormatted ? `
    <div class="detail-section">
      <div class="detail-section-title">
        请求体
        <button class="copy-btn" data-copy="${escapeHTML(requestBodyFormatted)}">复制</button>
      </div>
      <div class="code-block">${escapeHTML(requestBodyFormatted)}</div>
    </div>` : ''}

    <div class="detail-section">
      <div class="detail-section-title">请求头</div>
      <div class="detail-kv">${headersHTML(req.requestHeaders)}</div>
    </div>

    <div class="detail-section">
      <div class="detail-section-title">响应头</div>
      <div class="detail-kv">${headersHTML(req.responseHeaders)}</div>
    </div>

    <div class="detail-section">
      <div class="detail-section-title">
        响应体
        ${req.responseText ? `<button class="copy-btn" data-copy-response="${req.id}">复制</button>` : ''}
        ${req.responseText ? `<span style="color:var(--text-dim);font-size:9px">${formatSize(req.responseText.length)}</span>` : ''}
      </div>
      ${req.responseText
        ? `<div class="code-block">${highlightedResponse}</div>`
        : `<div style="color:var(--text-dim);font-size:10px;padding:4px 0">（无响应体）</div>`
      }
    </div>
  `;

  // Events
  document.getElementById('detail-back').addEventListener('click', hideDetail);

  detailEl.querySelectorAll('.copy-btn[data-copy]').forEach(btn => {
    btn.addEventListener('click', () => {
      navigator.clipboard.writeText(btn.dataset.copy).then(() => {
        btn.textContent = '已复制!';
        setTimeout(() => btn.textContent = '复制', 1500);
      });
    });
  });

  detailEl.querySelectorAll('.copy-btn[data-copy-response]').forEach(btn => {
    btn.addEventListener('click', () => {
      const r = state.requests.find(x => x.id === btn.dataset.copyResponse);
      if (r) {
        navigator.clipboard.writeText(r.responseText).then(() => {
          btn.textContent = '已复制!';
          setTimeout(() => btn.textContent = '复制', 1500);
        });
      }
    });
  });

  renderList(); // re-render to show selected state
}

function hideDetail() {
  state.selectedId = null;
  listEl.style.display = '';
  detailEl.classList.remove('visible');
  renderList();
}

// ── Event Listeners ───────────────────────────────────────────────────────────

listEl.addEventListener('click', (e) => {
  const item = e.target.closest('.request-item');
  if (!item) return;
  const req = state.requests.find(r => r.id === item.dataset.id);
  if (req) showDetail(req);
});

document.getElementById('btn-clear').addEventListener('click', () => {
  state.requests = [];
  state.selectedId = null;
  hideDetail();
  renderList();
  chrome.runtime.sendMessage({ type: 'CLEAR_REQUESTS' });
});

document.getElementById('btn-refresh').addEventListener('click', () => {
  // 触发重新获取选中文本
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_SELECTION' });
    }
  });
  renderList();
});

document.querySelectorAll('.filter-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    state.filter = tab.dataset.filter;
    if (state.selectedId) hideDetail();
    else renderList();
  });
});

urlSearchEl.addEventListener('input', () => {
  state.urlSearch = urlSearchEl.value.trim();
  renderList();
});

// ── Chrome Message Listeners ──────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'NEW_REQUEST') {
    state.requests.push(message.request);
    if (!state.selectedId) renderList();
  }

  if (message.type === 'SELECTION_UPDATE') {
    const text = message.text || '';
    const timestamp = message.timestamp || Date.now();
    state.selectionText = text;
    state.selectionTime = timestamp;

    if (text) {
      selectionDisplayEl.classList.remove('selection-empty');
      selectionDisplayEl.textContent = text.length > 80 ? text.slice(0, 80) + '…' : text;
    } else {
      selectionDisplayEl.classList.add('selection-empty');
      selectionDisplayEl.textContent = '在页面上选中文本...';
    }

    if (!state.selectedId) renderList();
  }
});

// ── Init: load existing requests ──────────────────────────────────────────────

chrome.runtime.sendMessage({ type: 'GET_REQUESTS' }, (res) => {
  if (res?.requests) {
    state.requests = res.requests;
    renderList();
  }
});
