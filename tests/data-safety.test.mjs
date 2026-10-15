import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { mergeRemoteWithLocal, validateStore, createBackup, readBackup, previewRestore } from '../public/js/data-safety.js';

const item = (id, extra = {}) => ({ id, stableId: id, title: id, isRead: false, isCandidate: false, note: '', ...extra });
const day = (date, items, extra = {}) => ({ date, items, ...extra });
const prompt = (version, date = '2026-10-10', extra = {}) => ({ version, createdAt: `${date}T00:00:00Z`, promptContent: version, ...extra });
const store = (days = [], extra = {}) => ({
  systemInfo: {}, dailyRecords: days, promptRegistry: { workbuddy: [], muse: [] }, goalsAndThoughts: {}, rawReports: [], ...extra
});

test('refresh keeps local additions on the same day and local-only dates, without mutating either source', () => {
  const remote = store([day('2026-10-15', [item('a')])]);
  const local = store([day('2026-10-15', [item('a'), item('b', { category: '同行视频', video: { duration_sec: 60 } })]), day('2026-10-14', [item('c')])]);
  const before = JSON.stringify([remote, local]);
  const merged = mergeRemoteWithLocal(remote, local);
  assert.deepEqual(merged.dailyRecords.map(d => [d.date, d.items.map(i => i.id)]), [['2026-10-15', ['a', 'b']], ['2026-10-14', ['c']]]);
  assert.equal(merged.dailyRecords[0].items[1].video.duration_sec, 60);
  assert.equal(JSON.stringify([remote, local]), before);
  assert.deepEqual(mergeRemoteWithLocal(remote, merged), merged);
});

test('false flags and a deliberately emptied note survive refresh', () => {
  const remote = store([day('2026-10-15', [item('a', { isRead: true, isCandidate: true, note: 'old' })])]);
  const local = store([day('2026-10-15', [item('a')])]);
  assert.deepEqual(mergeRemoteWithLocal(remote, local).dailyRecords[0].items[0], item('a'));
});

test('missing local interaction fields do not erase repository interactions', () => {
  const localItem = { id: 'a', title: 'a' };
  const merged = mergeRemoteWithLocal(store([day('2026-10-15', [item('a', { isRead: true, note: 'kept' })])]), store([day('2026-10-15', [localItem])]));
  assert.equal(merged.dailyRecords[0].items[0].isRead, true);
  assert.equal(merged.dailyRecords[0].items[0].note, 'kept');
});

test('legacy IDs and rotated link tokens match once without losing notes', () => {
  const remote = store([day('2026-10-15', [item('new-id', { stableId: 'xhs_abc123', platform: '小红书', url: 'https://www.xiaohongshu.com/explore/abc123?xsec_token=new' })])]);
  const local = store([day('2026-10-15', [{ id: 'old-id', title: 'a', platform: '小红书', url: 'https://www.xiaohongshu.com/explore/abc123?xsec_token=old', note: 'my note' }])]);
  const items = mergeRemoteWithLocal(remote, local).dailyRecords[0].items;
  assert.equal(items.length, 1);
  assert.equal(items[0].note, 'my note');
  assert.match(items[0].url, /token=new/);
});

test('different long URLs never collapse because a derived fallback ID shares a prefix', () => {
  const prefix = 'https://example.com/a-very-long-shared-path-with-over-fifty-characters/';
  const remote = store([day('2026-10-15', [{ id: 'remote', title: 'one', url: `${prefix}one` }])]);
  const local = store([day('2026-10-15', [{ id: 'local', title: 'two', url: `${prefix}two` }])]);
  assert.equal(mergeRemoteWithLocal(remote, local).dailyRecords[0].items.length, 2);
});

