/* Copyright 2019 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { assert, unreachable, warn } from "../shared/util.js";
import { RefSet, RefSetCache } from "./primitives.js";

class BaseLocalCache {
  constructor(options) {
    if (
      (typeof PDFJSDev === "undefined" || PDFJSDev.test("TESTING")) &&
      this.constructor === BaseLocalCache
    ) {
      unreachable("Cannot initialize BaseLocalCache.");
    }
    this._onlyRefs = options?.onlyRefs === true;

    if (!this._onlyRefs) {
      this._nameRefMap = new Map();
      this._imageMap = new Map();
    }
    this._imageCache = new RefSetCache();
  }

  getByName(name) {
    if (this._onlyRefs) {
      unreachable("Should not call `getByName` method.");
    }
    const ref = this._nameRefMap.get(name);
    if (ref) {
      return this.getByRef(ref);
    }
    return this._imageMap.get(name) || null;
  }

  getByRef(ref) {
    return this._imageCache.get(ref) || null;
  }

  set(name, ref, data) {
    unreachable("Abstract method `set` called.");
  }

  /**
   * Get all cached items
   * @returns {Array} Array of all cached items
   */
  getAll() {
    const items = [];
    if (!this._onlyRefs) {
      // Add all items from _imageMap
      for (const item of this._imageMap.values()) {
        items.push(item);
      }
    }
    // Add all items from _imageCache
    try {
      const cacheItems = this._imageCache.items();
      if (cacheItems && typeof cacheItems[Symbol.iterator] === "function") {
        for (const item of cacheItems) {
          items.push(item);
        }
      }
    } catch (e) {
      // _imageCache might not have an items() method, ignore
    }
    return items;
  }
}

class LocalImageCache extends BaseLocalCache {
  set(name, ref = null, data) {
    if (typeof name !== "string") {
      throw new Error('LocalImageCache.set - expected "name" argument.');
    }
    if (ref) {
      if (this._imageCache.has(ref)) {
        return;
      }
      this._nameRefMap.set(name, ref);
      this._imageCache.put(ref, data);
      return;
    }
    // name
    if (this._imageMap.has(name)) {
      return;
    }
    this._imageMap.set(name, data);
  }
}

class LocalColorSpaceCache extends BaseLocalCache {
  set(name = null, ref = null, data) {
    if (typeof name !== "string" && !ref) {
      throw new Error(
        'LocalColorSpaceCache.set - expected "name" and/or "ref" argument.'
      );
    }
    if (ref) {
      if (this._imageCache.has(ref)) {
        return;
      }
      if (name !== null) {
        // Optional when `ref` is defined.
        this._nameRefMap.set(name, ref);
      }
      this._imageCache.put(ref, data);
      return;
    }
    // name
    if (this._imageMap.has(name)) {
      return;
    }
    this._imageMap.set(name, data);
  }
}

class LocalFunctionCache extends BaseLocalCache {
  constructor(options) {
    super({ onlyRefs: true });
  }

  set(name = null, ref, data) {
    if (!ref) {
      throw new Error('LocalFunctionCache.set - expected "ref" argument.');
    }
    if (this._imageCache.has(ref)) {
      return;
    }
    this._imageCache.put(ref, data);
  }
}

class LocalGStateCache extends BaseLocalCache {
  set(name, ref = null, data) {
    if (typeof name !== "string") {
      throw new Error('LocalGStateCache.set - expected "name" argument.');
    }
    if (ref) {
      if (this._imageCache.has(ref)) {
        return;
      }
      this._nameRefMap.set(name, ref);
      this._imageCache.put(ref, data);
      return;
    }
    // name
    if (this._imageMap.has(name)) {
      return;
    }
    this._imageMap.set(name, data);
  }
}

class LocalTilingPatternCache extends BaseLocalCache {
  constructor(options) {
    super({ onlyRefs: true });
  }

