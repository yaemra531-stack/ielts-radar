import { Parser } from './parser.js';

const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const clone = value => JSON.parse(JSON.stringify(value));
const time = value => Date.parse(value || '') || 0;
const personalFields = ['isRead', 'isCandidate', 'note'];

// 多种标识可互相补位：旧数据缺少 stableId、链接令牌变化时也能认出同一篇。
function itemKeys(item) {
  const keys = [];
  if (item.stableId) keys.push(`stable:${item.stableId}`);
  if (item.id) keys.push(`id:${item.id}`);
  if (item.url) {
    keys.push(`url:${Parser.normalizeUrl(item.url)}`);
    const contentId = Parser.extractStableContentId(item.platform, item.url);
    if (/^(xhs_[a-z0-9]+|douyin_\d+|x_\d+|reddit_[a-z0-9]+|youtube_[a-z0-9_-]{11}|bilibili_BV[a-z0-9]+)$/i.test(contentId)) {
      keys.push(`stable:${contentId}`);
    }
  }
  return keys;
}

function indexItems(items) {
  const index = new Map();
  items.forEach(item => itemKeys(item).forEach(key => { if (!index.has(key)) index.set(key, item); }));
  return index;
}

function findItem(index, item) {
  return itemKeys(item).map(key => index.get(key)).find(Boolean);
}

