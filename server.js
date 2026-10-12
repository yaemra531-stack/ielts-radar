/**
 * IELTS Radar｜我的 AI 雅思侦察日志 - 本地数据持久化与服务核心
 * 完全使用 Node.js 原生标准库，保证 100% 稳定运行与可靠持久化。
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, 'data');
const STORE_FILE = path.join(DATA_DIR, 'radar-store.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const RAW_REPORTS_DIR = path.join(DATA_DIR, 'raw-reports');
const EXAMPLES_DIR = path.join(__dirname, 'examples');
const PUBLIC_DIR = path.join(__dirname, 'public');

// 保证数据目录与备份目录存在
[DATA_DIR, BACKUP_DIR, RAW_REPORTS_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// MIME 映射
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

/**
 * 安全读取 Store 数据
 */
function readStoreData() {
  try {
    if (!fs.existsSync(STORE_FILE)) {
      return null;
    }
    const raw = fs.readFileSync(STORE_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('[Error reading store]:', err);
    return null;
  }
}

/**
 * 原子安全写入 Store 数据并自动创建时间戳备份
 */
function writeStoreData(data) {
  try {
    data.systemInfo = data.systemInfo || {};
    data.systemInfo.updatedAt = new Date().toISOString();

    const jsonStr = JSON.stringify(data, null, 2);
    const tempFile = path.join(DATA_DIR, `temp-${Date.now()}.json`);

    // 1. 写入临时文件
    fs.writeFileSync(tempFile, jsonStr, 'utf-8');
    // 2. 原子重命名覆盖主文件
    fs.renameSync(tempFile, STORE_FILE);

    // 3. 自动归档备份 (限制最近 20 份)
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(BACKUP_DIR, `radar-store-${timestamp}.json`);
    fs.writeFileSync(backupFile, jsonStr, 'utf-8');

    // 清理旧备份
    const backups = fs.readdirSync(BACKUP_DIR)
      .filter((f) => f.endsWith('.json'))
      .sort();
    if (backups.length > 20) {
      const toDelete = backups.slice(0, backups.length - 20);
      toDelete.forEach((f) => {
        try { fs.unlinkSync(path.join(BACKUP_DIR, f)); } catch (_) {}
      });
    }

    return true;
  } catch (err) {
    console.error('[Error writing store]:', err);
    return false;
  }
}

/**
 * 生成阅读友好的 Markdown 导出文档
 */
function generateMarkdownExport(store) {
  const nowStr = new Date().toISOString().split('T')[0];
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

  // 2. 每日侦察记录
  md += `## 📅 每日侦察历史记录\n\n`;
  if (!store.dailyRecords || store.dailyRecords.length === 0) {
    md += `*暂无历史记录*\n\n`;
  } else {
    // 按日期倒序
    const sorted = [...store.dailyRecords].sort((a, b) => b.date.localeCompare(a.date));
    sorted.forEach((day) => {
      const items = day.items || [];
      const readCount = items.filter((i) => i.isRead).length;
      md += `### 📆 ${day.date}（收录 ${items.length} 篇 · 已读 ${readCount}/${items.length}）\n\n`;

      if (day.promptVersionWorkBuddy || day.promptVersionMuse) {
        md += `*关联提示词版本：WorkBuddy: ${day.promptVersionWorkBuddy || '无'} | Muse: ${day.promptVersionMuse || '无'}*\n\n`;
      }

      // 按 Agent 分类展示
      const wbItems = items.filter((i) => i.agent === 'WorkBuddy');
      const museItems = items.filter((i) => i.agent === 'Muse');
      const otherItems = items.filter((i) => i.agent !== 'WorkBuddy' && i.agent !== 'Muse');

      if (wbItems.length > 0) {
        md += `#### 🔴 WorkBuddy（小红书 / 抖音）\n\n`;
        wbItems.forEach((item, idx) => {
          md += `**${idx + 1}. [${item.platform || '未知平台'}] ${item.title}** ${item.isCandidate ? '⭐ **【今日候选】** ' : ''}${item.isRead ? '✅ *(已读)*' : '⏳ *(待读)*'}\n`;
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
          md += `**${idx + 1}. [${item.platform || '未知平台'}] ${item.title}** ${item.isCandidate ? '⭐ **【今日候选】** ' : ''}${item.isRead ? '✅ *(已读)*' : '⏳ *(待读)*'}\n`;
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

// 请求体 JSON 读取辅助函数
function parseRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 10 * 1024 * 1024) { // 限制 10MB
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        if (!body) return resolve({});
        resolve(JSON.parse(body));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

// 静态文件发送辅助函数
function serveStaticFile(res, filePath) {
  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stats.size,
      'Cache-Control': 'no-cache'
    });
    const readStream = fs.createReadStream(filePath);
    readStream.pipe(res);
  });
}

// 创建 HTTP 服务
const server = http.createServer(async (req, res) => {
  const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(urlObj.pathname);

  // 跨域支持 (CORS) 与预检
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // --- API 路由 ---
  
  // 1. 获取全量数据
  if (req.method === 'GET' && pathname === '/api/data') {
    const store = readStoreData();
    if (!store) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Store not found or corrupted' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(store));
    return;
  }

  // 2. 保存全量数据
  if (req.method === 'POST' && pathname === '/api/save') {
    try {
      const data = await parseRequestBody(req);
      const success = writeStoreData(data);
      if (success) {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true, updatedAt: data.systemInfo?.updatedAt }));
      } else {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to write store file' }));
      }
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // 3. 归档原始报告并追加记录
  if (req.method === 'POST' && pathname === '/api/save-raw-report') {
    try {
      const body = await parseRequestBody(req);
      const { agent, date, rawText } = body;
      const reportId = `${agent || 'Agent'}_${date || 'Unknown'}_${Date.now()}`;
      const filename = `${reportId}.txt`;
      const filePath = path.join(RAW_REPORTS_DIR, filename);

      fs.writeFileSync(filePath, rawText || '', 'utf-8');

      // 更新到 store
      const store = readStoreData() || {};
      store.rawReports = store.rawReports || [];
      store.rawReports.unshift({
        id: reportId,
        agent: agent || 'Unknown',
        date: date || new Date().toISOString().split('T')[0],
        filename,
        createdAt: new Date().toISOString(),
        preview: (rawText || '').slice(0, 120)
      });
      writeStoreData(store);

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: true, reportId, filename }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // 4. 获取指定原始报告内容
  if (req.method === 'GET' && pathname.startsWith('/api/raw-report/')) {
    const filename = pathname.replace('/api/raw-report/', '');
    const filePath = path.join(RAW_REPORTS_DIR, filename);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(content);
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Report file not found');
    }
    return;
  }

  // 5. 导出 JSON 文件
  if (req.method === 'GET' && pathname === '/api/export/json') {
    const store = readStoreData();
    const dateStr = new Date().toISOString().split('T')[0];
    const jsonStr = JSON.stringify(store, null, 2);
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="ielts-radar-backup-${dateStr}.json"`,
      'Content-Length': Buffer.byteLength(jsonStr)
    });
    res.end(jsonStr);
    return;
  }

  // 6. 导出 Markdown 文件
  if (req.method === 'GET' && pathname === '/api/export/markdown') {
    const store = readStoreData();
    const dateStr = new Date().toISOString().split('T')[0];
    const md = generateMarkdownExport(store);
    res.writeHead(200, {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="ielts-radar-${dateStr}.md"`,
      'Content-Length': Buffer.byteLength(md)
    });
    res.end(md);
    return;
  }

  // 7. 读取示例数据文件（便于前端快捷导入）
  if (req.method === 'GET' && pathname.startsWith('/api/examples/')) {
    const sampleName = pathname.replace('/api/examples/', '');
    const samplePath = path.join(EXAMPLES_DIR, sampleName);
    if (fs.existsSync(samplePath)) {
      const content = fs.readFileSync(samplePath, 'utf-8');
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(content);
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Sample not found');
    }
    return;
  }

  // --- 静态文件路由 ---
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);

  // 安全检查防止目录遍历
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 Forbidden');
    return;
  }

  serveStaticFile(res, filePath);
});

// 端口自动探测与启动
const DEFAULT_PORT = parseInt(process.env.PORT || '3000', 10);

function startServer(port) {
  server.listen(port, () => {
    console.log(`\n======================================================`);
    console.log(`  🚀 IELTS Radar｜我的 AI 雅思侦察日志 已启动`);
    console.log(`  👉 访问地址: http://localhost:${port}`);
    console.log(`  📁 数据目录: ${DATA_DIR}`);
    console.log(`  💾 持久存储: ${STORE_FILE}`);
    console.log(`======================================================\n`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`⚠️  端口 ${port} 被占用，正在尝试 ${port + 1}...`);
      startServer(port + 1);
    } else {
      console.error('Server error:', err);
    }
  });
}

startServer(DEFAULT_PORT);
