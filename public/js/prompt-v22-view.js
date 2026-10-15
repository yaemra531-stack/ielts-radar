// V2.2 的阅读概览；完整提示词仍来自版本数据库，不改写、不替换原文。
export function renderV22Overview(version, isCurrent, escapeHtml) {
  const quotas = [
    { key: 'pain', name: '痛点', count: 3, platform: '小红书', window: '30 天', rule: '赞或藏 > 100，必须读评论', use: '选题素材' },
    { key: 'video', name: '同行视频', count: 3, platform: '抖音 2 · 小红书视频 1', window: '60 天', rule: '赞 > 1000；含固定博主 2 条', use: '学节奏' },
    { key: 'tools', name: '方法工具', count: 2, platform: '小红书或抖音', window: '60 天', rule: '赞或藏 > 100，有具体步骤、工具或提示词', use: '亲自验证' },
    { key: 'gaps', name: '补漏洞', count: 2, platform: '小红书或抖音', window: '60 天', rule: '赞或藏 > 100，只限听力和阅读', use: '补我的短板' }
  ];
  const flow = [
    ['固定博主', '曲木古也 2 条，新作品优先'],
    ['同行名单', '看最近 60 天视频，补剩余名额'],
    ['搜小红书', '按关键词，每词前 20 条'],
    ['搜抖音', '按最多点赞排序，限发布时间'],
    ['打开核实', '日期、互动、内容三项，去重'],
    ['自检交付', '逐条过清单，只交一个 JSON']
  ];

  return `
    <header class="pv22-header">
      <div>
        <div class="pv22-heading-line">
          <h2 class="pd-title">WorkBuddy · V2.2</h2>
          ${isCurrent ? '<span class="badge-active-tag">当前生效</span>' : ''}
        </div>
        <p class="pv22-meta">创建于 ${escapeHtml(version.createdAt?.split('T')[0] || '')} · ${escapeHtml(version.reason || '')}</p>
      </div>
      <button class="btn btn-secondary btn-sm" id="btn-create-prompt-version" type="button">+ 发布新版本</button>
    </header>

    <div class="pv22-overview">
      <div class="pv22-purpose"><strong>它在做什么</strong><span>每天派斥候去小红书和抖音探地图：读者在愁什么、同行怎么拍、什么方法工具值得试、我的听力阅读缺什么。</span></div>

      <section aria-labelledby="pv22-quota-heading">
        <h3 id="pv22-quota-heading">每天交什么 <small>上限 10 条 · 不够就空着，不硬凑</small></h3>
        <div class="pv22-quotas">
          ${quotas.map(q => `<article class="pv22-quota pv22-quota--${q.key}">
            <h4><span>${q.name}</span><strong>${q.count}</strong></h4>
            <dl><dt>平台</dt><dd>${q.platform}</dd><dt>时间窗</dt><dd>${q.window}</dd><dt>门槛</dt><dd>${q.rule}</dd></dl>
            <p class="pv22-use">→ ${q.use}</p>
          </article>`).join('')}
        </div>
        <p class="pv22-footnote">固定博主的 2 条计入同行视频名额：不设点赞门槛，补旧作品可不受 60 天限制；不够时写明原因。</p>
      </section>

      <section aria-labelledby="pv22-flow-heading">
        <h3 id="pv22-flow-heading">执行流程 <small>AI 按这个顺序跑</small></h3>
        <ol class="pv22-flow">
          ${flow.map(([title, description], i) => `<li>
            <span class="pv22-flow-number" aria-hidden="true">${i + 1}</span>
            <div><h4>${title}</h4><p>${description}</p></div>
            <span class="pv22-flow-arrow" aria-hidden="true">›</span>
          </li>`).join('')}
        </ol>
      </section>

      <section aria-labelledby="pv22-roles-heading">
        <h3 id="pv22-roles-heading">谁做什么</h3>
        <div class="pv22-role-grid">
          <article class="pv22-box pv22-box--ai">
            <h4><span class="pv22-role-label" aria-hidden="true">AI</span> AI 做</h4>
            <ul><li>找内容、核实、去重</li><li>写发现 · 理解 · 价值</li><li>节奏卡里读得到的：时长、章节、第一个干货秒数</li></ul>
          </article>
          <article class="pv22-box pv22-box--human">
            <h4><span class="pv22-role-label" aria-hidden="true">人</span> 我做</h4>
            <ul><li>在网站选候选、写笔记</li><li>节奏卡：前 3 秒、画面形式、看完的感觉</li><li>方法工具：亲自试，写试用结论</li></ul>
          </article>
        </div>
      </section>

      <section aria-labelledby="pv22-changes-heading">
        <h3 id="pv22-changes-heading">这一版</h3>
        <div class="pv22-version-grid">
          <article class="pv22-box pv22-box--changes">
            <h4>比 V2.0 改了什么</h4>
            <ul>
              <li>痛点全部来自小红书，「蹲老师」类评论不算问题</li>
              <li>同行视频按形式筛选，不按观点</li>
              <li>节奏卡分工：AI 只填读得到的</li>
              <li>关键词战报补最终入选，方法工具补工具链接</li>
              <li>新增固定博主：曲木古也，每天 2 条</li>
              <li>附 7 条参考案例</li>
            </ul>
          </article>
          <article class="pv22-box pv22-box--limits">
            <h4>不做什么</h4>
            <ul><li>不写选题建议和写文角度</li><li>不推断为什么火，不把高赞说成趋势</li><li>读不到的信息写 null 或「未读到」，不猜</li><li>遇到验证码或登录验证立即停</li></ul>
          </article>
        </div>
      </section>

      <details class="pv22-source">
        <summary>给 AI 的完整提示词 <small>点开查看 · 复制内容</small></summary>
        <div class="pv22-source-body">
          <div class="pv22-source-toolbar"><span>原文完整保留</span><button class="btn btn-secondary btn-sm" id="btn-copy-prompt-text" type="button">复制完整提示词</button></div>
          <pre class="prompt-code-body">${escapeHtml(version.promptContent)}</pre>
        </div>
      </details>
    </div>`;
}
