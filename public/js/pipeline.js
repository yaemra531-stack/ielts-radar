/**
 * 雅思见闻 (IELTS Radar) - 写作进度看板模块 (pipeline.js)
 * 纯可视化看板：看清每个选题走到 10 步流程的哪一步
 * 保持简单、克制，本地持久化，刷新不丢
 */

const STORAGE_KEY = 'ielts_writing_topics_v1';

// 10 步流程定义
export const WRITING_STEPS = [
  { index: 0, name: '建候选页', role: 'AI', requiresMe: false },
  { index: 1, name: '第一印象', role: '我', requiresMe: true },
  { index: 2, name: '三个角度拆解', role: 'AI', requiresMe: false },
  { index: 3, name: '提炼结构', role: 'AI', requiresMe: false },
  { index: 4, name: '挑延伸选题', role: '我', requiresMe: true },
  { index: 5, name: '补素材', role: '我', requiresMe: true },
  { index: 6, name: '合并/系列/暂缓', role: '我', requiresMe: true },
  { index: 7, name: '核实', role: 'AI', requiresMe: false },
  { index: 8, name: '写初稿', role: '我说写·AI写', requiresMe: true },
  { index: 9, name: '定稿与导出', role: '我确认·AI导出', requiresMe: false }
];

// 看板 5 列定义
export const KANBAN_COLUMNS = [
  { key: 'candidate', title: '候选', desc: '第 0–1 步' },
  { key: 'deconstructing', title: '拆解中', desc: '第 2–6 步' },
  { key: 'writing', title: '写作中', desc: '第 7–9 步' },
  { key: 'completed', title: '已完成', desc: '已完成 / 全勾完' },
  { key: 'paused', title: '暂缓', desc: '暂缓搁置' }
];

// 初始数据（第一次打开时写入）
const INITIAL_TOPICS = [
  {
    id: 'topic_init_1',
    title: '基础差的人，别信雅思速成',
    type: 'original',
    parentTitle: null,
    completedSteps: 10,
    status: 'completed',
    createdAt: '2026-10-10'
  },
  {
    id: 'topic_init_2',
    title: '雅思6.5 7.0 等于文盲',
    type: 'original',
    parentTitle: null,
    completedSteps: 7,
    status: 'completed',
    createdAt: '2026-10-10'
  },
  {
    id: 'topic_init_3',
    title: '雅思6.5，对学渣来说已经是天花板',
    type: 'extension',
    parentTitle: '雅思6.5 7.0 等于文盲',
    completedSteps: 9,
    status: 'active',
    createdAt: '2026-10-11'
  },
  {
    id: 'topic_init_4',
    title: '四级450，等于没有基础',
    type: 'extension',
    parentTitle: '雅思6.5 7.0 等于文盲',
    completedSteps: 9,
    status: 'active',
    createdAt: '2026-10-11'
  },
  {
    id: 'topic_init_5',
    title: '刷题越多，学渣越学不会',
    type: 'extension',
    parentTitle: '雅思6.5 7.0 等于文盲',
    completedSteps: 9,
    status: 'active',
    createdAt: '2026-10-11'
  },
  {
    id: 'topic_init_6',
    title: 'AI学英语，学渣用了可能更焦虑',
    type: 'extension',
    parentTitle: '雅思6.5 7.0 等于文盲',
    completedSteps: 6,
    status: 'paused',
    createdAt: '2026-10-12'
  },
  {
    id: 'topic_init_7',
    title: '二本，六级437，雅思8.0',
    type: 'original',
    parentTitle: null,
    completedSteps: 1,
    status: 'active',
    createdAt: '2026-10-14'
  },
  {
    id: 'topic_init_8',
    title: '普通家庭想考雅思的，可以参考我的开智顺序',
    type: 'original',
    parentTitle: null,
    completedSteps: 0,
    status: 'active',
    createdAt: '2026-10-14'
  }
];

// 本地数据缓存
let topicsData = [];

// 读取数据（带初始数据兜底）
export function loadTopics() {
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          topicsData = parsed;
          return topicsData;
        }
      }
    } catch (_) {}
  }

  // 写入初始数据
  topicsData = JSON.parse(JSON.stringify(INITIAL_TOPICS));
  saveTopics();
  return topicsData;
}

// 保存数据
export function saveTopics() {
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(topicsData));
    } catch (err) {
      console.error('Failed to save writing topics to localStorage', err);
    }
  }
}

