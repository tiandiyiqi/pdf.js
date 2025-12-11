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

class ColorConverter {
  // 静态颜色过滤器配置
  static #colorFilterConfig = {
    enabled: true,
    colors: new Map([
      ["Cyan", true],
      ["Magenta", true],
      ["Yellow", true],
      ["Black", true],
    ]),
    overprint: false, // 叠印预览开关
  };

  // 事件监听器
  static #eventListeners = new Map();

  // 触发事件
  static #triggerEvent(eventName, data) {
    const listeners = this.#eventListeners.get(eventName) || [];
    console.log(
      `[${new Date().toISOString()}] ColorConverter: 触发事件 ${eventName}，数据:`,
      data,
      `监听器数量: ${listeners.length}`
    );
    for (const listener of listeners) {
      listener(data);
    }
  }

  // 配置管理方法
  static setColorFilterConfig(config) {
    if (config?.enabled !== undefined) {
      this.#colorFilterConfig.enabled = !!config.enabled;
    }
    if (config?.colors && typeof config.colors === "object") {
      this.#colorFilterConfig.colors = new Map(Object.entries(config.colors));
    }
    if (config?.overprint !== undefined) {
      this.#colorFilterConfig.overprint = !!config.overprint;
    }
  }

  static getColorFilterConfig() {
    const colors = Object.fromEntries(this.#colorFilterConfig.colors);
    console.log(
      `[${new Date().toISOString()}] ColorConverter.getColorFilterConfig: 返回颜色配置，enabled: ${this.#colorFilterConfig.enabled}，overprint: ${this.#colorFilterConfig.overprint}，colors:`,
      colors
    );
    return {
      enabled: this.#colorFilterConfig.enabled,
      overprint: this.#colorFilterConfig.overprint,
      colors: colors,
    };
  }

  static updateColorState(colorName, visible) {
    if (typeof colorName === "string") {
      this.#colorFilterConfig.colors.set(colorName, !!visible);
    }
  }

  static addSpotColor(spotName, visible = true) {
    console.log(
      `[${new Date().toISOString()}] ColorConverter.addSpotColor: 开始添加专色，spotName: ${spotName}，类型: ${typeof spotName}，visible: ${visible}`
    );
    if (typeof spotName === "string") {
      const wasPresent = this.#colorFilterConfig.colors.has(spotName);
      this.#colorFilterConfig.colors.set(spotName, !!visible);

      if (!wasPresent) {
        console.log(
          `[${new Date().toISOString()}] ColorConverter.addSpotColor: 专色 ${spotName} 首次添加，触发事件`
        );
        // 触发专色添加事件
        this.#triggerEvent("spotColorAdded", {
          name: spotName,
          visible: !!visible,
        });
      } else {
        console.log(
          `[${new Date().toISOString()}] ColorConverter.addSpotColor: 专色 ${spotName} 已存在，跳过事件触发`
        );
      }
      const currentColors = Object.fromEntries(this.#colorFilterConfig.colors);
      console.log(
        `[${new Date().toISOString()}] ColorConverter.addSpotColor: 添加专色后，当前颜色配置:`,
        currentColors
      );
    } else {
      console.log(
        `[${new Date().toISOString()}] ColorConverter.addSpotColor: 无效的专色名称，类型: ${typeof spotName}，值:`,
        spotName
      );
    }
  }

  /**
   * 从PDF文档中提取专色信息（主线程专用）
   * @param {PDFDocumentProxy} pdfDocument - PDF文档代理对象
   * @returns {Promise<string[]>} 专色名称列表
   */
  static async extractSpotColorsFromPDF(pdfDocument) {
    console.log(
      `[${new Date().toISOString()}] ColorConverter.extractSpotColorsFromPDF: 开始提取专色`
    );

    if (!pdfDocument || !pdfDocument.numPages) {
      console.log(
        `[${new Date().toISOString()}] ColorConverter.extractSpotColorsFromPDF: 无效的PDF文档`
      );
      return [];
    }

    const spotColors = new Set();

    try {
      // 只扫描第一页（通常足够）
      const page = await pdfDocument.getPage(1);
      const opList = await page.getOperatorList();

      console.log(
        `[${new Date().toISOString()}] ColorConverter.extractSpotColorsFromPDF: 获取到第一页的操作列表，操作数: ${opList.fnArray.length}`
      );

      // 注意：这里我们无法直接访问ColorSpace对象，因为那些在Worker线程
      // 但我们可以通过其他方式（如PDF元数据）获取专色信息
      // 暂时返回空数组，让PDF文档加载后通过其他机制填充
    } catch (error) {
      console.error(
        `[${new Date().toISOString()}] ColorConverter.extractSpotColorsFromPDF: 提取专色时出错:`,
        error
      );
    }

    return Array.from(spotColors);
  }

  // 事件管理方法
  static addEventListener(eventName, listener) {
    if (typeof eventName !== "string" || typeof listener !== "function") {
      return;
    }

    if (!this.#eventListeners.has(eventName)) {
      this.#eventListeners.set(eventName, []);
    }
    this.#eventListeners.get(eventName).push(listener);
  }

  static removeEventListener(eventName, listener) {
    if (typeof eventName !== "string" || typeof listener !== "function") {
      return;
    }

    const listeners = this.#eventListeners.get(eventName);
    if (listeners) {
      const index = listeners.indexOf(listener);
      if (index !== -1) {
        listeners.splice(index, 1);
      }
    }
  }

  // 过滤逻辑
  static filterCMYK(cmyk) {
    if (!this.#colorFilterConfig.enabled) return [...cmyk];

    const filtered = [...cmyk];
    const colors = this.#colorFilterConfig.colors;

    if (!colors.get("Cyan")) filtered[0] = 0;
    if (!colors.get("Magenta")) filtered[1] = 0;
    if (!colors.get("Yellow")) filtered[2] = 0;
    if (!colors.get("Black")) filtered[3] = 0;

    return filtered;
  }

  static filterSpot(spotName, spotValue) {
    if (!this.#colorFilterConfig.enabled) return spotValue;

    const shouldShow = this.#colorFilterConfig.colors.get(spotName);
    return shouldShow === false ? 0 : spotValue;
  }

  // 带过滤器的转换方法
  static cmykToRgbWithFilter(cmyk) {
    return this.cmykToRgb(this.filterCMYK(cmyk));
  }

  static deviceNToRgbWithFilter(channels) {
    console.log(
      `[${new Date().toISOString()}] ColorConverter: 进入 deviceNToRgbWithFilter 方法，通道数据:`,
      channels
    );

    // 先处理专色名称的自动注册
    // 检查channels的不同可能结构
    if (channels.spots) {
      console.log(
        `[${new Date().toISOString()}] ColorConverter: 检测到专色通道:`,
        Object.keys(channels.spots)
      );
      for (const [name] of Object.entries(channels.spots)) {
        // 如果专色尚未在配置中，自动添加，否则保持现有可见性
        if (!this.#colorFilterConfig.colors.has(name)) {
          this.addSpotColor(name);
        }
      }
    } else if (channels.channelNames) {
      console.log(
        `[${new Date().toISOString()}] ColorConverter: 检测到通道名称:`,
        channels.channelNames
      );
      // 从通道名称中提取专色
      const cmykNames = ["Cyan", "Magenta", "Yellow", "Black"];
      const spotNames = channels.channelNames.filter(
        name => !cmykNames.includes(name)
      );
      console.log(
        `[${new Date().toISOString()}] ColorConverter: 提取到专色名称:`,
        spotNames
      );
      spotNames.forEach(name => this.addSpotColor(name));
    }

    const cmyk = channels.cmyk ? this.filterCMYK(channels.cmyk) : [0, 0, 0, 0];
    console.log(
      `[${new Date().toISOString()}] ColorConverter: 处理后的CMYK值:`,
      cmyk
    );

    let totalSpot = 0;
    if (channels.spots) {
      for (const [name, value] of Object.entries(channels.spots)) {
        const filteredValue = this.filterSpot(name, value);
        totalSpot += filteredValue;
        console.log(
          `[${new Date().toISOString()}] ColorConverter: 处理专色 ${name}，原始值: ${value}，过滤后值: ${filteredValue}，累计值: ${totalSpot}`
        );
      }
    }

    cmyk[3] = Math.min(1, cmyk[3] + totalSpot * 0.3);
    const rgb = this.cmykToRgb(cmyk);
    console.log(
      `[${new Date().toISOString()}] ColorConverter: 最终CMYK值:`,
      cmyk,
      `转换为RGB值:`,
      rgb
    );
    return rgb;
  }

  // CMYK到RGB的转换方法（基于现有逻辑）
  static cmykToRgb(cmyk) {
    const [c, m, y, k] = cmyk;

    if (this.#colorFilterConfig.overprint) {
      // 叠印模式：颜色直接叠加，不进行传统的CMYK混合
      // 每个颜色分量直接转换为RGB并叠加
      const r = 255 * (1 - c * (1 - k) - k * 0.5);
      const g = 255 * (1 - m * (1 - k) - k * 0.5);
      const b = 255 * (1 - y * (1 - k) - k * 0.5);

      return [Math.round(r), Math.round(g), Math.round(b)];
    } else {
      // 普通模式：简单的CMYK到RGB转换公式
      const r = 255 * (1 - c) * (1 - k);
      const g = 255 * (1 - m) * (1 - k);
      const b = 255 * (1 - y) * (1 - k);

      return [Math.round(r), Math.round(g), Math.round(b)];
    }
  }
}

export { ColorConverter };
