// ========== Nocturne 1.0 ==========

// ---------- 页面切换 ----------
const pages = {
  home: document.getElementById('page-home'),
  chatList: document.getElementById('page-chat-list'),
  chat: document.getElementById('page-chat'),
  charSettings: document.getElementById('page-char-settings'),
  settings: document.getElementById('page-settings'),
};
let pageHistory = ['home'];
function navigateTo(id) {
  Object.values(pages).forEach(p => p.classList.remove('active'));
  pages[id].classList.add('active');
  pageHistory.push(id);
}
function goBack() {
  if (pageHistory.length <= 1) return;
  pageHistory.pop();
  Object.values(pages).forEach(p => p.classList.remove('active'));
  pages[pageHistory[pageHistory.length - 1]].classList.add('active');
}

// ---------- 数据 ----------
let characters = [];
let currentCharId = null;
let config = {
  apiUrl: '',
  apiKey: '',
  model: 'gpt-4o',
  temperature: 0.8,
  topP: 1.0,
  maxTokens: 2048,
  freqPenalty: 0,
  presPenalty: 0,
  contextCount: 20,
  theme: 'dark',
  // 记忆总结 API（空 = 用主 API）
  memApiUrl: '',
  memApiKey: '',
  memModel: '',
};

function saveChars() { localStorage.setItem('nocturne_chars', JSON.stringify(characters)); }
function loadChars() { try { const d = localStorage.getItem('nocturne_chars'); if (d) characters = JSON.parse(d); } catch(e) { characters = []; } }
function saveConfig() { localStorage.setItem('nocturne_config', JSON.stringify(config)); }
function loadConfig() { try { const d = localStorage.getItem('nocturne_config'); if (d) Object.assign(config, JSON.parse(d)); } catch(e) {} }
function getChar(id) { return characters.find(c => c.id === id); }

// ---------- 聊天列表 ----------
const chatListEl = document.getElementById('chat-list');
const emptyState = document.getElementById('empty-state');
function renderChatList() {
  chatListEl.querySelectorAll('.chat-item').forEach(el => el.remove());
  if (!characters.length) { emptyState.style.display = 'flex'; return; }
  emptyState.style.display = 'none';
  characters.forEach(char => {
    const last = char.messages[char.messages.length - 1];
    const el = document.createElement('div');
    el.className = 'chat-item';
    el.innerHTML = `<div class="chat-avatar">${char.avatar||'😀'}</div><div class="chat-info"><div class="chat-info-top"><span class="chat-name">${esc(char.nickname||char.name)}</span><span class="chat-time">${last?fmtTime(last.time):''}</span></div><div class="chat-preview">${esc(last?trunc(last.text,30):'[在线]')}</div></div>`;
    el.addEventListener('click', () => openChat(char.id));
    chatListEl.appendChild(el);
  });
}

// ---------- 对话页 ----------
const chatTitle = document.getElementById('chat-title');
const messagesEl = document.getElementById('messages');
const msgInput = document.getElementById('msg-input');

function openChat(id) {
  currentCharId = id;
  const c = getChar(id);
  if (!c) return;
  chatTitle.textContent = c.nickname || c.name;
  renderMessages(c);
  navigateTo('chat');
  setTimeout(() => messagesEl.scrollTop = messagesEl.scrollHeight, 50);
}

function renderMessages(c) {
  messagesEl.innerHTML = '';
  if (!c.messages.length) { messagesEl.innerHTML = '<div class="msg-time-divider"><span>开始聊天吧</span></div>'; return; }

  // 找最后一条 assistant 消息的索引
  let lastAssistantIdx = -1;
  for (let i = c.messages.length - 1; i >= 0; i--) {
    if (c.messages[i].role === 'assistant') { lastAssistantIdx = i; break; }
  }

  let lastDate = '';
  c.messages.forEach((msg, idx) => {
    const d = new Date(msg.time).toLocaleDateString();
    if (d !== lastDate) { lastDate = d; const div = document.createElement('div'); div.className = 'msg-time-divider'; div.innerHTML = `<span>${fmtDateLabel(msg.time)}</span>`; messagesEl.appendChild(div); }

    const isLast = idx === lastAssistantIdx;

    if (msg.role === 'user') {
      appendBubble(c, msg, msg.text, false, false, idx, false);
    } else {
      const mode = c.replyMode || 'chat';
      if (mode === 'novel') {
        appendBubble(c, msg, msg.text, true, false, idx, isLast);
      } else {
        const parts = msg.text.split('|||').map(s => s.trim()).filter(Boolean);
        if (parts.length <= 1) {
          appendBubble(c, msg, msg.text, false, false, idx, isLast);
        } else {
          parts.forEach((part, i) => appendBubble(c, msg, part, false, i > 0, idx, isLast && i === parts.length - 1));
        }
      }
    }
  });
}