function unionRows(primary = [], secondary = []) {
  const seen = new Set();
  return [...primary, ...secondary].filter(row => {
    const key = row.id || row.filename || JSON.stringify(row);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mergePrompts(primary = {}, secondary = {}) {
  return Object.fromEntries([...new Set([...Object.keys(primary), ...Object.keys(secondary)])].map(agent => {
    const versions = new Map();
    (secondary[agent] || []).forEach(prompt => versions.set(prompt.version, prompt));
    (primary[agent] || []).forEach(prompt => versions.set(prompt.version, prompt));
    return [agent, [...versions.values()].sort((a, b) => time(a.createdAt) - time(b.createdAt))];
  }));
}

function mergeGoals(primary = {}, secondary = {}, syncing = false) {
  const history = unionRows(primary.history, secondary.history).sort((a, b) => time(a.savedAt) - time(b.savedAt));
  const primaryHistory = new Set((primary.history || []).map(row => row.id || row.savedAt));
  const locallyEdited = time(secondary.localEditedAt) > time(primary.localEditedAt)
    || (secondary.history || []).some(row => !primaryHistory.has(row.id || row.savedAt));
  const useSecondary = Object.keys(primary).length === 0 || (syncing && locallyEdited);
  const goals = useSecondary ? { ...primary, ...secondary } : { ...secondary, ...primary };
  if (history.length || primary.history || secondary.history) goals.history = history;
  return goals;
}

function mergeStores(primary, secondary, syncing = false) {
  const primaryDays = primary.dailyRecords || [];
  const secondaryDays = secondary.dailyRecords || [];
  const secondaryByDate = new Map(secondaryDays.map(day => [day.date, day]));
  const secondaryItems = indexItems(secondaryDays.flatMap(day => day.items || []));
  const mergedDays = [];
  const dates = new Set();

  primaryDays.forEach(day => {
    dates.add(day.date);
    const other = secondaryByDate.get(day.date);
    const otherIndex = indexItems(other?.items || []);
    const present = new Map();
    const items = (day.items || []).map(item => {
      const sameDay = findItem(otherIndex, item);
      const local = sameDay || (syncing && findItem(secondaryItems, item));
      const useLocalContent = syncing && sameDay?.localEditedAt
        && time(sameDay.localEditedAt) >= time(item.localEditedAt);
      const mergedItem = useLocalContent ? { ...item, ...sameDay } : { ...sameDay, ...item };
      if (syncing && local) {
        // false 和空笔记也是用户的选择，不能用 truthy 判断把它们撤销。
        personalFields.forEach(key => { if (own(local, key)) mergedItem[key] = local[key]; });
      }
      itemKeys(item).forEach(key => present.set(key, mergedItem));
      if (sameDay) itemKeys(sameDay).forEach(key => present.set(key, mergedItem));
      return mergedItem;
    });
    (other?.items || []).forEach(item => {
      if (!findItem(present, item)) {
        items.push(item);
        itemKeys(item).forEach(key => present.set(key, item));
      }
    });
    const localDayNewer = syncing && other?.localEditedAt
      && time(other.localEditedAt) >= time(day.localEditedAt);
    mergedDays.push({ ...(localDayNewer ? day : other), ...(localDayNewer ? other : day), items });
  });
  secondaryDays.forEach(day => { if (!dates.has(day.date)) mergedDays.push(day); });
  mergedDays.sort((a, b) => b.date.localeCompare(a.date));

  return clone({
    ...secondary,
    ...primary,
    dailyRecords: mergedDays,
    promptRegistry: mergePrompts(primary.promptRegistry, secondary.promptRegistry),
    goalsAndThoughts: mergeGoals(primary.goalsAndThoughts, secondary.goalsAndThoughts, syncing),
    rawReports: unionRows(primary.rawReports, secondary.rawReports)
  });
}

export function mergeRemoteWithLocal(remote, cached) {
  if (!remote) return clone(cached);
  if (!cached) return clone(remote);
  return mergeStores(remote, cached, true);
}

export function validateStore(data) {
  if (!object(data) || !Array.isArray(data.dailyRecords) || !object(data.promptRegistry)
    || !object(data.goalsAndThoughts) || !object(data.systemInfo)) {
    throw new Error('这不是完整备份。请选择“下载完整备份”保存的 JSON 文件，不能使用日报或精简导出。');
  }
  const dates = new Set();
  data.dailyRecords.forEach(day => {
    if (!object(day) || typeof day.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day.date)
      || dates.has(day.date) || !Array.isArray(day.items)) throw new Error('备份中的日期记录格式不完整或重复，未恢复任何数据。');
    dates.add(day.date);
    day.items.forEach(item => {
      if (!object(item) || typeof item.title !== 'string'
        || !['id', 'stableId', 'url'].some(key => typeof item[key] === 'string' && item[key])) {
        throw new Error('备份中有无法识别的条目，未恢复任何数据。');
      }
      ['id', 'stableId', 'url', 'platform', 'note'].forEach(key => {
        if (own(item, key) && typeof item[key] !== 'string' && item[key] !== null) throw new Error('备份条目字段格式不正确。');
      });
      ['isRead', 'isCandidate'].forEach(key => {
        if (own(item, key) && typeof item[key] !== 'boolean') throw new Error('备份中的阅读标记格式不正确。');
      });
    });
  });
  Object.values(data.promptRegistry).forEach(list => {
    if (!Array.isArray(list) || list.some(prompt => !object(prompt) || typeof prompt.version !== 'string'
      || typeof prompt.promptContent !== 'string')) throw new Error('备份中的提示词版本格式不正确。');
  });
  ['rawReports'].forEach(key => {
    if (own(data, key) && (!Array.isArray(data[key]) || data[key].some(row => !object(row)))) throw new Error('备份归档信息格式不正确。');
  });
  const goals = data.goalsAndThoughts;
  ['why', 'coreGoals', 'strategyPrinciples', 'newThoughts'].forEach(key => {
    if (own(goals, key) && typeof goals[key] !== 'string') throw new Error('备份中的目标内容格式不正确。');
  });
  if (own(goals, 'history') && (!Array.isArray(goals.history) || goals.history.some(row => !object(row)))) {
    throw new Error('备份中的目标历史格式不正确。');
  }
  return data;
}

export function createBackup(data, exportedAt = new Date().toISOString()) {
  validateStore(data);
  return { format: 'ielts-radar-backup', formatVersion: 1, exportedAt, data: clone(data) };
}

export function readBackup(text) {
  let parsed;
  try { parsed = JSON.parse(text); } catch (_) { throw new Error('文件不是有效的 JSON，未恢复任何数据。'); }
  if (parsed?.format === 'ielts-radar-backup') {
    if (parsed.formatVersion !== 1) throw new Error('暂不支持这个备份版本，请保留原文件。');
    return { data: validateStore(parsed.data), exportedAt: parsed.exportedAt || null };
  }
  // 兼容旧版本直接下载的 radar-store 全量 JSON。
  return { data: validateStore(parsed), exportedAt: null };
}

export function storeSummary(data) {
  const days = data.dailyRecords || [];
  const items = days.flatMap(day => day.items || []);
  const dates = days.map(day => day.date).sort();
  return {
    days: days.length, items: items.length,
    read: items.filter(item => item.isRead).length,
    candidates: items.filter(item => item.isCandidate).length,
    notes: items.filter(item => item.note?.trim()).length,
    prompts: Object.values(data.promptRegistry || {}).reduce((sum, list) => sum + list.length, 0),
    start: dates[0] || null, end: dates[dates.length - 1] || null
  };
}

export function previewRestore(current, backup, preferBackup = false) {
  validateStore(current);
  validateStore(backup);
  const data = preferBackup ? mergeStores(backup, current) : mergeStores(current, backup);
  const before = storeSummary(current);
  const after = storeSummary(data);
  return { data, before, after, addedDays: after.days - before.days, addedItems: after.items - before.items };
}
