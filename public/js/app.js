/**
 * IELTS Radar - 前端核心应用逻辑 (app.js) V3.0
 * 遵循 Apple × Notion × Linear 风格个人研究工作台设计
 * 单列纵向阅读流、阅读优先、轻量版本管理器、文档化目标阅读
 */
import { Parser } from './parser.js';
import { DiffViewer } from './diff.js';
import { renderV22Overview } from './prompt-v22-view.js?v=1.1';
import { mergeRemoteWithLocal, validateStore, createBackup, readBackup, storeSummary, previewRestore } from './data-safety.js?v=1.0';
import { renderWritingPipeline, initWritingPipelineEvents } from './pipeline.js?v=1.7';

// 全局应用状态
const state = {
  currentTab: 'timeline', // 'timeline' | 'writing' | 'rhythm' | 'video' | 'prompts' | 'goals'
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
    readStatus: 'all' // 'all' | 'unread' | 'read' | 'candidate'
  },
  expandedDates: new Set(),
  expandedItemIds: new Set(),
  selectedDate: null,
  importPreview: null,
  backendAvailable: false
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

// 获取当前本地系统日期 YYYY-MM-DD
function getTodayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// 格式化日期与星期几 (如: 10月11日 · 周日)
function formatDateWithWeekday(dateStr) {
  if (!dateStr) return '今日';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  const d = new Date(year, month - 1, day);
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const weekday = weekdays[d.getDay()] || '';
  return `${month}月${day}日 · ${weekday}`;
}

// 格式化药丸胶囊日期 (如: 10月11日)
function formatPillDate(dateStr) {
  if (!dateStr) return '今日';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  return `${parseInt(parts[1], 10)}月${parseInt(parts[2], 10)}日`;
}

// 格式化文章简明发布日期 (如 2026-09-15 转换为 09-15，精确匹配设计稿)
function formatMetaDate(dateStr) {
  if (!dateStr || dateStr === '待确认') return '近期';
  const m = String(dateStr).match(/^\d{4}-(\d{2}-\d{2})$/);
  if (m) return m[1];
  return dateStr;
}

// --- 数据同步与加载 (支持 Node 原生后端与 GitHub Pages 静态环境无缝双模) ---
function writeLocalCache(data) {
  try {
    localStorage.setItem('ielts_radar_cache', JSON.stringify(data));
    return true;
  } catch (_) {
    return false;
  }
}

async function loadData() {
  let remoteData = null;
  let cachedData = null;
  let cacheUnreadable = false;

  try {
    const res = await fetch('/api/data', { cache: 'no-cache' });
    if (res.ok) {
      remoteData = validateStore(await res.json());
      state.backendAvailable = true;
    }
  } catch (_) {}

  if (!remoteData) {
    try {
      const res = await fetch('./data/radar-store.json', { cache: 'no-cache' });
      if (res.ok) remoteData = validateStore(await res.json());
    } catch (_) {}
  }

  try {
    const raw = localStorage.getItem('ielts_radar_cache');
    if (raw) cachedData = validateStore(JSON.parse(raw));
  } catch (_) {
    cacheUnreadable = true;
    showToast('浏览器中的原始缓存未覆盖，但暂时无法读取。请保留已有备份文件。', 'error');
  }

  if (remoteData || cachedData) {
    state.data = mergeRemoteWithLocal(remoteData, cachedData);
    // 合并和写缓存分开处理：容量不足时仍保留内存中的完整结果。
    const localSaved = !cacheUnreadable && writeLocalCache(state.data);
    const fileMatches = state.backendAvailable && JSON.stringify(state.data) === JSON.stringify(remoteData);
    updateSyncStatus(fileMatches ? 'file-read' : (localSaved ? 'browser' : 'unsaved'));
    if (!remoteData && cachedData) showToast('已从此浏览器恢复数据', 'info');
  } else {
    updateSyncStatus('unsaved');
  }

  if (state.data.dailyRecords?.length) {
    state.data.dailyRecords.forEach(day => state.expandedDates.add(day.date));
    state.activeTimelineDate = state.data.dailyRecords[0].date;
  }
  renderApp();
}

async function persistData(successMessage = '数据已保存', data = state.data, { requireLocal = false } = {}) {
  const localSaved = writeLocalCache(data);
  // 恢复时若无法写入浏览器，旧缓存会在下次加载时干扰结果；此时保持原数据。
  if (requireLocal && !localSaved) {
    showToast('未恢复：浏览器无法保存这份备份，当前数据保持原样。请保留备份文件。', 'error');
    return false;
  }
  let backendSaved = false;
  if (state.backendAvailable) {
    try {
      const res = await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      backendSaved = res.ok;
    } catch (_) {}
  }

  updateSyncStatus(backendSaved ? 'file' : (localSaved ? 'browser' : 'unsaved'));
  if (!localSaved && !backendSaved) {
    showToast('保存失败，当前内容仍在页面中。请立即下载完整备份，暂时不要刷新。', 'error');
    return false;
  }
  if (successMessage) {
    showToast(backendSaved ? `${successMessage}（已写入本机文件）` : `${successMessage}（仅存此浏览器）`, 'success');
  }
  return true;
}

function updateSyncStatus(mode) {
  const badge = document.getElementById('sync-indicator');
  if (!badge) return;
  const labels = {
    'file-read': ['已读取本机文件', '已从本机服务读取文件；可用“导出”下载完整备份。'],
    file: ['已保存本机文件', '已写入本机服务的数据文件；可用“导出”另存完整备份。'],
    browser: ['仅存此浏览器', '尚未备份到服务器。清除网站数据前，请到“导出”下载完整备份。'],
    unsaved: ['尚未保存', '当前无法确认保存成功，请立即下载完整备份。']
  };
  const [label, help] = labels[mode] || labels.unsaved;
  const savedToFile = mode === 'file' || mode === 'file-read';
  badge.innerHTML = `<span class="${savedToFile ? 'dot-live' : 'dot-warn'}"></span> ${label}`;
  badge.className = `status-badge ${savedToFile ? 'online' : 'offline'}`;
  badge.title = help;
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
  } else if (['writing', 'rhythm', 'video'].includes(state.currentTab)) {
    renderWritingPipeline();
  } else if (state.currentTab === 'prompts') {
    renderPrompts();
  } else if (state.currentTab === 'goals') {
    renderGoals();
  }
}

