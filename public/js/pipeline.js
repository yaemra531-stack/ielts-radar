/**
 * 雅思见闻 (IELTS Radar) - 写作流程交互模块 (pipeline.js)
 * 对应 flow.html 设计：从上到下 5 个卡片，细箭头相连
 * 默认展开第 1 个，点卡片标题可展开/收起，右上角「全部展开/全部收起」自由切换
 */

export function renderWritingPipeline() {
  initWritingPipelineEvents();
}

let eventsBound = false;

export function initWritingPipelineEvents() {
  const wrap = document.querySelector('.writing-flow-wrap');
  if (!wrap) return;

  if (eventsBound) return;
  eventsBound = true;

  // 1. 点击每个步骤标题栏展开/收起
  wrap.querySelectorAll('.step .head').forEach(head => {
    head.addEventListener('click', () => {
      const step = head.closest('.step');
      if (step) {
        step.classList.toggle('open');
        syncToggleAllButton();
      }
    });
  });

  // 2. 全部展开 / 全部收起 切换
  const btnToggleAll = document.getElementById('btn-flow-toggle-all');
  if (btnToggleAll) {
    btnToggleAll.addEventListener('click', () => {
      const steps = [...wrap.querySelectorAll('.step')];
      const anyClosed = steps.some(s => !s.classList.contains('open'));
      steps.forEach(s => s.classList.toggle('open', anyClosed));
      syncToggleAllButton();
    });
  }

  function syncToggleAllButton() {
    if (!btnToggleAll) return;
    const steps = [...wrap.querySelectorAll('.step')];
    const allOpen = steps.every(s => s.classList.contains('open'));
    btnToggleAll.textContent = allOpen ? '全部收起' : '全部展开';
  }
}
