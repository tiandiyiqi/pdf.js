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
 * 多通道颜色值数据结构
 * 支持RGB、CMYK、DeviceN、Gray等多种颜色空间
 * 核心设计：保留原始颜色通道信息，延迟RGB转换
 */

import { ColorConverter } from "./color_converter.js";
import { ColorSpaceUtils } from "./colorspace_utils.js";

/**
 * 颜色空间类型枚举
 */
const ColorSpace = {
  RGB: "RGB",
  CMYK: "CMYK",
  DEVICEN: "DeviceN",
  GRAY: "Gray",
  SEPARATION: "Separation",
};

/**
 * ColorValue类
 * 表示保留原始颜色空间信息的颜色值
 */
class ColorValue {
  /**
   * @param {Object} config - 配置对象
   * @param {string} config.colorSpace - 颜色空间类型
   * @param {Object} config.channels - 通道值对象
   * @param {Array<string>} config.channelNames - 通道名称列表(DeviceN专用)
   * @param {string} config.rgbFallback - RGB备用值
   */
  constructor(config) {
    if (!config || !config.colorSpace) {
      throw new Error("ColorValue: colorSpace is required");
    }

    /**
     * 颜色空间类型
     * @type {string}
     */
    this.colorSpace = config.colorSpace;

    /**
     * 通道值对象
     * 结构根据颜色空间不同而不同：
     * - RGB: {rgb: "#RRGGBB"}
     * - CMYK: {cmyk: [C, M, Y, K]}
     * - DeviceN: {cmyk: [C,M,Y,K], spots: {Spot1: val, Spot2: val, ...}}
     * - Gray: {gray: [G]}
     * @type {Object}
     */
    this.channels = config.channels;

    /**
     * 通道名称列表(DeviceN专用)
     * @type {Array<string>|null}
     */
    this.channelNames = config.channelNames || null;

    /**
     * RGB备用值，用于快速渲染或不支持多通道的场景
     * @type {string|null}
     */
    this.rgbFallback = config.rgbFallback || null;

    // 参数验证
    this.#validate();
  }

  /**
   * 验证ColorValue对象的完整性
   */
  #validate() {
    if (!this.channels) {
      throw new Error("ColorValue: channels is required");
    }