// --------------------------------------------------------------------------
// 模块 1：每日侦察 (Timeline) - 单列纵向阅读流，轻量日期归档与切换
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

  // 确定当前选中的日期：
  // 规则：网站进入时优先展示当天记录；当天没有记录时展示最近一个有记录的日期，并清楚标注实际日期
  if (!state.selectedDate || !records.some(r => r.date === state.selectedDate)) {
    const todayStr = getTodayDateString();
    const hasToday = records.some(r => r.date === todayStr);
    state.selectedDate = hasToday ? todayStr : sortedRecords[0].date;
  }

  const activeRecord = records.find(r => r.date === state.selectedDate) || sortedRecords[0];
  const activeDate = activeRecord.date;

  // 1. 渲染日期导航药丸胶囊栏 ([ 10月11日 ] [ 10月10日 ] [ 🗓️ ])
  const navContainer = document.getElementById('date-navigation-bar');
  if (navContainer) {
    const allDates = [...new Set(records.map(r => r.date).filter(Boolean))].sort((a, b) => b.localeCompare(a));
    let navHtml = allDates.map(d => `
      <button class="date-nav-pill ${d === activeDate ? 'active' : ''}" data-date="${d}" type="button">
        ${formatPillDate(d)}
      </button>
    `).join('');

    navHtml += `
      <div class="date-picker-wrap">
        <button class="date-picker-icon-btn" id="btn-date-picker-trigger" type="button" title="从日历选择日期">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="16" y1="2" x2="16" y2="6"></line>
            <line x1="8" y1="2" x2="8" y2="6"></line>
            <line x1="3" y1="10" x2="21" y2="10"></line>
          </svg>
        </button>
        <input type="date" id="calendar-date-input" class="date-picker-native-input" value="${activeDate}" />
      </div>
    `;
    navContainer.innerHTML = navHtml;
  }

  // 2. 统计当前日期的数据
  const activeItems = activeRecord.items || [];
  const activeTotal = activeItems.length;
  const wbTotal = activeItems.filter(i => i.agent === 'WorkBuddy').length;
  const museTotal = activeItems.filter(i => i.agent === 'Muse').length;

  // 3. 过滤条件
  const agentFilter = state.filters.agent;
  const kw = state.filters.keyword.trim().toLowerCase();
  const readFilter = state.filters.readStatus;

  // 过滤活跃日期的文章
  const filteredItems = activeItems.filter(item => {
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
    // 3. 阅读与候选状态过滤
    if (readFilter === 'unread' && item.isRead) return false;
    if (readFilter === 'read' && !item.isRead) return false;
    if (readFilter === 'candidate' && !item.isCandidate) return false;
    return true;
  });

  // 4. 更新当前日期状态与数量指示 (如: 10月11日 · 周日 | 已收录5篇 · 以下展示2篇 | 0 / 2 已读)
  const dateDisplay = document.getElementById('active-date-display');
  if (dateDisplay) {
    dateDisplay.textContent = formatDateWithWeekday(activeDate);
  }

  const countDisplay = document.getElementById('active-date-count');
  if (countDisplay) {
    if (filteredItems.length < activeTotal) {
      countDisplay.textContent = `已收录${activeTotal}篇 · 以下展示${filteredItems.length}篇`;
    } else {
      countDisplay.textContent = `已收录${activeTotal}篇 · 以下展示${activeTotal}篇`;
    }
  }

  // 渲染平台覆盖分布 pills
  const coverageContainer = document.getElementById('active-date-coverage');
  if (coverageContainer) {
    if (activeRecord && activeRecord.coverage) {
      if (typeof activeRecord.coverage === 'object' && !Array.isArray(activeRecord.coverage)) {
        coverageContainer.innerHTML = Object.entries(activeRecord.coverage).map(([plat, cnt]) => {
          let label = '';
          let titleAttr = '';
          if (typeof cnt === 'object' && cnt !== null) {
            const target = cnt.target;
            const collected = cnt.collected ?? target;
            const isShort = target !== undefined && collected !== undefined && collected < target;
            label = isShort ? `${collected}/${target}` : `${collected}`;
            if (cnt.reason) {
              titleAttr = ` title="${escapeHtml(cnt.reason)}"`;
              if (isShort) label += ' ℹ️';
            }
          } else {
            label = escapeHtml(String(cnt));
          }
          return `<span class="coverage-pill"${titleAttr}>${escapeHtml(plat)} ${label}</span>`;
        }).join('');
        coverageContainer.style.display = 'flex';
      } else if (typeof activeRecord.coverage === 'string') {
        coverageContainer.innerHTML = `<span class="coverage-pill">${escapeHtml(activeRecord.coverage)}</span>`;
        coverageContainer.style.display = 'flex';
      } else {
        coverageContainer.style.display = 'none';
        coverageContainer.innerHTML = '';
      }
    } else {
      coverageContainer.style.display = 'none';
      coverageContainer.innerHTML = '';
    }
  }

  // 渲染今日候选选题数量与快速筛选胶囊
  const candidateCount = activeItems.filter(i => i.isCandidate).length;
  const candidateIndicator = document.getElementById('active-date-candidate-indicator');
  if (candidateIndicator) {
    if (candidateCount > 0) {
      const isFilteringCandidate = state.filters.readStatus === 'candidate';
      candidateIndicator.innerHTML = `
        <button class="candidate-summary-pill ${isFilteringCandidate ? 'active' : ''}" id="btn-quick-filter-candidate" type="button" title="${isFilteringCandidate ? '点击查看全部条目' : '点击只看今日候选条目'}">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
          </svg>
          <span>候选 ${candidateCount} 篇</span>
        </button>
      `;
      candidateIndicator.style.display = 'inline-flex';
    } else {
      candidateIndicator.style.display = 'none';
      candidateIndicator.innerHTML = '';
    }
  }

  const readDisplay = document.getElementById('active-date-read-status');
  if (readDisplay) {
    const filteredRead = filteredItems.filter(i => i.isRead).length;
    readDisplay.textContent = `${filteredRead} / ${filteredItems.length} 已读`;
  }

  // 更新右上角 1-10 刻度条状认知看板 (Daily 10 Segment Meter)
  const totalDayItems = activeRecord ? (activeRecord.items || []).length : 10;
  const readDayItems = activeRecord ? (activeRecord.items || []).filter(i => i.isRead).length : 0;
  const remaining = Math.max(0, totalDayItems - readDayItems);

  const dpStats = document.getElementById('dp-progress-stats');
  if (dpStats) {
    dpStats.textContent = `${readDayItems} / ${totalDayItems}`;
  }

  // 点亮 1 到 10 刻度块（按实际篇数自适应）
  const segBar = document.getElementById('dp-segment-bar');
  if (segBar) {
    const segs = segBar.querySelectorAll('.seg-item');
    segs.forEach((seg, idx) => {
      if (idx < totalDayItems) {
        seg.style.display = '';
        if (idx < readDayItems) {
          seg.classList.add('active');
        } else {
          seg.classList.remove('active');
        }
      } else {
        seg.style.display = 'none';
      }
    });
  }

  const dpRemaining = document.getElementById('dp-progress-remaining');
  const dpMilestone = document.getElementById('dp-milestone-banner');
  if (totalDayItems > 0 && readDayItems === totalDayItems) {
    if (dpRemaining) dpRemaining.style.display = 'none';
    if (dpMilestone) dpMilestone.style.display = 'inline';
  } else {
    if (dpRemaining) {
      dpRemaining.style.display = 'inline';
      dpRemaining.textContent = remaining > 0 ? `剩余 ${remaining} 篇` : '已读完';
    }
    if (dpMilestone) dpMilestone.style.display = 'none';
  }

  // 5. 更新顶部 Agent 切换栏数字
  const countAll = document.getElementById('count-all');
  if (countAll) countAll.textContent = activeTotal;
  const countWb = document.getElementById('count-wb');
  if (countWb) countWb.textContent = wbTotal;
  const countMuse = document.getElementById('count-muse');
  if (countMuse) countMuse.textContent = museTotal;

  // 6. 渲染纵向单列阅读流
  let html = '';
  if (filteredItems.length === 0) {
    html += `
      <div style="padding: 48px 0; text-align: center; color: var(--text-secondary);">
        <p>未找到符合筛选条件的内容</p>
      </div>
    `;
  } else {
    html += filteredItems.map(item => renderArticleItem(item, activeDate)).join('');
  }

  container.innerHTML = html;
  bindTimelineEvents();
}

