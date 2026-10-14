/**
 * 雅思见闻 - 写作流程参考页
 * 五步连续文档使用原生 details，支持鼠标和键盘按需展开。
 */

export function renderWritingPipeline() {
  initWritingPipelineEvents();
}

let eventsBound = false;

export function initWritingPipelineEvents() {
  const wrap = document.querySelector('.writing-flow-wrap');
  if (!wrap || eventsBound) return;
  eventsBound = true;

  const steps = [...wrap.querySelectorAll('.flow-document > .step')];
  const btnToggleAll = document.getElementById('btn-flow-toggle-all');

  function syncToggleAllButton() {
    if (!btnToggleAll) return;
    btnToggleAll.textContent = steps.every(step => step.open) ? '全部收起' : '全部展开';
  }

  steps.forEach(step => step.addEventListener('toggle', syncToggleAllButton));

  btnToggleAll?.addEventListener('click', () => {
    const expand = steps.some(step => !step.open);
    steps.forEach(step => { step.open = expand; });
    syncToggleAllButton();
  });

  syncToggleAllButton();
}
