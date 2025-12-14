/* Copyright 2025 Mozilla Foundation
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

/**
 * ColorFilterConfig manages color visibility settings for CMYK channels and spot colors.
 * Similar to OptionalContentConfig, this is a configurable object that can be passed
 * through promises to the rendering pipeline.
 */
class ColorFilterConfig {
  #colors = new Map([
    ["Cyan", true],
    ["Magenta", true],
    ["Yellow", true],
    ["Black", true],
  ]);

  #enabled = true;

  #overprint = false;

  constructor(initialConfig = {}) {
    if (initialConfig.colors) {
      if (initialConfig.colors instanceof Map) {
        this.#colors = new Map(initialConfig.colors);
      } else if (typeof initialConfig.colors === "object") {
        this.#colors = new Map(Object.entries(initialConfig.colors));
      }
    }
    if (initialConfig.enabled !== undefined) {
      this.#enabled = !!initialConfig.enabled;
    }
    if (initialConfig.overprint !== undefined) {
      this.#overprint = !!initialConfig.overprint;
    }
  }

  /**
   * Set the visibility of a color channel or spot color.
   * @param {string} colorName - The name of the color (e.g., "Cyan", "Magenta", "Yellow", "Black", or a spot color name)
   * @param {boolean} visible - Whether the color should be visible
   */
  setVisibility(colorName, visible) {
    this.#colors.set(colorName, !!visible);
  }

  /**
   * Check if a color channel or spot color is visible.
   * @param {string} colorName - The name of the color
   * @returns {boolean} True if the color is visible, false otherwise
   */
  isVisible(colorName) {
    if (!this.#enabled) {
      return true; // If filter is disabled, all colors are visible
    }
    return this.#colors.get(colorName) !== false;
  }

  /**
   * Get the current configuration as a plain object.
   * @returns {Object} Configuration object with enabled, colors, and overprint properties
   */
  getConfig() {
    return {
      enabled: this.#enabled,
      colors: Object.fromEntries(this.#colors),
      overprint: this.#overprint,
    };
  }

  /**
   * Filter CMYK color values based on visibility settings.
   * @param {number[]} cmyk - CMYK color array [C, M, Y, K]
   * @returns {number[]} Filtered CMYK color array
   */
  filterCMYK(cmyk) {
    if (!this.#enabled) {
      return [...cmyk];
    }

    const filtered = [...cmyk];
    if (!this.isVisible("Cyan")) {
      filtered[0] = 0;
    }
    if (!this.isVisible("Magenta")) {
      filtered[1] = 0;
    }
    if (!this.isVisible("Yellow")) {
      filtered[2] = 0;
    }
    if (!this.isVisible("Black")) {
      filtered[3] = 0;
    }

    return filtered;
  }

  /**
   * Filter spot color value based on visibility settings.
   * @param {string} spotName - The name of the spot color
   * @param {number} spotValue - The original spot color value
   * @returns {number} Filtered spot color value (0 if not visible, original value otherwise)
   */
  filterSpot(spotName, spotValue) {
    if (!this.#enabled) {
      return spotValue;
    }
    return this.isVisible(spotName) ? spotValue : 0;
  }

  /**
   * Enable or disable the color filter.
   * @param {boolean} enabled - Whether the filter should be enabled
   */
  setEnabled(enabled) {
    this.#enabled = !!enabled;
  }

  /**
   * Check if the color filter is enabled.
   * @returns {boolean} True if enabled, false otherwise
   */
  get enabled() {
    return this.#enabled;
  }

  /**
   * Set overprint preview mode.
   * @param {boolean} overprint - Whether overprint preview is enabled
   */
  setOverprint(overprint) {
    this.#overprint = !!overprint;
  }

  /**
   * Check if overprint preview is enabled.
   * @returns {boolean} True if overprint preview is enabled
   */
  get overprint() {
    return this.#overprint;
  }

  /**
   * Create a copy of this configuration.
   * @returns {ColorFilterConfig} A new ColorFilterConfig instance with the same settings
   */
  clone() {
    return new ColorFilterConfig(this.getConfig());
  }

  /**
   * 生成当前颜色过滤状态的唯一键
   * 用于缓存不同颜色组合的渲染结果
   * @returns {string} 状态键，格式如 "CMYK:1011|Spot1:1_Spot2:0"
   */
  getFilterStateKey() {
    if (!this.#enabled) {
      return "original"; // 未启用过滤，返回原始状态
    }

    const parts = [];

    // CMYK 通道状态（按固定顺序: Cyan, Magenta, Yellow, Black）
    const cmykChannels = ["Cyan", "Magenta", "Yellow", "Black"];
    const cmykState = cmykChannels
      .map(channel => (this.isVisible(channel) ? "1" : "0"))
      .join("");
    parts.push(`CMYK:${cmykState}`);

    // 专色状态（按名称排序以确保一致性）
    const spotColors = [];
    for (const [colorName, visible] of this.#colors.entries()) {
      if (!cmykChannels.includes(colorName)) {
        spotColors.push({ name: colorName, visible });
      }
    }

    if (spotColors.length > 0) {
      spotColors.sort((a, b) => a.name.localeCompare(b.name));
      const spotState = spotColors
        .map(spot => `${spot.name}:${spot.visible ? "1" : "0"}`)
        .join("_");
      parts.push(spotState);
    }

    return parts.join("|");
  }

  /**
   * 检查是否为原始状态（所有颜色都可见）
   * @returns {boolean}
   */
  isOriginalState() {
    if (!this.#enabled) {
      return true;
    }

    // 检查所有注册的颜色是否都可见
    for (const [colorName, visible] of this.#colors.entries()) {
      if (visible === false) {
        return false;
      }
    }

    return true;
  }

  /**
   * 检查是否所有颜色都隐藏（完全空白状态）
   * @returns {boolean}
   */
  isAllHidden() {
    if (!this.#enabled) {
      return false;
    }

    // 检查所有注册的颜色是否都不可见
    for (const [colorName, visible] of this.#colors.entries()) {
      if (visible !== false) {
        return false;
      }
    }

    return true;
  }
}

export { ColorFilterConfig };
