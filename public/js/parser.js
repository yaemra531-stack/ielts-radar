/**
 * IELTS Radar - 智能报告解析引擎 (parser.js)
 * 支持识别 WorkBuddy / Muse 输出的 Markdown、纯文本、JSON 格式。
 * 严守原则：无法准确识别的字段标记为「待确认」，不得编造。
 */

export const Parser = {
  /**
   * 自动推断 Agent 类型
   */
  detectAgent(text, explicitAgent) {
    if (explicitAgent && explicitAgent !== 'auto') {
      return explicitAgent;
    }
    const lower = text.toLowerCase();
    if (lower.includes('workbuddy') || lower.includes('小红书') || lower.includes('抖音')) {
      return 'WorkBuddy';
    }
    if (lower.includes('muse') || lower.includes('youtube') || lower.includes('reddit') || lower.includes('twitter') || lower.includes('x.com')) {
      return 'Muse';
    }
    return 'WorkBuddy';
  },

  /**
   * 自动从文本中提取日期 (YYYY-MM-DD)
   */
  detectDate(text) {
    const match = text.match(/\b(202\d[-/.](?:0[1-9]|1[0-2])[-/.](?:0[1-9]|[12]\d|3[01]))\b/);
    if (match) {
      return match[1].replace(/[./]/g, '-');
    }
    // 默认返回当前日期
    return new Date().toISOString().split('T')[0];
  },

  /**
   * 主解析入口
   * @param {string} rawText 原始文本或 JSON 字符串
   * @param {string} selectedAgent 用户选择的 Agent（可选）
   * @param {string} targetDate 归档日期（可选）
   * @returns {{ agent: string, date: string, items: Array, warnings: Array }}
   */
  parse(rawText, selectedAgent = 'auto', targetDate = '') {
    if (!rawText || !rawText.trim()) {
      return { agent: 'WorkBuddy', date: targetDate || new Date().toISOString().split('T')[0], items: [], warnings: ['内容为空'] };
    }

    const trimmed = rawText.trim();
    const agent = this.detectAgent(trimmed, selectedAgent);
    const date = targetDate || this.detectDate(trimmed);

    // 1. 尝试解析是否为 JSON
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      try {
        const json = JSON.parse(trimmed);
        return this.parseJson(json, agent, date);
      } catch (_) {
        // 不是有效 JSON，继续走文本/Markdown 解析
      }
    }

    // 2. 文本 / Markdown 解析
    return this.parseTextOrMarkdown(trimmed, agent, date);
  },

  /**
   * 解析 JSON 格式输入
   */
  parseJson(jsonObj, defaultAgent, defaultDate) {
    const isTopObject = !Array.isArray(jsonObj) && typeof jsonObj === 'object' && jsonObj !== null;
    const targetAgent = (isTopObject && jsonObj.agent) || defaultAgent;
    const targetDate = (isTopObject && (jsonObj.report_date || jsonObj.date)) || defaultDate;
    const promptVersion = (isTopObject && jsonObj.prompt_version) || null;
    const coverage = (isTopObject && jsonObj.coverage !== undefined) ? jsonObj.coverage : null;

    let rawList = Array.isArray(jsonObj) ? jsonObj : (jsonObj.items || [jsonObj]);
    const items = [];
    const warnings = [];

    rawList.forEach((raw, idx) => {
      const score = (raw.score !== undefined && raw.score !== null) ? Number(raw.score) : null;

      // 计算互动数据
      let engagement = raw.engagement || raw.stats || '';
      if (!engagement && (raw.likes !== undefined || raw.favorites !== undefined || raw.score !== undefined)) {
        const parts = [];
        if (raw.likes !== undefined && raw.likes !== null) parts.push(`赞 ${raw.likes}`);
        if (raw.favorites !== undefined && raw.favorites !== null) parts.push(`藏 ${raw.favorites}`);
        if (score !== null) parts.push(`得分 ${score}`);
        engagement = parts.join(' · ');
      }
      if (!engagement) engagement = '待确认';

      const platform = raw.platform || this.inferPlatform(raw.url || '', targetAgent);
      const url = raw.url || raw.link || '';
      const title = raw.title || '待确认';
      const stableId = this.extractStableContentId(platform, url, title);

      const item = {
        id: `item_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 7)}`,
        stableId: stableId,
        agent: raw.agent || targetAgent,
        title: title,
        author: raw.author !== undefined ? raw.author : null,
        platform: platform,
        publishDate: raw.published_at || raw.publishDate || raw.date || '待确认',
        likes: raw.likes !== undefined ? raw.likes : null,
        favorites: raw.favorites !== undefined ? raw.favorites : null,
        score: score,
        engagement: engagement,
        discovery_reason: raw.discovery_reason !== undefined ? raw.discovery_reason : null,
        summary: raw.summary || raw.desc || raw.description || '待确认',
        reader_value: raw.reader_value !== undefined ? raw.reader_value : (raw.readerValue || raw.value || ''),
        comments_checked: raw.comments_checked !== undefined ? raw.comments_checked : false,
        audience_questions: Array.isArray(raw.audience_questions) ? raw.audience_questions : [],
        url: url,
        isRead: false
      };

      if (!item.url) {
        warnings.push(`第 ${idx + 1} 条未识别到原文链接，请手动补充`);
      }
      items.push(item);
    });

    return { agent: targetAgent, date: targetDate, promptVersion, coverage, items, warnings };
  },

  /**
   * 解析 Markdown 或自由结构文本
   */
  parseTextOrMarkdown(text, defaultAgent, defaultDate) {
    const items = [];
    const warnings = [];

    // 分块逻辑：尝试根据分割线 (---)、标题前缀 (### 1. 或 ### 或 1. 标题) 切分
    let blocks = [];

    if (text.includes('---')) {
      // 存在明显分隔线
      blocks = text.split(/\n\s*---\s*\n/).map(b => b.trim()).filter(b => b.length > 10);
    } else {
      // 尝试根据标号分段：如 "### 1." 或 "1." 或 "【1】"
      const lines = text.split('\n');
      let currentBlock = [];

      for (let line of lines) {
        const isHeader = /^(?:#{1,4}\s*)?(?:\d+[\.、\)]|【\d+】)\s+/.test(line.trim());
        if (isHeader && currentBlock.length > 0) {
          blocks.push(currentBlock.join('\n'));
          currentBlock = [];
        }
        currentBlock.push(line);
      }
      if (currentBlock.length > 0) {
        blocks.push(currentBlock.join('\n'));
      }
    }

    // 如果未切分出多个块，尝试按空行双换行
    if (blocks.length <= 1 && text.includes('\n\n')) {
      blocks = text.split(/\n\s*\n/).map(b => b.trim()).filter(b => b.length > 20);
    }

    // 过滤掉纯开头的报告 Header 块（如以 # WorkBuddy 日报 开始且没有包含链接/正文的内容）
    const validBlocks = blocks.filter(b => {
      const hasUrl = /https?:\/\//i.test(b);
      const hasFields = /(?:平台|Platform|互动|Engagement|简介|Summary|链接|Link)[:：]/i.test(b);
      return (hasUrl || hasFields) && b.length > 15;
    });

    validBlocks.forEach((block, idx) => {
      const parsed = this.parseSingleBlock(block, idx, defaultAgent);
      if (parsed && parsed.title !== '待确认' && !parsed.title.includes('日报') && !parsed.title.toLowerCase().includes('intelligence brief')) {
        items.push(parsed);
      }
    });

    // 如果依然没有识别出条目，做最后的降级单篇保底识别
    if (items.length === 0) {
      const fallback = this.parseSingleBlock(text, 0, defaultAgent);
      if (fallback && (fallback.title !== '待确认' || fallback.url)) {
        items.push(fallback);
      } else {
        warnings.push('未能自动识别出文章条目，请检查输入格式或使用手动添加');
      }
    }

    return { agent: defaultAgent, date: defaultDate, items, warnings };
  },

  /**
   * 解析单个内容块
   */
  parseSingleBlock(block, index, defaultAgent) {
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) return null;

    let title = '待确认';
    let platform = '待确认';
    let publishDate = '待确认';
    let engagement = '待确认';
    let summary = '待确认';
    let reader_value = '';
    let url = '';

    // 1. 提取 URL
    const urlMatch = block.match(/https?:\/\/[^\s\)\>\]]+/);
    if (urlMatch) {
      url = urlMatch[0];
      // 清理末尾可能的标点
      url = url.replace(/[，。；;,]+$/, '');
    }

    // 2. 提取 Title
    for (const line of lines) {
      const isMetaLine = /(?:平台|Platform|来源|Source|发布日期|日期|Date|Published|互动数据|互动|指标|数据|Engagement|Stats|Likes|Upvotes|简介|摘要|核心亮点|简短介绍|Summary|Description|读者价值|对读者的帮助|对读者有什么帮助|读者收获|核心价值|Reader Value|Value|链接|原文链接|Link|URL)[\*\s]*[:：]/i.test(line) || line.includes('http');
      if (isMetaLine) continue;

      // 匹配以 ### 或数字标号开头的标题行
      const isHeaderLine = /^(?:#{1,4}\s*)?(?:\d+[\.、\)]|【\d+】)\s+/.test(line.trim());
      if (isHeaderLine) {
        let candidate = line.trim()
          .replace(/^(?:#{1,4}\s*)?/, '')
          .replace(/^(?:\d+[\.、\)]|【\d+】)\s*/, '')
          .replace(/^[\*\_\s]+/, '')
          .replace(/[\*\_\s]+$/, '')
          .trim();
        if (candidate.length > 2 && !candidate.toLowerCase().includes('日报') && !candidate.toLowerCase().includes('intelligence brief')) {
          title = candidate;
          break;
        }
      }
    }

    // 如果还没有标题，用第一个非元数据行作为备选
    if (title === '待确认') {
      for (const line of lines) {
        const isMetaLine = /(?:平台|Platform|来源|Source|发布日期|日期|Date|Published|互动数据|互动|指标|数据|Engagement|Stats|Likes|Upvotes|简介|摘要|核心亮点|简短介绍|Summary|Description|读者价值|对读者的帮助|对读者有什么帮助|读者收获|核心价值|Reader Value|Value|链接|原文链接|Link|URL)[\*\s]*[:：]/i.test(line) || line.includes('http');
        if (isMetaLine) continue;

        let candidate = line.trim()
          .replace(/^[#*\s\d.、】\]\)]+/, '')
          .replace(/[#*\s]+$/, '')
          .trim();
        if (candidate.length > 3 && !candidate.toLowerCase().includes('日报') && !candidate.toLowerCase().includes('intelligence brief')) {
          title = candidate;
          break;
        }
      }
    }

    // 3. 逐行提取字段
    lines.forEach(line => {
      // 平台 Platform
      const platMatch = line.match(/(?:平台|Platform|来源|Source)[\*\s]*[:：]\s*([^\n\r]+)/i);
      if (platMatch) {
        platform = platMatch[1].replace(/[\*\_\[\]]/g, '').trim();
      }

      // 发布日期 Date
      const dateMatch = line.match(/(?:发布日期|日期|Date|Published)[\*\s]*[:：]\s*([^\n\r]+)/i);
      if (dateMatch) {
        publishDate = dateMatch[1].replace(/[\*\_\[\]]/g, '').trim();
      }

      // 互动数据 Engagement / Likes / Upvotes
      const engMatch = line.match(/(?:互动数据|互动|指标|数据|Engagement|Stats|Likes|Upvotes)[\*\s]*[:：]\s*([^\n\r]+)/i);
      if (engMatch) {
        engagement = engMatch[1].replace(/[\*\_\[\]]/g, '').trim();
      }

      // 简介 / 摘要 / Summary
      const sumMatch = line.match(/(?:简介|摘要|核心亮点|简短介绍|Summary|Description)[\*\s]*[:：]\s*([^\n\r]+)/i);
      if (sumMatch) {
        summary = sumMatch[1].replace(/^[\*\_\[\]]+/, '').replace(/[\*\_\[\]]+$/, '').trim();
      }

      // 读者价值 / 对读者的帮助
      const valMatch = line.match(/(?:读者价值|对读者的帮助|对读者有什么帮助|读者收获|核心价值|Reader Value|Value)[\*\s]*[:：]\s*([^\n\r]+)/i);
      if (valMatch) {
        reader_value = valMatch[1].replace(/^[\*\_\[\]]+/, '').replace(/[\*\_\[\]]+$/, '').trim();
      }
    });

    // 4. 如果平台仍为待确认，通过 URL 或内容推测
    if (platform === '待确认') {
      platform = this.inferPlatform(url || block, defaultAgent);
    }

    // 5. 如果简介为待确认，尝试将非元数据行整合为简介
    if (summary === '待确认') {
      const descLines = lines.filter(l => {
        return !l.includes('平台') &&
               !l.includes('链接') &&
               !l.includes('http') &&
               !l.includes('发布日期') &&
               !l.includes('互动') &&
               !l.includes('价值') &&
               !l.includes('Value') &&
               !l.startsWith('#') &&
               l !== title;
      });
      if (descLines.length > 0) {
        summary = descLines.join(' ').replace(/[\*\_]/g, '').trim();
        if (summary.length > 200) summary = summary.substring(0, 200) + '...';
      }
    }

    // 如果标题还是包含【平台】，自动清洗
    if (title.startsWith('【') && title.includes('】')) {
      const bracketMatch = title.match(/^【(.*?)】(.*)$/);
      if (bracketMatch) {
        if (platform === '待确认') platform = bracketMatch[1];
        title = bracketMatch[2].trim();
      }
    }

    const stableId = this.extractStableContentId(platform, url, title);

    return {
      id: `item_${Date.now()}_${index}_${Math.random().toString(36).substring(2, 7)}`,
      stableId: stableId,
      agent: defaultAgent,
      title: title || '待确认',
      platform: platform || '待确认',
      publishDate: publishDate || '待确认',
      engagement: engagement || '待确认',
      summary: summary || '待确认',
      reader_value: reader_value || '',
      url: url || '',
      isRead: false
    };
  },

  /**
   * 推断平台
   */
  inferPlatform(str, defaultAgent) {
    const s = str.toLowerCase();
    if (s.includes('xiaohongshu') || s.includes('小红书') || s.includes('xhs')) return '小红书';
    if (s.includes('douyin') || s.includes('抖音') || s.includes('tiktok')) return '抖音';
    if (s.includes('youtube') || s.includes('youtu.be')) return 'YouTube';
    if (s.includes('reddit')) return 'Reddit';
    if (s.includes('twitter') || s.includes('x.com')) return 'X';
    if (s.includes('bilibili') || s.includes('b站')) return 'B站';

    return defaultAgent === 'WorkBuddy' ? '小红书' : 'YouTube';
  },

  /**
   * 规范化 URL（去除常见跟踪和临时参数，保留主体链接）
   */
  normalizeUrl(url) {
    if (!url || typeof url !== 'string') return '';
    try {
      const u = new URL(url);
      const searchParams = new URLSearchParams(u.search);
      const keysToDelete = [];
      for (const key of searchParams.keys()) {
        if (key.startsWith('utm_') || key.startsWith('xsec_') || ['spm', 'from', 's', 'ref', 'source', 'share_source'].includes(key)) {
          keysToDelete.push(key);
        }
      }
      keysToDelete.forEach(k => searchParams.delete(k));
      u.search = searchParams.toString();
      return (u.origin + u.pathname + (u.search ? '?' + u.search : '')).replace(/\/+$/, '');
    } catch (_) {
      return url.split('?')[0].replace(/\/+$/, '').trim();
    }
  },

  /**
   * 提取跨平台的稳定内容唯一 ID (Stable Content ID)
   */
  extractStableContentId(platform = '', url = '', title = '') {
    const plat = (platform || '').trim();
    const cleanUrl = url ? url.trim() : '';

    // 1. 小红书: /explore/6aaa332b... 或 /discovery/item/6aaa332b...
    if (/小红书|xhs|xiaohongshu/i.test(plat) || /xiaohongshu\.com|xhslink\.com/i.test(cleanUrl)) {
      const match = cleanUrl.match(/(?:explore|discovery\/item)\/([a-zA-Z0-9]+)/i);
      if (match) return `xhs_${match[1].toLowerCase()}`;
    }

    // 2. 抖音: /video/7692821830976998656
    if (/抖音|douyin|tiktok/i.test(plat) || /douyin\.com|tiktok\.com/i.test(cleanUrl)) {
      const match = cleanUrl.match(/video\/(\d+)/i);
      if (match) return `douyin_${match[1]}`;
    }

    // 3. X (Twitter): /status/2108911522022121959
    if (/^x$/i.test(plat) || /twitter|x\.com/i.test(plat) || /x\.com|twitter\.com/i.test(cleanUrl)) {
      const match = cleanUrl.match(/status\/(\d+)/i);
      if (match) return `x_${match[1]}`;
    }

    // 4. Reddit: /comments/1wtwdr1/... 或 /redd.it/1wtwdr1
    if (/reddit/i.test(plat) || /reddit\.com|redd\.it/i.test(cleanUrl)) {
      const match = cleanUrl.match(/(?:comments|redd\.it)\/([a-zA-Z0-9]+)/i);
      if (match) return `reddit_${match[1].toLowerCase()}`;
    }

    // 5. YouTube: /watch?v=... 或 /youtu.be/... 或 /shorts/...
    if (/youtube/i.test(plat) || /youtube\.com|youtu\.be/i.test(cleanUrl)) {
      const match = cleanUrl.match(/(?:v=|youtu\.be\/|shorts\/)([a-zA-Z0-9_-]{11})/i);
      if (match) return `youtube_${match[1]}`;
    }

    // 6. B站 (Bilibili): /video/BV...
    if (/bilibili|b站/i.test(plat) || /bilibili\.com/i.test(cleanUrl)) {
      const match = cleanUrl.match(/(BV[a-zA-Z0-9]+)/i);
      if (match) return `bilibili_${match[1]}`;
    }

    // 7. 通用降级: 规范化 URL 路径
    if (cleanUrl) {
      const normalized = this.normalizeUrl(cleanUrl);
      const noProto = normalized.replace(/^https?:\/\//i, '').replace(/[\/\?#&:]+/g, '_');
      return `${plat ? plat.toLowerCase() : 'web'}_${noProto.substring(0, 50)}`;
    }

    // 8. 无 URL 降级: platform + title 干净字符串
    if (title && title !== '待确认') {
      const cleanTitle = title.replace(/\s+/g, '_').substring(0, 40).toLowerCase();
      return `${plat ? plat.toLowerCase() : 'item'}_${cleanTitle}`;
    }

    return `item_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  },

  /**
   * 在已有条目列表中查找匹配的已有条目
   */
  matchExistingItem(newItem, existingItems = []) {
    if (!newItem || !Array.isArray(existingItems) || existingItems.length === 0) return null;

    const newStableId = newItem.stableId || this.extractStableContentId(newItem.platform, newItem.url, newItem.title);
    const newNormUrl = this.normalizeUrl(newItem.url);
    const newNormTitle = (newItem.title || '').trim().toLowerCase();

    for (const existing of existingItems) {
      // 1. 如果已有条目有 stableId 且相同
      const existingStableId = existing.stableId || this.extractStableContentId(existing.platform, existing.url, existing.title);
      if (newStableId && existingStableId && newStableId === existingStableId) {
        return existing;
      }

      // 2. 如果 URL 规范化后一致
      if (newNormUrl && existing.url) {
        const existNormUrl = this.normalizeUrl(existing.url);
        if (existNormUrl && existNormUrl === newNormUrl) {
          return existing;
        }
      }

      // 3. 同一平台且标题完全一致
      if (newItem.platform && existing.platform && newItem.platform === existing.platform) {
        const existNormTitle = (existing.title || '').trim().toLowerCase();
        if (newNormTitle && existNormTitle && newNormTitle === existNormTitle && newNormTitle !== '待确认') {
          return existing;
        }
      }
    }

    return null;
  },

  /**
   * 细粒度计算已有条目与新导入条目之间的字段差异
   */
  computeItemDiff(existingItem, newItem) {
    if (!existingItem || !newItem) {
      return { hasChanges: false, diffs: [] };
    }

    const diffs = [];

    // 1. 标题
    if ((existingItem.title || '').trim() !== (newItem.title || '').trim()) {
      diffs.push({
        field: 'title',
        label: '标题',
        oldVal: existingItem.title || '（空）',
        newVal: newItem.title || '（空）'
      });
    }

    // 2. 作者
    if (newItem.author !== undefined && newItem.author !== null && (existingItem.author || '').trim() !== (newItem.author || '').trim()) {
      diffs.push({
        field: 'author',
        label: '作者',
        oldVal: existingItem.author || '（空）',
        newVal: newItem.author || '（空）'
      });
    }

    // 3. 发布日期
    if (newItem.publishDate && newItem.publishDate !== '待确认' && existingItem.publishDate !== newItem.publishDate) {
      diffs.push({
        field: 'publishDate',
        label: '发布日期',
        oldVal: existingItem.publishDate || '（空）',
        newVal: newItem.publishDate || '（空）'
      });
    }

    // 4. 互动数据 (点赞、收藏、Score)
    const oldLikes = existingItem.likes;
    const newLikes = newItem.likes;
    const oldFavs = existingItem.favorites;
    const newFavs = newItem.favorites;
    const oldScore = existingItem.score;
    const newScore = newItem.score;

    const statsChanged = (newLikes !== undefined && newLikes !== null && newLikes !== oldLikes) ||
                         (newFavs !== undefined && newFavs !== null && newFavs !== oldFavs) ||
                         (newScore !== undefined && newScore !== null && newScore !== oldScore) ||
                         (newItem.engagement && newItem.engagement !== '待确认' && newItem.engagement !== existingItem.engagement);

    if (statsChanged) {
      const oldStatStr = existingItem.engagement || `赞 ${oldLikes ?? '-'} · 藏 ${oldFavs ?? '-'}` + (oldScore !== null && oldScore !== undefined ? ` · 得分 ${oldScore}` : '');
      const newStatStr = newItem.engagement || `赞 ${newLikes ?? '-'} · 藏 ${newFavs ?? '-'}` + (newScore !== null && newScore !== undefined ? ` · 得分 ${newScore}` : '');
      diffs.push({
        field: 'engagement',
        label: '互动数据',
        oldVal: oldStatStr,
        newVal: newStatStr
      });
    }

    // 5. ① 发现：为什么最近值得关注？
    const oldDisc = (existingItem.discovery_reason || '').trim();
    const newDisc = (newItem.discovery_reason || '').trim();
    if (newDisc && newDisc !== oldDisc) {
      diffs.push({
        field: 'discovery_reason',
        label: '① 发现原因',
        oldVal: oldDisc || '尚未分析',
        newVal: newDisc
      });
    }

    // 6. ② 理解：内容简介
    const oldSummary = (existingItem.summary || '').trim();
    const newSummary = (newItem.summary || '').trim();
    if (newSummary && newSummary !== '待确认' && newSummary !== oldSummary) {
      diffs.push({
        field: 'summary',
        label: '② 内容简介',
        oldVal: oldSummary || '暂无内容简介',
        newVal: newSummary
      });
    }

    // 7. ③ 价值：对读者有什么帮助？
    const oldValue = (existingItem.reader_value || '').trim();
    const newValue = (newItem.reader_value || '').trim();
    if (newValue && newValue !== oldValue) {
      diffs.push({
        field: 'reader_value',
        label: '③ 读者价值',
        oldVal: oldValue || '尚未分析',
        newVal: newValue
      });
    }

    // 8. 观众真实问题
    const oldQuestions = Array.isArray(existingItem.audience_questions) ? existingItem.audience_questions : [];
    const newQuestions = Array.isArray(newItem.audience_questions) ? newItem.audience_questions : [];
    const qChanged = JSON.stringify(oldQuestions) !== JSON.stringify(newQuestions);
    if (qChanged && (newQuestions.length > 0 || newItem.comments_checked)) {
      diffs.push({
        field: 'audience_questions',
        label: '观众真实问题',
        oldVal: oldQuestions.length > 0 ? oldQuestions.join(' ； ') : '暂无记录的问题',
        newVal: newQuestions.length > 0 ? newQuestions.join(' ； ') : '暂无记录的问题'
      });
    }

    return {
      hasChanges: diffs.length > 0,
      diffs
    };
  }
};
