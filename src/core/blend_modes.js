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
 * PDF标准混合模式实现
 * 支持RGB、CMYK和DeviceN色彩空间的混合模式
 */

import { ColorSpace, ColorValueBuilder } from "./color_value.js";
import { ChannelManager } from "./device_n.js";
import { ColorConverter } from "./color_converter.js";
import { warn } from "../shared/util.js";

/**
 * 混合模式基类
 */
class BlendMode {
  /**
   * @param {string} name - 混合模式名称
   */
  constructor(name) {
    this.name = name;
  }

  /**
   * 混合两个颜色
   * @param {ColorValue} backdrop - 背景色
   * @param {ColorValue} source - 源色
   * @param {number} alpha - 透明度 [0-1]
   * @returns {ColorValue} 混合结果
   */
  blend(backdrop, source, alpha) {
    throw new Error("BlendMode.blend must be implemented");
  }

  /**
   * 获取混合模式名称
   * @returns {string}
   */
  getName() {
    return this.name;
  }
}

/**
 * CMYK混合模式基类
 * 在CMYK色彩空间中进行混合
 */
class CMYKBlendMode extends BlendMode {
  /**
   * 混合两个颜色（CMYK空间）
   * @param {ColorValue} backdrop
   * @param {ColorValue} source
   * @param {number} alpha
   * @returns {ColorValue}
   */
  blend(backdrop, source, alpha) {
    // 确保两个颜色都转换为CMYK空间
    const backCmyk = this.#toCMYK(backdrop);
    const srcCmyk = this.#toCMYK(source);

    // 执行CMYK通道混合
    const resultCmyk = this.blendCMYK(backCmyk, srcCmyk, alpha);

    // 返回CMYK ColorValue
    return ColorValueBuilder.createCMYK(resultCmyk);
  }

  /**
   * CMYK通道混合（子类实现）
   * @param {Array<number>} back - 背景CMYK [C,M,Y,K]
   * @param {Array<number>} src - 源CMYK [C,M,Y,K]
   * @param {number} alpha - 透明度
   * @returns {Array<number>} 混合后的CMYK
   */
  blendCMYK(back, src, alpha) {
    throw new Error("CMYKBlendMode.blendCMYK must be implemented");
  }

  /**
   * 将ColorValue转换为CMYK数组
   * @param {ColorValue} colorValue
   * @returns {Array<number>}
   */
  #toCMYK(colorValue) {
    if (colorValue.colorSpace === ColorSpace.CMYK) {
      return colorValue.getCMYK();
    }
    if (colorValue.colorSpace === ColorSpace.DEVICEN) {
      return colorValue.getCMYK();
    }
    // RGB转CMYK
    const rgb = colorValue.toRGB();
    return ColorConverter.rgbToCmyk(rgb);
  }
}

/**
 * DeviceN混合模式基类
 * 在DeviceN色彩空间中进行通道级独立混合
 */
class DeviceNBlendMode extends BlendMode {
  /**
   * 混合两个颜色（DeviceN空间）
   * @param {ColorValue} backdrop
   * @param {ColorValue} source
   * @param {number} alpha
   * @returns {ColorValue}
   */
  blend(backdrop, source, alpha) {
    const channelManager = new ChannelManager();

    // 分离通道
    const backChannels = channelManager.separateChannels(backdrop);
    const srcChannels = channelManager.separateChannels(source);

    // 获取所有通道名称
    const allChannelNames = new Set([
      ...backChannels.keys(),
      ...srcChannels.keys(),
    ]);

    // 对每个通道独立混合
    const resultChannels = new Map();
    for (const channelName of allChannelNames) {
      const backVal = backChannels.get(channelName) || 0;
      const srcVal = srcChannels.get(channelName) || 0;
      const blendedVal = this.blendChannel(backVal, srcVal, alpha);
      resultChannels.set(channelName, blendedVal);
    }

    // 合并通道
    return channelManager.mergeChannels(
      resultChannels,
      Array.from(allChannelNames)
    );
  }

  /**
   * 单通道混合（子类实现）
   * @param {number} back - 背景通道值 [0-1]
   * @param {number} src - 源通道值 [0-1]
   * @param {number} alpha - 透明度
   * @returns {number} 混合后的通道值 [0-1]
   */
  blendChannel(back, src, alpha) {
    throw new Error("DeviceNBlendMode.blendChannel must be implemented");
  }
}

// ============= CMYK混合模式实现 =============

/**
 * CMYK Normal模式
 * 标准alpha混合
 */
class CMYKNormalMode extends CMYKBlendMode {
  constructor() {
    super("Normal");
  }

  blendCMYK(back, src, alpha) {
    const result = [];
    for (let i = 0; i < 4; i++) {
      result[i] = back[i] * (1 - alpha) + src[i] * alpha;
    }
    return result;
  }
}

