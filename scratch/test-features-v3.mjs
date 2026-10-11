import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ARTIFACTS_DIR = '/Users/curry/.gemini/antigravity-ide/brain/d9590727-b29a-4eb4-a0d5-f41addf3d5ed';

const port = 9333;
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new',
  '--remote-debugging-port=' + port,
  '--user-data-dir=/tmp/chrome-features-v3-' + Date.now(),
  '--window-size=1440,1050',
  'http://localhost:3000'
]);

await new Promise(r => setTimeout(r, 2000));

let targets = [];
for (let i = 0; i < 15; i++) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json`);
    targets = await res.json();
    if (targets.some(t => t.type === 'page' && t.url.includes('localhost:3000'))) {
      break;
    }
  } catch (_) {}
  await new Promise(r => setTimeout(r, 400));
}

const pageTarget = targets.find(t => t.type === 'page' && t.url.includes('localhost:3000'));
if (!pageTarget) {
  console.error('Page target not found');
  chrome.kill();
  process.exit(1);
}

const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
let id = 1;
function send(method, params = {}) {
  return new Promise((resolve) => {
    const curId = id++;
    const handler = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id === curId) {
        ws.removeEventListener('message', handler);
        resolve(msg.result);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id: curId, method, params }));
  });
}

await new Promise(r => ws.onopen = r);

await send('Emulation.setDeviceMetricsOverride', {
  width: 1440,
  height: 1050,
  deviceScaleFactor: 2,
  mobile: false
});

async function evalInPage(expression) {
  const res = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true
  });
  return res.result ? res.result.value : undefined;
}

await new Promise(r => setTimeout(r, 1000));

console.log('--- 1. 验证进度组件展示 ---');
const progressInfo = await evalInPage(`
  (() => {
    const fill = document.getElementById('dp-progress-fill');
    const stats = document.getElementById('dp-progress-stats');
    const milestone = document.getElementById('dp-milestone-banner');
    return {
      fillWidth: fill ? fill.style.width : null,
      statsText: stats ? stats.textContent : null,
      milestoneDisplay: milestone ? milestone.style.display : null
    };
  })()
`);
console.log('Progress Info:', progressInfo);

console.log('--- 2. 截取带有每日认知进度条的首页视图 ---');
const ss1 = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(path.join(ARTIFACTS_DIR, 'screenshot_daily_progress_widget.png'), Buffer.from(ss1.data, 'base64'));
console.log('Saved screenshot_daily_progress_widget.png');

console.log('--- 3. 验证并打开 AI 选题讨论导出弹窗 ---');
const openModalRes = await evalInPage(`
  (() => {
    const btn = document.getElementById('btn-open-ai-export');
    if (!btn) return { error: 'btn-open-ai-export not found' };
    btn.click();
    const modal = document.getElementById('modal-ai-export');
    const preview = document.getElementById('ai-export-preview');
    return {
      modalActive: modal.classList.contains('active'),
      previewLength: preview ? preview.value.length : 0,
      previewHeader: preview ? preview.value.slice(0, 300) : ''
    };
  })()
`);
console.log('AI Modal Info:', openModalRes);

await new Promise(r => setTimeout(r, 600));

console.log('--- 4. 截取 AI 选题讨论弹窗视图 ---');
const ss2 = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(path.join(ARTIFACTS_DIR, 'screenshot_ai_topic_export_modal.png'), Buffer.from(ss2.data, 'base64'));
console.log('Saved screenshot_ai_topic_export_modal.png');

console.log('--- 5. 验证目标与想法页面更新与历史快照 ---');
const goalsInfo = await evalInPage(`
  (() => {
    document.getElementById('btn-close-ai-export')?.click();
    const navBtn = document.querySelector('.nav-tab[data-tab="goals"]');
    if (navBtn) navBtn.click();
    const why = document.getElementById('doc-display-why');
    const strategy = document.getElementById('doc-display-strategy');
    const thoughts = document.getElementById('doc-display-thoughts');
    return {
      whyText: why ? why.textContent.slice(0, 100) : '',
      hasWorkBuddyV14: why ? why.textContent.includes('WorkBuddy V1.4') : false,
      strategyHasStableId: strategy ? strategy.textContent.includes('稳定ID去重') : false,
      thoughtsLength: thoughts ? thoughts.textContent.length : 0
    };
  })()
`);
console.log('Goals Page Info:', goalsInfo);

await new Promise(r => setTimeout(r, 600));

console.log('--- 6. 截取目标与想法页面 ---');
const ss3 = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(path.join(ARTIFACTS_DIR, 'screenshot_updated_goals_page.png'), Buffer.from(ss3.data, 'base64'));
console.log('Saved screenshot_updated_goals_page.png');

chrome.kill();
console.log('🎉 验证全部顺利完成！');
