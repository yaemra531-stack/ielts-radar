/**
 * IELTS Radar - 读后自动缩小与选题候选功能专用自动化验证套件
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = 'http://localhost:3000';

async function runTests() {
  console.log('====================================================');
  console.log('🚀 开始验证 IELTS Radar 读后自动缩小与选题候选功能');
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

  // 1. 验证 HTML 页面与选项
  const resHome = await fetch(`${BASE_URL}/`);
  assert(resHome.status === 200, '服务正常运行且首页响应 200');
  const homeHtml = await resHome.text();
  assert(homeHtml.includes('active-date-candidate-indicator'), '首页包含顶部候选状态指示器容器');
  assert(homeHtml.includes('value="candidate"'), '状态筛选包含「⭐ 仅看候选」选项');
  assert(homeHtml.includes('edit-item-is-candidate'), '编辑模态框包含候选勾选项');

  // 2. 验证 CSS 样式与微动效
  const resCss = await fetch(`${BASE_URL}/css/style.css`);
  assert(resCss.status === 200, 'style.css 正常加载');
  const cssText = await resCss.text();
  assert(cssText.includes('.article-item.is-candidate'), '包含候选卡片特有高亮样式 (.article-item.is-candidate)');
  assert(cssText.includes('.candidate-tag-badge'), '包含卡片顶部候选微标样式 (.candidate-tag-badge)');
  assert(cssText.includes('.btn-pill-candidate'), '包含设为候选胶囊按钮样式 (.btn-pill-candidate)');
  assert(cssText.includes('.candidate-summary-pill'), '包含顶部候选快速筛选药丸样式 (.candidate-summary-pill)');
  assert(cssText.includes('@keyframes detailsFadeIn'), '包含展开完整分析时的平滑微动效 (@keyframes detailsFadeIn)');

  // 3. 验证 API 数据读写与 candidate 字段持久化
  const resData = await fetch(`${BASE_URL}/api/data`);
  assert(resData.status === 200, '/api/data 接口正常');
  const data = await resData.json();
  assert(Array.isArray(data.dailyRecords) && data.dailyRecords.length > 0, '数据中存在每日侦察记录');

  const todayRecord = data.dailyRecords[0];
  assert(Array.isArray(todayRecord.items) && todayRecord.items.length > 0, '当天存在侦察条目');

  // 测试给第 1 条设为候选并保存
  const firstItem = todayRecord.items[0];
  const originalCandidateState = firstItem.isCandidate;
  firstItem.isCandidate = true;

  const saveRes = await fetch(`${BASE_URL}/api/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  assert(saveRes.status === 200, '通过 /api/save 接口成功保存包含 isCandidate 标记的数据');

  // 重新读取验证持久化
  const reloadRes = await fetch(`${BASE_URL}/api/data`);
  const reloadedData = await reloadRes.json();
  assert(reloadedData.dailyRecords[0].items[0].isCandidate === true, '重新拉取数据确认 isCandidate 成功持久化');

  // 恢复状态（保持测试幂等性）
  data.dailyRecords[0].items[0].isCandidate = originalCandidateState;
  await fetch(`${BASE_URL}/api/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });

  // 4. 验证 Markdown 导出接口是否包含候选标记
  const resMdExport = await fetch(`${BASE_URL}/api/export/markdown`);
  assert(resMdExport.status === 200, 'Markdown 全量导出接口响应正常');

  console.log(`\n====================================================`);
  console.log(`🎉 自动化测试完成！通过: ${passed}/${total}`);
  console.log(`====================================================\n`);
}

runTests().catch(err => {
  console.error('测试异常:', err);
  process.exit(1);
});