function appendBubble(c, msg, text, isNovel, hideAvatar, msgIndex, isLastAssistant) {
  const row = document.createElement('div');
  row.className = `msg-row ${msg.role === 'user' ? 'me' : ''}`;
  const av = msg.role === 'user' ? getAvatarHtml(c.myAvatarImg, c.myAvatar || '🧑') : getAvatarHtml(c.avatarImg, c.avatar || '😀');
  const bubbleClass = isNovel ? 'msg-bubble novel-bubble' : 'msg-bubble';
  const content = isNovel ? formatNovelText(text) : formatChatText(text);
  const avatarStyle = hideAvatar ? ' style="visibility:hidden"' : '';
  const stamp = hideAvatar ? '' : `<div class="msg-stamp">${fmtShort(msg.time)}</div>`;
  const rerollHtml = isLastAssistant && !hideAvatar ? `<button class="msg-reroll" onclick="rerollLastReply()">↻ 重新生成</button>` : '';
  row.innerHTML = `<div class="msg-avatar"${avatarStyle}>${av}</div><div class="msg-body"><div class="${bubbleClass}">${content}</div>${stamp}${rerollHtml}</div>`;

  // 长按事件
  if (msgIndex !== undefined) {
    let timer;
    const bubble = row;
    bubble.addEventListener('touchstart', () => { timer = setTimeout(() => openMsgMenu(msgIndex), 500); });
    bubble.addEventListener('touchend', () => clearTimeout(timer));
    bubble.addEventListener('touchmove', () => clearTimeout(timer));
    // 桌面端右键
    bubble.addEventListener('contextmenu', (e) => { e.preventDefault(); openMsgMenu(msgIndex); });
  }

  messagesEl.appendChild(row);
}

function getAvatarHtml(imgData, fallback) {
  if (imgData) return `<img src="${imgData}">`;
  return fallback;
}

function formatChatText(text) {
  return esc(text).replace(/\*([^*]+)\*/g, '<span class="narration">$1</span>');
}

function formatNovelText(text) {
  let html = esc(text);
  html = html.replace(/\*([^*]+)\*/g, '<span class="narration">$1</span>');
  html = html.replace(/「([^」]+)」/g, '<b>「$1」</b>');
  return html;
}

// ---------- 发消息（不自动触发 AI） ----------
let isGenerating = false;

function sendMessage() {
  const text = msgInput.value.trim();
  if (!text || !currentCharId) return;
  const char = getChar(currentCharId);
  if (!char) return;
  char.messages.push({ role: 'user', text, time: Date.now() });
  msgInput.value = '';
  renderMessages(char);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  saveChars();
}

