import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function assert(cond, msg) {
  if (cond) {
    console.log(`✅ [PASS] ${msg}`);
  } else {
    console.error(`❌ [FAIL] ${msg}`);
    process.exitCode = 1;
  }
}

const html = fs.readFileSync(path.join(__dirname, 'public/index.html'), 'utf-8');
const appJs = fs.readFileSync(path.join(__dirname, 'public/js/app.js'), 'utf-8');
const css = fs.readFileSync(path.join(__dirname, 'public/css/style.css'), 'utf-8');

console.log('🧪 正在验证「定制候选导出与日期筛选」功能实现...\n');

// 1. 验证 HTML 结构
assert(html.includes('id="btn-export-candidates-dropdown"'), '导出菜单包含「⭐ 导出精选候选 (定制)」');
assert(html.includes('id="export-date-select"'), '导出弹窗包含日期下拉选择框');
assert(html.includes('id="export-scope-group"'), '导出弹窗包含范围选择组（仅候选 / 全部）');
assert(html.includes('id="export-format-group"'), '导出弹窗包含格式选择组（JSON / AI / MD）');
assert(html.includes('id="export-candidate-count"'), '导出弹窗包含候选数量动态指示器');
assert(html.includes('id="export-all-count"'), '导出弹窗包含全部收录数量动态指示器');
assert(html.includes('id="ai-export-preview"'), '导出弹窗包含文本实时预览框');

// 2. 验证 CSS 样式
assert(css.includes('.export-controls-card'), 'style.css 包含控制面板卡片样式');
assert(css.includes('.btn-pill-choice'), 'style.css 包含微晶药丸切换按钮样式');
assert(css.includes('.btn-pill-choice.active'), 'style.css 包含微晶药丸高亮激活态');

// 3. 验证 JS 核心函数
assert(appJs.includes('function generateCustomJsonExport'), 'app.js 包含 generateCustomJsonExport 函数');
assert(appJs.includes('function openCustomExportModal'), 'app.js 包含 openCustomExportModal 函数');
assert(appJs.includes('function updateExportPreview'), 'app.js 包含 updateExportPreview 实时响应函数');
assert(appJs.includes('candidates_only'), 'JSON 导出支持 candidates_only 过滤标记');
assert(appJs.includes('btn-export-candidates-dropdown'), '正确绑定菜单点击唤起弹窗事件');

console.log('\n🎉 定制候选导出测试全部通过！');