/**
 * CMYK Lighten模式
 * 关键实现：在CMYK空间中，较小的值表示较亮的颜色
 */
class CMYKLightenMode extends CMYKBlendMode {
  constructor() {
    super("Lighten");
  }

  blendCMYK(back, src, alpha) {
    // CMYK是减色系统：值越小越亮
    // Lighten: 取最小值（最亮）
    const blended = [];
    for (let i = 0; i < 4; i++) {
      blended[i] = Math.min(back[i], src[i]);
    }

    // 应用alpha混合
    const result = [];
    for (let i = 0; i < 4; i++) {
      result[i] = back[i] * (1 - alpha) + blended[i] * alpha;
    }
    return result;
  }
}

/**
 * CMYK Darken模式
 * 在CMYK空间中，较大的值表示较暗的颜色
 */
class CMYKDarkenMode extends CMYKBlendMode {
  constructor() {
    super("Darken");
  }

  blendCMYK(back, src, alpha) {
    // CMYK是减色系统：值越大越暗
    // Darken: 取最大值（最暗）
    const blended = [];
    for (let i = 0; i < 4; i++) {
      blended[i] = Math.max(back[i], src[i]);
    }

    // 应用alpha混合
    const result = [];
    for (let i = 0; i < 4; i++) {
      result[i] = back[i] * (1 - alpha) + blended[i] * alpha;
    }
    return result;
  }
}

/**
 * CMYK Multiply模式
 * 正片叠底
 */
class CMYKMultiplyMode extends CMYKBlendMode {
  constructor() {
    super("Multiply");
  }

  blendCMYK(back, src, alpha) {
    // Multiply公式：B(b, s) = b × s
    // 在CMYK中：结果 = 1 - (1-c1) × (1-c2)
    const blended = [];
    for (let i = 0; i < 4; i++) {
      blended[i] = 1 - (1 - back[i]) * (1 - src[i]);
    }

    // 应用alpha混合
    const result = [];
    for (let i = 0; i < 4; i++) {
      result[i] = back[i] * (1 - alpha) + blended[i] * alpha;
    }
    return result;
  }
}

/**
 * CMYK Screen模式
 * 滤色
 */
class CMYKScreenMode extends CMYKBlendMode {
  constructor() {
    super("Screen");
  }

  blendCMYK(back, src, alpha) {
    // Screen公式：B(b, s) = 1 - (1-b) × (1-s)
    // 在CMYK中：结果 = c1 × c2
    const blended = [];
    for (let i = 0; i < 4; i++) {
      blended[i] = back[i] * src[i];
    }

    // 应用alpha混合
    const result = [];
    for (let i = 0; i < 4; i++) {
      result[i] = back[i] * (1 - alpha) + blended[i] * alpha;
    }
    return result;
  }
}

// ============= DeviceN混合模式实现 =============

/**
 * DeviceN Normal模式
 */
class DeviceNNormalMode extends DeviceNBlendMode {
  constructor() {
    super("Normal");
  }

  blendChannel(back, src, alpha) {
    return back * (1 - alpha) + src * alpha;
  }
}

/**
 * DeviceN Lighten模式
 * 对每个通道独立应用Lighten算法
 */
class DeviceNLightenMode extends DeviceNBlendMode {
  constructor() {
    super("Lighten");
  }

  blendChannel(back, src, alpha) {
    // 减色系统：取最小值（最亮）
    const blended = Math.min(back, src);
    return back * (1 - alpha) + blended * alpha;
  }
}

/**
 * DeviceN Darken模式
 */
class DeviceNDarkenMode extends DeviceNBlendMode {
  constructor() {
    super("Darken");
  }

  blendChannel(back, src, alpha) {
    // 减色系统：取最大值（最暗）
    const blended = Math.max(back, src);
    return back * (1 - alpha) + blended * alpha;
  }
}

/**
 * DeviceN Multiply模式
 */
class DeviceNMultiplyMode extends DeviceNBlendMode {
  constructor() {
    super("Multiply");
  }

  blendChannel(back, src, alpha) {
    const blended = 1 - (1 - back) * (1 - src);
    return back * (1 - alpha) + blended * alpha;
  }
}

/**
 * DeviceN Screen模式
 */
class DeviceNScreenMode extends DeviceNBlendMode {
  constructor() {
    super("Screen");
  }

  blendChannel(back, src, alpha) {
    const blended = back * src;
    return back * (1 - alpha) + blended * alpha;
  }
}

// ============= RGB混合模式（使用Canvas原生） =============

/**
 * Canvas原生混合模式
 * 用于RGB颜色空间，直接使用Canvas的globalCompositeOperation
 */