// 归列规则
export function getTopicColumn(topic) {
  // 1. 10 步全勾完，或该选题标为「已完成」→ 已完成
  if (topic.completedSteps >= 10 || topic.status === 'completed') {
    return 'completed';
  }
  // 2. 标为「暂缓」→ 暂缓（卡片灰色）
  if (topic.status === 'paused') {
    return 'paused';
  }
  // 3. 其余按当前步骤：
  // 第 0–1 步 → 候选
  if (topic.completedSteps <= 1) {
    return 'candidate';
  }
  // 第 2–6 步 → 拆解中
  if (topic.completedSteps >= 2 && topic.completedSteps <= 6) {
    return 'deconstructing';
  }
  // 第 7–9 步 → 写作中
  return 'writing';
}

// 渲染写作进度看板主入口
export function renderWritingPipeline() {
  const boardEl = document.getElementById('wp-kanban-board');
  if (!boardEl) return;

  loadTopics();

  // 1. 统计各列数量
  const colMap = {
    candidate: [],
    deconstructing: [],
    writing: [],
    completed: [],
    paused: []
  };

  topicsData.forEach(topic => {
    const colKey = getTopicColumn(topic);
    if (colMap[colKey]) {
      colMap[colKey].push(topic);
    }
  });

  // 更新顶部数字
  document.getElementById('wp-count-candidate').textContent = colMap.candidate.length;
  document.getElementById('wp-count-deconstructing').textContent = colMap.deconstructing.length;
  document.getElementById('wp-count-writing').textContent = colMap.writing.length;
  document.getElementById('wp-count-completed').textContent = colMap.completed.length;
  document.getElementById('wp-count-paused').textContent = colMap.paused.length;

  // 2. 渲染 5 列看板
  boardEl.innerHTML = '';
  KANBAN_COLUMNS.forEach(col => {
    const colTopics = colMap[col.key] || [];
    const colDiv = document.createElement('div');
    colDiv.className = `wp-kanban-col wp-col-${col.key}`;

    let cardsHtml = '';
    if (colTopics.length === 0) {
      cardsHtml = `<div class="wp-empty-placeholder">暂无选题</div>`;
    } else {
      cardsHtml = colTopics.map(t => renderTopicCardHtml(t)).join('');
    }

    colDiv.innerHTML = `
      <div class="wp-col-header">
        <div class="wp-col-title-wrap">
          <span class="wp-col-title">${col.title}</span>
          <span class="wp-col-count-badge">${colTopics.length}</span>
        </div>
      </div>
      <div class="wp-col-cards-container">
        ${cardsHtml}
      </div>
    `;

    boardEl.appendChild(colDiv);
  });

  // 3. 绑定卡片交互事件（打勾、菜单）
  bindCardInteractions();
}

