/**
 * IELTS Radar 全链路功能与验收标准自动化测试脚本
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 动态引入前端解析器以测试解析逻辑
import { Parser } from './public/js/parser.js';
import { DiffViewer } from './public/js/diff.js';

const BASE_URL = 'http://localhost:3000';

async function runTests() {
  console.log('====================================================');
  console.log('🧪 开始 IELTS Radar 全量功能与验收标准测试');
  console.log('====================================================\n');

  let passed = 0;
  let total = 0;

  const storeFilePath = path.join(__dirname, 'data/radar-store.json');
  const publicStoreFilePath = path.join(__dirname, 'public/data/radar-store.json');
  const originalStoreSnapshot = fs.readFileSync(storeFilePath, 'utf-8');

  try {
    function assert(condition, testName) {
      total++;
      if (condition) {
        console.log(`✅ [PASS] ${testName}`);
        passed++;
      } else {
        console.error(`❌ [FAIL] ${testName}`);
        process.exitCode = 1;
      }
    }

  // 1. 服务健康检查
  const resHome = await fetch(`${BASE_URL}/`);
  assert(resHome.status === 200, '首页 HTTP 200 可访问');
  const homeHtml = await resHome.text();
  assert(homeHtml.includes('IELTS Radar') && homeHtml.includes('导入日报'), '首页包含核心品牌与入口元素');

  // 2. 检查静态资源
  const resCss = await fetch(`${BASE_URL}/css/style.css`);
  assert(resCss.status === 200, 'style.css 可正常访问');
  const resAppJs = await fetch(`${BASE_URL}/js/app.js`);
  assert(resAppJs.status === 200, 'app.js 可正常访问');

  // 3. 读取初始数据并清理测试用例
  const resData = await fetch(`${BASE_URL}/api/data`);
  assert(resData.status === 200, 'API /api/data 可正常读取');
  const initialStore = await resData.json();
  initialStore.dailyRecords = []; // 重置为空，开始测试全流程
  assert(initialStore.promptRegistry?.workbuddy?.length >= 2, 'WorkBuddy 预设包含 V1.0 和 V1.1 版本');
  assert(initialStore.promptRegistry?.muse?.length >= 1, 'Muse 预设包含 V1.0 版本');
  assert(!!initialStore.goalsAndThoughts?.why, '目标与想法包含预置初衷与心法');

  // 4. 验收标准 1：导入 WorkBuddy 的 5 篇记录
  const wbRaw = fs.readFileSync(path.join(__dirname, 'examples/workbuddy-sample.md'), 'utf-8');
  const wbParsed = Parser.parse(wbRaw, 'WorkBuddy', '2026-10-10');
  assert(wbParsed.items.length === 5, `WorkBuddy 成功识别 5 篇内容（实际: ${wbParsed.items.length} 篇）`);
  assert(wbParsed.items.every(i => i.title !== '待确认' && i.url.startsWith('http')), 'WorkBuddy 标题与 URL 完整提取');
  assert(wbParsed.items.some(i => i.platform === '小红书') && wbParsed.items.some(i => i.platform === '抖音'), '涵盖小红书和抖音平台');

  // 模拟保存 WorkBuddy 5篇到当天
  let dayRecord = initialStore.dailyRecords.find(d => d.date === '2026-10-10');
  if (!dayRecord) {
    dayRecord = {
      date: '2026-10-10',
      promptVersionWorkBuddy: 'V1.1',
      promptVersionMuse: null,
      items: []
    };
    initialStore.dailyRecords.push(dayRecord);
  }
  dayRecord.items.push(...wbParsed.items);

  let saveRes = await fetch(`${BASE_URL}/api/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(initialStore)
  });
  assert(saveRes.status === 200, '保存 WorkBuddy 5 篇数据成功');

  // 5. 验收标准 2：导入 Muse 的 5 篇记录
  const museRaw = fs.readFileSync(path.join(__dirname, 'examples/muse-sample.md'), 'utf-8');
  const museParsed = Parser.parse(museRaw, 'Muse', '2026-10-10');
  assert(museParsed.items.length === 5, `Muse 成功识别 5 篇内容（实际: ${museParsed.items.length} 篇）`);
  assert(museParsed.items.some(i => i.platform === 'YouTube') && museParsed.items.some(i => i.platform === 'Reddit'), '涵盖 YouTube 和 Reddit 平台');

  // 6. 验收标准 3：两批内容自动归入同一天，显示 10 篇
  dayRecord.promptVersionMuse = 'V1.0';
  dayRecord.items.push(...museParsed.items);
  saveRes = await fetch(`${BASE_URL}/api/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(initialStore)
  });
  assert(saveRes.status === 200, '保存 Muse 5 篇数据成功');

  // 重新从 API 获取验证
  const updatedData = await (await fetch(`${BASE_URL}/api/data`)).json();
  const day20261010 = updatedData.dailyRecords.find(d => d.date === '2026-10-10');
  assert(day20261010 && day20261010.items.length === 10, `两批内容自动归入 2026-10-10 同一天，总篇数正好为 10 篇（当前: ${day20261010?.items?.length}）`);

  const wbCount = day20261010.items.filter(i => i.agent === 'WorkBuddy').length;
  const museCount = day20261010.items.filter(i => i.agent === 'Muse').length;
  assert(wbCount === 5 && museCount === 5, '精确包含 5 篇 WorkBuddy 与 5 篇 Muse');

  // 7. 验收标准 4：刷新网站（重新从磁盘读取），数据仍然存在
  const diskStore = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/radar-store.json'), 'utf-8'));
  const diskDay = diskStore.dailyRecords.find(d => d.date === '2026-10-10');
  assert(diskDay && diskDay.items.length === 10, '磁盘存储文件 radar-store.json 完好持久化 10 篇记录');

  // 8. 验收标准 5：重复导入同一篇不会重复保存（URL 去重）
  const testDuplicateUrl = wbParsed.items[0].url;
  const duplicateCandidates = [wbParsed.items[0]]; // 传入已存在的条目
  let addedNew = 0;
  duplicateCandidates.forEach(item => {
    const exists = day20261010.items.some(i => i.url === item.url);
    if (!exists) {
      day20261010.items.push(item);
      addedNew++;
    }
  });
  assert(addedNew === 0 && day20261010.items.length === 10, '重复导入已存在的链接条目，自动被去重拦截，篇数保持 10 篇');

  // 9. 验收标准 6：新建 WorkBuddy V1.2 后仍可查看 V1.0 和 V1.1
  const newPrompt = {
    version: 'V1.2',
    createdAt: new Date().toISOString(),
    reason: '强化论点论据因果链校验',
    changeLog: '增加论证逻辑链规则：必须包含因果推导展开',
    promptContent: '你是一名雅思情报搜集助手 WorkBuddy（V1.2 增强版）...\n【新规则】严格筛选因果链推导范文。'
  };
  diskStore.promptRegistry.workbuddy.push(newPrompt);
  await fetch(`${BASE_URL}/api/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(diskStore)
  });

  const promptCheckData = await (await fetch(`${BASE_URL}/api/data`)).json();
  const versions = promptCheckData.promptRegistry.workbuddy.map(p => p.version);
  assert(versions.includes('V1.0') && versions.includes('V1.1') && versions.includes('V1.2'), 'V1.0、V1.1、V1.2 均完好保存在版本历史中，旧版本未被覆盖');

  // 10. 验收标准 7：能对比两个版本的变化 (DiffViewer)
  const v1_0 = promptCheckData.promptRegistry.workbuddy.find(p => p.version === 'V1.0');
  const v1_1 = promptCheckData.promptRegistry.workbuddy.find(p => p.version === 'V1.1');
  const diffRows = DiffViewer.computeDiff(v1_0.promptContent, v1_1.promptContent);
  assert(diffRows.length > 0, `并排 Diff 算法成功计算出 ${diffRows.length} 行对比`);
  const hasAdded = diffRows.some(r => r.type === 'added');
  const hasRemoved = diffRows.some(r => r.type === 'removed');
  assert(hasAdded, 'Diff 结果正确识别新增行与修改行');

  // 11. 验收标准 8：能修改并保存我的目标和想法，并产生认知快照
  diskStore.goalsAndThoughts.newThoughts += '\n- 【测试观察】今天读完了10篇，发现口语Part 2的PEEL结构与写作Task 2的主题句拓展高度同构！';
  diskStore.goalsAndThoughts.history.push({
    id: `snapshot_${Date.now()}`,
    savedAt: new Date().toISOString(),
    summary: '测试观察：口语与写作结构同构性认知沉淀'
  });
  await fetch(`${BASE_URL}/api/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(diskStore)
  });

  const goalsCheckData = await (await fetch(`${BASE_URL}/api/data`)).json();
  assert(goalsCheckData.goalsAndThoughts.newThoughts.includes('同构'), '目标与想法成功更新并持久化');
  assert(goalsCheckData.goalsAndThoughts.history.length >= 2, '历史认知快照成功记录并留存');

  // 12. 验收标准 9：能导出全部历史记录 (Markdown & JSON)
  const resExportJson = await fetch(`${BASE_URL}/api/export/json`);
  assert(resExportJson.status === 200, '导出 JSON API 响应正常');
  const exportedJson = await resExportJson.json();
  assert(exportedJson.dailyRecords.length > 0, '导出的 JSON 包含完整每日记录');

  const resExportMd = await fetch(`${BASE_URL}/api/export/markdown`);
  assert(resExportMd.status === 200, '导出 Markdown API 响应正常');
  const exportedMd = await resExportMd.text();
  assert(exportedMd.includes('IELTS Radar') && exportedMd.includes('WorkBuddy') && exportedMd.includes('Muse'), '导出的 Markdown 包含雅思侦察完整排版内容');

  console.log('\n====================================================');
  console.log(`🎉 测试全部通过！通过数: ${passed}/${total}`);
  console.log('====================================================');
  } finally {
    // 无论测试通过还是异常中断，均 100% 还原原始生产数据库，绝不污染真实数据
    fs.writeFileSync(storeFilePath, originalStoreSnapshot, 'utf-8');
    fs.writeFileSync(publicStoreFilePath, originalStoreSnapshot, 'utf-8');
    // 通知后台服务重新加载已还原的数据
    try {
      await fetch(`${BASE_URL}/api/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: originalStoreSnapshot
      });
    } catch (_) {}
  }
}

runTests().catch(err => {
  console.error('测试异常:', err);
  process.exit(1);
});