// 渲染单篇侦察记录卡片（单列阅读流，默认折叠纯净摘要，支持候选高亮与按需展开完整三问）
function renderArticleItem(item, date) {
  const isRead = !!item.isRead;
  const isCandidate = !!item.isCandidate;
  const isExpanded = state.expandedItemIds.has(item.id);

  // 1. 顶部互动数据解析：支持 likes/favorites/score 或从 engagement 字符串解析
  let likes = item.likes;
  let favorites = item.favorites;
  let score = item.score;
  if ((likes === undefined || likes === null) && item.engagement) {
    const matchLike = item.engagement.match(/赞\s*(\d+)/);
    const matchFav = item.engagement.match(/藏\s*(\d+)/);
    if (matchLike) likes = parseInt(matchLike[1], 10);
    if (matchFav) favorites = parseInt(matchFav[1], 10);
  }
  if ((score === undefined || score === null) && item.engagement) {
    const matchScore = item.engagement.match(/(?:得分|Score)\s*(\d+)/i);
    if (matchScore) score = parseInt(matchScore[1], 10);
  }

  let engagementHtml = '';
  if (score !== undefined && score !== null) {
    engagementHtml += `
      <span class="meta-stat-pill stat-score" title="Reddit 得分 / Upvotes">
        <svg class="stat-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="18 15 12 9 6 15"></polyline>
        </svg>
        <span>Score ${score}</span>
      </span>
    `;
  }
  if (likes !== undefined && likes !== null) {
    engagementHtml += `
      <span class="meta-stat-pill" title="点赞数">
        <svg class="stat-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
        <span>${likes}</span>
      </span>
    `;
  }
  if (favorites !== undefined && favorites !== null) {
    engagementHtml += `
      <span class="meta-stat-pill" title="收藏数">
        <svg class="stat-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>
        <span>${favorites}</span>
      </span>
    `;
  }
  if (!engagementHtml && item.engagement) {
    engagementHtml = `<span class="meta-stat-text">${escapeHtml(item.engagement)}</span>`;
  }

  // 2. 观众问题渲染逻辑（未核实时清晰标识，有真实问题时以点列出）
  let audienceQuestionsHtml = '';
  if (item.comments_checked === false || item.comments_checked === undefined || item.comments_checked === null) {
    audienceQuestionsHtml = `
      <div class="audience-section-card">
        <div class="audience-title">观众真实问题</div>
        <div class="meta-note-text">未核实评论区问题</div>
      </div>
    `;
  } else {
    const questions = Array.isArray(item.audience_questions) ? item.audience_questions : [];
    if (questions.length > 0) {
      audienceQuestionsHtml = `
        <div class="audience-section-card">
          <div class="audience-title">观众真实问题</div>
          <ul class="audience-questions-list">
            ${questions.map(q => `<li><span class="question-bullet">•</span> <span>${escapeHtml(q)}</span></li>`).join('')}
          </ul>
        </div>
      `;
    } else {
      audienceQuestionsHtml = `
        <div class="audience-section-card">
          <div class="audience-title">观众真实问题</div>
          <div class="meta-note-text">暂无记录的问题</div>
        </div>
      `;
    }
  }

  // 3. 完整分析三问严格固定顺序：
  // ① 发现：为什么最近值得关注？ (无则显示“尚未分析”，不可擅自编造)
  const discoveryContent = (item.discovery_reason && item.discovery_reason.trim())
    ? escapeHtml(item.discovery_reason)
    : '<span class="empty-note-text">尚未分析</span>';

  // ② 理解：这篇内容究竟在讲什么？ (summary)
  const summaryContent = (item.summary && item.summary.trim())
    ? escapeHtml(item.summary)
    : '<span class="empty-note-text">暂无内容简介</span>';

  // ③ 价值：对读者到底有什么帮助？ (reader_value)
  const valueContent = (item.reader_value && item.reader_value.trim())
    ? escapeHtml(item.reader_value)
    : '<span class="empty-note-text">尚未分析</span>';

  // 个人备考笔记展示
  let personalNoteHtml = '';
  if (item.note && item.note.trim()) {
    personalNoteHtml = `
      <div class="personal-note-section">
        <div class="personal-note-header">
          <span class="personal-note-label">📝 我的备考笔记</span>
          <button class="btn-note-edit" data-id="${item.id}" data-date="${date}" type="button">编辑笔记</button>
        </div>
        <div class="personal-note-body">${escapeHtml(item.note)}</div>
      </div>
    `;
  }

  return `
    <article class="article-item ${isRead ? 'is-read' : ''} ${isCandidate ? 'is-candidate' : ''} ${isExpanded ? 'is-expanded' : ''}" id="article-${item.id}">
      <!-- 顶部辅助信息：平台 · 日期 与 候选微标 与 互动数据 -->
      <div class="article-header-row">
        <div class="article-meta-left">
          <span>${escapeHtml(item.platform || '社媒')} · ${formatMetaDate(item.publishDate)}</span>
          ${isCandidate ? `
            <span class="candidate-tag-badge" title="当前已选为今日重点候选选题">
              <svg class="candidate-star-svg" width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
              </svg>
              <span>今日候选</span>
            </span>
          ` : ''}
        </div>
        <div class="article-meta-right">
          ${engagementHtml}
        </div>
      </div>

      <!-- 标题 -->
      <h2 class="article-title">
        <a href="${item.url || '#'}" target="_blank" rel="noopener noreferrer" class="article-title-link">
          ${escapeHtml(item.title)}
        </a>
      </h2>

      <!-- 折叠状态纯净内容摘要 (严格不出现 ②理解 等编号) -->
      <div class="article-collapsed-summary">
        ${summaryContent}
      </div>

      <!-- 展开的完整分析与观众问题 (按 ①发现 → ②理解 → ③价值 固定顺序) -->
      <div class="article-details-expanded" id="details-${item.id}">
        <div class="article-divider"></div>

        <!-- ① 发现：为什么最近值得关注？ -->
        <div class="analysis-section">
          <div class="section-label">① 发现 · 为什么值得关注？</div>
          <div class="section-body">${discoveryContent}</div>
        </div>

        <!-- ② 理解：这篇内容究竟在讲什么？ -->
        <div class="analysis-section">
          <div class="section-label">② 理解 · 内容讲什么？</div>
          <div class="section-body">${summaryContent}</div>
        </div>

        <!-- ③ 价值：对读者到底有什么帮助？ -->
        <div class="analysis-section">
          <div class="section-label">③ 价值 · 对读者有什么帮助？</div>
          <div class="section-body">${valueContent}</div>
        </div>

        <!-- 观众真实问题 -->
        ${audienceQuestionsHtml}

        <!-- 个人备考笔记（如有） -->
        ${personalNoteHtml}
      </div>

      <div class="article-divider"></div>

      <!-- 底部操作栏 -->
      <div class="article-footer-row">
        <div class="footer-left">
          <button class="btn-toggle-expand" data-id="${item.id}" type="button">
            ${isExpanded ? '收起详情' : '展开完整分析'}
          </button>
        </div>

        <div class="footer-right">
          <!-- 候选按钮 -->
          <button class="btn-pill btn-pill-candidate ${isCandidate ? 'is-candidate' : ''}" data-id="${item.id}" data-date="${date}" type="button" title="${isCandidate ? '点击取消候选状态' : '设为今日重点候选选题'}">
            <svg class="btn-star-icon" width="13" height="13" viewBox="0 0 24 24" fill="${isCandidate ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
            </svg>
            <span>候选</span>
          </button>

          <!-- 标为已读/未读切换按钮 -->
          <button class="btn-pill btn-pill-read ${isRead ? 'is-read' : ''}" data-id="${item.id}" data-date="${date}" type="button" title="切换阅读状态">
            <span class="read-dot">${isRead ? '●' : '○'}</span>
            <span>${isRead ? '已读' : '标为已读'}</span>
          </button>

          ${item.url ? `
            <a href="${item.url}" target="_blank" rel="noopener noreferrer" class="btn-pill btn-pill-link">
              原文 <span class="arrow-icon">↗</span>
            </a>
          ` : '<span style="font-size:12px; color:var(--text-muted);">无链接</span>'}

          <div class="dropdown-wrapper">
            <button class="btn-pill btn-pill-more" data-id="${item.id}" type="button" title="更多操作">···</button>
            <div class="dropdown-menu-card" id="menu-${item.id}">
              <button class="dropdown-item-btn btn-item-toggle-candidate" data-id="${item.id}" data-date="${date}">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="${isCandidate ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                ${isCandidate ? '取消候选' : '标记为候选'}
              </button>
              <button class="dropdown-item-btn btn-item-note" data-id="${item.id}" data-date="${date}">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                ${item.note ? '修改笔记' : '添加笔记'}
              </button>
              <button class="dropdown-item-btn btn-item-edit" data-id="${item.id}" data-date="${date}">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                编辑
              </button>
              <button class="dropdown-item-btn danger btn-item-delete" data-id="${item.id}" data-date="${date}">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                删除
              </button>
            </div>
          </div>
        </div>
      </div>
    </article>
  `;
}

function toggleArticleExpand(id) {
  const articleEl = document.getElementById(`article-${id}`);
  if (!articleEl) return;
  const toggleBtn = articleEl.querySelector('.btn-toggle-expand');

  if (state.expandedItemIds.has(id)) {
    state.expandedItemIds.delete(id);
    articleEl.classList.remove('is-expanded');
    if (toggleBtn) {
      toggleBtn.textContent = '展开完整分析';
    }
  } else {
    state.expandedItemIds.add(id);
    articleEl.classList.add('is-expanded');
    if (toggleBtn) {
      toggleBtn.textContent = '收起详情';
    }
  }
}

