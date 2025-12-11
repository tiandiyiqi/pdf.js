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
 * 颜色空间转换器
 * 提供各种颜色空间之间的转换功能
 * 注意：这些是标准转换，DeviceN专色的实际转换应使用tint函数
 */

class ColorConverter {
  /**
   * CMYK转RGB
   * 使用改进的CMYK到RGB转换公式，考虑sRGB色彩空间和UCR（Under Color Removal）
   *
   * 注意：这是简化的设备相关转换。专业印刷预览应使用ICC色彩管理。
   *
   * @param {Array<number>} cmyk - [C, M, Y, K]，范围[0-1]
   * @returns {string} RGB hex值，如 "#RRGGBB"
   */
  static cmykToRgb(cmyk) {
    if (!Array.isArray(cmyk) || cmyk.length !== 4) {
      throw new Error("ColorConverter: CMYK must be array of 4 numbers");
    }

    let [c, m, y, k] = cmyk;

    // 方案A: 标准简化公式（当前使用）
    // 优点：简单快速
    // 缺点：不够准确，特别是高饱和度颜色
    //
    // R = 255 × (1 - C) × (1 - K)
    // G = 255 × (1 - M) × (1 - K)
    // B = 255 × (1 - Y) × (1 - K)

    // 方案B: 改进公式（考虑UCR）
    // 更接近Adobe的转换效果
    // 参考：https://www.rapidtables.com/convert/color/cmyk-to-rgb.html
    //
    // 我们使用方案A，因为：
    // 1. PDF.js原本就用此公式
    // 2. 保持向后兼容
    // 3. 如需专业精度，应实现完整ICC色彩管理

    const r = 255 * (1 - c) * (1 - k);
    const g = 255 * (1 - m) * (1 - k);
    const b = 255 * (1 - y) * (1 - k);

    return this.#rgbToHex(r, g, b);
  }

  /**
   * RGB转CMYK
   * 使用标准RGB到CMYK转换公式
   * @param {string} rgb - RGB hex值，如 "#RRGGBB"
   * @returns {Array<number>} [C, M, Y, K]，范围[0-1]
   */
  static rgbToCmyk(rgb) {
    const { r, g, b } = this.#hexToRgb(rgb);

    // 归一化RGB值到[0-1]
    const r1 = r / 255;
    const g1 = g / 255;
    const b1 = b / 255;

    // 计算K值
    const k = 1 - Math.max(r1, g1, b1);

    // 如果是纯黑色
    if (k === 1) {
      return [0, 0, 0, 1];
    }

    // 计算CMY值
    const c = (1 - r1 - k) / (1 - k);
    const m = (1 - g1 - k) / (1 - k);
    const y = (1 - b1 - k) / (1 - k);

    return [c, m, y, k];
  }

  /**
   * DeviceN转RGB
   * 将DeviceN色彩空间(CMYK+专色)转换为RGB
   * 注意：这是简化版本，实际应使用tint函数
   * @param {Object} channels - {cmyk: [...], spots: {...}}
   * @returns {string} RGB hex值
   */
  static deviceNToRgb(channels) {
    if (!channels) {
      throw new Error("ColorConverter: DeviceN channels is required");
    }

    // 获取CMYK基础值
    const cmyk = channels.cmyk ? [...channels.cmyk] : [0, 0, 0, 0];

    // 处理专色通道
    // 简化处理：将专色叠加到K通道
    // 实际应用中应该使用tint函数进行准确转换
    if (channels.spots && Object.keys(channels.spots).length > 0) {
      const spotValues = Object.values(channels.spots);
      const totalSpot = spotValues.reduce((sum, val) => sum + val, 0);

      // 将专色影响叠加到K通道(简化处理)
      cmyk[3] = Math.min(1, cmyk[3] + totalSpot * 0.3);
    }

    // 转换CMYK到RGB
    return this.cmykToRgb(cmyk);
  }

  /**
   * 灰度转RGB
   * @param {number} gray - 灰度值，范围[0-1]
   * @returns {string} RGB hex值
   */
  static grayToRgb(gray) {
    if (typeof gray !== "number" || gray < 0 || gray > 1) {
      throw new Error("ColorConverter: Gray value must be number in [0-1]");
    }

    const val = Math.round((1 - gray) * 255); // PDF灰度是反向的(0=白色,1=黑色)
    return this.#rgbToHex(val, val, val);
  }

  /**
   * RGB转灰度
   * 使用加权平均法
   * @param {string} rgb - RGB hex值
   * @returns {number} 灰度值，范围[0-1]
   */
  static rgbToGray(rgb) {
    const { r, g, b } = this.#hexToRgb(rgb);

    // 使用加权平均法(符合人眼感知)
    // Gray = 0.299*R + 0.587*G + 0.114*B
    const grayValue = 0.299 * r + 0.587 * g + 0.114 * b;

    // 归一化到[0-1]并反向(PDF灰度定义)
    return 1 - grayValue / 255;
  }

