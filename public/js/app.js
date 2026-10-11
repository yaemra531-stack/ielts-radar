/**
 * IELTS Radar - 前端核心应用逻辑 (app.js) V3.0
 * 遵循 Apple × Notion × Linear 风格个人研究工作台设计
 * 单列纵向阅读流、阅读优先、轻量版本管理器、文档化目标阅读
 */
import { Parser } from './parser.js';
import { DiffViewer } from './diff.js';

// 全局应用状态
const state = {
  currentTab: 'timeline', // 'timeline' | 'prompts' | 'goals'
  activePromptAgent: 'workbuddy', // 'workbuddy' | 'muse'
  selectedPromptVersion: null, // 当前选中的提示词版本
  data: {
    systemInfo: {},
    goalsAndThoughts: {},
    promptRegistry: { workbuddy: [], muse: [] },
    dailyRecords: [],
    rawReports: []
  },
  filters: {
    agent: 'all', // 'all' | 'WorkBuddy' | 'Muse'
    keyword: '',
    platform: 'all',
    readStatus: 'all' // 'all' | 'unread' | 'read'
  },
  expandedDates: new Set(),
  importPreview: null
};

// --- 暗黑/亮色主题控制 ---
function initTheme() {
  const savedTheme = localStorage.getItem('ielts_radar_theme');
  const currentTheme = savedTheme || 'light';
  setTheme(currentTheme);
}

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('ielts_radar_theme', theme);
  const icon = document.getElementById('theme-icon');
  if (icon) {
    icon.textContent = theme === 'dark' ? '☀️' : '🌙';
  }
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  setTheme(next);
  showToast(next === 'dark' ? '已切换至暗黑模式 🌙' : '已切换至浅色模式 ☀️', 'info');
}

// 工具函数：Toast 提示 (克制轻盈)
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${type === 'success' ? '✓' : (type === 'error' ? '✕' : 'ℹ')}</span>
    <span class="toast-text">${message}</span>
  `;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('toast-fade-out');
    setTimeout(() => toast.remove(), 250);
  }, 2400);
}

// 格式化顶部大写日期 (如 SATURDAY, OCT 10)
function formatTodayUppercase(dateStr) {
  if (!dateStr) return 'TODAY';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr.toUpperCase();
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  const weekdays = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  return `${weekdays[d.getDay()]}, ${months[d.getMonth()]} ${parseInt(parts[2], 10)}`;
}

// 格式化文章简明日期 (如 10月6日)
function formatMetaDate(dateStr) {
  if (!dateStr) return '近期';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parseInt(parts[1], 10)}月${parseInt(parts[2], 10)}日`;
  }
  return dateStr;
}

// --- 数据同步与加载 (支持 Node 原生后端与 GitHub Pages 静态环境无缝双模) ---
async function loadData() {
  let remoteData = null;

  // 1. 优先尝试从本地 Node.js 后端服务读取
  try {
    const res = await fetch('/api/data');
    if (res.ok) {
      remoteData = await res.json();
    }
  } catch (_) {}

  // 2. 若无后端（如 GitHub Pages 静态托管），尝试读取同源静态初始数据文件
  if (!remoteData) {
    try {
      const res = await fetch('./data/radar-store.json');
      if (res.ok) {
        remoteData = await res.json();
      }
    } catch (_) {}
  }

  const cachedRaw = localStorage.getItem('ielts_radar_cache');

  if (remoteData) {
    if (!cachedRaw) {
      state.data = remoteData;
      localStorage.setItem('ielts_radar_cache', JSON.stringify(remoteData));
    } else {
      try {
        const cached = JSON.parse(cachedRaw);
        const remoteTime = new Date(remoteData.systemInfo?.updatedAt || 0).getTime();
        const localTime = new Date(cached.systemInfo?.updatedAt || 0).getTime();
        // 若远程数据较新则采用远程，否则保留本地最新编辑
        if (remoteTime > localTime) {
          state.data = remoteData;
          localStorage.setItem('ielts_radar_cache', JSON.stringify(remoteData));
        } else {
          state.data = cached;
        }
      } catch (_) {
        state.data = remoteData;
      }
    }
    updateSyncStatus(true);
  } else if (cachedRaw) {
    // 3. 兜底纯离线本地缓存
    try {
      state.data = JSON.parse(cachedRaw);
      showToast('已从本地缓存恢复数据', 'info');
      updateSyncStatus(true);
    } catch (_) {}
  }

  // 默认展开所有日期
  if (state.data.dailyRecords && state.data.dailyRecords.length > 0) {
    state.data.dailyRecords.forEach(d => state.expandedDates.add(d.date));
  }

  renderApp();
}

async function persistData(successMessage = '数据已保存') {
  // 先将状态写入本地 Storage 保障数据不丢失
  localStorage.setItem('ielts_radar_cache', JSON.stringify(state.data));

  let backendSaved = false;
  try {
    const res = await fetch('/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state.data)
    });
    if (res.ok) {
      backendSaved = true;
    }
  } catch (_) {}

  if (successMessage) {
    showToast(backendSaved ? successMessage : `${successMessage}（已写入本地存储）`, 'success');
  }
  updateSyncStatus(true);
  return true;
}

function updateSyncStatus(isOnline) {
  const badge = document.getElementById('sync-indicator');
  if (badge) {
    if (isOnline) {
      badge.innerHTML = `<span class="dot-live"></span> 已持久化`;
      badge.className = 'status-badge online';
    } else {
      badge.innerHTML = `<span class="dot-warn"></span> 离线缓存`;
      badge.className = 'status-badge offline';
    }
  }
}