// 触发 AI 回复
async function triggerAIReply() {
  if (isGenerating || !currentCharId) return;
  const char = getChar(currentCharId);
  if (!char || !char.messages.length) return;

  if (!config.apiKey || !config.apiUrl) {
    // 没配 API 用假回复
    const r = ['嗯嗯，我知道了~','然后呢？','真的吗？好厉害','哈哈哈哈','你在干嘛呀','我也是这么想的','等一下，让我想想...','好的好的'];
    char.messages.push({ role: 'assistant', text: r[Math.floor(Math.random()*r.length)], time: Date.now() });
    renderMessages(char); messagesEl.scrollTop = messagesEl.scrollHeight; saveChars();
    return;
  }

  isGenerating = true;
  // 显示正在输入
  const typing = document.createElement('div');
  typing.className = 'msg-row';
  typing.innerHTML = `<div class="msg-avatar">${char.avatar||'😀'}</div><div class="msg-body"><div class="msg-bubble" style="opacity:0.5">正在输入...</div></div>`;
  messagesEl.appendChild(typing);
  messagesEl.scrollTop = messagesEl.scrollHeight;

  try {
    const reply = await callAPI(char);
    char.messages.push({ role: 'assistant', text: reply, time: Date.now() });
    saveChars();
  } catch (e) {
    char.messages.push({ role: 'assistant', text: `[错误] ${e.message}`, time: Date.now() });
    saveChars();
  }
  isGenerating = false;
  renderMessages(char);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// 重 roll（删除最后一条 AI 回复，重新生成）
async function rerollLastReply() {
  if (isGenerating || !currentCharId) return;
  const char = getChar(currentCharId);
  if (!char) return;
  // 删最后一条 assistant 消息
  for (let i = char.messages.length - 1; i >= 0; i--) {
    if (char.messages[i].role === 'assistant') {
      char.messages.splice(i, 1);
      break;
    }
  }
  saveChars();
  renderMessages(char);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  await triggerAIReply();
}

async function callAPI(char, overrideCfg) {
  const cfg = overrideCfg || config;
  const sysPrompt = buildSystemPrompt(char);
  const recentMsgs = char.messages.slice(-config.contextCount);

  const msgs = [{ role: 'system', content: sysPrompt }];
  recentMsgs.forEach(m => msgs.push({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text }));

  const body = {
    model: cfg.model || config.model || 'gpt-4o',
    messages: msgs,
    temperature: config.temperature,
    top_p: config.topP,
    max_tokens: config.maxTokens,
    frequency_penalty: config.freqPenalty,
    presence_penalty: config.presPenalty,
  };

  let url = (cfg.apiUrl || config.apiUrl).replace(/\/+$/, '');
  if (!url.includes('/chat/completions')) url += '/v1/chat/completions';

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${cfg.apiKey || config.apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) { const e = await res.text(); throw new Error(`${res.status}: ${e.slice(0, 200)}`); }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '[空回复]';
}

function buildSystemPrompt(char) {
  let prompt = '';
  if (char.persona) prompt += char.persona + '\n\n';
  if (char.name) prompt += `你的名字是${char.name}。\n`;
  if (char.myName) prompt += `用户的名字是${char.myName}。\n`;
  if (char.myPersona) prompt += `关于用户: ${char.myPersona}\n`;
  if (!prompt) prompt = `你是一个名叫${char.nickname || char.name}的角色，请以这个角色的身份和用户聊天。\n`;

  const mode = char.replyMode || 'chat';

  if (mode === 'chat') {
    prompt += `\n【回复格式要求】
你正在用手机聊天。像朋友一样自然地回复，不要长篇大论。
你可以回复一句，也可以回复好几句。如果要回复多句，每句之间用 ||| 分隔。
例如: "哈哈哈哈|||你怎么这么搞笑|||笑死我了"
注意：
- 不要使用引号包裹整段回复
- 每句保持简短自然，像发微信一样
- ||| 是分隔符，不要让用户看到`;
  } else if (mode === 'narrate') {
    prompt += `\n【回复格式要求】
你正在用手机聊天，但你的回复需要包含心理活动和环境描写。
对话内容正常输出，心理活动/内心独白/环境描写用 *星号* 包裹。
多句对话之间用 ||| 分隔。
例如: "*看到消息后嘴角微微上扬*|||嗯，我知道了|||*心想今天心情真好*"
注意：
- 对话部分像正常聊天，简短自然
- *旁白* 部分可以描写心理、表情、动作、环境
- ||| 是分隔符`;
  } else if (mode === 'novel') {
    const min = char.novelMin || 100;
    const max = char.novelMax || 500;
    prompt += `\n【回复格式要求】
请用小说/描写模式回复，包含角色的动作、心理、对话、环境描写。
用第三人称或角色视角书写。对话部分用「」包裹。
字数要求: ${min}~${max}字。
不要使用 ||| 分隔符，整段输出即可。
输出风格类似轻小说或网文的场景描写。`;
  }

  return prompt.trim();
}

// 模式切换 UI
function updateModeUI(mode) {
  ['chat', 'narrate', 'novel'].forEach(m => {
    const desc = document.getElementById('mode-desc-' + m);
    if (desc) desc.classList.toggle('hidden', m !== mode);
  });
  const novelRange = document.getElementById('novel-word-range');
  if (novelRange) novelRange.classList.toggle('hidden', mode !== 'novel');
}

// 获取记忆总结用的 API 配置（没填就 fallback 到主 API）
function getMemConfig() {
  return {
    apiUrl: config.memApiUrl || config.apiUrl,
    apiKey: config.memApiKey || config.apiKey,
    model: config.memModel || config.model,
  };
}

// 拉取模型列表
let modelPickerTarget = ''; // 选完后填入哪个 input 的 id

async function fetchModels(apiUrl, apiKey, targetInputId) {
  if (!apiUrl || !apiKey) { toast('请先填写反代地址和 API Key', 'error'); return; }
  let url = apiUrl.replace(/\/+$/, '') + '/v1/models';
  try {
    const btn = event.target;
    btn.textContent = '拉取中...';
    btn.disabled = true;

    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${apiKey}` } });
    if (!res.ok) throw new Error(`${res.status}`);
    const data = await res.json();
    const models = (data.data || []).map(m => m.id).sort();

    btn.textContent = '拉取';
    btn.disabled = false;

    if (!models.length) { toast('没有找到可用模型', 'error'); return; }

    // 打开自定义模型选择弹窗
    modelPickerTarget = targetInputId;
    const listEl = document.getElementById('model-list');
    const searchEl = document.getElementById('model-search');
    searchEl.value = '';
    listEl.innerHTML = '';

    models.forEach(m => {
      const item = document.createElement('div');
      item.className = 'model-item';
      item.textContent = m;
      item.addEventListener('click', () => {
        document.getElementById(modelPickerTarget).value = m;
        hideModal('modal-model-picker');
      });
      listEl.appendChild(item);
    });

    // 搜索过滤
    searchEl.oninput = () => {
      const q = searchEl.value.toLowerCase();
      listEl.querySelectorAll('.model-item').forEach(el => {
        el.classList.toggle('hidden', !el.textContent.toLowerCase().includes(q));
      });
    };

    showModal('modal-model-picker');
    setTimeout(() => searchEl.focus(), 200);

  } catch (e) {
    const btn = event.target;
    btn.textContent = '拉取';
    btn.disabled = false;
    toast('拉取失败: ' + e.message, 'error');
  }
}

// ---------- 角色设置页 ----------
function openCharSettings() {
  const c = getChar(currentCharId); if (!c) return;
  document.getElementById('set-nickname').value = c.nickname || '';
  document.getElementById('set-realname').value = c.name || '';
  document.getElementById('set-myname').value = c.myName || '';
  document.getElementById('set-persona').value = c.persona || '';
  document.getElementById('set-mypersona').value = c.myPersona || '';
  document.getElementById('avatar-char').innerHTML = c.avatarImg ? `<img src="${c.avatarImg}">` : (c.avatar || '😀');
  document.getElementById('avatar-me').innerHTML = c.myAvatarImg ? `<img src="${c.myAvatarImg}">` : (c.myAvatar || '🧑');
  // 回复模式
  const mode = c.replyMode || 'chat';
  document.getElementById('set-reply-mode').value = mode;
  document.getElementById('set-novel-min').value = c.novelMin || 100;
  document.getElementById('set-novel-max').value = c.novelMax || 500;
  updateModeUI(mode);
  navigateTo('charSettings');
}
function saveCharSettings() {
  const c = getChar(currentCharId); if (!c) return;
  c.nickname = document.getElementById('set-nickname').value.trim();
  c.name = document.getElementById('set-realname').value.trim() || c.name;
  c.myName = document.getElementById('set-myname').value.trim();
  c.persona = document.getElementById('set-persona').value.trim();
  c.myPersona = document.getElementById('set-mypersona').value.trim();
  c.replyMode = document.getElementById('set-reply-mode').value;
  c.novelMin = parseInt(document.getElementById('set-novel-min').value) || 100;
  c.novelMax = parseInt(document.getElementById('set-novel-max').value) || 500;
  saveChars();
  chatTitle.textContent = c.nickname || c.name;
  goBack();
  toast('已保存', 'success');
}

// ---------- 全局设置页 ----------
function openSettings() {
  document.getElementById('cfg-api-url').value = config.apiUrl;
  document.getElementById('cfg-api-key').value = config.apiKey;
  document.getElementById('cfg-model').value = config.model;
  document.getElementById('cfg-mem-api-url').value = config.memApiUrl || '';
  document.getElementById('cfg-mem-api-key').value = config.memApiKey || '';
  document.getElementById('cfg-mem-model').value = config.memModel || '';
  document.getElementById('cfg-temperature').value = Math.round(config.temperature * 100);
  document.getElementById('cfg-temperature-val').textContent = config.temperature.toFixed(1);
  document.getElementById('cfg-top-p').value = Math.round(config.topP * 100);
  document.getElementById('cfg-top-p-val').textContent = config.topP.toFixed(1);
  document.getElementById('cfg-max-tokens').value = config.maxTokens;
  document.getElementById('cfg-freq-pen').value = Math.round(config.freqPenalty * 100);
  document.getElementById('cfg-freq-pen-val').textContent = config.freqPenalty.toFixed(1);
  document.getElementById('cfg-pres-pen').value = Math.round(config.presPenalty * 100);
  document.getElementById('cfg-pres-pen-val').textContent = config.presPenalty.toFixed(1);
  document.getElementById('cfg-context-count').value = config.contextCount;
  document.getElementById('cfg-theme').value = config.theme;
  navigateTo('settings');
}

function saveSettings(silent) {
  config.apiUrl = document.getElementById('cfg-api-url').value.trim();
  config.apiKey = document.getElementById('cfg-api-key').value.trim();
  config.model = document.getElementById('cfg-model').value.trim();
  config.memApiUrl = document.getElementById('cfg-mem-api-url').value.trim();
  config.memApiKey = document.getElementById('cfg-mem-api-key').value.trim();
  config.memModel = document.getElementById('cfg-mem-model').value.trim();
  config.temperature = parseInt(document.getElementById('cfg-temperature').value) / 100;
  config.topP = parseInt(document.getElementById('cfg-top-p').value) / 100;
  config.maxTokens = parseInt(document.getElementById('cfg-max-tokens').value) || 2048;
  config.freqPenalty = parseInt(document.getElementById('cfg-freq-pen').value) / 100;
  config.presPenalty = parseInt(document.getElementById('cfg-pres-pen').value) / 100;
  config.contextCount = parseInt(document.getElementById('cfg-context-count').value) || 20;
  config.theme = document.getElementById('cfg-theme').value;
  document.documentElement.dataset.theme = config.theme;
  saveConfig();
  if (!silent) toast('设置已保存', 'success');
}

async function testAPI() {
  // 先临时保存
  saveSettings();
  if (!config.apiUrl || !config.apiKey) { toast('请先填写 API 地址和 Key', 'error'); return; }
  try {
    const testChar = { name: 'test', nickname: 'test', persona: '', myName: '', myPersona: '', avatar: '', messages: [{ role: 'user', text: 'Hi, reply with "OK" only.', time: Date.now() }] };
    const reply = await callAPI(testChar);
    toast('连接成功！', 'success');
  } catch (e) {
    toast('连接失败: ' + e.message, 'error');
  }
}

// Slider 联动
function bindSlider(sliderId, valId, divisor) {
  const slider = document.getElementById(sliderId);
  const val = document.getElementById(valId);
  slider.addEventListener('input', () => { val.textContent = (parseInt(slider.value) / divisor).toFixed(1); });
}
bindSlider('cfg-temperature', 'cfg-temperature-val', 100);
bindSlider('cfg-top-p', 'cfg-top-p-val', 100);
bindSlider('cfg-freq-pen', 'cfg-freq-pen-val', 100);
bindSlider('cfg-pres-pen', 'cfg-pres-pen-val', 100);

// ---------- 弹窗 ----------
function showModal(id) { document.getElementById(id).classList.add('show'); }
function hideModal(id) { document.getElementById(id).classList.remove('show'); }
let createNickname = '';
function createCharacter(nickname, realname) {
  const emojis = ['😀','🐱','🎵','✨','🌸','🔥','💜','🦊','🐻','🌙','⭐','🎭'];
  characters.unshift({ id:'c_'+Date.now(), name:realname, nickname, avatar:emojis[Math.floor(Math.random()*emojis.length)], myAvatar:'🧑', myName:'', persona:'', myPersona:'', messages:[], createdAt:Date.now() });
  saveChars(); renderChatList();
}

// ---------- Toast 提示 ----------
function toast(msg, type) {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = 'toast' + (type ? ' ' + type : '');
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => el.remove(), 2500);
}

// ---------- 工具函数 ----------
function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function trunc(s, n) { return s.length > n ? s.slice(0, n) + '...' : s; }
function fmtTime(ts) { const d=new Date(ts),now=new Date(),diff=now-d; if(diff<86400000&&d.getDate()===now.getDate()) return pad(d.getHours())+':'+pad(d.getMinutes()); if(diff<172800000) return '昨天'; if(diff<604800000) return ['周日','周一','周二','周三','周四','周五','周六'][d.getDay()]; return (d.getMonth()+1)+'/'+d.getDate(); }
function fmtShort(ts) { const d=new Date(ts); return pad(d.getHours())+':'+pad(d.getMinutes()); }
function fmtDateLabel(ts) { const d=new Date(ts),now=new Date(); if(d.toDateString()===now.toDateString()) return '今天'; if(d.toDateString()===new Date(now-86400000).toDateString()) return '昨天'; return (d.getMonth()+1)+'月'+d.getDate()+'日'; }
function pad(n) { return n.toString().padStart(2,'0'); }
function updateClock() { const n=new Date(); document.getElementById('status-time').textContent=pad(n.getHours())+':'+pad(n.getMinutes()); }

// Toast 提示
let toastTimer = null;
function toast(msg, type) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show' + (type ? ' ' + type : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, 2500);
}

// ---------- 事件绑定 ----------
document.getElementById('btn-open-chat').addEventListener('click', () => { renderChatList(); navigateTo('chatList'); });
document.getElementById('btn-open-settings').addEventListener('click', openSettings);
document.getElementById('chat-list-back').addEventListener('click', goBack);
document.getElementById('btn-new-chat').addEventListener('click', () => showModal('modal-new-chat'));
document.getElementById('chat-back').addEventListener('click', () => { renderChatList(); goBack(); });
document.getElementById('btn-chat-settings').addEventListener('click', openCharSettings);
document.getElementById('btn-send').addEventListener('click', sendMessage);
msgInput.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } });
document.getElementById('btn-ai-reply').addEventListener('click', triggerAIReply);

// 模式切换联动
document.getElementById('set-reply-mode').addEventListener('change', (e) => updateModeUI(e.target.value));

// 头像上传
document.getElementById('file-avatar-char').addEventListener('change', (e) => handleAvatarUpload(e, 'avatarImg', 'avatar-char'));
document.getElementById('file-avatar-me').addEventListener('change', (e) => handleAvatarUpload(e, 'myAvatarImg', 'avatar-me'));

function handleAvatarUpload(e, field, previewId) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const dataUrl = ev.target.result;
    // 更新预览
    document.getElementById(previewId).innerHTML = `<img src="${dataUrl}">`;
    // 临时存到当前角色
    const c = getChar(currentCharId);
    if (c) { c[field] = dataUrl; saveChars(); }
  };
  reader.readAsDataURL(file);
}

// 长按消息菜单
let selectedMsgIndex = null;

function openMsgMenu(idx) {
  selectedMsgIndex = idx;
  showModal('modal-msg-menu');
}

document.getElementById('msg-menu-edit').addEventListener('click', () => {
  hideModal('modal-msg-menu');
  const c = getChar(currentCharId);
  if (!c || selectedMsgIndex === null) return;
  const msg = c.messages[selectedMsgIndex];
  document.getElementById('edit-msg-text').value = msg.text;
  showModal('modal-edit-msg');
});

document.getElementById('msg-menu-delete').addEventListener('click', () => {
  hideModal('modal-msg-menu');
  const c = getChar(currentCharId);
  if (!c || selectedMsgIndex === null) return;
  c.messages.splice(selectedMsgIndex, 1);
  saveChars();
  renderMessages(c);
  toast('消息已删除', 'success');
});

document.getElementById('msg-menu-copy').addEventListener('click', () => {
  hideModal('modal-msg-menu');
  const c = getChar(currentCharId);
  if (!c || selectedMsgIndex === null) return;
  navigator.clipboard.writeText(c.messages[selectedMsgIndex].text).then(() => toast('已复制', 'success')).catch(() => toast('复制失败', 'error'));
});

document.getElementById('msg-menu-cancel').addEventListener('click', () => hideModal('modal-msg-menu'));

document.getElementById('edit-msg-cancel').addEventListener('click', () => hideModal('modal-edit-msg'));
document.getElementById('edit-msg-confirm').addEventListener('click', () => {
  const c = getChar(currentCharId);
  if (!c || selectedMsgIndex === null) return;
  c.messages[selectedMsgIndex].text = document.getElementById('edit-msg-text').value;
  saveChars();
  hideModal('modal-edit-msg');
  renderMessages(c);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  toast('消息已修改', 'success');
});
document.getElementById('char-settings-back').addEventListener('click', goBack);
document.getElementById('btn-save-char').addEventListener('click', saveCharSettings);
document.getElementById('settings-back').addEventListener('click', () => { saveSettings(true); goBack(); });
document.getElementById('btn-save-settings').addEventListener('click', () => saveSettings(false));
document.getElementById('btn-save-settings-top').addEventListener('click', () => saveSettings(false));
document.getElementById('btn-test-api').addEventListener('click', testAPI);
document.getElementById('btn-fetch-models').addEventListener('click', () => {
  fetchModels(
    document.getElementById('cfg-api-url').value.trim(),
    document.getElementById('cfg-api-key').value.trim(),
    'cfg-model'
  );
});
document.getElementById('btn-fetch-mem-models').addEventListener('click', () => {
  const url = document.getElementById('cfg-mem-api-url').value.trim() || document.getElementById('cfg-api-url').value.trim();
  const key = document.getElementById('cfg-mem-api-key').value.trim() || document.getElementById('cfg-api-key').value.trim();
  fetchModels(url, key, 'cfg-mem-model');
});

document.getElementById('btn-clear-history').addEventListener('click', () => { const c=getChar(currentCharId); if(c&&confirm('确认清空聊天记录？')){ c.messages=[]; saveChars(); toast('已清空', 'success'); } });
document.getElementById('btn-delete-char').addEventListener('click', () => showModal('modal-confirm-delete'));
document.getElementById('delete-cancel').addEventListener('click', () => hideModal('modal-confirm-delete'));
document.getElementById('delete-confirm').addEventListener('click', () => { characters=characters.filter(c=>c.id!==currentCharId); saveChars(); hideModal('modal-confirm-delete'); currentCharId=null; pageHistory=['home','chatList']; Object.values(pages).forEach(p=>p.classList.remove('active')); pages.chatList.classList.add('active'); renderChatList(); });

document.getElementById('opt-create-char').addEventListener('click', () => { hideModal('modal-new-chat'); document.getElementById('input-step1').value=''; showModal('modal-step1'); setTimeout(()=>document.getElementById('input-step1').focus(),200); });
document.getElementById('opt-create-group').addEventListener('click', () => { hideModal('modal-new-chat'); toast('群聊功能开发中...');  });
document.getElementById('modal-cancel').addEventListener('click', () => hideModal('modal-new-chat'));
document.getElementById('step1-cancel').addEventListener('click', () => hideModal('modal-step1'));
document.getElementById('step1-next').addEventListener('click', () => { const v=document.getElementById('input-step1').value.trim(); if(!v) return; createNickname=v; hideModal('modal-step1'); document.getElementById('input-step2').value=''; showModal('modal-step2'); setTimeout(()=>document.getElementById('input-step2').focus(),200); });
document.getElementById('input-step1').addEventListener('keydown', e => { if(e.key==='Enter') document.getElementById('step1-next').click(); });
document.getElementById('step2-cancel').addEventListener('click', () => hideModal('modal-step2'));
document.getElementById('step2-confirm').addEventListener('click', () => { const v=document.getElementById('input-step2').value.trim(); if(!v) return; hideModal('modal-step2'); createCharacter(createNickname, v); });
document.getElementById('input-step2').addEventListener('keydown', e => { if(e.key==='Enter') document.getElementById('step2-confirm').click(); });

['modal-new-chat','modal-step1','modal-step2','modal-confirm-delete','modal-model-picker','modal-msg-menu','modal-edit-msg'].forEach(id => { document.getElementById(id).addEventListener('click', e => { if(e.target.id===id) hideModal(id); }); });
document.getElementById('model-picker-cancel').addEventListener('click', () => hideModal('modal-model-picker'));

// ---------- 初始化 ----------
loadChars();
loadConfig();
document.documentElement.dataset.theme = config.theme;
updateClock();
setInterval(updateClock, 10000);
console.log('Nocturne 1.0 loaded');