  set(name = null, ref, data) {
    if (!ref) {
      throw new Error('LocalTilingPatternCache.set - expected "ref" argument.');
    }
    if (this._imageCache.has(ref)) {
      return;
    }
    this._imageCache.put(ref, data);
  }
}

class RegionalImageCache extends BaseLocalCache {
  constructor(options) {
    super({ onlyRefs: true });
  }

  set(name = null, ref, data) {
    if (!ref) {
      throw new Error('RegionalImageCache.set - expected "ref" argument.');
    }
    if (this._imageCache.has(ref)) {
      return;
    }
    this._imageCache.put(ref, data);
  }
}

class GlobalColorSpaceCache extends BaseLocalCache {
  constructor(options) {
    super({ onlyRefs: true });
  }

  set(name = null, ref, data) {
    if (!ref) {
      throw new Error('GlobalColorSpaceCache.set - expected "ref" argument.');
    }
    if (this._imageCache.has(ref)) {
      return;
    }
    this._imageCache.put(ref, data);
  }

  clear() {
    this._imageCache.clear();
  }
}

/**
 * 颜色过滤图像缓存
 * 为不同的颜色过滤状态缓存图像数据
 *
 * 缓存结构：RefSetCache<imageRef, Map<filterStateKey, imageDataEntry>>
 * 其中 imageDataEntry = { data, byteSize, createdAt }
 */
class FilteredImageCache {
  static MAX_FILTER_STATES_PER_IMAGE = 8; // 每个图像最多缓存8种颜色组合
  static MAX_TOTAL_BYTE_SIZE = 3e7; // 30MB 总缓存限制

  constructor() {
    // imageRef → Map<filterStateKey, imageDataEntry>
    this._cache = new RefSetCache();

    // 追踪总字节大小
    this._totalByteSize = 0;

    // LRU 访问记录：Map<combinedKey, timestamp>
    this._accessLog = new Map();
  }

  /**
   * 生成复合缓存键（用于 LRU 访问日志）
   * @param {Ref} ref - 图像引用
   * @param {string} filterStateKey - 颜色状态键
   * @returns {string}
   */
  _getCombinedKey(ref, filterStateKey) {
    const refStr =
      typeof ref === "string" ? ref : ref?.toString ? ref.toString() : "";
    return `${refStr}_${filterStateKey}`;
  }

  /**
   * 获取缓存的图像数据
   * @param {Ref} ref - 图像引用
   * @param {string} filterStateKey - 颜色状态键
   * @returns {Object|null} 图像数据，如果未找到返回 null
   */
  getData(ref, filterStateKey) {
    const stateMap = this._cache.get(ref);
    if (!stateMap) {
      return null;
    }

    const entry = stateMap.get(filterStateKey);
    if (!entry) {
      return null;
    }

    // 更新访问时间（LRU）
    const combinedKey = this._getCombinedKey(ref, filterStateKey);
    this._accessLog.set(combinedKey, Date.now());

    return entry.data;
  }

  /**
   * 设置缓存数据
   * @param {Ref} ref - 图像引用
   * @param {string} filterStateKey - 颜色状态键
   * @param {Object} imageData - 图像数据（包含 fn, args, optionalContent）
   * @param {number} byteSize - 数据大小（字节）
   */
  setData(ref, filterStateKey, imageData, byteSize = 0) {
    // 检查是否需要清理缓存
    if (this._shouldEvict(byteSize)) {
      this._evictLRU();
    }

    // 获取或创建该图像的状态映射
    let stateMap = this._cache.get(ref);
    if (!stateMap) {
      stateMap = new Map();
      this._cache.put(ref, stateMap);
    }

    // 检查该图像的过滤状态数量限制
    if (
      stateMap.size >= FilteredImageCache.MAX_FILTER_STATES_PER_IMAGE &&
      !stateMap.has(filterStateKey)
    ) {
      // 删除该图像最旧的过滤状态
      this._evictOldestState(ref, stateMap);
    }

    // 保存数据
    const entry = {
      data: imageData,
      byteSize,
      createdAt: Date.now(),
    };
    stateMap.set(filterStateKey, entry);

    this._totalByteSize += byteSize;

    // 记录访问
    const combinedKey = this._getCombinedKey(ref, filterStateKey);
    this._accessLog.set(combinedKey, Date.now());
  }

