// background.js - Service Worker

// 存储每个tab的网络请求
const tabRequests = {};

// 点击插件图标时打开侧边栏
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});

// 监听来自content script和panel的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id || message.tabId;

  // content script 上报：用户选中了文本
  if (message.type === 'SELECTION_CHANGED') {
    // 广播给panel
    chrome.runtime.sendMessage({
      type: 'SELECTION_UPDATE',
      text: message.text,
      timestamp: message.timestamp,
      tabId: tabId
    }).catch(() => {});
  }

  // content script 上报：XHR/fetch 请求（由注入脚本捕获）
  if (message.type === 'NETWORK_REQUEST') {
    if (!tabRequests[tabId]) tabRequests[tabId] = [];
    tabRequests[tabId].push(message.request);
    // 保留最近500条
    if (tabRequests[tabId].length > 500) {
      tabRequests[tabId] = tabRequests[tabId].slice(-500);
    }
    // 广播给panel
    chrome.runtime.sendMessage({
      type: 'NEW_REQUEST',
      request: message.request,
      tabId: tabId
    }).catch(() => {});
  }

  // panel 请求获取当前tab的所有请求
  if (message.type === 'GET_REQUESTS') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tid = tabs[0]?.id;
      sendResponse({ requests: tabRequests[tid] || [] });
    });
    return true; // 异步响应
  }

  // panel 请求清空记录
  if (message.type === 'CLEAR_REQUESTS') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tid = tabs[0]?.id;
      if (tid) tabRequests[tid] = [];
      sendResponse({ ok: true });
    });
    return true;
  }
});

// tab关闭时清理
chrome.tabs.onRemoved.addListener((tabId) => {
  delete tabRequests[tabId];
});