class CanvasBlendMode extends BlendMode {
  /**
   * @param {string} canvasMode - Canvas混合模式名称
   */
  constructor(canvasMode) {
    super(canvasMode);
    this.canvasMode = canvasMode;
  }

  blend(backdrop, source, alpha) {
    // RGB混合由Canvas直接处理，这里只是接口占位
    // 实际混合在canvas.js中使用ctx.globalCompositeOperation
    warn("CanvasBlendMode.blend should not be called directly");
    return source;
  }

  /**
   * 获取Canvas混合模式名称
   * @returns {string}
   */
  getCanvasMode() {
    return this.canvasMode;
  }
}

// ============= 混合模式工厂 =============

/**
 * 混合模式工厂
 * 根据颜色空间和模式名称创建合适的混合模式实例
 */
class BlendModeFactory {
  /**
   * 创建混合模式实例
   * @param {string} modeName - PDF混合模式名称 (如 "Lighten", "Darken")
   * @param {string} colorSpace - 颜色空间 ('RGB', 'CMYK', 'DeviceN')
   * @returns {BlendMode}
   */
  static create(modeName, colorSpace) {
    if (colorSpace === ColorSpace.DEVICEN) {
      return this.#createDeviceNMode(modeName);
    }
    if (colorSpace === ColorSpace.CMYK) {
      return this.#createCMYKMode(modeName);
    }
    // 默认RGB模式（使用Canvas原生）
    return this.#createCanvasMode(modeName);
  }

  /**
   * 创建DeviceN混合模式
   * @param {string} modeName
   * @returns {DeviceNBlendMode}
   */
  static #createDeviceNMode(modeName) {
    switch (modeName) {
      case "Normal":
      case "Compatible":
        return new DeviceNNormalMode();
      case "Lighten":
        return new DeviceNLightenMode();
      case "Darken":
        return new DeviceNDarkenMode();
      case "Multiply":
        return new DeviceNMultiplyMode();
      case "Screen":
        return new DeviceNScreenMode();
      default:
        warn(`Unsupported DeviceN blend mode: ${modeName}, using Normal`);
        return new DeviceNNormalMode();
    }
  }

  /**
   * 创建CMYK混合模式
   * @param {string} modeName
   * @returns {CMYKBlendMode}
   */
  static #createCMYKMode(modeName) {
    switch (modeName) {
      case "Normal":
      case "Compatible":
        return new CMYKNormalMode();
      case "Lighten":
        return new CMYKLightenMode();
      case "Darken":
        return new CMYKDarkenMode();
      case "Multiply":
        return new CMYKMultiplyMode();
      case "Screen":
        return new CMYKScreenMode();
      default:
        warn(`Unsupported CMYK blend mode: ${modeName}, using Normal`);
        return new CMYKNormalMode();
    }
  }

  /**
   * 创建Canvas混合模式（RGB）
   * @param {string} modeName
   * @returns {CanvasBlendMode}
   */
  static #createCanvasMode(modeName) {
    // 映射PDF混合模式名称到Canvas模式
    const modeMap = {
      Normal: "source-over",
      Compatible: "source-over",
      Multiply: "multiply",
      Screen: "screen",
      Overlay: "overlay",
      Darken: "darken",
      Lighten: "lighten",
      ColorDodge: "color-dodge",
      ColorBurn: "color-burn",
      HardLight: "hard-light",
      SoftLight: "soft-light",
      Difference: "difference",
      Exclusion: "exclusion",
      Hue: "hue",
      Saturation: "saturation",
      Color: "color",
      Luminosity: "luminosity",
    };

    const canvasMode = modeMap[modeName] || "source-over";
    return new CanvasBlendMode(canvasMode);
  }

  /**
   * 检查是否支持指定的混合模式
   * @param {string} modeName
   * @returns {boolean}
   */
  static isSupported(modeName) {
    const supportedModes = [
      "Normal",
      "Compatible",
      "Multiply",
      "Screen",
      "Overlay",
      "Darken",
      "Lighten",
      "ColorDodge",
      "ColorBurn",
      "HardLight",
      "SoftLight",
      "Difference",
      "Exclusion",
      "Hue",
      "Saturation",
      "Color",
      "Luminosity",
    ];
    return supportedModes.includes(modeName);
  }
}

export {
  BlendMode,
  BlendModeFactory,
  CanvasBlendMode,
  CMYKBlendMode,
  CMYKDarkenMode,
  CMYKLightenMode,
  CMYKMultiplyMode,
  CMYKNormalMode,
  CMYKScreenMode,
  DeviceNBlendMode,
  DeviceNDarkenMode,
  DeviceNLightenMode,
  DeviceNMultiplyMode,
  DeviceNNormalMode,
  DeviceNScreenMode,
};