test('future deliberate local content and day metadata edits survive an older repository copy', () => {
  const remote = store([day('2026-10-15', [item('a', { summary: 'old' })], { coverage: { old: true } })]);
  const local = store([day('2026-10-15', [item('a', { summary: 'manual edit', localEditedAt: '2026-10-15T01:00:00Z' })], { localEditedAt: '2026-10-15T01:00:00Z', coverage: { new: true } })]);
  const merged = mergeRemoteWithLocal(remote, local);
  assert.equal(merged.dailyRecords[0].items[0].summary, 'manual edit');
  assert.deepEqual(merged.dailyRecords[0].coverage, { new: true });
});

test('local prompt versions survive; a shared version uses repository content and both agents remain', () => {
  const remote = store([], { promptRegistry: { workbuddy: [prompt('V1.4'), prompt('V2.2', '2026-10-15')], muse: [prompt('V1.0')] } });
  const local = store([], { promptRegistry: { workbuddy: [prompt('V1.4', '2026-10-10', { promptContent: 'local duplicate' }), prompt('V-test', '2026-10-16')], muse: [prompt('V-local', '2026-10-16')] } });
  const registry = mergeRemoteWithLocal(remote, local).promptRegistry;
  assert.deepEqual(registry.workbuddy.map(p => p.version), ['V1.4', 'V2.2', 'V-test']);
  assert.equal(registry.workbuddy[0].promptContent, 'V1.4');
  assert.equal(registry.muse.length, 2);
});

test('legacy local goal history identifies an actual edit, while an untouched older cache accepts repository updates', () => {
  const remote = store([], { goalsAndThoughts: { why: 'repository', history: [{ id: 'old', savedAt: '2026-10-10' }, { id: 'repository-new', savedAt: '2026-10-15' }] } });
  const untouched = store([], { goalsAndThoughts: { why: 'older', history: [{ id: 'old', savedAt: '2026-10-10' }] } });
  assert.equal(mergeRemoteWithLocal(remote, untouched).goalsAndThoughts.why, 'repository');
  const edited = store([], { goalsAndThoughts: { why: '', history: [{ id: 'old', savedAt: '2026-10-10' }, { id: 'local-new', savedAt: '2026-10-15' }] } });
  assert.equal(mergeRemoteWithLocal(remote, edited).goalsAndThoughts.why, '');
});

test('complete backup round trips every section and accepts a legacy full-store backup', () => {
  const original = store([day('2026-10-15', [item('a', { isRead: true, isCandidate: true, note: 'personal' })])], {
    goalsAndThoughts: { why: 'goal', history: [{ id: 'h' }] }, promptRegistry: { workbuddy: [prompt('V2.2')], muse: [] }, rawReports: [{ id: 'r', filename: 'raw.txt' }], fixed_creators: [{ name: 'example' }]
  });
  assert.deepEqual(readBackup(JSON.stringify(createBackup(original))).data, original);
  assert.deepEqual(readBackup(JSON.stringify(original)).data, original);
  assert.deepEqual(previewRestore(store(), original).data, original);
});

test('restore previews are non-destructive and offer both explicit conflict policies without removing unique records', () => {
  const current = store([day('2026-10-15', [item('a', { note: 'current', isRead: false }), item('current-only')])], { goalsAndThoughts: { why: 'current' }, promptRegistry: { workbuddy: [prompt('V1', '2026-10-10', { promptContent: 'current' })] } });
  const backup = store([day('2026-10-15', [item('a', { note: 'backup', isRead: true }), item('backup-only')]), day('2026-10-14', [item('old')])], { goalsAndThoughts: { why: 'backup' }, promptRegistry: { workbuddy: [prompt('V1', '2026-10-10', { promptContent: 'backup' })] } });
  const before = JSON.stringify([current, backup]);
  for (const preferBackup of [false, true]) {
    const result = previewRestore(current, backup, preferBackup);
    assert.equal(result.addedItems, 2);
    assert.equal(result.addedDays, 1);
    const restored = result.data.dailyRecords[0].items.find(i => i.id === 'a');
    assert.equal(restored.note, preferBackup ? 'backup' : 'current');
    assert.equal(restored.isRead, preferBackup);
    assert.equal(result.data.goalsAndThoughts.why, preferBackup ? 'backup' : 'current');
    assert.equal(result.data.promptRegistry.workbuddy[0].promptContent, preferBackup ? 'backup' : 'current');
  }
  assert.equal(JSON.stringify([current, backup]), before);
});

