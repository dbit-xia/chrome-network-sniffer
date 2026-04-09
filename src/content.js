// content.js - 注入每个页面

(function () {
  // 避免重复注入
  if (window.__netSniffInjected) return;
  window.__netSniffInjected = true;

  // ─── 1. 注入 page-world 脚本来拦截 XHR / fetch ───────────────────────
  // 必须在页面 JS 执行前注入，才能 patch 原生 fetch/XHR
  const injectScript = document.createElement('script');
  injectScript.src = chrome.runtime.getURL('injected.js');
  // async=false 确保同步加载，在页面其他脚本之前执行
  injectScript.async = false;
  injectScript.onload = () => injectScript.remove();
  injectScript.onerror = (e) => console.error('[NetSniff] injected.js 加载失败', e);
  // document_start 时 documentElement 一定存在（比 head/body 更可靠）
  document.documentElement.appendChild(injectScript);

  // 监听来自 injected.js 的 postMessage
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (event.data?.type === '__NETSNIFF_REQUEST__') {
      chrome.runtime.sendMessage({
        type: 'NETWORK_REQUEST',
        request: event.data.request
      }).catch(() => {
        // service worker 可能还没就绪，忽略错误
      });
    }
  });

  // ─── 2. 监听用户选中文本 ───────────────────────────────────────────────
  let selectionTimer = null;

  document.addEventListener('mouseup', () => {
    clearTimeout(selectionTimer);
    selectionTimer = setTimeout(() => {
      const selection = window.getSelection();
      const text = selection?.toString().trim();
      if (text && text.length > 0) {
        chrome.runtime.sendMessage({
          type: 'SELECTION_CHANGED',
          text: text,
          timestamp: Date.now()
        }).catch(() => {});
      }
    }, 200);
  });

  // 监听 panel 发来的"立即获取选中"请求
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'GET_SELECTION') {
      const text = window.getSelection()?.toString().trim() || '';
      chrome.runtime.sendMessage({
        type: 'SELECTION_CHANGED',
        text: text,
        timestamp: Date.now()
      }).catch(() => {});
    }
  });
})();