// --- 渲染路由分发 ---
function renderApp() {
  // 侧边栏及移动端高亮
  document.querySelectorAll('.nav-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === state.currentTab);
  });

  // 主内容视图可见性
  document.querySelectorAll('.view-section').forEach(sec => {
    sec.classList.toggle('active', sec.id === `view-${state.currentTab}`);
  });

  if (state.currentTab === 'timeline') {
    renderTimeline();
  } else if (state.currentTab === 'prompts') {
    renderPrompts();
  } else if (state.currentTab === 'goals') {
    renderGoals();
  }
}

// --------------------------------------------------------------------------
// 模块 1：每日记录 (Timeline) - 单列纵向阅读流，阅读优先
// --------------------------------------------------------------------------
function renderTimeline() {
  const container = document.getElementById('timeline-records');
  if (!container) return;

  const records = state.data.dailyRecords || [];
  if (records.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <h3 style="font-size:16px; margin-bottom:8px;">暂无侦察记录</h3>
        <p style="color:var(--text-secondary); margin-bottom:16px;">点击右上角「导入日报」导入今日的侦察内容。</p>
        <button class="btn btn-primary btn-sm" id="btn-empty-import">立即导入今日日报</button>
      </div>
    `;
    document.getElementById('btn-empty-import')?.addEventListener('click', openImportModal);
    return;
  }

  // 排序：日期倒序
  const sortedRecords = [...records].sort((a, b) => b.date.localeCompare(a.date));
  const todayRecord = sortedRecords[0];

  // 更新今日大标题区域
  const dateLabel = document.getElementById('today-date-label');
  if (dateLabel) {
    dateLabel.textContent = formatTodayUppercase(todayRecord.date);
  }

  // 统计数量
  const todayItems = todayRecord.items || [];
  const todayTotal = todayItems.length;
  const todayRead = todayItems.filter(i => i.isRead).length;
  const wbTotal = todayItems.filter(i => i.agent === 'WorkBuddy').length;
  const museTotal = todayItems.filter(i => i.agent === 'Muse').length;

  const statsText = document.getElementById('today-stats-text');
  if (statsText) {
    statsText.textContent = `${todayTotal} 篇内容 · ${todayRead} 篇已读`;
  }

  // 更新顶部 Agent 切换栏数字
  const countAll = document.getElementById('count-all');
  if (countAll) countAll.textContent = todayTotal;
  const countWb = document.getElementById('count-wb');
  if (countWb) countWb.textContent = wbTotal;
  const countMuse = document.getElementById('count-muse');
  if (countMuse) countMuse.textContent = museTotal;

  // 过滤条件
  const agentFilter = state.filters.agent;
  const kw = state.filters.keyword.trim().toLowerCase();
  const readFilter = state.filters.readStatus;

  // 过滤今日文章
  const filteredTodayItems = todayItems.filter(item => {
    // 1. Agent 过滤
    if (agentFilter !== 'all' && item.agent !== agentFilter) return false;
    // 2. 搜索过滤
    if (kw) {
      const inTitle = (item.title || '').toLowerCase().includes(kw);
      const inSummary = (item.summary || '').toLowerCase().includes(kw);
      const inVal = (item.reader_value || '').toLowerCase().includes(kw);
      const inPlat = (item.platform || '').toLowerCase().includes(kw);
      if (!inTitle && !inSummary && !inVal && !inPlat) return false;
    }
    // 3. 阅读状态过滤
    if (readFilter === 'unread' && item.isRead) return false;
    if (readFilter === 'read' && !item.isRead) return false;
    return true;
  });

  // 渲染今日纵向单列阅读流
  let html = '';
  if (filteredTodayItems.length === 0) {
    html += `
      <div style="padding: 48px 0; text-align: center; color: var(--text-secondary);">
        <p>未找到符合筛选条件的内容</p>
      </div>
    `;
  } else {
    html += filteredTodayItems.map(item => renderArticleItem(item, todayRecord.date)).join('');
  }

  // 历史日期归档区（若有往日记录，折叠在底部）
  if (sortedRecords.length > 1) {
    const pastRecords = sortedRecords.slice(1);
    html += `
      <div class="history-archive-section">
        <details class="history-archive-collapse">
          <summary class="history-archive-header">
            <span>往日侦察归档 (${pastRecords.length} 天)</span>
            <span style="font-size:12px; color:var(--text-muted); font-weight:normal;">点击展开 ▾</span>
          </summary>
          <div style="margin-top: 16px;">
            ${pastRecords.map(day => `
              <div style="margin-bottom: 24px;">
                <div style="font-size:13px; font-weight:600; color:var(--text-secondary); margin-bottom:8px; padding-bottom:4px; border-bottom:1px solid var(--border-subtle);">
                  ${day.date} (${(day.items || []).length} 篇)
                </div>
                ${(day.items || []).map(item => renderArticleItem(item, day.date)).join('')}
              </div>
            `).join('')}
          </div>
        </details>
      </div>
    `;
  }

  container.innerHTML = html;
  bindTimelineEvents();
}

// 严格按照参考图五层架构渲染每篇文章
function renderArticleItem(item, date) {
  const isRead = !!item.isRead;
  const readerValue = item.reader_value ? item.reader_value.trim() : '';

  return `
    <article class="article-item ${isRead ? 'is-read' : ''}" id="article-${item.id}">
      <!-- 第一层：辅助信息 (平台 · 日期 · 互动) 12~13px -->
      <div class="article-meta">
        <span>${escapeHtml(item.platform || '社媒')}</span>
        <span>·</span>
        <span>${formatMetaDate(item.publishDate)}</span>
        ${item.engagement ? `<span>·</span><span>${escapeHtml(item.engagement)}</span>` : ''}
      </div>

      <!-- 第二层：文章标题 17~18px 视觉重点 -->
      <h2 class="article-title">
        <a href="${item.url || '#'}" target="_blank" rel="noopener noreferrer" class="article-title-link">
          ${escapeHtml(item.title)}
        </a>
      </h2>

      <!-- 第三层：内容简介 14~15px 正文说明 -->
      <div class="article-summary">
        ${escapeHtml(item.summary || '暂无内容简介')}
      </div>

      <!-- 第四层：读者价值 14~15px 蓝紫小标排版 -->
      ${readerValue ? `
        <div class="article-value">
          <span class="value-label">读者价值</span>
          <span class="value-text">${escapeHtml(readerValue)}</span>
        </div>
      ` : ''}

      <!-- 第五层：操作栏 (原文链接 + 状态切换 + 工具) -->
      <div class="article-actions">
        ${item.url ? `
          <a href="${item.url}" target="_blank" rel="noopener noreferrer" class="link-original">
            查看原文 ↗
          </a>
        ` : '<span style="font-size:12px; color:var(--warning);">链接待确认</span>'}

        <div class="article-tools">
          <button class="btn-read-toggle ${isRead ? 'is-read' : ''}" data-id="${item.id}" data-date="${date}" title="切换阅读状态">
            ${isRead ? '✓ 已读' : '○ 标为已读'}
          </button>
          <button class="btn-tool btn-edit-item" data-id="${item.id}" data-date="${date}" title="编辑条目">编辑</button>
          <button class="btn-tool btn-delete-item" data-id="${item.id}" data-date="${date}" title="删除条目">删除</button>
        </div>
      </div>
    </article>
  `;
}

function bindTimelineEvents() {
  // Agent 筛选切换
  document.querySelectorAll('.agent-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.agent === state.filters.agent);
    btn.onclick = () => {
      state.filters.agent = btn.dataset.agent;
      renderTimeline();
    };
  });

  // 标为已读/未读切换
  document.querySelectorAll('.btn-read-toggle').forEach(btn => {
    btn.onclick = (e) => {
      e.preventDefault();
      const id = btn.dataset.id;
      const date = btn.dataset.date;
      toggleItemRead(id, date);
    };
  });

  // 编辑单条
  document.querySelectorAll('.btn-edit-item').forEach(btn => {
    btn.onclick = (e) => {
      e.preventDefault();
      const id = btn.dataset.id;
      const date = btn.dataset.date;
      const day = state.data.dailyRecords.find(d => d.date === date);
      const item = day?.items?.find(i => i.id === id);
      if (item) openItemEditModal(item, date);
    };
  });

  // 删除单条
  document.querySelectorAll('.btn-delete-item').forEach(btn => {
    btn.onclick = (e) => {
      e.preventDefault();
      const id = btn.dataset.id;
      const date = btn.dataset.date;
      if (confirm('确认删除本篇侦察记录？')) {
        deleteItem(id, date);
      }
    };
  });
}

function toggleItemRead(id, date) {
  const day = state.data.dailyRecords.find(d => d.date === date);
  const item = day?.items?.find(i => i.id === id);
  if (item) {
    item.isRead = !item.isRead;
    persistData(null);
    renderTimeline();
  }
}

function deleteItem(id, date) {
  const day = state.data.dailyRecords.find(d => d.date === date);
  if (!day || !day.items) return;
  day.items = day.items.filter(i => i.id !== id);
  persistData('已删除记录');
  renderTimeline();
}

// --------------------------------------------------------------------------
// 模块 2：提示词版本 (Prompts) - 轻量版本管理器
// --------------------------------------------------------------------------
function renderPrompts() {
  const container = document.getElementById('prompts-container');
  if (!container) return;

  const currentAgent = state.activePromptAgent; // 'workbuddy' | 'muse'
  const promptList = state.data.promptRegistry[currentAgent] || [];

  // 默认选中最新版本
  if (!state.selectedPromptVersion && promptList.length > 0) {
    state.selectedPromptVersion = promptList[promptList.length - 1].version;
  }

  const selectedVer = promptList.find(p => p.version === state.selectedPromptVersion) || promptList[promptList.length - 1];
  const latestVer = promptList.length > 0 ? promptList[promptList.length - 1] : null;

  let html = `
    <div class="prompts-manager-layout">
      <!-- 左侧：版本列表 -->
      <aside class="prompts-sidebar">
        <div class="prompts-agent-switch">
          <button class="p-switch-btn ${currentAgent === 'workbuddy' ? 'active' : ''}" data-agent="workbuddy">
            WorkBuddy (国内)
          </button>
          <button class="p-switch-btn ${currentAgent === 'muse' ? 'active' : ''}" data-agent="muse">
            Muse (海外)
          </button>
        </div>

        <div style="font-size:12px; font-weight:600; color:var(--text-secondary); margin-top:4px;">版本历史</div>

        <div class="version-nav-list">
          ${[...promptList].reverse().map(ver => {
            const isSelected = selectedVer && selectedVer.version === ver.version;
            const isCurrentActive = latestVer && latestVer.version === ver.version;
            return `
              <div class="version-nav-item ${isSelected ? 'active' : ''}" data-ver="${ver.version}">
                <div class="v-item-top">
                  <span class="v-item-ver">${ver.version}</span>
                  ${isCurrentActive ? '<span class="badge-active-tag">当前生效</span>' : ''}
                </div>
                <div class="v-item-date">${ver.createdAt ? ver.createdAt.split('T')[0] : ''}</div>
                <div class="v-item-reason">${escapeHtml(ver.reason || '无说明')}</div>
              </div>
            `;
          }).join('')}
        </div>
      </aside>

      <!-- 右侧：当前版本详情与完整提示词 -->
      <main class="prompts-detail-pane">
        ${selectedVer ? `
          <div class="prompts-detail-header">
            <div>
              <h2 class="pd-title">${currentAgent === 'workbuddy' ? 'WorkBuddy' : 'Muse'} · ${selectedVer.version}</h2>
              <div class="pd-meta">创建于 ${selectedVer.createdAt ? selectedVer.createdAt.split('T')[0] : ''}</div>
            </div>
            <button class="btn btn-primary btn-sm" id="btn-create-prompt-version">
              + 发布新版本
            </button>
          </div>

          <div class="pd-info-block">
            <div class="pd-info-row">
              <span class="pd-info-label">更新原因</span>
              <p class="pd-info-text">${escapeHtml(selectedVer.reason || '无')}</p>
            </div>

            <div class="pd-info-row">
              <span class="pd-info-label">主要规则变化</span>
              <p class="pd-info-text">${escapeHtml(selectedVer.changeLog || '无')}</p>
            </div>

            <div class="pd-info-row">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <span class="pd-info-label">完整提示词内容</span>
              </div>
              <div class="prompt-code-container">
                <button class="btn-copy-code" id="btn-copy-prompt-text">复制内容</button>
                <pre class="prompt-code-body">${escapeHtml(selectedVer.promptContent)}</pre>
              </div>
            </div>
          </div>

          <!-- 版本差异比较 (二级功能，默认折叠) -->
          <details class="diff-collapsible" id="diff-collapsible-wrapper">
            <summary class="diff-summary">版本差异比较 ▾</summary>
            <div class="diff-collapsible-body">
              <div class="diff-selector-row">
                <span>基准版本：</span>
                <select id="diff-select-a" class="minimal-select">
                  ${promptList.map((p, i) => `<option value="${p.version}" ${i === 0 ? 'selected' : ''}>${p.version}</option>`).join('')}
                </select>
                <span>➔ 对比版本：</span>
                <select id="diff-select-b" class="minimal-select">
                  ${promptList.map((p, i) => `<option value="${p.version}" ${p.version === selectedVer.version ? 'selected' : ''}>${p.version}</option>`).join('')}
                </select>
              </div>
              <div id="diff-viewer-mount"></div>
            </div>
          </details>
        ` : '<div style="color:var(--text-secondary);">尚未创建版本</div>'}
      </main>
    </div>
  `;

  container.innerHTML = html;
  bindPromptsEvents(selectedVer);
}

function bindPromptsEvents(selectedVer) {
  // Agent 切换
  document.querySelectorAll('.p-switch-btn').forEach(btn => {
    btn.onclick = () => {
      state.activePromptAgent = btn.dataset.agent;
      state.selectedPromptVersion = null;
      renderPrompts();
    };
  });

  // 版本切换
  document.querySelectorAll('.version-nav-item').forEach(item => {
    item.onclick = () => {
      state.selectedPromptVersion = item.dataset.ver;
      renderPrompts();
    };
  });

  // 复制提示词
  document.getElementById('btn-copy-prompt-text')?.addEventListener('click', () => {
    if (selectedVer && selectedVer.promptContent) {
      navigator.clipboard.writeText(selectedVer.promptContent).then(() => {
        showToast('提示词已复制到剪贴板', 'success');
      });
    }
  });

  // 发布新版本
  document.getElementById('btn-create-prompt-version')?.addEventListener('click', openPromptCreateModal);

  // Diff 渲染联动
  const selA = document.getElementById('diff-select-a');
  const selB = document.getElementById('diff-select-b');
  selA?.addEventListener('change', renderActiveDiff);
  selB?.addEventListener('change', renderActiveDiff);

  document.getElementById('diff-collapsible-wrapper')?.addEventListener('toggle', (e) => {
    if (e.target.open) renderActiveDiff();
  });
}

function renderActiveDiff() {
  const mount = document.getElementById('diff-viewer-mount');
  const selA = document.getElementById('diff-select-a');
  const selB = document.getElementById('diff-select-b');
  if (!mount || !selA || !selB) return;

  const currentAgent = state.activePromptAgent;
  const promptList = state.data.promptRegistry[currentAgent] || [];
  const verA = promptList.find(p => p.version === selA.value);
  const verB = promptList.find(p => p.version === selB.value);

  mount.innerHTML = DiffViewer.renderSideBySide(verA, verB);
}

// --------------------------------------------------------------------------
// 模块 3：目标与想法 (Goals & Thoughts) - 文档阅读优先
// --------------------------------------------------------------------------
function renderGoals() {
  const g = state.data.goalsAndThoughts || {};

  // 填充文档阅读视图
  const elWhy = document.getElementById('doc-display-why');
  if (elWhy) elWhy.textContent = g.why || '暂未填写初衷';

  const elStrategy = document.getElementById('doc-display-strategy');
  if (elStrategy) elStrategy.textContent = g.strategyPrinciples || '暂未填写策略与原则';

  const elThoughts = document.getElementById('doc-display-thoughts');
  if (elThoughts) elThoughts.textContent = g.newThoughts || '暂未记录新想法';

  // 预填编辑表单
  const inpWhy = document.getElementById('goal-input-why');
  if (inpWhy) inpWhy.value = g.why || '';
  const inpCore = document.getElementById('goal-input-core');
  if (inpCore) inpCore.value = g.coreGoals || '';
  const inpStrategy = document.getElementById('goal-input-strategy');
  if (inpStrategy) inpStrategy.value = g.strategyPrinciples || '';
  const inpThoughts = document.getElementById('goal-input-thoughts');
  if (inpThoughts) inpThoughts.value = g.newThoughts || '';

  // 渲染历史快照
  const histContainer = document.getElementById('goals-history-list');
  const histCount = document.getElementById('gh-summary-count');
  const list = g.history || [];
  if (histCount) histCount.textContent = `共 ${list.length} 条记录 ▾`;

  if (histContainer) {
    if (list.length === 0) {
      histContainer.innerHTML = '<div style="color:var(--text-muted); font-size:12px;">暂无历史快照</div>';
    } else {
      histContainer.innerHTML = list.slice().reverse().map(h => `
        <div class="history-item">
          <span class="hist-time">${h.savedAt ? h.savedAt.replace('T', ' ').substring(0, 16) : ''}</span>
          <span class="hist-summary">${escapeHtml(h.summary || '更新认知笔记')}</span>
        </div>
      `).join('');
    }
  }
}

// --------------------------------------------------------------------------
// 模块 4：导入日报流程
// --------------------------------------------------------------------------
function openImportModal() {
  const modal = document.getElementById('modal-import');
  if (!modal) return;

  document.getElementById('import-raw-input').value = '';
  document.getElementById('import-agent-select').value = 'auto';
  document.getElementById('import-date-input').value = new Date().toISOString().split('T')[0];
  document.getElementById('import-preview-section').style.display = 'none';
  document.getElementById('import-step1').style.display = 'block';
  state.importPreview = null;

  modal.classList.add('active');
}

function closeImportModal() {
  document.getElementById('modal-import')?.classList.remove('active');
  state.importPreview = null;
}

async function loadSampleReport(sampleFilename) {
  try {
    let res = await fetch(`/api/examples/${sampleFilename}`);
    if (!res.ok) {
      res = await fetch(`./examples/${sampleFilename}`);
    }
    if (!res.ok) throw new Error('Sample fetch failed');
    const text = await res.text();
    document.getElementById('import-raw-input').value = text;
    showToast(`已载入示例文件: ${sampleFilename}`, 'info');
    handleParseImport();
  } catch (err) {
    showToast('无法读取示例文件', 'error');
  }
}

function handleParseImport() {
  const rawText = document.getElementById('import-raw-input').value.trim();
  if (!rawText) {
    showToast('请先输入或粘贴报告内容', 'error');
    return;
  }

  const selectedAgent = document.getElementById('import-agent-select').value;
  const targetDate = document.getElementById('import-date-input').value || new Date().toISOString().split('T')[0];

  const parsed = Parser.parse(rawText, selectedAgent, targetDate);
  if (parsed.items.length === 0) {
    showToast('未能识别出有效文章条目，请检查格式', 'error');
    return;
  }

  const existingDay = state.data.dailyRecords?.find(d => d.date === parsed.date);
  const existingUrls = new Set((existingDay?.items || []).map(i => i.url).filter(Boolean));

  parsed.items.forEach(item => {
    if (item.url && existingUrls.has(item.url)) {
      item.isDuplicate = true;
      item.duplicateAction = 'skip';
    } else {
      item.isDuplicate = false;
      item.duplicateAction = 'keep';
    }
  });

  const agentKey = parsed.agent.toLowerCase() === 'muse' ? 'muse' : 'workbuddy';
  const promptList = state.data.promptRegistry[agentKey] || [];
  const latestPrompt = promptList.length > 0 ? promptList[promptList.length - 1].version : 'V1.0';

  state.importPreview = {
    ...parsed,
    rawText,
    promptVersion: latestPrompt
  };

  renderImportPreview();
}

function renderImportPreview() {
  const container = document.getElementById('import-preview-list');
  const previewSection = document.getElementById('import-preview-section');
  if (!container || !state.importPreview) return;

  const { agent, date, items, promptVersion } = state.importPreview;

  document.getElementById('preview-meta-agent').textContent = agent;
  document.getElementById('preview-meta-date').textContent = date;
  document.getElementById('preview-meta-count').textContent = `${items.length} 篇`;

  const promptSelect = document.getElementById('preview-prompt-version');
  const agentKey = agent.toLowerCase() === 'muse' ? 'muse' : 'workbuddy';
  const promptList = state.data.promptRegistry[agentKey] || [];
  promptSelect.innerHTML = promptList.map(p => `
    <option value="${p.version}" ${p.version === promptVersion ? 'selected' : ''}>
      ${p.version} (${p.reason || '无说明'})
    </option>
  `).join('');

  container.innerHTML = items.map((item, idx) => `
    <div class="preview-item-card" data-index="${idx}">
      <div class="preview-card-header">
        <span style="font-weight:600; font-size:12.5px;">第 ${idx + 1} 篇</span>
        <button type="button" class="btn-tool btn-remove-preview" data-index="${idx}">✕ 移除</button>
      </div>

      <div class="preview-card-grid">
        <input type="text" class="input-field preview-title" value="${escapeHtml(item.title)}" placeholder="标题">
        <input type="text" class="input-field preview-platform" value="${escapeHtml(item.platform)}" placeholder="平台">
        <input type="text" class="input-field preview-date" value="${escapeHtml(item.publishDate)}" placeholder="发布日期">
      </div>

      <textarea class="input-field preview-summary" rows="2" placeholder="简介">${escapeHtml(item.summary)}</textarea>
      <input type="text" class="input-field preview-reader-value" value="${escapeHtml(item.reader_value || '')}" placeholder="读者价值">
      <input type="text" class="input-field preview-url" value="${escapeHtml(item.url)}" placeholder="原文链接">
    </div>
  `).join('');

  document.getElementById('import-step1').style.display = 'none';
  previewSection.style.display = 'block';

  // 移除单条
  container.querySelectorAll('.btn-remove-preview').forEach(btn => {
    btn.onclick = () => {
      const idx = parseInt(btn.dataset.index, 10);
      state.importPreview.items.splice(idx, 1);
      renderImportPreview();
    };
  });
}

async function confirmImportAndSave() {
  if (!state.importPreview || state.importPreview.items.length === 0) {
    showToast('没有可归档的有效条目', 'error');
    return;
  }

  const { agent, date, items, rawText } = state.importPreview;
  const promptVersion = document.getElementById('preview-prompt-version').value;

  let dayRecord = state.data.dailyRecords.find(d => d.date === date);
  if (!dayRecord) {
    dayRecord = {
      date: date,
      promptVersionWorkBuddy: agent === 'WorkBuddy' ? promptVersion : null,
      promptVersionMuse: agent === 'Muse' ? promptVersion : null,
      items: []
    };
    state.data.dailyRecords.unshift(dayRecord);
  } else {
    if (agent === 'WorkBuddy') dayRecord.promptVersionWorkBuddy = promptVersion;
    if (agent === 'Muse') dayRecord.promptVersionMuse = promptVersion;
  }

  let addedCount = 0;
  items.forEach(newItem => {
    const existingIndex = dayRecord.items.findIndex(existing => existing.url && existing.url === newItem.url);
    if (existingIndex < 0) {
      dayRecord.items.push(newItem);
      addedCount++;
    }
  });

  try {
    fetch('/api/save-raw-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent, date, rawText })
    });
  } catch (_) {}

  await persistData(`成功归档至 ${date}（新增 ${addedCount} 篇）`);
  closeImportModal();
  renderTimeline();
}

// --------------------------------------------------------------------------
// 模块 5：条目手动编辑模态框
// --------------------------------------------------------------------------
function openItemEditModal(item = null, defaultDate = '') {
  const modal = document.getElementById('modal-edit-item');
  if (!modal) return;

  const isEditing = !!item;
  document.getElementById('edit-modal-title').textContent = isEditing ? '编辑侦察记录' : '添加侦察记录';
  document.getElementById('edit-item-id').value = isEditing ? item.id : '';
  document.getElementById('edit-item-date').value = defaultDate || new Date().toISOString().split('T')[0];
  document.getElementById('edit-item-agent').value = isEditing ? item.agent : 'WorkBuddy';
  document.getElementById('edit-item-title').value = isEditing ? item.title : '';
  document.getElementById('edit-item-platform').value = isEditing ? item.platform : '小红书';
  document.getElementById('edit-item-publish-date').value = isEditing ? item.publishDate : new Date().toISOString().split('T')[0];
  document.getElementById('edit-item-engagement').value = isEditing ? item.engagement : '';
  document.getElementById('edit-item-url').value = isEditing ? item.url : '';
  document.getElementById('edit-item-summary').value = isEditing ? item.summary : '';
  document.getElementById('edit-item-reader-value').value = isEditing ? (item.reader_value || '') : '';

  modal.classList.add('active');
}

function closeItemEditModal() {
  document.getElementById('modal-edit-item')?.classList.remove('active');
}

function handleSaveItemEdit(e) {
  e.preventDefault();
  const id = document.getElementById('edit-item-id').value;
  const date = document.getElementById('edit-item-date').value.trim();
  const agent = document.getElementById('edit-item-agent').value;
  const title = document.getElementById('edit-item-title').value.trim() || '待确认';
  const platform = document.getElementById('edit-item-platform').value.trim() || '待确认';
  const publishDate = document.getElementById('edit-item-publish-date').value.trim() || '待确认';
  const engagement = document.getElementById('edit-item-engagement').value.trim() || '待确认';
  const url = document.getElementById('edit-item-url').value.trim();
  const summary = document.getElementById('edit-item-summary').value.trim() || '待确认';
  const reader_value = document.getElementById('edit-item-reader-value').value.trim();

  let dayRecord = state.data.dailyRecords.find(d => d.date === date);
  if (!dayRecord) {
    dayRecord = { date, items: [] };
    state.data.dailyRecords.unshift(dayRecord);
  }

  if (id) {
    const item = dayRecord.items.find(i => i.id === id);
    if (item) {
      item.agent = agent;
      item.title = title;
      item.platform = platform;
      item.publishDate = publishDate;
      item.engagement = engagement;
      item.url = url;
      item.summary = summary;
      item.reader_value = reader_value;
    }
  } else {
    dayRecord.items.push({
      id: `item_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      agent,
      title,
      platform,
      publishDate,
      engagement,
      summary,
      reader_value,
      url,
      isRead: false
    });
  }

  persistData(id ? '记录已修改' : '已添加记录');
  closeItemEditModal();
  renderTimeline();
}