// 生成单张卡片 HTML
function renderTopicCardHtml(topic) {
  const isPaused = (topic.status === 'paused');
  const isCompleted = (topic.completedSteps >= 10 || topic.status === 'completed');
  const typeTag = topic.type === 'extension' 
    ? `<span class="wp-tag tag-extension">延伸</span>`
    : `<span class="wp-tag tag-original">原帖</span>`;

  // 10 步圆圈渲染
  let dotsHtml = '';
  for (let i = 0; i < 10; i++) {
    const isDone = topic.completedSteps > i;
    const isCurrent = !isCompleted && topic.completedSteps === i;
    const dotClass = isDone ? 'is-done' : (isCurrent ? 'is-current' : 'is-pending');
    const dotInner = isDone ? '✓' : '';
    const stepDef = WRITING_STEPS[i];
    const tooltip = `第 ${i} 步：${stepDef.name} (${stepDef.role})`;

    dotsHtml += `
      <div class="wp-step-dot ${dotClass}" 
           data-topic-id="${topic.id}" 
           data-step-index="${i}" 
           title="${tooltip}">
        ${dotInner}
      </div>
    `;
  }

  // 当前步骤说明文字
  let stepNameDesc = '';
  if (isCompleted) {
    stepNameDesc = `<span class="wp-step-name-text is-finished">✓ 全部流程已完成</span>`;
  } else {
    const currStep = WRITING_STEPS[topic.completedSteps] || WRITING_STEPS[9];
    const roleTag = currStep.requiresMe ? '⏸' : '';
    stepNameDesc = `
      <span class="wp-step-name-text">
        第 ${currStep.index} 步：${currStep.name} ${roleTag}
      </span>
    `;
  }

  // 原帖卡片如果有延伸选题，在下面缩进列出它们的标题和小圆圈
  let extensionsHtml = '';
  if (topic.type === 'original') {
    const extensions = topicsData.filter(t => t.type === 'extension' && t.parentTitle === topic.title);
    if (extensions.length > 0) {
      const extItems = extensions.map(ext => {
        let extDots = '';
        for (let i = 0; i < 10; i++) {
          const dDone = ext.completedSteps > i;
          const dCurr = (ext.completedSteps < 10 && ext.status !== 'completed' && ext.completedSteps === i);
          const dClass = dDone ? 'is-done' : (dCurr ? 'is-current' : 'is-pending');
          extDots += `<span class="wp-ext-dot ${dClass}"></span>`;
        }
        return `
          <div class="wp-ext-item">
            <span class="wp-ext-title">🌱 ${escapeHtml(ext.title)}</span>
            <div class="wp-ext-dots-row">${extDots}</div>
          </div>
        `;
      }).join('');

      extensionsHtml = `
        <div class="wp-card-extensions">
          <div style="font-size: 11px; font-weight: 600; color: var(--text-secondary); margin-bottom: 2px;">
            🔗 延伸选题 (${extensions.length})：
          </div>
          ${extItems}
        </div>
      `;
    }
  }

  return `
    <div class="wp-card ${isPaused ? 'is-paused' : ''}" data-topic-id="${topic.id}">
      <div class="wp-card-header">
        <div class="wp-card-title-area">
          ${typeTag}
          <div class="wp-card-title">${escapeHtml(topic.title)}</div>
        </div>
        <div class="wp-card-menu-wrap">
          <button type="button" class="wp-card-menu-btn" data-action="toggle-menu" title="操作菜单">···</button>
          <div class="wp-card-menu-popover">
            ${topic.status === 'paused' 
              ? `<button type="button" class="wp-menu-opt-btn" data-action="resume">▶ 恢复进行</button>`
              : `<button type="button" class="wp-menu-opt-btn" data-action="pause">⏸ 暂缓</button>`
            }
            ${isCompleted
              ? `<button type="button" class="wp-menu-opt-btn" data-action="uncomplete">↩ 重新激活</button>`
              : `<button type="button" class="wp-menu-opt-btn" data-action="complete">✓ 标记完成</button>`
            }
            <button type="button" class="wp-menu-opt-btn danger" data-action="delete">🗑 删除</button>
          </div>
        </div>
      </div>

      <div class="wp-step-dots-row">
        ${dotsHtml}
      </div>

      ${stepNameDesc}

      ${extensionsHtml}
    </div>
  `;
}

// 绑定卡片交互
function bindCardInteractions() {
  const boardEl = document.getElementById('wp-kanban-board');
  if (!boardEl) return;

  // 1. 点击圆圈打勾 / 取消
  boardEl.querySelectorAll('.wp-step-dot').forEach(dot => {
    dot.addEventListener('click', (e) => {
      e.stopPropagation();
      const topicId = dot.dataset.topicId;
      const stepIdx = parseInt(dot.dataset.stepIndex, 10);
      const topic = topicsData.find(t => t.id === topicId);
      if (!topic) return;

      // 如果点的是当前已经完成的最后一个，取消这一步（步数减1）
      if (topic.completedSteps === stepIdx + 1) {
        topic.completedSteps = stepIdx;
      } else {
        // 否则等于前 N 步都完成
        topic.completedSteps = stepIdx + 1;
      }

      // 如果 10 步全勾完，标记完成
      if (topic.completedSteps >= 10) {
        topic.status = 'completed';
      } else if (topic.status === 'completed') {
        topic.status = 'active';
      }

      saveTopics();
      renderWritingPipeline();
    });
  });

  // 2. 卡片操作菜单展开/收起
  boardEl.querySelectorAll('.wp-card-menu-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const popover = btn.nextElementSibling;
      const wasActive = popover.classList.contains('active');
      // 关闭其他已打开的菜单
      document.querySelectorAll('.wp-card-menu-popover.active').forEach(p => p.classList.remove('active'));
      if (!wasActive) {
        popover.classList.add('active');
      }
    });
  });

  // 3. 菜单选项点击
  boardEl.querySelectorAll('.wp-menu-opt-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const card = btn.closest('.wp-card');
      const topicId = card?.dataset.topicId;
      const action = btn.dataset.action;
      const topic = topicsData.find(t => t.id === topicId);
      if (!topic) return;

      if (action === 'pause') {
        topic.status = 'paused';
      } else if (action === 'resume') {
        topic.status = 'active';
      } else if (action === 'complete') {
        topic.status = 'completed';
      } else if (action === 'uncomplete') {
        topic.status = 'active';
        if (topic.completedSteps >= 10) topic.completedSteps = 9;
      } else if (action === 'delete') {
        if (confirm(`确认删除选题「${topic.title}」吗？`)) {
          topicsData = topicsData.filter(t => t.id !== topicId);
        }
      }

      saveTopics();
      renderWritingPipeline();
    });
  });
}