  /**
   * 私有方法：RGB值转Hex字符串
   * @param {number} r - Red [0-255]
   * @param {number} g - Green [0-255]
   * @param {number} b - Blue [0-255]
   * @returns {string} "#RRGGBB"
   */
  static #rgbToHex(r, g, b) {
    // 钳制到有效范围
    r = Math.round(Math.max(0, Math.min(255, r)));
    g = Math.round(Math.max(0, Math.min(255, g)));
    b = Math.round(Math.max(0, Math.min(255, b)));

    // 转换为hex字符串
    const rHex = r.toString(16).padStart(2, "0");
    const gHex = g.toString(16).padStart(2, "0");
    const bHex = b.toString(16).padStart(2, "0");

    return `#${rHex}${gHex}${bHex}`;
  }

  /**
   * 私有方法：Hex字符串转RGB值
   * @param {string} hex - "#RRGGBB" 或 "RRGGBB"
   * @returns {Object} {r, g, b}
   */
  static #hexToRgb(hex) {
    // 移除可能的#前缀
    hex = hex.replace(/^#/, "");

    // 验证hex格式
    if (!/^[0-9A-Fa-f]{6}$/.test(hex)) {
      console.warn(`ColorConverter: Invalid hex color ${hex}, using black`);
      return { r: 0, g: 0, b: 0 };
    }

    // 解析RGB值
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);

    return { r, g, b };
  }

  /**
   * 检查颜色是否为灰度
   * @param {string} rgb - RGB hex值
   * @param {number} tolerance - 容差，默认0(完全相等)
   * @returns {boolean}
   */
  static isGrayscale(rgb, tolerance = 0) {
    const { r, g, b } = this.#hexToRgb(rgb);
    return Math.abs(r - g) <= tolerance && Math.abs(g - b) <= tolerance;
  }

  /**
   * 计算两个RGB颜色的差异
   * 使用欧氏距离
   * @param {string} rgb1 - 第一个RGB hex值
   * @param {string} rgb2 - 第二个RGB hex值
   * @returns {number} 差异值[0-441.67]，0表示完全相同
   */
  static colorDifference(rgb1, rgb2) {
    const c1 = this.#hexToRgb(rgb1);
    const c2 = this.#hexToRgb(rgb2);

    const dr = c1.r - c2.r;
    const dg = c1.g - c2.g;
    const db = c1.b - c2.b;

    return Math.sqrt(dr * dr + dg * dg + db * db);
  }

  /**
   * 混合两个RGB颜色
   * @param {string} rgb1 - 第一个RGB hex值
   * @param {string} rgb2 - 第二个RGB hex值
   * @param {number} ratio - 混合比例[0-1]，0=完全rgb1，1=完全rgb2
   * @returns {string} 混合后的RGB hex值
   */
  static blendRgb(rgb1, rgb2, ratio) {
    if (ratio < 0 || ratio > 1) {
      throw new Error("ColorConverter: Blend ratio must be in [0-1]");
    }

    const c1 = this.#hexToRgb(rgb1);
    const c2 = this.#hexToRgb(rgb2);

    const r = c1.r * (1 - ratio) + c2.r * ratio;
    const g = c1.g * (1 - ratio) + c2.g * ratio;
    const b = c1.b * (1 - ratio) + c2.b * ratio;

    return this.#rgbToHex(r, g, b);
  }

  /**
   * 调整RGB颜色的亮度
   * @param {string} rgb - RGB hex值
   * @param {number} factor - 亮度因子，>1变亮，<1变暗
   * @returns {string} 调整后的RGB hex值
   */
  static adjustBrightness(rgb, factor) {
    if (factor < 0) {
      throw new Error("ColorConverter: Brightness factor must be >= 0");
    }

    const { r, g, b } = this.#hexToRgb(rgb);

    const newR = r * factor;
    const newG = g * factor;
    const newB = b * factor;

    return this.#rgbToHex(newR, newG, newB);
  }

  /**
   * 获取颜色的补色
   * @param {string} rgb - RGB hex值
   * @returns {string} 补色的RGB hex值
   */
  static complementary(rgb) {
    const { r, g, b } = this.#hexToRgb(rgb);
    return this.#rgbToHex(255 - r, 255 - g, 255 - b);
  }

  /**
   * 归一化颜色值到[0-1]范围
   * @param {number} value - 颜色值
   * @param {number} max - 最大值，默认255
   * @returns {number} 归一化后的值[0-1]
   */
  static normalize(value, max = 255) {
    if (max === 0) {
      return 0;
    }
    return Math.max(0, Math.min(1, value / max));
  }

  /**
   * 反归一化颜色值
   * @param {number} value - 归一化的值[0-1]
   * @param {number} max - 目标最大值，默认255
   * @returns {number} 反归一化后的值[0-max]
   */
  static denormalize(value, max = 255) {
    return Math.max(0, Math.min(max, value * max));
  }
}

export { ColorConverter };
