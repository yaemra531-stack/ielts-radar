/**
 * 流程参考页使用原生 details；每页的展开/收起按钮独立绑定。
 */
export function renderWritingPipeline() {
  initWritingPipelineEvents();
}

const boundWraps = new WeakSet();

export function initWritingPipelineEvents() {
  document.querySelectorAll('.writing-flow-wrap').forEach(wrap => {
    if (boundWraps.has(wrap)) return;
    boundWraps.add(wrap);

    const steps = [...wrap.querySelectorAll('.flow-document > .step')];
    const btnToggleAll = wrap.querySelector('.flow-toolbar .toggle-all');

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
  });
}
