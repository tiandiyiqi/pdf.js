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
 * DeviceN色彩空间管理模块
 * 负责DeviceN色彩空间的解析、通道管理和混合空间确定
 */

import { ColorValue, ColorValueBuilder } from "./color_value.js";
import { warn } from "../shared/util.js";

/**
 * DeviceN色彩空间管理器
 */
class DeviceNManager {
  constructor() {
    /**
     * 通道管理器实例
     * @type {ChannelManager}
     */
    this.channelManager = new ChannelManager();

    /**
     * 混合颜色空间缓存
     * @type {Map<string, string>}
     */
    this.blendSpaceCache = new Map();

    /**
     * 预览图层列表
     * @type {Array<PreviewLayer>}
     */
    this.previewLayers = [];
  }

  /**
   * 确定混合颜色空间
   * @param {Array<ColorValue>} colors - 参与混合的颜色列表
   * @returns {string} 混合颜色空间类型: 'DeviceN', 'CMYK', 'RGB'
   */
  determineBlendSpace(colors) {
    if (!Array.isArray(colors) || colors.length === 0) {
      return "RGB";
    }

    // 规则优先级：
    // 1. 如果有DeviceN颜色，使用DeviceN空间
    // 2. 如果有CMYK颜色，使用CMYK空间
    // 3. 否则使用RGB空间

    let hasDeviceN = false;
    let hasCMYK = false;

    for (const color of colors) {
      if (!(color instanceof ColorValue)) {
        continue;
      }

      if (color.colorSpace === "DeviceN") {
        hasDeviceN = true;
        break;
      }
      if (color.colorSpace === "CMYK") {
        hasCMYK = true;
      }
    }

    if (hasDeviceN) {
      return "DeviceN";
    }
    if (hasCMYK) {
      return "CMYK";
    }
    return "RGB";
  }

  /**
   * 识别预览图层
   * @param {Object} opList - 操作符列表
   * @returns {Array<PreviewLayer>} 预览图层列表
   */
  identifyPreviewLayers(opList) {
    const layers = [];
    let currentLayer = null;

    if (!opList || !opList.fnArray || !opList.argsArray) {
      return layers;
    }

    // 扫描操作符列表，识别图层标记
    for (let i = 0; i < opList.fnArray.length; i++) {
      const fn = opList.fnArray[i];
      const args = opList.argsArray[i];

      // 检测图层开始标记 (如 OPS.beginMarkedContent)
      // OPS常量需要导入，这里使用数值
      if (this.#isLayerBegin(fn)) {
        currentLayer = new PreviewLayer(args[0] || `Layer${layers.length}`);
      }

      // 收集图层内的颜色信息
      if (currentLayer && this.#isColorOp(fn)) {
        currentLayer.addColorOp(fn, args);
      }

      // 检测图层结束
      if (this.#isLayerEnd(fn) && currentLayer) {
        layers.push(currentLayer);
        currentLayer = null;
      }
    }

    // 如果有未关闭的图层，也添加进去
    if (currentLayer) {
      layers.push(currentLayer);
    }

    this.previewLayers = layers;
    return layers;
  }

  /**
   * 判断是否为图层开始操作
   * @param {number} fn - 操作符编号
   * @returns {boolean}
   */
  #isLayerBegin(fn) {
    // OPS.beginMarkedContent = 39
    // OPS.beginMarkedContentProps = 40
    return fn === 39 || fn === 40;
  }

  /**
   * 判断是否为图层结束操作
   * @param {number} fn - 操作符编号
   * @returns {boolean}
   */
  #isLayerEnd(fn) {
    // OPS.endMarkedContent = 41
    return fn === 41;
  }

  /**
   * 判断是否为颜色操作
   * @param {number} fn - 操作符编号
   * @returns {boolean}
   */
  #isColorOp(fn) {
    // OPS.setFillRGBColor = 23
    // OPS.setFillCMYKColor = 25
    // OPS.setStrokeRGBColor = 30
    // OPS.setStrokeCMYKColor = 32
    // 以及其他颜色操作符
    const colorOps = [23, 24, 25, 26, 27, 28, 29, 30, 31, 32];
    return colorOps.includes(fn);
  }

  /**
   * 获取图层中的专色通道
   * @param {PreviewLayer} layer - 预览图层
   * @returns {Array<string>} 专色名称列表
   */
  getLayerSpotChannels(layer) {
    const spotChannels = new Set();

    for (const colorOp of layer.colorOps) {
      if (colorOp.args && colorOp.args[0] instanceof ColorValue) {
        const colorValue = colorOp.args[0];
        if (colorValue.colorSpace === "DeviceN") {
          const spots = colorValue.getAllSpots();
          Object.keys(spots).forEach(spot => spotChannels.add(spot));
        }
      }
    }

    return Array.from(spotChannels);
  }

  /**
   * 重置管理器状态
   */
  reset() {
    this.channelManager.reset();
    this.blendSpaceCache.clear();
    this.previewLayers = [];
  }
}