// 初始化全局事件（新增选题、折叠说明、全局点击关闭菜单）
export function initWritingPipelineEvents() {
  // 点击空白处关闭卡片菜单
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.wp-card-menu-wrap')) {
      document.querySelectorAll('.wp-card-menu-popover.active').forEach(p => p.classList.remove('active'));
    }
  });

  // 底部流程说明展开/收起切换
  const guideHeader = document.getElementById('wp-process-guide-toggle');
  const guideBody = document.getElementById('wp-process-guide-body');
  const guideBtn = document.getElementById('wp-guide-toggle-btn');
  if (guideHeader && guideBody && guideBtn) {
    guideHeader.addEventListener('click', () => {
      const isHidden = guideBody.style.display === 'none';
      guideBody.style.display = isHidden ? 'block' : 'none';
      guideBtn.innerHTML = isHidden 
        ? `<span>收起流程说明</span> ▴` 
        : `<span>展开流程说明</span> ▾`;
    });
  }

  // 打开新建选题弹窗
  const btnOpenCreate = document.getElementById('btn-open-create-topic');
  const modalCreate = document.getElementById('modal-create-topic');
  const btnCloseCreate = document.getElementById('btn-close-create-topic');
  const btnCancelCreate = document.getElementById('btn-cancel-create-topic');
  const btnSubmitCreate = document.getElementById('btn-submit-create-topic');
  const titleInput = document.getElementById('topic-input-title');
  const parentGroup = document.getElementById('topic-parent-group');
  const parentSelect = document.getElementById('topic-select-parent');
  const typePills = document.querySelectorAll('#topic-type-group .btn-pill-choice');

  let currentCreateType = 'original';

  function openCreateModal() {
    if (!modalCreate) return;
    if (titleInput) titleInput.value = '';
    currentCreateType = 'original';
    typePills.forEach(p => p.classList.toggle('active', p.dataset.type === 'original'));
    if (parentGroup) parentGroup.style.display = 'none';

    // 填充已有原帖列表
    if (parentSelect) {
      parentSelect.innerHTML = '';
      const originals = topicsData.filter(t => t.type === 'original');
      if (originals.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = '暂无可选原帖';
        parentSelect.appendChild(opt);
      } else {
        originals.forEach(orig => {
          const opt = document.createElement('option');
          opt.value = orig.title;
          opt.textContent = orig.title;
          parentSelect.appendChild(opt);
        });
      }
    }

    modalCreate.classList.add('active');
    setTimeout(() => titleInput?.focus(), 50);
  }

  function closeCreateModal() {
    if (modalCreate) modalCreate.classList.remove('active');
  }

  btnOpenCreate?.addEventListener('click', openCreateModal);
  btnCloseCreate?.addEventListener('click', closeCreateModal);
  btnCancelCreate?.addEventListener('click', closeCreateModal);
  modalCreate?.addEventListener('click', (e) => {
    if (e.target.id === 'modal-create-topic') closeCreateModal();
  });

  // 类型选择切换（原帖 / 延伸）
  typePills.forEach(pill => {
    pill.addEventListener('click', () => {
      currentCreateType = pill.dataset.type;
      typePills.forEach(p => p.classList.toggle('active', p.dataset.type === currentCreateType));
      if (parentGroup) {
        parentGroup.style.display = currentCreateType === 'extension' ? 'block' : 'none';
      }
    });
  });

  // 提交新建选题
  btnSubmitCreate?.addEventListener('click', () => {
    const title = titleInput?.value.trim();
    if (!title) {
      alert('请填写选题标题');
      titleInput?.focus();
      return;
    }

    let parentTitle = null;
    if (currentCreateType === 'extension') {
      parentTitle = parentSelect?.value || null;
      if (!parentTitle) {
        alert('请选择属于哪篇原帖');
        return;
      }
    }

    const newTopic = {
      id: 'topic_' + Date.now(),
      title: title,
      type: currentCreateType,
      parentTitle: parentTitle,
      completedSteps: 0,
      status: 'active',
      createdAt: new Date().toISOString().slice(0, 10)
    };

    topicsData.unshift(newTopic);
    saveTopics();
    closeCreateModal();
    renderWritingPipeline();
  });
}

// 辅助 HTML 转义
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
