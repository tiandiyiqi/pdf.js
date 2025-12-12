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

  // 初始化日志
  static {
    const stack = new Error().stack;
    const location = typeof window !== "undefined" ? "主线程" : "Worker线程";
    console.log(`[ColorConverter] 类初始化完成（${location}），初始配置:`, {
      enabled: this.#colorFilterConfig.enabled,
      overprint: this.#colorFilterConfig.overprint,
      colors: Object.fromEntries(this.#colorFilterConfig.colors),
    });
    console.log(`[ColorConverter] 初始化调用栈:`, stack);
  }

  // 事件监听器
  static #eventListeners = new Map();

  // 触发事件
  static #triggerEvent(eventName, data) {
    const listeners = this.#eventListeners.get(eventName) || [];
    for (const listener of listeners) {
      listener(data);
    }
  }

  // 配置管理方法
  static setColorFilterConfig(config) {
    // #region agent log
    fetch("http://127.0.0.1:7242/ingest/a7a0bbf3-c810-44bd-8abc-01573cb8b9a5", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "color_converter.js:52",
        message: "setColorFilterConfig called",
        data: { config, isWorker: typeof window === "undefined" },
        timestamp: Date.now(),
        sessionId: "debug-session",
        hypothesisId: "A,E",
      }),
    }).catch(() => {});
    // #endregion

    if (config?.enabled !== undefined) {
      this.#colorFilterConfig.enabled = !!config.enabled;
    }
    if (config?.colors && typeof config.colors === "object") {
      this.#colorFilterConfig.colors = new Map(Object.entries(config.colors));
    }
    if (config?.overprint !== undefined) {
      this.#colorFilterConfig.overprint = !!config.overprint;
    }

    // #region agent log
    fetch("http://127.0.0.1:7242/ingest/a7a0bbf3-c810-44bd-8abc-01573cb8b9a5", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "color_converter.js:62",
        message: "setColorFilterConfig complete",
        data: { finalConfig: this.getColorFilterConfig() },
        timestamp: Date.now(),
        sessionId: "debug-session",
        hypothesisId: "A",
      }),
    }).catch(() => {});
    // #endregion
  }

  static getColorFilterConfig() {
    const colors = Object.fromEntries(this.#colorFilterConfig.colors);
    return {
      enabled: this.#colorFilterConfig.enabled,
      overprint: this.#colorFilterConfig.overprint,
      colors,
    };
  }

  static updateColorState(colorName, visible) {
    if (typeof colorName === "string") {
      console.log(
        `[ColorConverter] updateColorState: ${colorName} -> ${visible}`
      );
      this.#colorFilterConfig.colors.set(colorName, !!visible);
      console.log(
        `[ColorConverter] 更新后的配置:`,
        this.getColorFilterConfig()
      );
    }
  }

  static addSpotColor(spotName, visible = true, color = null) {
    if (typeof spotName === "string") {
      const wasPresent = this.#colorFilterConfig.colors.has(spotName);

      // 只有当专色不存在时才设置，避免覆盖用户已经设置的状态
      if (!wasPresent) {
        this.#colorFilterConfig.colors.set(spotName, !!visible);

        // 触发专色添加事件，包含颜色信息
        this.#triggerEvent("spotColorAdded", {
          name: spotName,
          visible: !!visible,
          color,
        });
      }
    }
  }

  /**
   * 从PDF文档中提取专色信息（主线程专用）
   * @param {PDFDocumentProxy} pdfDocument - PDF文档代理对象
   * @returns {Promise<string[]>} 专色名称列表
   */
  static async extractSpotColorsFromPDF(pdfDocument) {
    if (!pdfDocument || !pdfDocument.numPages) {
      return [];
    }

    const spotColors = new Set();

    try {
      // 只扫描第一页（通常足够）
      // 注意：这里我们无法直接访问ColorSpace对象，因为那些在Worker线程
      // 但我们可以通过其他方式（如PDF元数据）获取专色信息
      // 暂时返回空数组，让PDF文档加载后通过其他机制填充
    } catch {
      // 错误处理
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
  /**
   * 过滤CMYK颜色值，根据当前颜色过滤器配置隐藏/显示特定颜色通道
   * @param {number[]} cmyk - 输入的CMYK颜色值数组，顺序为[C, M, Y, K]
   * @returns {number[]} 过滤后的CMYK颜色值数组
   */
  static filterCMYK(cmyk) {
    // #region agent log
    // 调试日志：记录方法调用时的输入参数和配置状态
    fetch("http://127.0.0.1:7242/ingest/a7a0bbf3-c810-44bd-8abc-01573cb8b9a5", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "color_converter.js:155",
        message: "filterCMYK entry",
        data: {
          cmyk,
          enabled: this.#colorFilterConfig.enabled,
          colors: Object.fromEntries(this.#colorFilterConfig.colors),
          isWorker: typeof window === "undefined",
        },
        timestamp: Date.now(),
        sessionId: "debug-session",
        hypothesisId: "A,B",
      }),
    }).catch(() => {});
    // #endregion

    // 如果过滤器未启用，直接返回原始CMYK值
    if (!this.#colorFilterConfig.enabled) {
      return [...cmyk];
    }

    // 创建CMYK数组的副本用于过滤操作
    const filtered = [...cmyk];
    const colors = this.#colorFilterConfig.colors;

    // 根据配置逐个检查颜色通道是否应该显示
    // 如果颜色通道被禁用(visible=false)，则将该通道值设为0
    if (!colors.get("Cyan")) {
      filtered[0] = 0; // 青色通道
    }
    if (!colors.get("Magenta")) {
      filtered[1] = 0; // 品红色通道
    }
    if (!colors.get("Yellow")) {
      filtered[2] = 0; // 黄色通道
    }
    if (!colors.get("Black")) {
      filtered[3] = 0; // 黑色通道
    }

    return filtered;
  }

  static filterSpot(spotName, spotValue) {
    if (!this.#colorFilterConfig.enabled) {
      console.log(
        `[ColorConverter] filterSpot: 过滤器未启用，返回原始值 ${spotName}=${spotValue}`
      );
      return spotValue;
    }

    const shouldShow = this.#colorFilterConfig.colors.get(spotName);
    const result = shouldShow === false ? 0 : spotValue;
    console.log(
      `[ColorConverter] filterSpot: ${spotName} -> ${spotValue} (shouldShow=${shouldShow}) -> ${result}`
    );
    return result;
  }

  // 带过滤器的转换方法
  static cmykToRgbWithFilter(cmyk) {
    console.log(`[ColorConverter] cmykToRgbWithFilter 被调用，输入CMYK:`, cmyk);
    const filtered = this.filterCMYK(cmyk);
    const rgb = this.cmykToRgb(filtered);
    console.log(`[ColorConverter] cmykToRgbWithFilter 输出RGB:`, rgb);
    return rgb;
  }

  static deviceNToRgbWithFilter(channels) {
    // 先处理专色名称的自动注册
    // 检查channels的不同可能结构
    if (channels.spots) {
      for (const [name] of Object.entries(channels.spots)) {
        // 如果专色尚未在配置中，自动添加，否则保持现有可见性
        if (!this.#colorFilterConfig.colors.has(name)) {
          // 检查是否有颜色信息
          const color = channels.spotColorsRGB?.[name]?.hex || null;
          this.addSpotColor(name, true, color);
        }
      }
    } else if (channels.channelNames) {
      // 从通道名称中提取专色
      const cmykNames = ["Cyan", "Magenta", "Yellow", "Black"];
      const spotNames = channels.channelNames.filter(
        name => !cmykNames.includes(name)
      );
      spotNames.forEach(name => {
        // 检查是否有颜色信息
        const color = channels.spotColorsRGB?.[name]?.hex || null;
        this.addSpotColor(name, true, color);
      });
    }

    const cmyk = channels.cmyk ? this.filterCMYK(channels.cmyk) : [0, 0, 0, 0];

    let totalSpot = 0;
    if (channels.spots) {
      for (const [name, value] of Object.entries(channels.spots)) {
        const filteredValue = this.filterSpot(name, value);
        totalSpot += filteredValue;
      }
    }

    cmyk[3] = Math.min(1, cmyk[3] + totalSpot * 0.3);
    const rgb = this.cmykToRgb(cmyk);
    return rgb;
  }

  // CMYK到RGB的转换方法
  // 使用与DeviceCmykCS.#toRgb相同的多项式回归算法
  // 系数来自CMYK US Web Coated (SWOP) 色彩空间的采样RGB颜色表
  static cmykToRgb(cmyk) {
    const [c, m, y, k] = cmyk;

    if (this.#colorFilterConfig.overprint) {
      // 叠印模式：颜色直接叠加，不进行传统的CMYK混合
      // 每个颜色分量直接转换为RGB并叠加
      const r = 255 * (1 - c * (1 - k) - k * 0.5);
      const g = 255 * (1 - m * (1 - k) - k * 0.5);
      const b = 255 * (1 - y * (1 - k) - k * 0.5);

      return [Math.round(r), Math.round(g), Math.round(b)];
    }

    // 普通模式：使用多项式回归算法，与DeviceCmykCS.#toRgb完全相同
    let r, g, b;

    r =
      255 +
      c *
        (-4.387332384609988 * c +
          54.48615194189176 * m +
          18.82290502165302 * y +
          212.25662451639585 * k +
          -285.2331026137004) +
      m *
        (1.7149763477362134 * m -
          5.6096736904047315 * y -
          17.873870861415444 * k -
          5.497006427196366) +
      y *
        (-2.5217340131683033 * y - 21.248923337353073 * k + 17.5119270841813) +
      k * (-21.86122147463605 * k - 189.48180835922747);

    g =
      255 +
      c *
        (8.841041422036149 * c +
          60.118027045597366 * m +
          6.871425592049007 * y +
          31.159100130055922 * k +
          -79.2970844816548) +
      m *
        (-15.310361306967817 * m +
          17.575251261109482 * y +
          131.35250912493976 * k -
          190.9453302588951) +
      y * (4.444339102852739 * y + 9.8632861493405 * k - 24.86741582555878) +
      k * (-20.737325471181034 * k - 187.80453709719578);

    b =
      255 +
      c *
        (0.8842522430003296 * c +
          8.078677503112928 * m +
          30.89978309703729 * y -
          0.23883238689178934 * k +
          -14.183576799673286) +
      m *
        (10.49593273432072 * m +
          63.02378494754052 * y +
          50.606957656360734 * k -
          112.23884253719248) +
      y *
        (0.03296041114873217 * y +
          115.60384449646641 * k +
          -193.58209356861505) +
      k * (-22.33816807309886 * k - 180.12613974708367);

    // 确保RGB值在0-255范围内
    r = Math.round(Math.max(0, Math.min(255, r)));
    g = Math.round(Math.max(0, Math.min(255, g)));
    b = Math.round(Math.max(0, Math.min(255, b)));

    return [r, g, b];
  }
}

export { ColorConverter };
