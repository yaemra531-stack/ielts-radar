import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { renderV22Overview } from '../public/js/prompt-v22-view.js';
import { mergeRemoteWithLocal, createBackup, readBackup } from '../public/js/data-safety.js';
const escapeHtml = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
const data = JSON.parse(fs.readFileSync(new URL('../public/data/radar-store.json', import.meta.url), 'utf8'));

test('overview renders version data, escapes every field and preserves the full source', () => {
  const marker = '<img src=x onerror=alert(1)>';
  const version = { version: 'V-test', promptContent: '原始提示词 <unchanged>', reason: marker, changeLog: '原始规则变化', overview: {
    goal: marker, daily_total: 7, quotas: [{ category: marker, count: 7, platform: marker, window: marker, threshold: marker, use: marker }],
    flow: [{ step: marker, desc: marker }], split: { ai: [marker], me: [marker] }, changes: [marker], not_do: [marker]
  } };
  const html = renderV22Overview(version, false, escapeHtml, 'Muse');
  assert.ok(html.includes('Muse · V-test'));
  assert.ok(html.includes('上限 7 条'));
  assert.ok(html.includes('原始规则变化'));
  assert.ok(html.includes('原始提示词 &lt;unchanged&gt;'));
  assert.ok(!html.includes(marker));
  assert.ok(html.includes(escapeHtml(marker)));
  assert.ok(!html.includes('当前生效'));
  assert.ok(html.includes('<details class="pv22-source">'));
  assert.ok(!html.includes('<details class="pv22-source" open'));
});

test('a repository overview reaches older browser caches, without changing reading marks, and survives full backup', () => {
  const cached = structuredClone(data);
  const v22 = cached.promptRegistry.workbuddy.find(v => v.version === 'V2.2');
  delete v22.overview;
  const first = cached.dailyRecords[0].items[0];
  first.isRead = true; first.isCandidate = true; first.note = 'keep my note';
  const before = JSON.stringify([data, cached]);
  const merged = mergeRemoteWithLocal(data, cached);
  assert.deepEqual(merged.promptRegistry.workbuddy.find(v => v.version === 'V2.2').overview, data.promptRegistry.workbuddy.find(v => v.version === 'V2.2').overview);
  assert.equal(merged.dailyRecords[0].items[0].note, first.note);
  assert.equal(merged.dailyRecords[0].items[0].isRead, true);
  assert.equal(merged.dailyRecords[0].items[0].isCandidate, true);
  assert.deepEqual(readBackup(JSON.stringify(createBackup(merged))).data, merged);
  assert.equal(JSON.stringify([data, cached]), before);
});