  /**
   * 判断是否需要驱逐缓存
   * @param {number} newByteSize - 即将添加的数据大小
   * @returns {boolean}
   */
  _shouldEvict(newByteSize) {
    return (
      this._totalByteSize + newByteSize > FilteredImageCache.MAX_TOTAL_BYTE_SIZE
    );
  }

  /**
   * 驱逐最久未使用的缓存（LRU）
   */
  _evictLRU() {
    // 找到最旧的访问记录
    let oldestKey = null;
    let oldestTime = Infinity;

    for (const [key, time] of this._accessLog.entries()) {
      if (time < oldestTime) {
        oldestTime = time;
        oldestKey = key;
      }
    }

    if (!oldestKey) {
      return;
    }

    // 解析 combinedKey 获取 ref 和 filterStateKey
    const lastUnderscore = oldestKey.lastIndexOf("_");
    const refStr = oldestKey.substring(0, lastUnderscore);
    const filterStateKey = oldestKey.substring(lastUnderscore + 1);

    // 从缓存中删除
    for (const [ref, stateMap] of this._cache) {
      if (ref.toString() === refStr) {
        const entry = stateMap.get(filterStateKey);
        if (entry) {
          this._totalByteSize -= entry.byteSize;
          stateMap.delete(filterStateKey);
          this._accessLog.delete(oldestKey);

          // 如果该图像没有任何过滤状态了，删除整个映射
          if (stateMap.size === 0) {
            this._cache.delete(ref);
          }
        }
        break;
      }
    }
  }

  /**
   * 驱逐指定图像最旧的过滤状态
   * @param {Ref} ref - 图像引用
   * @param {Map} stateMap - 状态映射
   */
  _evictOldestState(ref, stateMap) {
    let oldestStateKey = null;
    let oldestTime = Infinity;

    for (const [stateKey, entry] of stateMap.entries()) {
      if (entry.createdAt < oldestTime) {
        oldestTime = entry.createdAt;
        oldestStateKey = stateKey;
      }
    }

    if (oldestStateKey) {
      const entry = stateMap.get(oldestStateKey);
      this._totalByteSize -= entry.byteSize;
      stateMap.delete(oldestStateKey);

      const combinedKey = this._getCombinedKey(ref, oldestStateKey);
      this._accessLog.delete(combinedKey);
    }
  }

  /**
   * 清除指定图像的所有缓存状态
   * @param {Ref} ref - 图像引用
   */
  clearImage(ref) {
    const stateMap = this._cache.get(ref);
    if (!stateMap) {
      return;
    }

    // 减少总字节数
    for (const entry of stateMap.values()) {
      this._totalByteSize -= entry.byteSize;
    }

    // 删除访问日志
    for (const stateKey of stateMap.keys()) {
      const combinedKey = this._getCombinedKey(ref, stateKey);
      this._accessLog.delete(combinedKey);
    }

    this._cache.delete(ref);
  }

  /**
   * 清空所有缓存
   */
  clear() {
    this._cache.clear();
    this._accessLog.clear();
    this._totalByteSize = 0;
  }

  /**
   * 获取缓存统计信息
   * @returns {Object}
   */
  getStats() {
    let totalImages = 0;
    let totalStates = 0;

    for (const stateMap of this._cache) {
      totalImages++;
      totalStates += stateMap.size;
    }

    return {
      totalImages,
      totalStates,
      totalByteSize: this._totalByteSize,
      maxByteSize: FilteredImageCache.MAX_TOTAL_BYTE_SIZE,
      utilization:
        (
          (this._totalByteSize / FilteredImageCache.MAX_TOTAL_BYTE_SIZE) *
          100
        ).toFixed(2) + "%",
    };
  }
}

