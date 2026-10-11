/**
 * IELTS Radar - 核心研究目标 V2.0 专用验证测试套件
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { Parser } from './public/js/parser.js';
import { DiffViewer } from './public/js/diff.js';

const BASE_URL = 'http://localhost:3000';

async function runV2Tests() {
  console.log('====================================================');
  console.log('🚀 开始验证 IELTS Radar 三大核心研究目标 V2.0 升级');
  console.log('====================================================\n');

  let passed = 0;
  let total = 0;

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

  // 1. 首页及目标页结构验证
  const resHome = await fetch(`${BASE_URL}/`);
  assert(resHome.status === 200, '首页正常访问');
  const homeHtml = await resHome.text();
  assert(homeHtml.includes('三大核心研究目标 V2.0'), '首页包含核心研究目标 V2.0 导向条');
  assert(homeHtml.includes('① 发现') && homeHtml.includes('② 理解') && homeHtml.includes('③ 价值'), '首页导向条包含三问：发现、理解、价值');
  assert(homeHtml.includes('长期指导原则 · 三个核心研究目标 V2.0'), '目标与想法页面包含长期指导原则展示卡片');

  // 2. 解析器 reader_value 识别验证 (从 Markdown)
  const wbRaw = fs.readFileSync(path.join(__dirname, 'examples/workbuddy-sample.md'), 'utf-8');
  const wbParsed = Parser.parse(wbRaw, 'WorkBuddy', '2026-10-10');
  assert(wbParsed.items.length === 5, 'WorkBuddy 样本正确解析出 5 篇条目');
  assert(wbParsed.items.every(i => typeof i.reader_value === 'string' && i.reader_value.length > 5), 'WorkBuddy 样本全部提取出高价值的 reader_value');

  const museRaw = fs.readFileSync(path.join(__dirname, 'examples/muse-sample.md'), 'utf-8');
  const museParsed = Parser.parse(museRaw, 'Muse', '2026-10-10');
  assert(museParsed.items.length === 5, 'Muse 样本正确解析出 5 篇条目');
  assert(museParsed.items.every(i => typeof i.reader_value === 'string' && i.reader_value.length > 5), 'Muse 样本全部提取出高价值的 reader_value');

  // 3. 【核心验证】旧数据兼容性：缺少 reader_value 字段时必须兼容
  const legacyRawItem = {
    title: '雅思口语Part 1回答长度控制（旧版数据测试）',
    platform: '小红书',
    publishDate: '2026-10-01',
    engagement: '赞 450 · 藏 320',
    summary: '分析考官在Part 1对答案长度的期望，建议每题保持在2-3句话之间。',
    url: 'https://www.xiaohongshu.com/discovery/item/legacy123456789'
    // 注意：故意不提供 reader_value 字段！
  };

  const parsedLegacy = Parser.parseJson([legacyRawItem], 'WorkBuddy', '2026-10-10');
  assert(parsedLegacy.items.length === 1, '旧版无 reader_value 数据成功导入，没有报错');
  assert(parsedLegacy.items[0].reader_value === '', '旧版数据 reader_value 优雅默认为空字符串，绝不自动胡乱编造');
  assert(parsedLegacy.items[0].title === legacyRawItem.title, '原有标题与内容完整保留无损');

  // 4. 【核心验证】JSON 格式带 reader_value 导入测试
  const standardJson = [
    {
      title: '雅思听力数字与字母拼读专项突破',
      platform: '小红书',
      publishDate: '2026-10-09',
      engagement: '赞 890 · 藏 1200',
      summary: '梳理了高频易混数字（13 vs 30）与英国邮编/电话号码连读规律。',
      reader_value: '提供了易混音对比练习表，帮基础考生消灭听力填空题送分项失误。',
      url: 'https://www.xiaohongshu.com/discovery/item/json_standard_001'
    }
  ];
  const parsedJson = Parser.parseJson(standardJson, 'WorkBuddy', '2026-10-10');
  assert(parsedJson.items.length === 1, '标准 JSON 成功导入');
  assert(parsedJson.items[0].reader_value.includes('易混音对比练习表'), '正确识别并保留传入的 reader_value');

  // 5. 【核心验证】提示词版本库历史保留与新版本追加
  const storeRes = await fetch(`${BASE_URL}/api/data`);
  const store = await storeRes.json();
  const wbVersions = (store.promptRegistry?.workbuddy || []).map(p => p.version);
  const museVersions = (store.promptRegistry?.muse || []).map(p => p.version);

  assert(wbVersions.includes('V1.0') && wbVersions.includes('V1.1') && wbVersions.includes('V1.2'), 'WorkBuddy 历史旧版本 V1.0、V1.1、V1.2 完好保留未被覆盖');
  assert(wbVersions.includes('V1.3'), '成功记录新版本 WorkBuddy V1.3（三核心研究目标 V2.0 导向版）');
  assert(museVersions.includes('V1.0'), 'Muse 历史旧版本 V1.0 完好保留');
  assert(museVersions.includes('V1.1'), '成功记录新版本 Muse V1.1（三核心研究目标 V2.0 导向版）');

  // 验证 V1.3 的变更说明中体现了三问导向
  const v1_3 = store.promptRegistry.workbuddy.find(p => p.version === 'V1.3');
  assert(v1_3.promptContent.includes('三大核心研究目标') && v1_3.promptContent.includes('读者价值'), 'V1.3 提示词中明确包含三大核心研究目标与读者价值字段要求');

  // 6. 【核心验证】并排 Diff 比较新旧版本
  const diffRows = DiffViewer.computeDiff(v1_3.promptContent, store.promptRegistry.workbuddy.find(p => p.version === 'V1.0').promptContent);
  assert(diffRows.length > 0, 'Side-by-side Diff 对比新旧提示词工作正常');

  // 7. 【核心验证】目标与想法持久化内容包含 V2.0 三大目标
  assert(store.goalsAndThoughts?.coreGoals?.includes('三大核心研究目标 V2.0'), '持久化目标中包含核心研究目标 V2.0');
  assert(store.goalsAndThoughts?.coreGoals?.includes('① 发现') && store.goalsAndThoughts?.coreGoals?.includes('② 理解') && store.goalsAndThoughts?.coreGoals?.includes('③ 价值'), '持久化目标中完整阐述了发现、理解、价值三问');

  // 8. 【核心验证】Markdown 导出包含「读者价值」字段
  const mdRes = await fetch(`${BASE_URL}/api/export/markdown`);
  const mdText = await mdRes.text();
  assert(mdText.includes('读者价值'), '导出的 Markdown 文档中正确包含读者价值字段');

  console.log('\n====================================================');
  console.log(`🎉 全部 V2.0 专项测试通过！通过数: ${passed}/${total}`);
  console.log('====================================================\n');
}

runV2Tests().catch(err => {
  console.error('测试失败:', err);
  process.exit(1);
});