/**
 * 预览图层类
 */
class PreviewLayer {
  /**
   * @param {string} name - 图层名称
   */
  constructor(name) {
    this.name = name;
    this.colorOps = [];
    this.visible = true;
  }

  /**
   * 添加颜色操作
   * @param {number} fn - 操作符编号
   * @param {Array} args - 操作符参数
   */
  addColorOp(fn, args) {
    this.colorOps.push({ fn, args: Array.isArray(args) ? [...args] : [] });
  }

  /**
   * 获取图层中的所有颜色值
   * @returns {Array<ColorValue>}
   */
  getColorValues() {
    const colorValues = [];

    for (const colorOp of this.colorOps) {
      if (colorOp.args && colorOp.args[0] instanceof ColorValue) {
        colorValues.push(colorOp.args[0]);
      }
    }

    return colorValues;
  }

  /**
   * 设置图层可见性
   * @param {boolean} visible
   */
  setVisible(visible) {
    this.visible = visible;
  }
}

/**
 * 通道管理器
 * 负责管理颜色通道的分离和合并
 */
class ChannelManager {
  constructor() {
    /**
     * 通道值存储
     * @type {Map<string, number>}
     */
    this.channels = new Map();
  }

  /**
   * 设置通道值
   * @param {string} channelName - 通道名称
   * @param {number} value - 通道值 [0-1]
   */
  setChannel(channelName, value) {
    if (typeof channelName !== "string" || typeof value !== "number") {
      warn("ChannelManager: Invalid channel name or value");
      return;
    }

    // 钳制到有效范围 [0-1]
    const clampedValue = Math.max(0, Math.min(1, value));
    this.channels.set(channelName, clampedValue);
  }

  /**
   * 获取通道值
   * @param {string} channelName - 通道名称
   * @returns {number|null} 通道值或null(如果不存在)
   */
  getChannel(channelName) {
    return this.channels.get(channelName) ?? null;
  }

  /**
   * 检查通道是否存在
   * @param {string} channelName - 通道名称
   * @returns {boolean}
   */
  hasChannel(channelName) {
    return this.channels.has(channelName);
  }

  /**
   * 分离通道
   * 将DeviceN颜色拆分为各个独立通道
   * @param {ColorValue} colorValue - 颜色值对象
   * @returns {Map<string, number>} 通道名称到值的映射
   */
  separateChannels(colorValue) {
    const separated = new Map();

    if (!(colorValue instanceof ColorValue)) {
      warn("ChannelManager: Invalid ColorValue");
      return separated;
    }

    if (colorValue.colorSpace === "DeviceN") {
      // CMYK通道
      const cmykNames = ["Cyan", "Magenta", "Yellow", "Black"];
      const cmykValues = colorValue.getCMYK();

      if (cmykValues && cmykValues.length === 4) {
        cmykValues.forEach((val, i) => {
          separated.set(cmykNames[i], val);
        });
      }

      // 专色通道
      const spots = colorValue.getAllSpots();
      Object.entries(spots).forEach(([name, val]) => {
        separated.set(name, val);
      });
    } else if (colorValue.colorSpace === "CMYK") {
      // 纯CMYK
      const cmykNames = ["Cyan", "Magenta", "Yellow", "Black"];
      const cmykValues = colorValue.getCMYK();

      if (cmykValues && cmykValues.length === 4) {
        cmykValues.forEach((val, i) => {
          separated.set(cmykNames[i], val);
        });
      }
    }

    return separated;
  }