class GlobalImageCache {
  static NUM_PAGES_THRESHOLD = 2;

  static MIN_IMAGES_TO_CACHE = 10;

  static MAX_BYTE_SIZE = 5e7; // Fifty megabytes.

  #decodeFailedSet = new RefSet();

  constructor() {
    if (typeof PDFJSDev === "undefined" || PDFJSDev.test("TESTING")) {
      assert(
        GlobalImageCache.NUM_PAGES_THRESHOLD > 1,
        "GlobalImageCache - invalid NUM_PAGES_THRESHOLD constant."
      );
    }
    this._refCache = new RefSetCache();
    this._imageCache = new RefSetCache();
  }

  get #byteSize() {
    let byteSize = 0;
    for (const imageData of this._imageCache) {
      byteSize += imageData.byteSize;
    }
    return byteSize;
  }

  get #cacheLimitReached() {
    if (this._imageCache.size < GlobalImageCache.MIN_IMAGES_TO_CACHE) {
      return false;
    }
    if (this.#byteSize < GlobalImageCache.MAX_BYTE_SIZE) {
      return false;
    }
    return true;
  }

  shouldCache(ref, pageIndex) {
    let pageIndexSet = this._refCache.get(ref);
    if (!pageIndexSet) {
      pageIndexSet = new Set();
      this._refCache.put(ref, pageIndexSet);
    }
    pageIndexSet.add(pageIndex);

    if (pageIndexSet.size < GlobalImageCache.NUM_PAGES_THRESHOLD) {
      return false;
    }
    if (!this._imageCache.has(ref) && this.#cacheLimitReached) {
      return false;
    }
    return true;
  }

  addDecodeFailed(ref) {
    this.#decodeFailedSet.put(ref);
  }

  hasDecodeFailed(ref) {
    return this.#decodeFailedSet.has(ref);
  }

  /**
   * PLEASE NOTE: Must be called *after* the `setData` method.
   */
  addByteSize(ref, byteSize) {
    const imageData = this._imageCache.get(ref);
    if (!imageData) {
      return; // The image data isn't cached (the limit was reached).
    }
    if (imageData.byteSize) {
      return; // The byte-size has already been set.
    }
    imageData.byteSize = byteSize;
  }

  getData(ref, pageIndex) {
    const pageIndexSet = this._refCache.get(ref);
    if (!pageIndexSet) {
      return null;
    }
    if (pageIndexSet.size < GlobalImageCache.NUM_PAGES_THRESHOLD) {
      return null;
    }
    const imageData = this._imageCache.get(ref);
    if (!imageData) {
      return null;
    }
    // Ensure that we keep track of all pages containing the image reference.
    pageIndexSet.add(pageIndex);

    return imageData;
  }

  setData(ref, data) {
    if (!this._refCache.has(ref)) {
      throw new Error(
        'GlobalImageCache.setData - expected "shouldCache" to have been called.'
      );
    }
    if (this._imageCache.has(ref)) {
      return;
    }
    if (this.#cacheLimitReached) {
      warn("GlobalImageCache.setData - cache limit reached.");
      return;
    }
    this._imageCache.put(ref, data);
  }

  clear(onlyData = false) {
    if (!onlyData) {
      this.#decodeFailedSet.clear();
      this._refCache.clear();
    }
    this._imageCache.clear();
  }
}

export {
  FilteredImageCache,
  GlobalColorSpaceCache,
  GlobalImageCache,
  LocalColorSpaceCache,
  LocalFunctionCache,
  LocalGStateCache,
  LocalImageCache,
  LocalTilingPatternCache,
  RegionalImageCache,
};