// --------------------------------------------------------------------------
// 模块 6：发布提示词新版本模态框
// --------------------------------------------------------------------------
function openPromptCreateModal() {
  const modal = document.getElementById('modal-create-prompt');
  if (!modal) return;

  const currentAgent = state.activePromptAgent;
  const promptList = state.data.promptRegistry[currentAgent] || [];

  document.getElementById('prompt-modal-agent').textContent = currentAgent === 'workbuddy' ? 'WorkBuddy' : 'Muse';
  document.getElementById('new-prompt-version').value = `V1.${promptList.length}`;
  document.getElementById('new-prompt-reason').value = '';
  document.getElementById('new-prompt-changelog').value = '';
  document.getElementById('new-prompt-content').value = promptList.length > 0 ? promptList[promptList.length - 1].promptContent : '';

  modal.classList.add('active');
}

function closePromptCreateModal() {
  document.getElementById('modal-create-prompt')?.classList.remove('active');
}

async function handleSaveNewPrompt(e) {
  e.preventDefault();
  const currentAgent = state.activePromptAgent;
  const version = document.getElementById('new-prompt-version').value.trim();
  const reason = document.getElementById('new-prompt-reason').value.trim();
  const changeLog = document.getElementById('new-prompt-changelog').value.trim();
  const promptContent = document.getElementById('new-prompt-content').value.trim();

  if (!version || !promptContent) {
    showToast('请填写版本号和提示词内容', 'error');
    return;
  }

  const promptList = state.data.promptRegistry[currentAgent] || [];
  if (promptList.some(p => p.version === version)) {
    showToast(`版本号 ${version} 已存在，不可覆盖旧版本`, 'error');
    return;
  }

  promptList.push({
    version,
    createdAt: new Date().toISOString(),
    reason: reason || '日常迭代优化',
    changeLog: changeLog || '优化筛选精度与输出规范',
    promptContent
  });

  state.selectedPromptVersion = version;
  await persistData(`已发布 ${currentAgent === 'workbuddy' ? 'WorkBuddy' : 'Muse'} ${version}`);
  closePromptCreateModal();
  renderPrompts();
}