  /**
   * 合并通道
   * 将独立通道合并为DeviceN颜色
   * @param {Map<string, number>} channels - 通道值映射
   * @param {Array<string>} channelNames - 通道名称顺序
   * @returns {ColorValue} 合并后的颜色值
   */
  mergeChannels(channels, channelNames) {
    if (!(channels instanceof Map) || !Array.isArray(channelNames)) {
      warn("ChannelManager: Invalid parameters for mergeChannels");
      return ColorValueBuilder.createRGB("#000000");
    }

    if (channelNames.length === 0) {
      return ColorValueBuilder.createRGB("#000000");
    }

    // 从Map中提取对应顺序的值
    const values = channelNames.map(name => channels.get(name) || 0);

    try {
      return ColorValueBuilder.createDeviceN(channelNames, values);
    } catch (e) {
      warn(`ChannelManager: Failed to merge channels: ${e}`);
      return ColorValueBuilder.createRGB("#000000");
    }
  }

  /**
   * 获取所有通道名称
   * @returns {Array<string>}
   */
  getAllChannelNames() {
    return Array.from(this.channels.keys());
  }

  /**
   * 获取所有通道值
   * @returns {Object} {channelName: value, ...}
   */
  getAllChannels() {
    const result = {};
    this.channels.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }

  /**
   * 重置所有通道
   */
  reset() {
    this.channels.clear();
  }

  /**
   * 获取通道数量
   * @returns {number}
   */
  getChannelCount() {
    return this.channels.size;
  }

  /**
   * 克隆通道管理器
   * @returns {ChannelManager}
   */
  clone() {
    const cloned = new ChannelManager();
    this.channels.forEach((value, key) => {
      cloned.setChannel(key, value);
    });
    return cloned;
  }
}

/**
 * DeviceN颜色空间辅助类
 */
class DeviceNColorSpace {
  /**
   * @param {Object} config - 配置对象
   * @param {Array<string>} config.channelNames - 通道名称列表
   * @param {Object} config.alternateCS - 备用颜色空间
   * @param {Function} config.tintFn - 色调函数
   * @param {number} config.numComps - 通道数量
   */
  constructor(config) {
    this.channelNames = config.channelNames || [];
    this.alternateCS = config.alternateCS;
    this.tintFn = config.tintFn;
    this.numComps = config.numComps || this.channelNames.length;

    // 分离CMYK通道索引和专色通道索引
    this.cmykIndices = [];
    this.spotIndices = [];

    const cmykNames = ["Cyan", "Magenta", "Yellow", "Black"];
    this.channelNames.forEach((name, i) => {
      if (cmykNames.includes(name)) {
        this.cmykIndices.push(i);
      } else {
        this.spotIndices.push(i);
      }
    });
  }

  /**
   * 从值数组创建ColorValue
   * @param {Array<number>} values - 通道值数组
   * @returns {ColorValue}
   */
  createColorValue(values) {
    if (!Array.isArray(values) || values.length !== this.numComps) {
      warn(
        `DeviceNColorSpace: Invalid values array length. Expected ${this.numComps}, got ${values?.length}`
      );
      return ColorValueBuilder.createRGB("#000000");
    }

    try {
      return ColorValueBuilder.createDeviceN(this.channelNames, values);
    } catch (e) {
      warn(`DeviceNColorSpace: Failed to create ColorValue: ${e}`);
      return ColorValueBuilder.createRGB("#000000");
    }
  }

  /**
   * 获取CMYK通道名称
   * @returns {Array<string>}
   */
  getCMYKChannelNames() {
    return this.cmykIndices.map(i => this.channelNames[i]);
  }

  /**
   * 获取专色通道名称
   * @returns {Array<string>}
   */
  getSpotNames() {
    return this.spotIndices.map(i => this.channelNames[i]);
  }

  /**
   * 检查是否包含专色
   * @returns {boolean}
   */
  hasSpots() {
    return this.spotIndices.length > 0;
  }

  /**
   * 获取通道数量
   * @returns {number}
   */
  getNumChannels() {
    return this.numComps;
  }
}

export { DeviceNManager, DeviceNColorSpace, ChannelManager, PreviewLayer };
