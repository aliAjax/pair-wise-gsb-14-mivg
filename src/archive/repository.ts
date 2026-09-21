// 本地档案层：只负责 Archive 在浏览器 localStorage 的装载与保存。
// 领域规则与展示层都不直接读写 localStorage，便于将来替换成接口实现。

import type { Archive } from "../domain/types";
import { buildSeedArchive, STORAGE_KEY } from "../domain/seed";

/**
 * 装载档案：
 *  - 无记录时写入并返回演示种子数据
 *  - JSON 损坏或结构不符时回退到种子数据，避免白屏
 */
export function loadArchive(): Archive {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    raw = null;
  }
  if (!raw) {
    const seed = buildSeedArchive();
    saveArchive(seed);
    return seed;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<Archive>;
    if (!isValidArchive(parsed)) {
      const seed = buildSeedArchive();
      saveArchive(seed);
      return seed;
    }
    return parsed;
  } catch {
    const seed = buildSeedArchive();
    saveArchive(seed);
    return seed;
  }
}

export function saveArchive(archive: Archive): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(archive));
  } catch {
    // 存储不可用（隐私模式/超额）时仅静默，内存中的会话仍可操作
  }
}

export function resetArchive(): Archive {
  const seed = buildSeedArchive();
  saveArchive(seed);
  return seed;
}

function isValidArchive(value: Partial<Archive>): value is Archive {
  return (
    !!value &&
    value.schemaVersion === 1 &&
    Array.isArray(value.stations) &&
    Array.isArray(value.quotas) &&
    Array.isArray(value.priceVersions) &&
    Array.isArray(value.appeals) &&
    Array.isArray(value.events)
  );
}
