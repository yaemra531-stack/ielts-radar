// 概览来自版本的可选 overview；完整提示词始终保留数据库原文。
export function renderV22Overview(version, isCurrent, escapeHtml, agentName = 'WorkBuddy') {
  const overview = version.overview;
  const list = value => Array.isArray(value) ? value : [];
  const e = value => escapeHtml(String(value ?? ''));
  const bullets = value => list(value).map(text => `<li>${e(text)}</li>`).join('');
  const quotaColors = ['pain', 'video', 'tools', 'gaps'];

  return `
    <header class="pv22-header">
      <div>
        <div class="pv22-heading-line">
          <h2 class="pd-title">${e(agentName)} · ${e(version.version)}</h2>
          ${isCurrent ? '<span class="badge-active-tag">当前生效</span>' : ''}
        </div>
        <p class="pv22-meta">创建于 ${e(version.createdAt?.split('T')[0])} · ${e(version.reason)}</p>
      </div>
      <button class="btn btn-secondary btn-sm" id="btn-create-prompt-version" type="button">+ 发布新版本</button>
    </header>

    <div class="pv22-overview">
      <div class="pv22-purpose"><strong>它在做什么</strong><span>${e(overview.goal)}</span></div>

      <section aria-labelledby="pv22-quota-heading">
        <h3 id="pv22-quota-heading">每天交什么 <small>上限 ${e(overview.daily_total)} 条 · 不够就空着，不硬凑</small></h3>
        <div class="pv22-quotas">
          ${list(overview.quotas).map((q, i) => `<article class="pv22-quota pv22-quota--${quotaColors[i % quotaColors.length]}">
            <h4><span>${e(q.category)}</span><strong>${e(q.count)}</strong></h4>
            <dl><dt>平台</dt><dd>${e(q.platform)}</dd><dt>时间窗</dt><dd>${e(q.window)}</dd><dt>门槛</dt><dd>${e(q.threshold)}</dd></dl>
            <p class="pv22-use">→ ${e(q.use)}</p>
          </article>`).join('')}
        </div>
        ${overview.quota_note ? `<p class="pv22-footnote">${e(overview.quota_note)}</p>` : ''}
      </section>

      <section aria-labelledby="pv22-flow-heading">
        <h3 id="pv22-flow-heading">执行流程 <small>AI 按这个顺序跑</small></h3>
        <ol class="pv22-flow">
          ${list(overview.flow).map((item, i) => `<li>
            <span class="pv22-flow-number" aria-hidden="true">${i + 1}</span>
            <div><h4>${e(item.step)}</h4><p>${e(item.desc)}</p></div>
            <span class="pv22-flow-arrow" aria-hidden="true">›</span>
          </li>`).join('')}
        </ol>
      </section>

      <section aria-labelledby="pv22-roles-heading">
        <h3 id="pv22-roles-heading">谁做什么</h3>
        <div class="pv22-role-grid">
          <article class="pv22-box pv22-box--ai">
            <h4><span class="pv22-role-label" aria-hidden="true">AI</span> AI 做</h4>
            <ul>${bullets(overview.split?.ai)}</ul>
          </article>
          <article class="pv22-box pv22-box--human">
            <h4><span class="pv22-role-label" aria-hidden="true">人</span> 我做</h4>
            <ul>${bullets(overview.split?.me)}</ul>
          </article>
        </div>
      </section>

      <section aria-labelledby="pv22-changes-heading">
        <h3 id="pv22-changes-heading">这一版</h3>
        <div class="pv22-version-grid">
          <article class="pv22-box pv22-box--changes">
            <h4>改了什么</h4>
            <ul>${bullets(overview.changes)}</ul>
          </article>
          <article class="pv22-box pv22-box--limits">
            <h4>不做什么</h4>
            <ul>${bullets(overview.not_do)}</ul>
          </article>
        </div>
      </section>

      <div class="pd-info-block">
        <div class="pd-info-row">
          <span class="pd-info-label">更新原因</span>
          <p class="pd-info-text">${e(version.reason || '无')}</p>
        </div>
        <div class="pd-info-row">
          <span class="pd-info-label">主要规则变化</span>
          <p class="pd-info-text">${e(version.changeLog || '无')}</p>
        </div>
      </div>

      <details class="pv22-source">
        <summary>给 AI 的完整提示词 <small>点开查看 · 复制内容</small></summary>
        <div class="pv22-source-body">
          <div class="pv22-source-toolbar"><span>原文完整保留</span><button class="btn btn-secondary btn-sm" id="btn-copy-prompt-text" type="button">复制完整提示词</button></div>
          <pre class="prompt-code-body">${e(version.promptContent)}</pre>
        </div>
      </details>
    </div>`;
}