// --------------------------------------------------------------------------
// 模块 7：保存目标与想法
// --------------------------------------------------------------------------
async function handleSaveGoals() {
  const why = document.getElementById('goal-input-why').value.trim();
  const coreGoals = document.getElementById('goal-input-core').value.trim();
  const strategyPrinciples = document.getElementById('goal-input-strategy').value.trim();
  const newThoughts = document.getElementById('goal-input-thoughts').value.trim();

  state.data.goalsAndThoughts = state.data.goalsAndThoughts || {};
  state.data.goalsAndThoughts.why = why;
  state.data.goalsAndThoughts.coreGoals = coreGoals;
  state.data.goalsAndThoughts.strategyPrinciples = strategyPrinciples;
  state.data.goalsAndThoughts.newThoughts = newThoughts;

  state.data.goalsAndThoughts.history = state.data.goalsAndThoughts.history || [];
  state.data.goalsAndThoughts.history.push({
    id: `goal_${Date.now()}`,
    savedAt: new Date().toISOString(),
    summary: `更新认知笔记（共 ${why.length + coreGoals.length + strategyPrinciples.length + newThoughts.length} 字）`
  });

  await persistData('目标与想法已持久化保存');
  // 切回文档阅读模式
  document.getElementById('goals-edit-view').style.display = 'none';
  document.getElementById('goals-doc-view').style.display = 'flex';
  renderGoals();
}