function bindTimelineEvents() {
  // 日期药丸胶囊切换
  document.querySelectorAll('.date-nav-pill').forEach(btn => {
    btn.onclick = () => {
      const targetDate = btn.dataset.date;
      if (targetDate && state.selectedDate !== targetDate) {
        state.selectedDate = targetDate;
        renderTimeline();
      }
    };
  });

  // 日历图标触发日期选择
  const datePickerBtn = document.getElementById('btn-date-picker-trigger');
  const datePickerInput = document.getElementById('calendar-date-input');
  if (datePickerBtn && datePickerInput) {
    datePickerBtn.onclick = () => {
      if (datePickerInput.showPicker) {
        datePickerInput.showPicker();
      } else {
        datePickerInput.focus();
        datePickerInput.click();
      }
    };

    datePickerInput.onchange = (e) => {
      const chosen = e.target.value;
      if (!chosen) return;
      const exists = state.data.dailyRecords.some(r => r.date === chosen);
      if (exists) {
        state.selectedDate = chosen;
        renderTimeline();
      } else {
        showToast(`暂无 ${chosen} 的侦察记录，可通过右上角导入`, 'info');
      }
    };
  }

  // Agent 筛选切换
  document.querySelectorAll('.agent-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.agent === state.filters.agent);
    btn.onclick = () => {
      state.filters.agent = btn.dataset.agent;
      renderTimeline();
    };
  });

  // 展开/收起详情交互
  document.querySelectorAll('.btn-toggle-expand').forEach(btn => {
    btn.onclick = (e) => {
      e.preventDefault();
      const id = btn.dataset.id;
      toggleArticleExpand(id);
    };
  });

  // 标为已读/未读切换
  document.querySelectorAll('.btn-pill-read').forEach(btn => {
    btn.onclick = (e) => {
      e.preventDefault();
      const id = btn.dataset.id;
      const date = btn.dataset.date;
      toggleItemRead(id, date);
    };
  });

  // 设为/取消候选切换
  document.querySelectorAll('.btn-pill-candidate').forEach(btn => {
    btn.onclick = (e) => {
      e.preventDefault();
      const id = btn.dataset.id;
      const date = btn.dataset.date;
      toggleItemCandidate(id, date);
    };
  });

  // 更多菜单中的候选切换
  document.querySelectorAll('.btn-item-toggle-candidate').forEach(btn => {
    btn.onclick = (e) => {
      e.preventDefault();
      const id = btn.dataset.id;
      const date = btn.dataset.date;
      toggleItemCandidate(id, date);
    };
  });

  // 顶部候选快速筛选胶囊
  const quickCandidateBtn = document.getElementById('btn-quick-filter-candidate');
  if (quickCandidateBtn) {
    quickCandidateBtn.onclick = (e) => {
      e.preventDefault();
      const nextFilter = state.filters.readStatus === 'candidate' ? 'all' : 'candidate';
      state.filters.readStatus = nextFilter;
      const selectEl = document.getElementById('filter-read-status');
      if (selectEl) selectEl.value = nextFilter;
      renderTimeline();
    };
  }

  // 更多菜单下拉触发
  document.querySelectorAll('.btn-pill-more').forEach(btn => {
    btn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const id = btn.dataset.id;
      const menu = document.getElementById(`menu-${id}`);
      // 关闭其他已打开的菜单
      document.querySelectorAll('.dropdown-menu-card.active').forEach(m => {
        if (m !== menu) m.classList.remove('active');
      });
      if (menu) {
        menu.classList.toggle('active');
      }
    };
  });

  // 编辑单条
  document.querySelectorAll('.btn-item-edit').forEach(btn => {
    btn.onclick = (e) => {
      e.preventDefault();
      const id = btn.dataset.id;
      const date = btn.dataset.date;
      const day = state.data.dailyRecords.find(d => d.date === date);
      const item = day?.items?.find(i => i.id === id);
      if (item) openItemEditModal(item, date);
    };
  });

  // 个人备考笔记快捷入口
  document.querySelectorAll('.btn-item-note, .btn-note-edit').forEach(btn => {
    btn.onclick = (e) => {
      e.preventDefault();
      const id = btn.dataset.id;
      const date = btn.dataset.date;
      const day = state.data.dailyRecords.find(d => d.date === date);
      const item = day?.items?.find(i => i.id === id);
      if (item) {
        openItemEditModal(item, date);
        setTimeout(() => {
          document.getElementById('edit-item-note')?.focus();
        }, 120);
      }
    };
  });

  // 删除单条
  document.querySelectorAll('.btn-item-delete').forEach(btn => {
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

function toggleItemCandidate(id, date) {
  const day = state.data.dailyRecords.find(d => d.date === date);
  const item = day?.items?.find(i => i.id === id);
  if (item) {
    item.isCandidate = !item.isCandidate;
    persistData(null);
    showToast(item.isCandidate ? '⭐ 已标为候选' : '已取消候选', item.isCandidate ? 'success' : 'info');
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
  const hasOverview = Boolean(selectedVer?.overview && typeof selectedVer.overview === 'object' && !Array.isArray(selectedVer.overview));

  let html = `
    <div class="prompts-manager-layout${hasOverview ? ' prompts-manager-layout--visual' : ''}">
      <!-- 左侧：版本列表 -->
      <aside class="prompts-sidebar">
        <div class="prompts-agent-switch">
          <button class="p-switch-btn ${currentAgent === 'workbuddy' ? 'active' : ''}" data-agent="workbuddy">
            WorkBuddy (每日全平台)
          </button>
          <button class="p-switch-btn ${currentAgent === 'muse' ? 'active' : ''}" data-agent="muse">
            Muse (海外专题)
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
      <main class="prompts-detail-pane${hasOverview ? ' prompts-detail-pane--visual' : ''}">
        ${selectedVer ? `
          ${hasOverview ? renderV22Overview(selectedVer, latestVer?.version === selectedVer.version, escapeHtml, currentAgent === 'workbuddy' ? 'WorkBuddy' : 'Muse') : `
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

          `}

          <!-- 版本差异比较 (二级功能，默认折叠) -->
          <details class="diff-collapsible" id="diff-collapsible-wrapper">
            <summary class="diff-summary">版本差异比较 ▾</summary>
            <div class="diff-collapsible-body">
              <div class="diff-selector-row">
                <span>基准版本：</span>
                <select id="diff-select-a" class="minimal-select">
                  ${promptList.map((p, i) => `<option value="${p.version}" ${(hasOverview ? p.version === 'V2.0' : i === 0) ? 'selected' : ''}>${p.version}</option>`).join('')}
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
  const targetDateInput = document.getElementById('import-date-input').value;

  const parsed = Parser.parse(rawText, selectedAgent, targetDateInput);
  if (parsed.items.length === 0) {
    showToast('未能识别出有效文章条目，请检查格式', 'error');
    return;
  }

  // 归档日期：以 parsed.date 为准 (支持 report_date 自动归档)
  const archiveDate = parsed.date;
  const existingDay = state.data.dailyRecords?.find(d => d.date === archiveDate);
  const existingItems = existingDay?.items || [];

  parsed.items.forEach(newItem => {
    newItem.stableId = newItem.stableId || Parser.extractStableContentId(newItem.platform, newItem.url, newItem.title);
    const matched = Parser.matchExistingItem(newItem, existingItems);
    if (matched) {
      newItem.matchedExisting = matched;
      newItem.isExisting = true;
      const diffRes = Parser.computeItemDiff(matched, newItem);
      newItem.hasDiff = diffRes.hasChanges;
      newItem.diffs = diffRes.diffs;
      // 发现差异默认勾选更新；完全相同则默认跳过
      newItem.userAction = newItem.hasDiff ? 'update' : 'skip';
    } else {
      newItem.matchedExisting = null;
      newItem.isExisting = false;
      newItem.hasDiff = false;
      newItem.diffs = [];
      newItem.userAction = 'create';
    }
  });

  const agentKey = parsed.agent.toLowerCase() === 'muse' ? 'muse' : 'workbuddy';
  const promptList = state.data.promptRegistry[agentKey] || [];
  let detectedPrompt = parsed.promptVersion;
  if (!detectedPrompt) {
    detectedPrompt = promptList.length > 0 ? promptList[promptList.length - 1].version : 'V1.0';
  }

  state.importPreview = {
    ...parsed,
    date: archiveDate,
    rawText,
    promptVersion: detectedPrompt
  };

  renderImportPreview();
}

function renderImportPreview() {
  const container = document.getElementById('import-preview-list');
  const previewSection = document.getElementById('import-preview-section');
  if (!container || !state.importPreview) return;

  const { agent, date, items, promptVersion, coverage } = state.importPreview;

  const newCount = items.filter(i => !i.isExisting).length;
  const diffCount = items.filter(i => i.isExisting && i.hasDiff).length;
  const identicalCount = items.filter(i => i.isExisting && !i.hasDiff).length;

  document.getElementById('preview-meta-agent').textContent = agent;
  document.getElementById('preview-meta-date').textContent = date;

  let countText = `${items.length} 篇`;
  const statBadges = [];
  if (newCount > 0) statBadges.push(`✨ 新增 ${newCount}`);
  if (diffCount > 0) statBadges.push(`⚠️ 差异待确认 ${diffCount}`);
  if (identicalCount > 0) statBadges.push(`✓ 已有无变化 ${identicalCount}`);
  if (statBadges.length > 0) {
    countText += ` (${statBadges.join(' · ')})`;
  }
  document.getElementById('preview-meta-count').textContent = countText;

  // 顶层 Coverage 处理
  const coverageWrap = document.getElementById('preview-meta-coverage-wrap');
  const coverageEl = document.getElementById('preview-meta-coverage');
  if (coverageWrap && coverageEl) {
    if (coverage) {
      if (typeof coverage === 'object' && !Array.isArray(coverage)) {
        coverageEl.innerHTML = Object.entries(coverage).map(([k, v]) => {
          if (typeof v === 'object' && v !== null) {
            const target = v.target;
            const collected = v.collected ?? target;
            const isShort = target !== undefined && collected !== undefined && collected < target;
            const text = isShort ? `${collected}/${target}` : `${collected}`;
            const title = v.reason ? ` title="${escapeHtml(v.reason)}"` : '';
            return `<span${title}>${escapeHtml(k)} ${text}${v.reason ? ' ℹ️' : ''}</span>`;
          }
          return `${escapeHtml(k)} ${escapeHtml(String(v))}`;
        }).join(' · ');
      } else {
        coverageEl.textContent = String(coverage);
      }
      coverageWrap.style.display = 'inline';
    } else {
      coverageWrap.style.display = 'none';
    }
  }

  // 关联提示词下拉列表
  const promptSelect = document.getElementById('preview-prompt-version');
  const agentKey = agent.toLowerCase() === 'muse' ? 'muse' : 'workbuddy';
  const promptList = state.data.promptRegistry[agentKey] || [];
  const existsInList = promptList.some(p => p.version === promptVersion);
  let optionsHtml = promptList.map(p => `
    <option value="${p.version}" ${p.version === promptVersion ? 'selected' : ''}>
      ${p.version} (${p.reason || '无说明'})
    </option>
  `).join('');
  if (!existsInList && promptVersion) {
    optionsHtml = `<option value="${promptVersion}" selected>${promptVersion} (解析自JSON)</option>` + optionsHtml;
  }
  promptSelect.innerHTML = optionsHtml;

  container.innerHTML = items.map((item, idx) => {
    let cardClass = 'preview-item-card';
    let badgeHtml = '';
    let diffSummaryHtml = '';
    let actionToggleHtml = '';
    let safeBannerHtml = '';

    if (item.isExisting) {
      if (item.hasDiff) {
        cardClass += ' is-diff-update';
        badgeHtml = `<span class="preview-badge badge-warning">⚠️ 已收录 · 发现差异</span>`;
        safeBannerHtml = `
          <div class="preview-safe-banner">
            <span class="safe-icon">🛡️</span>
            <span>已开启安全保护：更新后<strong>保留已有阅读状态 [${item.matchedExisting.isRead ? '已读' : '未读'}]</strong> 与<strong>已有个人备考笔记</strong>，绝不重复新增。</span>
          </div>
        `;
        actionToggleHtml = `
          <label class="diff-confirm-toggle">
            <input type="checkbox" class="preview-item-action-checkbox" data-index="${idx}" ${item.userAction === 'update' ? 'checked' : ''}>
            <span><strong>确认更新此已有记录</strong>（将新指标与内容合入已有条目，保留阅读状态与笔记）</span>
          </label>
        `;

        diffSummaryHtml = `
          <div class="diff-summary-card">
            <div class="diff-summary-title">发现以下字段变动（原有数据 vs 本次导入）：</div>
            <div class="diff-fields-table">
              ${item.diffs.map(d => `
                <div class="diff-field-row">
                  <div class="diff-field-name">${escapeHtml(d.label)}</div>
                  <div class="diff-field-old"><span class="diff-tag old-tag">原记录</span> ${escapeHtml(String(d.oldVal))}</div>
                  <div class="diff-field-new"><span class="diff-tag new-tag">新数据</span> ${escapeHtml(String(d.newVal))}</div>
                </div>
              `).join('')}
            </div>
          </div>
        `;
      } else {
        cardClass += ' is-identical';
        badgeHtml = `<span class="preview-badge badge-success">✓ 已收录 · 内容无变化</span>`;
        safeBannerHtml = `
          <div class="preview-safe-banner" style="background-color:rgba(16, 185, 129, 0.05); border-color:rgba(16, 185, 129, 0.15);">
            <span>库中已有完全一致的记录，默认跳过，保留原有阅读状态与笔记。</span>
          </div>
        `;
        actionToggleHtml = `
          <label class="diff-confirm-toggle">
            <input type="checkbox" class="preview-item-action-checkbox" data-index="${idx}" ${item.userAction === 'update' ? 'checked' : ''}>
            <span>覆盖更新此条</span>
          </label>
        `;
      }
    } else {
      badgeHtml = `<span class="preview-badge badge-primary">✨ 全新收录</span>`;
    }

    return `
      <div class="${cardClass}" data-index="${idx}">
        <div class="preview-card-header">
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-weight:600; font-size:13px;">第 ${idx + 1} 篇</span>
            ${badgeHtml}
            <span style="font-size:11px; color:var(--text-muted); font-family:var(--font-mono);">[ID: ${escapeHtml(item.stableId)}]</span>
          </div>
          <button type="button" class="btn-tool btn-remove-preview" data-index="${idx}">✕ 移除</button>
        </div>

        ${safeBannerHtml}
        ${diffSummaryHtml}
        ${actionToggleHtml}

        <div class="preview-card-grid">
          <input type="text" class="input-field preview-title" value="${escapeHtml(item.title)}" placeholder="标题" data-index="${idx}">
          <input type="text" class="input-field preview-platform" value="${escapeHtml(item.platform)}" placeholder="平台" data-index="${idx}">
          <input type="text" class="input-field preview-date" value="${escapeHtml(item.publishDate)}" placeholder="发布日期" data-index="${idx}">
        </div>

        <textarea class="input-field preview-summary" rows="2" placeholder="内容简介（② 理解）" data-index="${idx}">${escapeHtml(item.summary)}</textarea>
        
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:6px;">
          <input type="text" class="input-field preview-discovery" value="${escapeHtml(item.discovery_reason || '')}" placeholder="① 发现原因（为什么值得关注）" data-index="${idx}">
          <input type="text" class="input-field preview-reader-value" value="${escapeHtml(item.reader_value || '')}" placeholder="③ 读者价值（对读者有什么帮助）" data-index="${idx}">
        </div>

        <input type="text" class="input-field preview-url" value="${escapeHtml(item.url)}" placeholder="原文链接" data-index="${idx}">
      </div>
    `;
  }).join('');

  document.getElementById('import-step1').style.display = 'none';
  previewSection.style.display = 'block';

  // 绑定用户确认复选框
  container.querySelectorAll('.preview-item-action-checkbox').forEach(cb => {
    cb.onchange = (e) => {
      const idx = parseInt(cb.dataset.index, 10);
      if (state.importPreview.items[idx]) {
        state.importPreview.items[idx].userAction = e.target.checked ? 'update' : 'skip';
      }
    };
  });

  // 绑定字段就地修改
  container.querySelectorAll('.preview-title').forEach(el => {
    el.oninput = (e) => { state.importPreview.items[el.dataset.index].title = e.target.value; };
  });
  container.querySelectorAll('.preview-platform').forEach(el => {
    el.oninput = (e) => { state.importPreview.items[el.dataset.index].platform = e.target.value; };
  });
  container.querySelectorAll('.preview-date').forEach(el => {
    el.oninput = (e) => { state.importPreview.items[el.dataset.index].publishDate = e.target.value; };
  });
  container.querySelectorAll('.preview-summary').forEach(el => {
    el.oninput = (e) => { state.importPreview.items[el.dataset.index].summary = e.target.value; };
  });
  container.querySelectorAll('.preview-discovery').forEach(el => {
    el.oninput = (e) => { state.importPreview.items[el.dataset.index].discovery_reason = e.target.value; };
  });
  container.querySelectorAll('.preview-reader-value').forEach(el => {
    el.oninput = (e) => { state.importPreview.items[el.dataset.index].reader_value = e.target.value; };
  });
  container.querySelectorAll('.preview-url').forEach(el => {
    el.oninput = (e) => { state.importPreview.items[el.dataset.index].url = e.target.value; };
  });

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

  const { agent, date, items, rawText, coverage } = state.importPreview;
  const promptVersion = document.getElementById('preview-prompt-version').value;

  let dayRecord = state.data.dailyRecords.find(d => d.date === date);
  if (!dayRecord) {
    dayRecord = {
      date: date,
      promptVersionWorkBuddy: agent === 'WorkBuddy' ? promptVersion : null,
      promptVersionMuse: agent === 'Muse' ? promptVersion : null,
      coverage: coverage || null,
      items: []
    };
    state.data.dailyRecords.unshift(dayRecord);
  } else {
    if (agent === 'WorkBuddy') dayRecord.promptVersionWorkBuddy = promptVersion;
    if (agent === 'Muse') dayRecord.promptVersionMuse = promptVersion;
    if (coverage) dayRecord.coverage = coverage;
  }

  dayRecord.localEditedAt = new Date().toISOString();

  let addedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;

  items.forEach(item => {
    if (item.isExisting && item.matchedExisting) {
      if (item.userAction === 'update') {
        const target = item.matchedExisting;
        target.localEditedAt = new Date().toISOString();
        target.title = item.title;
        target.platform = item.platform;
        if (item.author !== undefined) target.author = item.author;
        target.publishDate = item.publishDate;
        target.likes = item.likes;
        target.favorites = item.favorites;
        target.score = item.score;
        target.engagement = item.engagement;
        target.discovery_reason = item.discovery_reason;
        target.summary = item.summary;
        target.reader_value = item.reader_value;
        target.comments_checked = item.comments_checked;
        target.audience_questions = item.audience_questions;
        target.url = item.url;
        target.stableId = item.stableId || target.stableId;
        // 关键保护：绝不覆盖已有的 isRead 和 note！
        // target.isRead 保持不变
        // target.note 保持不变
        updatedCount++;
      } else {
        skippedCount++;
      }
    } else {
      // 全新条目
      const newItem = {
        id: item.id || `item_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        localEditedAt: new Date().toISOString(),
        stableId: item.stableId,
        agent: item.agent,
        title: item.title,
        author: item.author,
        platform: item.platform,
        publishDate: item.publishDate,
        likes: item.likes,
        favorites: item.favorites,
        score: item.score,
        engagement: item.engagement,
        discovery_reason: item.discovery_reason,
        summary: item.summary,
        reader_value: item.reader_value,
        comments_checked: item.comments_checked,
        audience_questions: item.audience_questions,
        url: item.url,
        isRead: false,
        note: ''
      };
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

  // 导入后自动将视图切换至当前归档日期
  state.selectedDate = date;

  let toastMsg = `成功归档至 ${date}`;
  const parts = [];
  if (addedCount > 0) parts.push(`新增 ${addedCount} 篇`);
  if (updatedCount > 0) parts.push(`更新 ${updatedCount} 篇`);
  if (skippedCount > 0) parts.push(`跳过 ${skippedCount} 篇`);
  if (parts.length > 0) toastMsg += `（${parts.join('，')}，已严格保留已有阅读状态及笔记）`;

  await persistData(toastMsg);
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
  const discoveryEl = document.getElementById('edit-item-discovery-reason');
  if (discoveryEl) discoveryEl.value = isEditing ? (item.discovery_reason || '') : '';
  document.getElementById('edit-item-summary').value = isEditing ? item.summary : '';
  document.getElementById('edit-item-reader-value').value = isEditing ? (item.reader_value || '') : '';
  const noteEl = document.getElementById('edit-item-note');
  if (noteEl) noteEl.value = isEditing ? (item.note || '') : '';
  const candidateEl = document.getElementById('edit-item-is-candidate');
  if (candidateEl) candidateEl.checked = !!(isEditing && item.isCandidate);

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
  const discoveryEl = document.getElementById('edit-item-discovery-reason');
  const discovery_reason = discoveryEl ? (discoveryEl.value.trim() || null) : null;
  const summary = document.getElementById('edit-item-summary').value.trim() || '待确认';
  const reader_value = document.getElementById('edit-item-reader-value').value.trim();
  const noteEl = document.getElementById('edit-item-note');
  const note = noteEl ? noteEl.value.trim() : '';
  const isCandidate = document.getElementById('edit-item-is-candidate')?.checked || false;

  let dayRecord = state.data.dailyRecords.find(d => d.date === date);
  if (!dayRecord) {
    dayRecord = { date, items: [] };
    state.data.dailyRecords.unshift(dayRecord);
  }

  if (id) {
    const item = dayRecord.items.find(i => i.id === id);
    if (item) {
      item.localEditedAt = new Date().toISOString();
      item.agent = agent;
      item.title = title;
      item.platform = platform;
      item.publishDate = publishDate;
      item.engagement = engagement;
      item.url = url;
      item.discovery_reason = discovery_reason;
      item.summary = summary;
      item.reader_value = reader_value;
      item.note = note;
      item.isCandidate = isCandidate;
    }
  } else {
    dayRecord.items.push({
      id: `item_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      localEditedAt: new Date().toISOString(),
      agent,
      title,
      platform,
      publishDate,
      engagement,
      summary,
      reader_value,
      url,
      isRead: false,
      isCandidate: isCandidate,
      note: note
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
  state.data.goalsAndThoughts.localEditedAt = new Date().toISOString();
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

  await persistData('目标与想法已保存');
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

// 格式化单条侦察条目为富文本 Markdown（包含核心三问、真实问题与个人笔记）
function formatItemForMarkdown(item, idx) {
  let text = `**${idx + 1}. [${item.platform || '未知平台'}] ${item.title}** ${item.isCandidate ? '⭐ **【今日候选】** ' : ''}${item.isRead ? '✅ *(已读)*' : '⏳ *(待读)*'}\n`;
  text += `- **作者**: ${item.author || '未标注'} | **发布日期**: ${item.publishDate || '待确认'} | **数据**: ${item.engagement || (item.score !== null && item.score !== undefined ? `得分 ${item.score}` : '待确认')}\n`;
  if (item.discovery_reason) {
    text += `- **① 发现原因**: ${item.discovery_reason}\n`;
  }
  text += `- **② 内容理解**: ${item.summary || '无'}\n`;
  if (item.reader_value) {
    text += `- **③ 读者价值**: ${item.reader_value}\n`;
  }
  if (item.audience_questions && item.audience_questions.length > 0) {
    text += `- **💬 观众真实问题**: ${item.audience_questions.join('；')}\n`;
  }
  if (item.note && item.note.trim()) {
    text += `- **📝 个人笔记**: ${item.note.trim()}\n`;
  }
  text += `- **原文链接**: [点击阅读](${item.url || '#'})\n\n`;
  return text;
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
        md += `#### 🔴 WorkBuddy（小红书 / 抖音 / X / Reddit）\n\n`;
        wbItems.forEach((item, idx) => {
          md += formatItemForMarkdown(item, idx);
        });
      }

      if (museItems.length > 0) {
        md += `#### 🔵 Muse（海外专题）\n\n`;
        museItems.forEach((item, idx) => {
          md += formatItemForMarkdown(item, idx);
        });
      }

      if (otherItems.length > 0) {
        md += `#### ⚪ 其他来源\n\n`;
        otherItems.forEach((item, idx) => {
          md += formatItemForMarkdown(item, idx);
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
// 导出工作台核心引擎（支持日期筛选、仅候选条目与多格式生成）
// --------------------------------------------------------------------------
const customExportState = {
  date: '',
  scope: 'candidate', // 'candidate' | 'all'
  format: 'json'      // 'json' | 'ai' | 'md'
};

// 1. 生成定制精简 JSON（专为 AI 分析设计，剔除一切多余元数据与系统字段）
function generateCustomJsonExport(targetDate, onlyCandidates = true, isChineseKey = false) {
  const store = state.data;
  const day = (store.dailyRecords || []).find(r => r.date === targetDate);
  const dayItems = day ? (day.items || []) : [];
  const exportItems = onlyCandidates ? dayItems.filter(i => i.isCandidate) : dayItems;

  const result = exportItems.map(item => {
    if (isChineseKey) {
      const obj = {
        平台: item.platform || "未知",
        标题: item.title || "",
        作者: item.author || "未知作者",
        日期: item.publishDate || "待确认",
        赞: item.likes ?? 0,
        收藏: item.favorites ?? 0,
        链接: item.url || "",
        一句话摘要: item.summary || ""
      };
      if (item.note) {
        obj["写文角度"] = item.note;
      }
      return obj;
    }

    const obj = {
      platform: item.platform,
      title: item.title,
      author: item.author || null,
      published_at: item.publishDate || "待确认",
      likes: item.likes !== undefined ? item.likes : null,
      favorites: item.favorites !== undefined ? item.favorites : null,
      url: item.url,
      summary: item.summary || ""
    };
    if (item.note) {
      obj.note = item.note;
    }
    return obj;
  });

  return JSON.stringify(result, null, 2);
}

// 2. 一键生成与 AI 讨论选题与决策的专用 Prompt Dossier（支持仅候选筛选）
function generateAiTopicDiscussionPrompt(targetDate, onlyCandidates = false) {
  const store = state.data;
  const date = targetDate || state.activeTimelineDate || (store.dailyRecords && store.dailyRecords[0]?.date) || new Date().toISOString().slice(0, 10);
  const record = (store.dailyRecords || []).find(r => r.date === date);
  const rawItems = record ? (record.items || []) : [];
  const items = onlyCandidates ? rawItems.filter(i => i.isCandidate) : rawItems;

  let coverageText = '全平台';
  if (record && record.coverage) {
    if (typeof record.coverage === 'object' && !Array.isArray(record.coverage)) {
      coverageText = Object.entries(record.coverage).map(([k, v]) => {
        if (typeof v === 'object' && v !== null) {
          const col = v.collected ?? v.target;
          const note = (v.target && col !== v.target) ? `（目标${v.target}篇${v.reason ? `，因${v.reason}` : ''}）` : '篇';
          return `${k} ${col}${note.startsWith('篇') ? note : `篇${note}`}`;
        }
        return `${k} ${v}篇`;
      }).join(' · ');
    } else {
      coverageText = String(record.coverage);
    }
  }

  const candidateTag = onlyCandidates ? '【⭐ 我锁定的今日精选候选】' : '【全部侦察情报】';
  let text = `# 雅思见闻｜${date} ${candidateTag}（共 ${items.length} 篇）深度研讨\n\n`;
  text += `> **侦察日期**：${date}\n`;
  text += `> **筛选范围**：${onlyCandidates ? `仅精选候选（${items.length} 篇）` : `全量收录（${items.length} 篇）`}\n`;
  text += `> **平台分布**：${coverageText}\n`;
  text += `> **我的身份**：雅思备考者 兼 AI 内容创作者\n\n`;

  text += `## 🎯 讨论目标与需求\n`;
  if (onlyCandidates) {
    text += `你好！以下是我今天在「雅思见闻（IELTS Radar）」中经过研读后，**重点锁定的 ${items.length} 篇高价值候选选题**。\n`;
    text += `请结合每篇内容的【① 发现原因】、【② 核心理解】、【③ 读者价值】以及【观众真实提问】和【我的备考/写文笔记】，帮我展开以下 3 个维度的深度决策：\n\n`;
    text += `1. **【切入角度与差异化爆款钩子】**：针对这 ${items.length} 篇题目，如何避开同行套路，给出更有穿透力的第一句话和反直觉解法？\n`;
    text += `2. **【直击评论区真实痛点】**：如何精准回应读者在评论区提出的卡点，把内容打造成让人忍不住立刻收藏的硬核实操？\n`;
    text += `3. **【我的备考实战迁移】**：结合我自己的备考，这里面哪个技巧或方法是我今晚就可以立刻吸收并践行在日记里的？\n\n`;
  } else {
    text += `你好！以下是我今天通过「雅思见闻（IELTS Radar）」侦察系统筛选出的 ${items.length} 篇社媒内容。\n`;
    text += `请仔细分析每篇内容的【① 发现原因】、【② 内容理解】、【③ 读者价值】以及【观众真实提问】与【我的备考笔记】，协助我完成以下 3 个维度的讨论与选题决策：\n\n`;
    text += `1. **【今日选题精选（2~3个）】**：结合当前考生的真实痛点与社媒互动热度，帮我挑选出最值得做成原创深度图文/视频的 2~3 个选题方向，并说明推荐理由。\n`;
    text += `2. **【切入角度与差异化解法】**：针对选出的题目，如何避开同质化套路？如何直接切入评论区考生的真实困惑（如痛点追问），给出更有穿透力的实操解法？\n`;
    text += `3. **【备考自用干货沉淀】**：在这 ${items.length} 篇中，有哪些思维模型、解题框架或考场心法，是我作为考生今天可以立刻吸收并应用到自己备考中的？\n\n`;
  }

  text += `---\n\n`;
  text += `## 📋 情报清单详情\n\n`;

  if (items.length === 0) {
    text += `*（当前筛选条件下暂无条目，请确认是否已在卡片上点击「★ 候选」）*\n`;
  } else {
    items.forEach((item, index) => {
      text += `### ${index + 1}. 【${item.platform || '未知平台'}】${item.title}${item.isCandidate ? ' ⭐【重点候选】' : ''}\n`;
      text += `- **作者**: ${item.author || '未标注'} | **发布日期**: ${item.publishDate || '待确认'} | **数据**: ${item.engagement || (item.score !== null && item.score !== undefined ? `得分 ${item.score}` : '无')}\n`;
      text += `- **① 发现（为何关注）**: ${item.discovery_reason || '尚未分析'}\n`;
      text += `- **② 理解（内容概述）**: ${item.summary || '无'}\n`;
      text += `- **③ 价值（读者帮助）**: ${item.reader_value || '尚未分析'}\n`;
      
      if (item.audience_questions && item.audience_questions.length > 0) {
        text += `- **💬 观众真实问题（评论区痛点）**:\n`;
        item.audience_questions.forEach(q => {
          text += `  - ${q}\n`;
        });
      }

      if (item.note && item.note.trim()) {
        text += `- **📝 我的写文思考/备考笔记**: ${item.note.trim()}\n`;
      }

      text += `- **原文链接**: ${item.url || '无'}\n\n`;
    });
  }

  text += `---\n\n`;
  text += `请逐一展开深度分析，并输出实操框架。谢谢！\n`;

  return text;
}

// 3. 生成定制复盘 Markdown
function generateCustomMarkdownExport(targetDate, onlyCandidates = false) {
  const store = state.data;
  const date = targetDate || state.activeTimelineDate || (store.dailyRecords && store.dailyRecords[0]?.date) || new Date().toISOString().slice(0, 10);
  const record = (store.dailyRecords || []).find(r => r.date === date);
  const rawItems = record ? (record.items || []) : [];
  const items = onlyCandidates ? rawItems.filter(i => i.isCandidate) : rawItems;

  const nowStr = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  let md = `# 雅思见闻 · ${date} ${onlyCandidates ? '精选候选' : '全量复盘'}（共 ${items.length} 篇）\n\n`;
  md += `> 导出时间：${nowStr}\n`;
  md += `> 筛选范围：${onlyCandidates ? '⭐ 仅候选条目' : '📑 全部收录条目'}\n\n`;

  if (items.length === 0) {
    md += `*暂无匹配条目*\n\n`;
  } else {
    items.forEach((item, idx) => {
      md += formatItemForMarkdown(item, idx);
    });
  }
  return md;
}

// 完整备份与恢复：与按日精简导出分开，始终包含全站状态。
let selectedBackup = null;
let backupReadSequence = 0;
let restoreInProgress = false;

function downloadFullBackup(data = state.data, tag = 'full') {
  try {
    const backup = createBackup(data);
    const stamp = backup.exportedAt.replace(/[:.]/g, '-');
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json; charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ielts-radar-${tag}-backup-${stamp}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast(tag === 'before-restore' ? '已发起恢复前的安全副本下载，请保留文件' : '已发起完整备份下载，请保留文件', 'success');
    return true;
  } catch (error) {
    showToast(`无法生成完整备份：${error.message}`, 'error');
    return false;
  }
}

function renderBackupSummary() {
  const summary = storeSummary(state.data);
  const el = document.getElementById('backup-current-summary');
  if (el) el.textContent = `全部 ${summary.days} 天 · ${summary.items} 条内容 · ${summary.read} 条已读 · ${summary.candidates} 条候选 · ${summary.notes} 条手记 · ${summary.prompts} 个提示词版本，及目标与想法。`;
}

function closeBackupRestore() {
  if (restoreInProgress) return;
  document.getElementById('modal-backup-restore')?.classList.remove('active');
  backupReadSequence++;
  selectedBackup = null;
  document.getElementById('modal-ai-export')?.classList.add('active');
  document.getElementById('btn-open-backup-restore')?.focus();
}

function updateRestorePreview() {
  const previewEl = document.getElementById('backup-restore-preview');
  const errorEl = document.getElementById('backup-restore-error');
  const button = document.getElementById('btn-confirm-backup-restore');
  button.disabled = !selectedBackup;
  previewEl.hidden = !selectedBackup;
  errorEl.hidden = true;
  if (!selectedBackup) return;
  const preferBackup = document.getElementById('backup-conflict-policy').value === 'backup';
  const result = previewRestore(state.data, selectedBackup.data, preferBackup);
  const summary = storeSummary(selectedBackup.data);
  const dateText = selectedBackup.exportedAt ? new Date(selectedBackup.exportedAt).toLocaleString('zh-CN') : '旧版完整备份';
  previewEl.innerHTML = `
    <p class="backup-preview-title">${escapeHtml(selectedBackup.filename)}</p>
    <p>${escapeHtml(dateText)} · ${summary.start || '暂无日期'}${summary.end && summary.end !== summary.start ? ` 至 ${summary.end}` : ''}</p>
    <p>备份包含 ${summary.days} 天、${summary.items} 条内容，${summary.read} 条已读、${summary.candidates} 条候选、${summary.notes} 条手记。</p>
    <p><strong>将补回 ${result.addedDays} 个日期、${result.addedItems} 条内容。</strong>合并后共 ${result.after.days} 天、${result.after.items} 条。</p>
    <p>${preferBackup ? '同一条记录的内容、已读、候选、手记，以及同版本提示词和目标，将采用备份中的内容。' : '同一条记录的内容、已读、候选、手记，以及同版本提示词和目标，优先保留当前内容。'}</p>
    <p>双方独有的内容都会保留。清除浏览器数据后恢复时，可选择“以备份为准”找回备份中的个人标记。</p>`;
}

function initBackupEvents() {
  const modal = document.getElementById('modal-backup-restore');
  document.getElementById('btn-open-backup-restore')?.addEventListener('click', () => {
    selectedBackup = null;
    backupReadSequence++;
    document.getElementById('backup-restore-file').value = '';
    document.getElementById('backup-conflict-policy').value = 'current';
    updateRestorePreview();
    document.getElementById('modal-ai-export').classList.remove('active');
    modal.classList.add('active');
    document.getElementById('backup-restore-file').focus();
  });
  document.getElementById('btn-close-backup-restore')?.addEventListener('click', closeBackupRestore);
  document.getElementById('btn-cancel-backup-restore')?.addEventListener('click', closeBackupRestore);
  modal?.addEventListener('click', event => { if (event.target === modal) closeBackupRestore(); });
  modal?.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeBackupRestore();
    } else if (event.key === 'Tab') {
      const controls = [...modal.querySelectorAll('button, input, select')].filter(el => !el.disabled);
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  document.getElementById('backup-conflict-policy')?.addEventListener('change', updateRestorePreview);
  document.getElementById('backup-restore-file')?.addEventListener('change', async event => {
    const sequence = ++backupReadSequence;
    selectedBackup = null;
    updateRestorePreview();
    const file = event.target.files[0];
    if (!file) return;
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error('文件超过 20 MB，请核对是否选中了完整备份。');
      const backup = readBackup(await file.text());
      if (sequence !== backupReadSequence) return;
      selectedBackup = { ...backup, filename: file.name };
      updateRestorePreview();
    } catch (error) {
      if (sequence !== backupReadSequence) return;
      const el = document.getElementById('backup-restore-error');
      el.textContent = error.message;
      el.hidden = false;
    }
  });
  document.getElementById('btn-confirm-backup-restore')?.addEventListener('click', async event => {
    if (!selectedBackup || event.target.disabled) return;
    const button = event.target;
    restoreInProgress = true;
    button.disabled = true;
    button.textContent = '正在恢复…';
    const controls = ['backup-restore-file', 'backup-conflict-policy', 'btn-close-backup-restore', 'btn-cancel-backup-restore'];
    controls.forEach(id => { document.getElementById(id).disabled = true; });
    try {
      const preferBackup = document.getElementById('backup-conflict-policy').value === 'backup';
      const result = previewRestore(state.data, selectedBackup.data, preferBackup);
      if (!downloadFullBackup(state.data, 'before-restore')) return;
      const restoredAt = new Date().toISOString();
      result.data.dailyRecords.forEach(day => {
        day.localEditedAt = restoredAt;
        day.items.forEach(item => { item.localEditedAt = restoredAt; });
      });
      result.data.goalsAndThoughts.localEditedAt = restoredAt;
      if (!await persistData('完整备份已合并恢复', result.data, { requireLocal: true })) return;
      state.data = result.data;
      state.selectedPromptVersion = null;
      state.data.dailyRecords.forEach(day => state.expandedDates.add(day.date));
      if (!state.data.dailyRecords.some(day => day.date === state.activeTimelineDate)) {
        state.activeTimelineDate = state.data.dailyRecords[0]?.date || null;
      }
      restoreInProgress = false;
      closeBackupRestore();
      renderApp();
      renderBackupSummary();
      updateExportPreview();
    } catch (error) {
      showToast(`未恢复数据：${error.message}`, 'error');
    } finally {
      restoreInProgress = false;
      controls.forEach(id => { document.getElementById(id).disabled = false; });
      button.textContent = '确认合并恢复';
      button.disabled = !selectedBackup;
    }
  });
}

// 打开定制导出工作台弹窗
function openCustomExportModal(initialFormat = 'json', initialScope = 'candidate') {
  const modal = document.getElementById('modal-ai-export');
  const dateSelect = document.getElementById('export-date-select');
  if (!modal || !dateSelect) return;

  const records = state.data.dailyRecords || [];
  const currentDate = state.activeTimelineDate || (records[0]?.date) || new Date().toISOString().slice(0, 10);

  // 1. 填充日期选择下拉框
  dateSelect.innerHTML = '';
  records.forEach(rec => {
    const candCount = (rec.items || []).filter(i => i.isCandidate).length;
    const opt = document.createElement('option');
    opt.value = rec.date;
    opt.textContent = `${rec.date}（${rec.items?.length || 0}篇 · ${candCount}候选）`;
    if (rec.date === currentDate) opt.selected = true;
    dateSelect.appendChild(opt);
  });

  customExportState.date = dateSelect.value || currentDate;
  customExportState.format = initialFormat;
  customExportState.scope = initialScope;

  // 2. 更新按钮高亮
  syncExportUiButtons();

  // 3. 刷新预览
  updateExportPreview();

  renderBackupSummary();
  modal.classList.add('active');
}

function syncExportUiButtons() {
  document.querySelectorAll('#export-scope-group .btn-pill-choice').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.scope === customExportState.scope);
  });
  document.querySelectorAll('#export-format-group .btn-pill-choice').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.format === customExportState.format);
  });
}

function updateExportPreview() {
  const date = customExportState.date;
  const scope = customExportState.scope;
  const format = customExportState.format;

  const day = (state.data.dailyRecords || []).find(r => r.date === date);
  const items = day ? (day.items || []) : [];
  const candCount = items.filter(i => i.isCandidate).length;
  const allCount = items.length;

  // 更新计数标签
  const elCandCount = document.getElementById('export-candidate-count');
  const elAllCount = document.getElementById('export-all-count');
  const elMatchedCount = document.getElementById('export-matched-count');
  const preview = document.getElementById('ai-export-preview');
  const btnDownloadText = document.getElementById('btn-download-ai-text');

  if (elCandCount) elCandCount.textContent = candCount;
  if (elAllCount) elAllCount.textContent = allCount;

  const onlyCandidates = (scope === 'candidate');
  const matchedCount = onlyCandidates ? candCount : allCount;
  if (elMatchedCount) elMatchedCount.textContent = matchedCount;

  // 根据当前选择格式生成文本
  let content = '';
  if (format === 'json') {
    content = generateCustomJsonExport(date, onlyCandidates, false);
    if (btnDownloadText) btnDownloadText.textContent = '下载精简 JSON';
  } else if (format === 'cn_json') {
    content = generateCustomJsonExport(date, onlyCandidates, true);
    if (btnDownloadText) btnDownloadText.textContent = '下载极简中文 JSON';
  } else if (format === 'ai') {
    content = generateAiTopicDiscussionPrompt(date, onlyCandidates);
    if (btnDownloadText) btnDownloadText.textContent = '下载讨论 Prompt';
  } else {
    content = generateCustomMarkdownExport(date, onlyCandidates);
    if (btnDownloadText) btnDownloadText.textContent = '下载复盘 .MD';
  }

  if (preview) preview.value = content;
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
    if (['timeline', 'writing', 'rhythm', 'video', 'prompts', 'goals'].includes(hash)) {
      state.currentTab = hash;
      renderApp();
    }
  });

  const initialHash = window.location.hash.replace('#', '');
  if (['timeline', 'writing', 'rhythm', 'video', 'prompts', 'goals'].includes(initialHash)) {
    state.currentTab = initialHash;
  }

  // 初始化各流程参考页的独立展开事件
  initWritingPipelineEvents();

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
  document.getElementById('btn-export-json')?.addEventListener('click', () => downloadFullBackup());
  initBackupEvents();

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

  // 7.1 定制导出工作台事件绑定（独立按钮，点击直接稳定打开）
  document.getElementById('btn-export-candidates')?.addEventListener('click', () => openCustomExportModal('json', 'candidate'));
  document.getElementById('btn-export-candidates-dropdown')?.addEventListener('click', () => openCustomExportModal('json', 'candidate'));
  document.getElementById('btn-export-ai-dropdown')?.addEventListener('click', () => openCustomExportModal('ai', 'candidate'));
  document.getElementById('btn-export-markdown')?.addEventListener('click', () => openCustomExportModal('md', 'candidate'));
  document.getElementById('btn-open-ai-export')?.addEventListener('click', () => openCustomExportModal('json', 'candidate'));

  // 日期选择切换
  document.getElementById('export-date-select')?.addEventListener('change', (e) => {
    customExportState.date = e.target.value;
    updateExportPreview();
  });

  // 范围选择切换（仅候选 / 全部）
  document.querySelectorAll('#export-scope-group .btn-pill-choice').forEach(btn => {
    btn.addEventListener('click', () => {
      customExportState.scope = btn.dataset.scope;
      syncExportUiButtons();
      updateExportPreview();
    });
  });

  // 格式选择切换（JSON / AI / MD）
  document.querySelectorAll('#export-format-group .btn-pill-choice').forEach(btn => {
    btn.addEventListener('click', () => {
      customExportState.format = btn.dataset.format;
      syncExportUiButtons();
      updateExportPreview();
    });
  });

  document.getElementById('btn-close-ai-export')?.addEventListener('click', () => {
    document.getElementById('modal-ai-export')?.classList.remove('active');
  });
  document.getElementById('modal-ai-export')?.addEventListener('click', (e) => {
    if (e.target.id === 'modal-ai-export') {
      e.target.classList.remove('active');
    }
  });

  // 一键复制内容
  document.getElementById('btn-copy-ai-dossier')?.addEventListener('click', () => {
    const preview = document.getElementById('ai-export-preview');
    if (!preview) return;
    const textToCopy = preview.value;
    const fmt = customExportState.format;
    const fmtLabel = fmt === 'json' ? '精简 JSON' : (fmt === 'cn_json' ? '极简中文 JSON' : (fmt === 'ai' ? 'AI 讨论 Prompt' : '复盘 Markdown'));

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(textToCopy).then(() => {
        const textSpan = document.getElementById('btn-copy-ai-text');
        const iconSpan = document.getElementById('btn-copy-ai-icon');
        if (textSpan) textSpan.textContent = '已复制！';
        if (iconSpan) iconSpan.textContent = '✓';
        showToast(`已复制 ${fmtLabel}！可直接粘贴给 AI 分析`, 'success');
        setTimeout(() => {
          if (textSpan) textSpan.textContent = '一键复制全文';
          if (iconSpan) iconSpan.textContent = '📋';
        }, 2500);
      }).catch(() => {
        preview.select();
        document.execCommand('copy');
        showToast(`已复制 ${fmtLabel}！可直接粘贴给 AI 分析`, 'success');
      });
    } else {
      preview.select();
      document.execCommand('copy');
      showToast(`已复制 ${fmtLabel}！可直接粘贴给 AI 分析`, 'success');
    }
  });

  // 下载文件 (按当前格式自适应扩展名与内容类型)
  document.getElementById('btn-download-ai-dossier')?.addEventListener('click', () => {
    const preview = document.getElementById('ai-export-preview');
    if (!preview) return;
    const date = customExportState.date || 'export';
    const fmt = customExportState.format;
    const scope = customExportState.scope;
    const scopeTag = scope === 'candidate' ? 'candidates' : 'all';

    let filename = `ielts-radar-${date}-${scopeTag}-clean.json`;
    let mimeType = 'application/json; charset=utf-8';

    if (fmt === 'cn_json') {
      filename = `ielts-radar-${date}-${scopeTag}-zh.json`;
      mimeType = 'application/json; charset=utf-8';
    } else if (fmt === 'ai') {
      filename = `ielts-radar-ai-topics-${date}-${scopeTag}.md`;
      mimeType = 'text/markdown; charset=utf-8';
    } else if (fmt === 'md') {
      filename = `ielts-radar-summary-${date}-${scopeTag}.md`;
      mimeType = 'text/markdown; charset=utf-8';
    }

    const blob = new Blob([preview.value], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast(`已下载 ${filename}`, 'success');
  });

  // 8. 主题
  initTheme();
  document.getElementById('btn-theme-toggle')?.addEventListener('click', toggleTheme);

  // 9. 点击外部关闭卡片更多操作下拉菜单
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.dropdown-wrapper')) {
      document.querySelectorAll('.dropdown-menu-card.active').forEach(m => m.classList.remove('active'));
    }
  });

  // 10. 载入数据
  loadData();
});