    switch (this.colorSpace) {
      case ColorSpace.CMYK:
        if (
          !Array.isArray(this.channels.cmyk) ||
          this.channels.cmyk.length !== 4
        ) {
          throw new Error(
            "ColorValue: CMYK channels must be array of 4 numbers"
          );
        }
        break;
      case ColorSpace.DEVICEN:
        if (!this.channels.cmyk && !this.channels.spots) {
          throw new Error(
            "ColorValue: DeviceN requires cmyk or spots channels"
          );
        }
        if (!this.channelNames || !Array.isArray(this.channelNames)) {
          throw new Error("ColorValue: DeviceN requires channelNames array");
        }
        break;
      case ColorSpace.RGB:
        if (!this.channels.rgb) {
          throw new Error("ColorValue: RGB requires rgb channel");
        }
        break;
      case ColorSpace.GRAY:
        if (this.channels.gray === undefined) {
          throw new Error("ColorValue: Gray requires gray channel");
        }
        break;
    }
  }

  /**
   * 获取CMYK通道值
   * @returns {Array<number>|null} [C, M, Y, K] 或 null
   */
  getCMYK() {
    if (this.colorSpace === ColorSpace.CMYK) {
      return [...this.channels.cmyk];
    }
    if (this.colorSpace === ColorSpace.DEVICEN && this.channels.cmyk) {
      return [...this.channels.cmyk];
    }
    return null;
  }

  /**
   * 获取指定专色通道值
   * @param {string} spotName - 专色名称
   * @returns {number|null} 专色值 [0-1] 或 null
   */
  getSpot(spotName) {
    if (this.colorSpace === ColorSpace.DEVICEN && this.channels.spots) {
      const value = this.channels.spots[spotName];
      return value !== undefined ? value : null;
    }
    return null;
  }

  /**
   * 获取所有专色通道
   * @returns {Object} {spotName: value, ...}
   */
  getAllSpots() {
    if (this.colorSpace === ColorSpace.DEVICEN && this.channels.spots) {
      return { ...this.channels.spots };
    }
    return {};
  }

  /**
   * 获取所有通道名称
   * @returns {Array<string>}
   */
  getChannelNames() {
    if (this.channelNames) {
      return [...this.channelNames];
    }

    // 生成默认通道名称
    switch (this.colorSpace) {
      case ColorSpace.CMYK:
        return ["Cyan", "Magenta", "Yellow", "Black"];
      case ColorSpace.RGB:
        return ["Red", "Green", "Blue"];
      case ColorSpace.GRAY:
        return ["Gray"];
      default:
        return [];
    }
  }

  /**
   * 转换为RGB
   * 优先使用缓存的rgbFallback，必要时进行实际转换
   * @returns {string} RGB hex值，如 "#RRGGBB"
   */
  toRGB() {
    if (this.rgbFallback) {
      return this.rgbFallback;
    }

    // 执行实际转换并缓存
    this.rgbFallback = this.#convertToRGB();
    return this.rgbFallback;
  }

  /**
   * 私有方法：执行RGB转换
   * @returns {string}
   */
  #convertToRGB() {
    switch (this.colorSpace) {
      case ColorSpace.RGB:
        return this.channels.rgb;

      case ColorSpace.CMYK:
        // 使用PDF.js原始的CMYK转换方法（SWOP色彩空间）
        return ColorSpaceUtils.cmyk.getRgbHex(this.channels.cmyk, 0);

      case ColorSpace.DEVICEN:
        return ColorConverter.deviceNToRgb(this.channels);

      case ColorSpace.GRAY:
        return ColorConverter.grayToRgb(this.channels.gray);

      default:
        console.warn(`ColorValue: Unknown color space ${this.colorSpace}`);
        return "#000000";
    }
  }

  /**
   * 克隆颜色值对象
   * @returns {ColorValue}
   */
  clone() {
    return new ColorValue({
      colorSpace: this.colorSpace,
      channels: JSON.parse(JSON.stringify(this.channels)),
      channelNames: this.channelNames ? [...this.channelNames] : null,
      rgbFallback: this.rgbFallback,
    });
  }

  /**
   * 检查是否为相同颜色空间
   * @param {ColorValue} other
   * @returns {boolean}
   */
  isSameColorSpace(other) {
    return this.colorSpace === other.colorSpace;
  }

  /**
   * 序列化为普通对象(用于传输)
   * @returns {Object}
   */
  serialize() {
    return {
      __type__: "ColorValue",
      colorSpace: this.colorSpace,
      channels: this.channels,
      channelNames: this.channelNames,
      rgbFallback: this.rgbFallback,
    };
  }

  /**
   * 从序列化对象反序列化
   * @param {Object} obj
   * @returns {ColorValue}
   */
  static deserialize(obj) {
    if (!obj) {
      throw new Error(
        "Invalid serialized ColorValue object: null or undefined"
      );
    }

    // 宽松检查：只要有colorSpace字段就尝试反序列化
    // Worker传递过来的对象可能没有__type__标记
    if (!obj.colorSpace) {
      throw new Error(
        "Invalid serialized ColorValue object: missing colorSpace"
      );
    }

    return new ColorValue({
      colorSpace: obj.colorSpace,
      channels: obj.channels,
      channelNames: obj.channelNames || null,
      rgbFallback: obj.rgbFallback || null,
    });
  }

  /**
   * 获取通道数量
   * @returns {number}
   */
  getNumChannels() {
    if (this.channelNames) {
      return this.channelNames.length;
    }

    switch (this.colorSpace) {
      case ColorSpace.CMYK:
        return 4;
      case ColorSpace.RGB:
        return 3;
      case ColorSpace.GRAY:
        return 1;
      case ColorSpace.DEVICEN:
        // CMYK + 专色
        return (
          (this.channels.cmyk ? 4 : 0) +
          (this.channels.spots ? Object.keys(this.channels.spots).length : 0)
        );
      default:
        return 0;
    }
  }

  /**
   * 转换为字符串(用于调试)
   * @returns {string}
   */
  toString() {
    const channelInfo =
      this.colorSpace === ColorSpace.DEVICEN
        ? `channels=${this.getNumChannels()}`
        : `channels=${JSON.stringify(this.channels)}`;
    return `ColorValue(${this.colorSpace}, ${channelInfo})`;
  }
}

/**
 * ColorValueBuilder类
 * 提供便捷的ColorValue构建方法
 */
class ColorValueBuilder {
  /**
   * 创建RGB颜色值
   * @param {string} rgb - RGB hex值，如 "#RRGGBB"
   * @returns {ColorValue}
   */
  static createRGB(rgb) {
    if (!rgb || typeof rgb !== "string") {
      throw new Error("ColorValueBuilder: Invalid RGB value");
    }

    return new ColorValue({
      colorSpace: ColorSpace.RGB,
      channels: { rgb },
      rgbFallback: rgb,
    });
  }