// 转义 HTML 辅助
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// 客户端纯前端生成导出复盘 Markdown
function generateClientMarkdownExport(store) {
  const nowStr = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  let md = `# IELTS Radar｜我的 AI 雅思侦察日志 全量导出\n\n`;
  md += `> 导出时间：${nowStr}\n`;
  md += `> 记录天数：${store.dailyRecords ? store.dailyRecords.length : 0} 天\n\n`;

  // 1. 目标与想法
  if (store.goalsAndThoughts) {
    const g = store.goalsAndThoughts;
    md += `## 🎯 核心目标与侦察原则\n\n`;
    md += `### 系统初衷\n${g.why || '未填写'}\n\n`;
    md += `### 核心目标\n${g.coreGoals || '未填写'}\n\n`;
    md += `### 策略与执行原则\n${g.strategyPrinciples || '未填写'}\n\n`;
    md += `### 最新想法与观察\n${g.newThoughts || '未填写'}\n\n`;
    md += `---\n\n`;
  }

  // 2. 每日侦察历史记录
  md += `## 📅 每日侦察历史记录\n\n`;
  if (!store.dailyRecords || store.dailyRecords.length === 0) {
    md += `*暂无历史记录*\n\n`;
  } else {
    const sorted = [...store.dailyRecords].sort((a, b) => b.date.localeCompare(a.date));
    sorted.forEach((day) => {
      const items = day.items || [];
      const readCount = items.filter((i) => i.isRead).length;
      md += `### 📆 ${day.date}（收录 ${items.length} 篇 · 已读 ${readCount}/${items.length}）\n\n`;

      if (day.promptVersionWorkBuddy || day.promptVersionMuse) {
        md += `*关联提示词版本：WorkBuddy: ${day.promptVersionWorkBuddy || '无'} | Muse: ${day.promptVersionMuse || '无'}*\n\n`;
      }

      const wbItems = items.filter((i) => i.agent === 'WorkBuddy');
      const museItems = items.filter((i) => i.agent === 'Muse');
      const otherItems = items.filter((i) => i.agent !== 'WorkBuddy' && i.agent !== 'Muse');

      if (wbItems.length > 0) {
        md += `#### 🔴 WorkBuddy（小红书 / 抖音）\n\n`;
        wbItems.forEach((item, idx) => {
          md += `**${idx + 1}. [${item.platform || '未知平台'}] ${item.title}** ${item.isRead ? '✅ *(已读)*' : '⏳ *(待读)*'}\n`;
          md += `- **发布日期**: ${item.publishDate || '待确认'}\n`;
          md += `- **互动数据**: ${item.engagement || '待确认'}\n`;
          md += `- **核心简介**: ${item.summary || '无'}\n`;
          if (item.reader_value) {
            md += `- **读者价值**: ${item.reader_value}\n`;
          }
          md += `- **原文链接**: [点击阅读](${item.url || '#'})\n\n`;
        });
      }

      if (museItems.length > 0) {
        md += `#### 🔵 Muse（YouTube / Reddit / X）\n\n`;
        museItems.forEach((item, idx) => {
          md += `**${idx + 1}. [${item.platform || '未知平台'}] ${item.title}** ${item.isRead ? '✅ *(已读)*' : '⏳ *(待读)*'}\n`;
          md += `- **发布日期**: ${item.publishDate || '待确认'}\n`;
          md += `- **互动数据**: ${item.engagement || '待确认'}\n`;
          md += `- **核心简介**: ${item.summary || '无'}\n`;
          if (item.reader_value) {
            md += `- **读者价值**: ${item.reader_value}\n`;
          }
          md += `- **原文链接**: [点击阅读](${item.url || '#'})\n\n`;
        });
      }

      if (otherItems.length > 0) {
        md += `#### ⚪ 其他来源\n\n`;
        otherItems.forEach((item, idx) => {
          md += `**${idx + 1}. [${item.platform || '未知'}] ${item.title}**\n`;
          md += `- 链接: ${item.url}\n\n`;
        });
      }

      md += `---\n\n`;
    });
  }

  // 3. 提示词版本
  if (store.promptRegistry) {
    md += `## ⚙️ 提示词版本库\n\n`;
    const wbPrompts = store.promptRegistry.workbuddy || [];
    const musePrompts = store.promptRegistry.muse || [];

    md += `### WorkBuddy 提示词历史\n\n`;
    wbPrompts.forEach((p) => {
      md += `#### ${p.version}（创建于 ${p.createdAt.split('T')[0]}）\n`;
      md += `- **修改原因**: ${p.reason}\n`;
      md += `- **变更说明**: ${p.changeLog}\n\n`;
      md += `\`\`\`text\n${p.promptContent}\n\`\`\`\n\n`;
    });

    md += `### Muse 提示词历史\n\n`;
    musePrompts.forEach((p) => {
      md += `#### ${p.version}（创建于 ${p.createdAt.split('T')[0]}）\n`;
      md += `- **修改原因**: ${p.reason}\n`;
      md += `- **变更说明**: ${p.changeLog}\n\n`;
      md += `\`\`\`text\n${p.promptContent}\n\`\`\`\n\n`;
    });
  }

  return md;
}

