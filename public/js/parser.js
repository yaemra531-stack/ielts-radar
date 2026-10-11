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

    let rawList = Array.isArray(jsonObj) ? jsonObj : (jsonObj.items || [jsonObj]);
    const items = [];
    const warnings = [];

    rawList.forEach((raw, idx) => {
      // 计算互动数据
      let engagement = raw.engagement || raw.stats || '';
      if (!engagement && (raw.likes !== undefined || raw.favorites !== undefined)) {
        const parts = [];
        if (raw.likes !== undefined && raw.likes !== null) parts.push(`赞 ${raw.likes}`);
        if (raw.favorites !== undefined && raw.favorites !== null) parts.push(`藏 ${raw.favorites}`);
        engagement = parts.join(' · ');
      }
      if (!engagement) engagement = '待确认';

      const item = {
        id: `item_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 7)}`,
        agent: raw.agent || targetAgent,
        title: raw.title || '待确认',
        author: raw.author !== undefined ? raw.author : null,
        platform: raw.platform || this.inferPlatform(raw.url || '', targetAgent),
        publishDate: raw.published_at || raw.publishDate || raw.date || '待确认',
        likes: raw.likes !== undefined ? raw.likes : null,
        favorites: raw.favorites !== undefined ? raw.favorites : null,
        engagement: engagement,
        discovery_reason: raw.discovery_reason !== undefined ? raw.discovery_reason : null,
        summary: raw.summary || raw.desc || raw.description || '待确认',
        reader_value: raw.reader_value !== undefined ? raw.reader_value : (raw.readerValue || raw.value || ''),
        score: raw.score !== undefined ? raw.score : null,
        comments_checked: raw.comments_checked !== undefined ? raw.comments_checked : false,
        audience_questions: Array.isArray(raw.audience_questions) ? raw.audience_questions : [],
        url: raw.url || raw.link || '',
        isRead: false
      };

      if (!item.url) {
        warnings.push(`第 ${idx + 1} 条未识别到原文链接，请手动补充`);
      }
      items.push(item);
    });

    return { agent: targetAgent, date: targetDate, promptVersion, items, warnings };
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

    return {
      id: `item_${Date.now()}_${index}_${Math.random().toString(36).substring(2, 7)}`,
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
  }
};