  /**
   * 创建CMYK颜色值
   * @param {Array<number>} cmyk - [C, M, Y, K]，每个值范围[0-1]
   * @returns {ColorValue}
   */
  static createCMYK(cmyk) {
    if (!Array.isArray(cmyk) || cmyk.length !== 4) {
      throw new Error("ColorValueBuilder: CMYK must be array of 4 numbers");
    }

    // 验证范围
    for (let i = 0; i < 4; i++) {
      if (cmyk[i] < 0 || cmyk[i] > 1) {
        throw new Error(
          `ColorValueBuilder: CMYK value ${i} out of range [0-1]: ${cmyk[i]}`
        );
      }
    }

    // 重要：使用PDF.js原始的CMYK转换方法（SWOP色彩空间）
    // 而不是简化的标准公式，以确保颜色准确性
    const rgbFallback = ColorSpaceUtils.cmyk.getRgbHex(cmyk, 0);

    return new ColorValue({
      colorSpace: ColorSpace.CMYK,
      channels: { cmyk: [...cmyk] },
      rgbFallback,
    });
  }

  /**
   * 创建Gray颜色值
   * @param {number} gray - 灰度值，范围[0-1]
   * @returns {ColorValue}
   */
  static createGray(gray) {
    if (typeof gray !== "number" || gray < 0 || gray > 1) {
      throw new Error("ColorValueBuilder: Gray value must be number in [0-1]");
    }

    return new ColorValue({
      colorSpace: ColorSpace.GRAY,
      channels: { gray },
      rgbFallback: ColorConverter.grayToRgb(gray),
    });
  }

  /**
   * 创建DeviceN颜色值
   * @param {Array<string>} channelNames - 通道名称列表，如 ['Cyan', 'Magenta', 'Yellow', 'Black', 'Spot1']
   * @param {Array<number>} values - 通道值列表，与channelNames对应
   * @returns {ColorValue}
   */
  static createDeviceN(channelNames, values) {
    if (!Array.isArray(channelNames) || !Array.isArray(values)) {
      throw new Error(
        "ColorValueBuilder: DeviceN requires arrays for channelNames and values"
      );
    }

    if (channelNames.length !== values.length) {
      throw new Error(
        "ColorValueBuilder: DeviceN channelNames and values length mismatch"
      );
    }

    // 分离CMYK和专色通道
    const cmykNames = ["Cyan", "Magenta", "Yellow", "Black"];
    const cmyk = [];
    const spots = {};

    channelNames.forEach((name, i) => {
      const value = values[i];

      // 验证值范围
      if (value < 0 || value > 1) {
        throw new Error(
          `ColorValueBuilder: DeviceN value ${i} out of range [0-1]: ${value}`
        );
      }

      if (cmykNames.includes(name)) {
        // CMYK通道
        const cmykIndex = cmykNames.indexOf(name);
        cmyk[cmykIndex] = value;
      } else {
        // 专色通道
        spots[name] = value;
      }
    });

    // 填充缺失的CMYK通道为0
    while (cmyk.length < 4) {
      cmyk.push(0);
    }

    const channels = {
      cmyk: cmyk.length > 0 && cmyk.some(v => v > 0) ? cmyk : [0, 0, 0, 0],
      spots: Object.keys(spots).length > 0 ? spots : {},
    };

    return new ColorValue({
      colorSpace: ColorSpace.DEVICEN,
      channels,
      channelNames: [...channelNames],
      rgbFallback: ColorConverter.deviceNToRgb(channels),
    });
  }

  /**
   * 创建Separation颜色值(单一专色)
   * @param {string} spotName - 专色名称
   * @param {number} value - 专色值 [0-1]
   * @returns {ColorValue}
   */
  static createSeparation(spotName, value) {
    if (!spotName || typeof spotName !== "string") {
      throw new Error("ColorValueBuilder: Separation requires spotName");
    }

    if (typeof value !== "number" || value < 0 || value > 1) {
      throw new Error(
        "ColorValueBuilder: Separation value must be number in [0-1]"
      );
    }

    return new ColorValue({
      colorSpace: ColorSpace.SEPARATION,
      channels: {
        cmyk: [0, 0, 0, 0],
        spots: { [spotName]: value },
      },
      channelNames: [spotName],
      rgbFallback: ColorConverter.deviceNToRgb({
        cmyk: [0, 0, 0, 0],
        spots: { [spotName]: value },
      }),
    });
  }

  /**
   * 从现有ColorValue对象创建副本，可选择性修改某些值
   * @param {ColorValue} original - 原始ColorValue
   * @param {Object} overrides - 要覆盖的属性
   * @returns {ColorValue}
   */
  static createFrom(original, overrides = {}) {
    if (!(original instanceof ColorValue)) {
      throw new Error(
        "ColorValueBuilder: createFrom requires ColorValue instance"
      );
    }

    return new ColorValue({
      colorSpace: overrides.colorSpace || original.colorSpace,
      channels:
        overrides.channels || JSON.parse(JSON.stringify(original.channels)),
      channelNames:
        overrides.channelNames ||
        (original.channelNames ? [...original.channelNames] : null),
      rgbFallback: overrides.rgbFallback || original.rgbFallback,
    });
  }
}

export { ColorValue, ColorValueBuilder, ColorSpace };