// --------------------------------------------------------------------------
// 初始化与全局事件绑定
// --------------------------------------------------------------------------
window.addEventListener('DOMContentLoaded', () => {
  // 1. 侧边栏与移动端导航切换
  document.querySelectorAll('.nav-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      state.currentTab = btn.dataset.tab;
      window.location.hash = state.currentTab;
      renderApp();
    });
  });

  window.addEventListener('hashchange', () => {
    const hash = window.location.hash.replace('#', '');
    if (['timeline', 'prompts', 'goals'].includes(hash)) {
      state.currentTab = hash;
      renderApp();
    }
  });

  const initialHash = window.location.hash.replace('#', '');
  if (['timeline', 'prompts', 'goals'].includes(initialHash)) {
    state.currentTab = initialHash;
  }

  // 2. 导入日报入口
  document.getElementById('btn-open-import')?.addEventListener('click', openImportModal);
  document.getElementById('btn-close-import')?.addEventListener('click', closeImportModal);
  document.getElementById('btn-parse-import')?.addEventListener('click', handleParseImport);
  document.getElementById('btn-confirm-import')?.addEventListener('click', confirmImportAndSave);

  document.getElementById('btn-load-wb-sample')?.addEventListener('click', () => loadSampleReport('workbuddy-sample.md'));
  document.getElementById('btn-load-muse-sample')?.addEventListener('click', () => loadSampleReport('muse-sample.md'));

  document.getElementById('import-file-upload')?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        document.getElementById('import-raw-input').value = evt.target.result;
        showToast(`已读取文件: ${file.name}`, 'info');
        handleParseImport();
      };
      reader.readAsText(file);
    }
  });

  // 3. 手动编辑条目
  document.getElementById('btn-close-edit-item')?.addEventListener('click', closeItemEditModal);
  document.getElementById('form-edit-item')?.addEventListener('submit', handleSaveItemEdit);

  // 4. 提示词创建
  document.getElementById('btn-close-prompt-modal')?.addEventListener('click', closePromptCreateModal);
  document.getElementById('form-create-prompt')?.addEventListener('submit', handleSaveNewPrompt);

  // 5. 目标与想法 文档/编辑 切换
  document.getElementById('btn-edit-goals-doc')?.addEventListener('click', () => {
    document.getElementById('goals-doc-view').style.display = 'none';
    document.getElementById('goals-edit-view').style.display = 'flex';
  });
  document.getElementById('btn-cancel-edit-goals')?.addEventListener('click', () => {
    document.getElementById('goals-edit-view').style.display = 'none';
    document.getElementById('goals-doc-view').style.display = 'flex';
  });
  document.getElementById('btn-save-goals')?.addEventListener('click', handleSaveGoals);

  // 6. 搜索与阅读状态过滤
  document.getElementById('search-input')?.addEventListener('input', (e) => {
    state.filters.keyword = e.target.value;
    renderTimeline();
  });

  document.getElementById('filter-read-status')?.addEventListener('change', (e) => {
    state.filters.readStatus = e.target.value;
    renderTimeline();
  });

  // 7. 导出 (支持纯前端 Blob 本地下载与服务端导出双模式)
  document.getElementById('btn-export-json')?.addEventListener('click', () => {
    try {
      const blob = new Blob([JSON.stringify(state.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ielts-radar-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast('已导出 JSON 完整数据备份', 'success');
    } catch (_) {
      window.location.href = '/api/export/json';
    }
  });

  document.getElementById('btn-export-markdown')?.addEventListener('click', () => {
    try {
      const mdContent = generateClientMarkdownExport(state.data);
      const blob = new Blob([mdContent], { type: 'text/markdown; charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ielts-radar-summary-${new Date().toISOString().slice(0, 10)}.md`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast('已导出复盘 Markdown 文档', 'success');
    } catch (_) {
      window.location.href = '/api/export/markdown';
    }
  });

  // 8. 主题
  initTheme();
  document.getElementById('btn-theme-toggle')?.addEventListener('click', toggleTheme);

  // 9. 载入数据
  loadData();
});