test('bad files, daily reports, clean exports, partial stores, invalid marks and future backup versions are rejected', () => {
  for (const bad of ['broken', '[]', '{"items":[]}', '{"dailyRecords":[]}', JSON.stringify({ format: 'ielts-radar-backup', formatVersion: 99, data: store() }), JSON.stringify(store([day('2026-10-15', [item('a', { isRead: 'yes' })])]))]) {
    assert.throws(() => readBackup(bad));
  }
});

function appHarness({ remote = store(), cached = null, writeFails = false, backend = false, backendSaveFails = false } = {}) {
  const source = fs.readFileSync(new URL('../public/js/app.js', import.meta.url), 'utf8');
  const code = source.slice(source.indexOf('function writeLocalCache('), source.indexOf('// --- 渲染路由分发 ---'));
  const storage = new Map(cached ? [['ielts_radar_cache', JSON.stringify(cached)]] : []);
  const badge = {};
  const toasts = [];
  const posts = [];
  const state = { data: store(), backendAvailable: false, expandedDates: new Set() };
  const context = {
    state, mergeRemoteWithLocal, validateStore,
    document: { getElementById: () => badge }, renderApp() {},
    showToast: (...args) => toasts.push(args),
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => { if (writeFails) throw new Error('quota'); storage.set(key, value); } },
    fetch: async (url, options) => {
      if (options?.method === 'POST') { posts.push(JSON.parse(options.body)); return { ok: !backendSaveFails }; }
      if (url === '/api/data' && !backend) return { ok: false };
      return { ok: true, json: async () => structuredClone(remote) };
    }
  };
  const api = vm.runInNewContext(`${code}\n({loadData, persistData})`, context);
  return { api, state, storage, badge, toasts, posts };
}

test('loading under quota pressure keeps all merged records in memory and leaves the prior cache untouched', async () => {
  const cached = store([day('2026-10-15', [item('a'), item('b')])]);
  const h = appHarness({ remote: store([day('2026-10-15', [item('a')])]), cached, writeFails: true });
  await h.api.loadData();
  assert.equal(h.state.data.dailyRecords[0].items.length, 2);
  assert.deepEqual(JSON.parse(h.storage.get('ielts_radar_cache')), cached);
  assert.match(h.badge.innerHTML, /尚未保存/);
});

test('Pages saves do not claim a server backup or send save requests to an unavailable backend', async () => {
  const h = appHarness();
  await h.api.loadData();
  assert.equal(await h.api.persistData('saved'), true);
  assert.match(h.badge.innerHTML, /仅存此浏览器/);
  assert.equal(h.posts.length, 0);
});

test('failed browser and backend saves report failure, while a successful backend is identified accurately', async () => {
  const failed = appHarness({ writeFails: true, backend: true, backendSaveFails: true });
  await failed.api.loadData();
  assert.equal(await failed.api.persistData('saved'), false);
  assert.match(failed.badge.innerHTML, /尚未保存/);
  assert.equal(failed.toasts.at(-1)[1], 'error');
  const saved = appHarness({ backend: true });
  await saved.api.loadData();
  assert.equal(await saved.api.persistData('saved'), true);
  assert.match(saved.badge.innerHTML, /已保存本机文件/);
});

test('a failed restore cache write cannot change the current cache or the backend', async () => {
  const current = store([day('2026-10-15', [item('current')])]);
  const h = appHarness({ cached: current, remote: current, writeFails: true, backend: true });
  await h.api.loadData();
  const before = h.storage.get('ielts_radar_cache');
  const restored = store([day('2026-10-15', [item('backup')])]);
  assert.equal(await h.api.persistData('restore', restored, { requireLocal: true }), false);
  assert.equal(h.storage.get('ielts_radar_cache'), before);
  assert.equal(h.posts.length, 0);
  assert.deepEqual(h.state.data, current);
});
