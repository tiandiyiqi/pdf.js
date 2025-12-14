/* Copyright 2020 Mozilla Foundation
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

/** @typedef {import("./event_utils.js").EventBus} EventBus */

import { BaseTreeViewer } from "./base_tree_viewer.js";
import { ColorConverter } from "./pdfjs.js";
import { ColorFilterConfig } from "../src/display/color_filter_config.js";

/**
 * @typedef {Object} PDFInkListViewerOptions
 * @property {HTMLDivElement} container - The viewer element.
 * @property {EventBus} eventBus - The application event bus.
 */

class PDFInkListViewer extends BaseTreeViewer {
  constructor(options) {
    super(options);
    this.inks = [];
    this.nextId = 6; // 从6开始，避免与demo数据冲突
    this.inksContainer = null;
    this.eyeIcons = {}; // 保存眼睛图标的引用
    this._firstPageRendered = false; // 标记第一页是否已渲染
    this.spotColorMap = new Map(); // 存储专色颜色映射，避免每次render重新生成

    // 多页面颜色状态管理
    this.pageColorStates = new Map(); // 存储每个页面的颜色配置
    this.currentPageNumber = 1; // 当前活动页面
    this.pageColorUpdateQueue = new Set(); // 页面颜色更新队列
    this._lastRenderTime = 0; // 上次渲染时间戳，用于防抖
    this.RENDER_DEBOUNCE_DELAY = 100; // 渲染防抖延迟（毫秒）

    // 持久化的油墨可见性状态（跨文档重新加载保持，按页面存储）
    this.inkVisibilityState = new Map(); // Map<pageNumber, Map<inkName, visible>>

    // 创建ColorFilterConfig实例（方案D）
    this._colorFilterConfig = new ColorFilterConfig();

    // 监听页面渲染事件和页面切换事件
    this._handlePageRendered = this._handlePageRendered.bind(this);
    this._handlePageChange = this._handlePageChange.bind(this);
    this._handlePagesLoaded = this._handlePagesLoaded.bind(this);

    this.eventBus._on("pagerendered", this._handlePageRendered);
    this.eventBus._on("pagechanging", this._handlePageChange);
    this.eventBus._on("pagesloaded", this._handlePagesLoaded);
  }

  /**
   * Handle page rendered event
   */
  async _handlePageRendered(evt) {
    try {
      const pageView = evt.source;
      if (pageView && pageView.pdfPage) {
        const opList = await pageView.pdfPage.getOperatorList();

        // 处理页面颜色信息并保存到状态管理
        await this._processPageColors(evt.pageNumber, opList);

        // 页面首次渲染完成后，触发"全部显示"状态的预缓存
        this._triggerPreCacheForPage(evt.pageNumber, opList);

        // 如果是当前活动页面，立即更新油墨清单
        if (evt.pageNumber === this.currentPageNumber) {
          console.log(
            `PDFInkListViewer: 页面${evt.pageNumber}渲染完成，更新油墨清单`
          );
          this._updateInkListFromCurrentPage();
        } else {
          console.log(
            `PDFInkListViewer: 页面${evt.pageNumber}渲染完成，但非当前页面`
          );
        }
      }
    } catch (error) {
      console.error(
        `PDFInkListViewer: 处理页面${evt.pageNumber}颜色信息时出错:`,
        error
      );
    }
  }

  /**
   * Handle page changing event
   */
  _handlePageChange(evt) {
    const newPageNumber = evt.pageNumber;
    if (newPageNumber !== this.currentPageNumber) {
      this.currentPageNumber = newPageNumber;

      // 检查目标页面是否已有颜色数据
      if (this.pageColorStates.has(newPageNumber)) {
        // 立即更新油墨清单
        this._updateInkListFromCurrentPage();
      } else {
        // 标记页面需要颜色数据
        this.pageColorUpdateQueue.add(newPageNumber);
      }
    }
  }

  /**
   * Handle pages loaded event
   */
  _handlePagesLoaded(evt) {
    console.log(`PDFInkListViewer: 文档加载完成，共${evt.pagesCount}页`);

    // 文档加载完成后，初始化第一页的颜色数据
    if (evt.pagesCount > 0 && !this.pageColorStates.has(1)) {
      this.pageColorUpdateQueue.add(1);
      console.log("PDFInkListViewer: 将第一页加入更新队列");
    }

    // 确保油墨清单在文档加载后能够显示
    if (this.currentPageNumber === 1 && this.pageColorStates.has(1)) {
      console.log("PDFInkListViewer: 文档加载完成，立即更新第一页油墨清单");
      this._updateInkListFromCurrentPage();
    }
  }

  /**
   * Process page colors and save to state management
   */
  async _processPageColors(pageNumber, opList) {
    const pageColorState = {
      pageNumber,
      colorType: this._determineColorType(opList),
      colors: [],
      lastUpdated: Date.now(),
      isLoaded: true,
    };

    // 为当前页面创建独立的spotColorMap
    const pageSpotColorMap = new Map();

    // 保存当前页面的spotColorsRGB
    if (opList.spotColorsRGB) {
      for (const [spotName, colorInfo] of Object.entries(
        opList.spotColorsRGB
      )) {
        if (colorInfo.hex) {
          pageSpotColorMap.set(spotName, colorInfo.hex);
          // 也更新全局spotColorMap，但仅用于颜色值缓存
          this.spotColorMap.set(spotName, colorInfo.hex);
        }
      }
    }

    // 提取当前页面的专色信息
    // spotColors 可能是 Set 或 Array
    if (opList.spotColors) {
      const spotColorsArray = Array.isArray(opList.spotColors)
        ? opList.spotColors
        : opList.spotColors instanceof Set
          ? Array.from(opList.spotColors)
          : [];

      for (const spotName of spotColorsArray) {
        const spotColor =
          pageSpotColorMap.get(spotName) ||
          this.spotColorMap.get(spotName) ||
          this._generateRandomColor();

        pageColorState.colors.push({
          name: spotName,
          value: spotColor,
          visible: true,
        });

        // 注册到ColorConverter用于颜色过滤
        ColorConverter.addSpotColor(spotName, true, spotColor);
      }
    }

    // 保存页面颜色状态
    this.pageColorStates.set(pageNumber, pageColorState);

    // 从队列中移除已处理的页面
    this.pageColorUpdateQueue.delete(pageNumber);
  }

  /**
   * Determine color type based on operator list
   */
  _determineColorType(opList) {
    if (!opList.spotColors || !Array.isArray(opList.spotColors)) {
      return "cmyk";
    }

    // 根据专色名称判断颜色类型
    const spotNames = opList.spotColors.join(",").toLowerCase();
    if (spotNames.includes("spot1")) {
      return "cmyk spot1";
    } else if (spotNames.includes("spot2")) {
      return "cmyk spot2";
    }

    return "cmyk";
  }

  /**
   * 触发当前页面的颜色过滤更新
   * 基于当前页面的可见性状态创建一个新的ColorFilterConfig
   */
  _triggerCurrentPageColorFilter() {
    // 基于当前页面的可见性状态创建一个新的ColorFilterConfig
    const pageConfig = new ColorFilterConfig();
    const pageVisibilityState = this._getPageVisibilityState(
      this.currentPageNumber
    );

    // 初始化CMYK通道
    const channelNameMap = {
      青色: "Cyan",
      洋红色: "Magenta",
      黄色: "Yellow",
      黑色: "Black",
    };

    for (const [chineseName, englishName] of Object.entries(channelNameMap)) {
      const visible = this._getInkVisibility(
        this.currentPageNumber,
        chineseName,
        true
      );
      pageConfig.setVisibility(englishName, visible);
    }

    // 初始化专色
    const currentState = this.pageColorStates.get(this.currentPageNumber);
    if (currentState && currentState.colors) {
      for (const colorInfo of currentState.colors) {
        const visible = this._getInkVisibility(
          this.currentPageNumber,
          colorInfo.name,
          true
        );
        pageConfig.setVisibility(colorInfo.name, visible);
      }
    }

    // 触发 colorfilterconfig 事件，传递新的Promise
    console.log(
      `[PDFInkListViewer] 触发页面${this.currentPageNumber}的颜色过滤更新`
    );
    this.eventBus.dispatch("colorfilterconfig", {
      source: this,
      promise: Promise.resolve(pageConfig), // 每次都创建新的Promise
    });
  }

  /**
   * 触发页面的预缓存：创建"全部显示"状态的 ColorFilterConfig 并触发一次渲染
   * @param {number} pageNumber - 页面号
   * @param {Object} opList - operatorList，包含 spotColors 信息
   */
  _triggerPreCacheForPage(pageNumber, opList) {
    // 确保每个页面只预缓存一次
    if (!this._preCachedPages) {
      this._preCachedPages = new Set();
    }

    if (this._preCachedPages.has(pageNumber)) {
      console.log(`[PDFInkListViewer] 页面${pageNumber}已预缓存过，跳过`);
      return; // 已经预缓存过
    }

    this._preCachedPages.add(pageNumber);

    // 获取页面的专色信息
    // spotColors 可能是 Set 或 Array
    let spotColors = opList.spotColors;

    console.log(
      `[PDFInkListViewer] 页面${pageNumber}预缓存检查: opList.spotColors类型=${typeof spotColors}, 是否为Set=${spotColors instanceof Set}, 是否为Array=${Array.isArray(spotColors)}`
    );

    if (
      !spotColors ||
      (Array.isArray(spotColors) && spotColors.length === 0) ||
      (spotColors instanceof Set && spotColors.size === 0)
    ) {
      console.log(
        `[PDFInkListViewer] 页面${pageNumber} opList.spotColors 为空，检查 pageColorStates`
      );
      // 如果 opList 中没有 spotColors，尝试从 pageColorStates 获取
      const pageState = this.pageColorStates.get(pageNumber);
      if (pageState && pageState.colors && pageState.colors.length > 0) {
        spotColors = new Set(pageState.colors.map(c => c.name));
        console.log(
          `[PDFInkListViewer] 从 pageColorStates 获取到专色:`,
          Array.from(spotColors)
        );
      } else {
        console.log(
          `[PDFInkListViewer] pageColorStates 中也无专色信息，pageState存在=${!!pageState}, colors存在=${!!(pageState && pageState.colors)}, colors长度=${pageState?.colors?.length || 0}`
        );
      }
    }

    // 统一转换为 Set
    if (Array.isArray(spotColors)) {
      spotColors = new Set(spotColors);
    } else if (!(spotColors instanceof Set)) {
      spotColors = new Set();
    }

    if (spotColors.size === 0) {
      console.log(
        `[PDFInkListViewer] 页面${pageNumber}无专色（spotColors.size=0），跳过预缓存`
      );
      return;
    }

    console.log(
      `[PDFInkListViewer] 页面${pageNumber}找到${spotColors.size}个专色:`,
      Array.from(spotColors)
    );

    // 创建一个"全部显示"的 ColorFilterConfig
    const fullVisibleConfig = new ColorFilterConfig({
      enabled: true,
      colors: {
        Cyan: true,
        Magenta: true,
        Yellow: true,
        Black: true,
      },
    });

    // 添加所有专色（全部可见）
    for (const colorName of spotColors) {
      fullVisibleConfig.setVisibility(colorName, true);
    }

    const stateKey = fullVisibleConfig.getFilterStateKey();
    console.log(
      `[PDFInkListViewer] 触发页面${pageNumber}的预缓存，状态: ${stateKey}`
    );

    // 触发一次颜色过滤渲染，但标记为预缓存操作
    this.eventBus.dispatch("colorfilterconfig", {
      source: this,
      promise: Promise.resolve(fullVisibleConfig),
      pageNumber,
      isPreCache: true, // 标记为预缓存操作
    });
  }

  /**
   * 获取当前页面的油墨可见性状态Map
   */
  _getPageVisibilityState(pageNumber) {
    if (!this.inkVisibilityState.has(pageNumber)) {
      this.inkVisibilityState.set(pageNumber, new Map());
    }
    return this.inkVisibilityState.get(pageNumber);
  }

  /**
   * 获取指定油墨在当前页面的可见性状态
   */
  _getInkVisibility(pageNumber, inkName, defaultValue = true) {
    const pageState = this._getPageVisibilityState(pageNumber);
    return pageState.has(inkName) ? pageState.get(inkName) : defaultValue;
  }

  /**
   * 设置指定油墨在当前页面的可见性状态
   */
  _setInkVisibility(pageNumber, inkName, visible) {
    const pageState = this._getPageVisibilityState(pageNumber);
    pageState.set(inkName, visible);
  }

  /**
   * Update ink list from current page color state
   */
  _updateInkListFromCurrentPage() {
    const currentState = this.pageColorStates.get(this.currentPageNumber);
    if (!currentState || !currentState.isLoaded) {
      console.warn(
        `PDFInkListViewer: 页面${this.currentPageNumber}的颜色数据尚未加载`
      );
      return;
    }

    // 防抖处理：避免频繁渲染
    const now = Date.now();
    if (now - this._lastRenderTime < this.RENDER_DEBOUNCE_DELAY) {
      clearTimeout(this._renderTimeout);
    }

    this._renderTimeout = setTimeout(() => {
      try {
        // 从持久化存储中恢复当前页面的可见性状态
        const pageState = this._getPageVisibilityState(this.currentPageNumber);

        // 清空当前油墨列表
        this.inks = [];
        this.nextId = 1;

        // 添加默认的CMYK组和通道，从当前页面的持久化存储恢复可见性状态
        this.inks.push(
          {
            id: this.nextId++,
            name: "CMYK",
            color: "#000000",
            visible: this._getInkVisibility(
              this.currentPageNumber,
              "CMYK",
              true
            ),
            isGroup: true,
          },
          {
            id: this.nextId++,
            name: "青色",
            color: "#00A0E9",
            visible: this._getInkVisibility(
              this.currentPageNumber,
              "青色",
              true
            ),
            isGroup: false,
          },
          {
            id: this.nextId++,
            name: "洋红色",
            color: "#E4007F",
            visible: this._getInkVisibility(
              this.currentPageNumber,
              "洋红色",
              true
            ),
            isGroup: false,
          },
          {
            id: this.nextId++,
            name: "黄色",
            color: "#FFF100",
            visible: this._getInkVisibility(
              this.currentPageNumber,
              "黄色",
              true
            ),
            isGroup: false,
          },
          {
            id: this.nextId++,
            name: "黑色",
            color: "#231815",
            visible: this._getInkVisibility(
              this.currentPageNumber,
              "黑色",
              true
            ),
            isGroup: false,
          }
        );

        // 添加当前页面的专色，从当前页面的持久化存储恢复可见性状态
        for (const colorInfo of currentState.colors) {
          const visible = this._getInkVisibility(
            this.currentPageNumber,
            colorInfo.name,
            colorInfo.visible
          );

          this._addSpotColorToInkList(colorInfo.name, visible, colorInfo.value);
        }

        // 直接渲染当前页面的油墨清单，而不是调用render()方法
        this._renderCurrentPageInks();
        this._lastRenderTime = now;

        console.log(
          `PDFInkListViewer: 已更新为页面${this.currentPageNumber}的颜色配置 (${currentState.colorType})`
        );
      } catch (error) {
        console.error(`PDFInkListViewer: 更新油墨清单时出错:`, error);
        this._handleRenderError(error);
      }
    }, this.RENDER_DEBOUNCE_DELAY);
  }

  /**
   * Handle rendering errors gracefully
   */
  _handleRenderError(error) {
    // 显示错误信息
    if (this.inksContainer) {
      const errorElement = document.createElement("div");
      errorElement.className = "inkError";
      errorElement.style.cssText = `
        padding: 10px;
        background: #ffebee;
        color: #c62828;
        border: 1px solid #ffcdd2;
        border-radius: 4px;
        margin: 5px 0;
        font-size: 12px;
      `;
      errorElement.textContent = `油墨清单加载失败: ${error.message}`;

      // 清空容器并显示错误
      this.inksContainer.innerHTML = "";
      this.inksContainer.append(errorElement);
    }

    // 恢复默认状态
    setTimeout(() => {
      if (this.inksContainer) {
        this.inksContainer.innerHTML = "";
        this.render();
      }
    }, 3000);
  }

  /**
   * Get current page color state for debugging
   */
  getCurrentPageColorState() {
    return this.pageColorStates.get(this.currentPageNumber);
  }

  /**
   * Get all page color states for debugging
   */
  getAllPageColorStates() {
    return Array.from(this.pageColorStates.entries());
  }

  /**
   * Create control buttons row (全部显示/全部隐藏)
   */
  _createControlButtonsRow() {
    const controlRow = document.createElement("div");
    controlRow.className = "inkControlRow";

    // 全部显示按钮
    const showAllButton = document.createElement("div");
    showAllButton.className = "inkControlButton";
    showAllButton.textContent = "全部显示";
    showAllButton.addEventListener("click", () => {
      this._showAllInks();
    });

    // 全部隐藏按钮
    const hideAllButton = document.createElement("div");
    hideAllButton.className = "inkControlButton";
    hideAllButton.textContent = "全部隐藏";
    hideAllButton.addEventListener("click", () => {
      this._hideAllInks();
    });

    controlRow.append(showAllButton);
    controlRow.append(hideAllButton);

    return controlRow;
  }

  /**
   * 显示所有油墨（仅作用于当前页面）
   */
  _showAllInks() {
    // this.inks 只包含当前页面的油墨，所以只更新当前页面的状态
    for (const ink of this.inks) {
      ink.visible = true;
      // 保存到当前页面的持久化存储（只影响当前页面）
      this._setInkVisibility(this.currentPageNumber, ink.name, true);
      // 更新眼睛图标
      const eyeIcon = this.eyeIcons[ink.name];
      if (eyeIcon) {
        eyeIcon.classList.remove("eyeHidden");
        eyeIcon.classList.add("eyeVisible");
      }
      // 更新ColorFilterConfig（方案D）
      const channelNameMap = {
        青色: "Cyan",
        洋红色: "Magenta",
        黄色: "Yellow",
        黑色: "Black",
      };
      const colorConverterName = channelNameMap[ink.name] || ink.name;
      this._colorFilterConfig.setVisibility(colorConverterName, true);
      // 保持向后兼容：同时更新ColorConverter
      ColorConverter.updateColorState(colorConverterName, true);
    }

    // 更新CMYK组图标状态
    this.updateCMYKGroupVisibility();

    // 触发当前页面的颜色过滤更新
    this._triggerCurrentPageColorFilter();
  }

  /**
   * 隐藏所有油墨（仅作用于当前页面）
   */
  _hideAllInks() {
    // this.inks 只包含当前页面的油墨，所以只更新当前页面的状态
    for (const ink of this.inks) {
      ink.visible = false;
      // 保存到当前页面的持久化存储（只影响当前页面）
      this._setInkVisibility(this.currentPageNumber, ink.name, false);
      // 更新眼睛图标
      const eyeIcon = this.eyeIcons[ink.name];
      if (eyeIcon) {
        eyeIcon.classList.remove("eyeVisible");
        eyeIcon.classList.add("eyeHidden");
      }
      // 更新ColorFilterConfig（方案D）
      const channelNameMap = {
        青色: "Cyan",
        洋红色: "Magenta",
        黄色: "Yellow",
        黑色: "Black",
      };
      const colorConverterName = channelNameMap[ink.name] || ink.name;
      this._colorFilterConfig.setVisibility(colorConverterName, false);
      // 保持向后兼容：同时更新ColorConverter
      ColorConverter.updateColorState(colorConverterName, false);
    }

    // 更新CMYK组图标状态
    this.updateCMYKGroupVisibility();

    // 触发当前页面的颜色过滤更新
    this._triggerCurrentPageColorFilter();
  }

  /**
   * Render only the current page's inks
   */
  _renderCurrentPageInks() {
    // 只清除DOM内容，不清空inks数组
    if (this.inksContainer) {
      this.inksContainer.innerHTML = "";
    } else {
      this.inksContainer = document.createElement("div");
      this.inksContainer.className = "inksContainer";
    }

    // Create fragment for better performance
    const fragment = document.createDocumentFragment();

    // Add control buttons row first
    const controlRow = this._createControlButtonsRow();
    this.inksContainer.append(controlRow);

    // Add only current page's inks
    for (const ink of this.inks) {
      const inkElement = this._createInkElement(ink);
      this.inksContainer.append(inkElement);
    }

    // Append to fragment
    fragment.append(this.inksContainer);

    // Update DOM
    this._finishRendering(fragment, this.inks.length, false);
  }

  reset() {
    super.reset();
    this.inks = [];
    this.nextId = 6;
    this.inksContainer = null;
    this.eyeIcons = {};
    // 注意：不要在这里重置_firstPageRendered，因为reset会在render中被调用
    // 注意：不要在这里重置spotColorMap，保留专色颜色映射
    // 注意：不要在这里重置inkVisibilityState，保留油墨可见性状态（跨文档重新加载）
  }

  destroy() {
    // 移除事件监听器
    this.eventBus._off("pagerendered", this._handlePageRendered);
    this.eventBus._off("pagechanging", this._handlePageChange);
    this.eventBus._off("pagesloaded", this._handlePagesLoaded);

    // 清除定时器
    if (this._renderTimeout) {
      clearTimeout(this._renderTimeout);
    }

    super.destroy();
  }

  /**
   * @protected
   */
  _dispatchEvent(inksCount) {
    this.eventBus.dispatch("inksloaded", {
      source: this,
      inksCount,
    });
  }

  /**
   * Add a spot color to the ink list
   */
  _addSpotColorToInkList(name, visible, color) {
    // 检查是否已经存在
    if (this.inks.some(ink => ink.name === name)) {
      return;
    }

    // 检查是否已经为该专色生成过颜色，优先级：
    // 1. spotColorMap中已存在的颜色
    // 2. 外部提供的color参数
    // 3. 生成新的随机颜色
    let inkColor;
    if (this.spotColorMap.has(name)) {
      inkColor = this.spotColorMap.get(name);
    } else if (color) {
      inkColor = color;
      this.spotColorMap.set(name, color);
    } else {
      inkColor = this._generateRandomColor();
      this.spotColorMap.set(name, inkColor);
    }

    // 创建新的油墨项
    const newInk = {
      id: this.nextId++,
      name,
      color: inkColor,
      visible,
      isGroup: false,
    };

    // 添加到油墨列表
    this.inks.push(newInk);

    // 如果油墨容器已经创建，直接添加到DOM
    if (this.inksContainer) {
      const inkElement = this._createInkElement(newInk);
      this.inksContainer.append(inkElement);

      // 更新事件
      this._dispatchEvent(this.inks.length);
    }
  }

  /**
   * Generate a random color for spot colors
   */
  _generateRandomColor() {
    // 生成相对鲜艳的颜色
    const letters = "0123456789ABCDEF";
    let color = "#";
    for (let i = 0; i < 6; i++) {
      // 确保颜色不太暗
      color += letters[Math.floor(Math.random() * 12) + 4];
    }
    return color;
  }

  /**
   * Create ink element
   */
  _createInkElement(ink) {
    // Create ink item container
    const inkItem = document.createElement("div");
    inkItem.className = `inkItem ${ink.isGroup ? "inkGroup" : ""}`;

    // Create eye icon container
    const eyeContainer = document.createElement("div");
    eyeContainer.className = "eyeContainer";

    // Create eye icon
    const eyeIcon = document.createElement("span");
    eyeIcon.className = `eyeIcon ${ink.visible ? "eyeVisible" : "eyeHidden"}`;

    // Create color swatch
    const colorSwatch = document.createElement("div");
    colorSwatch.className = "colorSwatch";
    if (ink.name === "CMYK" && ink.isGroup) {
      // Use inline CMYK SVG for reliable display
      colorSwatch.style.backgroundColor = "transparent";
      colorSwatch.innerHTML = `<svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 5.7 5.7" width="100%" height="100%">
        <style type="text/css">
          .st0{fill:#00A0E9;}
          .st1{fill:#FFF100;}
          .st2{fill:#E4007F;}
          .st3{fill:#231815;}
        </style>
        <polygon points="2.8,2.8 0,5.7 5.7,5.7" fill="#231815"/>
        <polygon class="st0" points="2.8,2.8 0,0 5.7,0"/>
        <polygon class="st1" points="2.8,2.8 5.7,5.7 5.7,0"/>
        <polygon class="st2" points="2.8,2.8 0,5.7 0,0"/>
      </svg>`;
    } else {
      // Use regular color for channels
      colorSwatch.style.backgroundColor = ink.color;
      colorSwatch.innerHTML = "";
    }

    // Create color name
    const colorName = document.createElement("div");
    colorName.className = "colorName";
    colorName.textContent = ink.name;

    // Bind click event to entire ink item row
    inkItem.addEventListener("click", () => {
      if (ink.name === "CMYK" && ink.isGroup) {
        // CMYK组图标点击事件
        ink.visible = !ink.visible;
        const allVisible = ink.visible;

        // 保存状态到当前页面的持久化存储
        this._setInkVisibility(this.currentPageNumber, "CMYK", allVisible);

        // 更新CMYK组图标状态
        eyeIcon.classList.toggle("eyeHidden", !allVisible);
        eyeIcon.classList.toggle("eyeVisible", allVisible);

        // 更新四个通道的状态
        const channelNames = ["青色", "洋红色", "黄色", "黑色"];
        const colorConverterNames = ["Cyan", "Magenta", "Yellow", "Black"];

        for (let i = 0; i < channelNames.length; i++) {
          const channelName = channelNames[i];
          const colorConverterName = colorConverterNames[i];
          const channelInk = this.inks.find(
            channel => channel.name === channelName
          );
          const channelEyeIcon = this.eyeIcons[channelName];

          if (channelInk && channelEyeIcon) {
            channelInk.visible = allVisible;
            // 保存状态到当前页面的持久化存储
            this._setInkVisibility(
              this.currentPageNumber,
              channelName,
              allVisible
            );
            channelEyeIcon.classList.toggle("eyeHidden", !allVisible);
            channelEyeIcon.classList.toggle("eyeVisible", allVisible);
            // 更新ColorFilterConfig（方案D）
            this._colorFilterConfig.setVisibility(
              colorConverterName,
              allVisible
            );
            // 保持向后兼容：同时更新ColorConverter
            ColorConverter.updateColorState(colorConverterName, allVisible);
          }
        }

        // 触发当前页面的颜色过滤更新
        this._triggerCurrentPageColorFilter();
      } else {
        // 单个通道或专色点击事件
        ink.visible = !ink.visible;

        // 保存状态到当前页面的持久化存储
        this._setInkVisibility(this.currentPageNumber, ink.name, ink.visible);

        // 更新当前图标状态
        eyeIcon.classList.toggle("eyeHidden", !ink.visible);
        eyeIcon.classList.toggle("eyeVisible", ink.visible);

        // 更新ColorFilterConfig（方案D）
        const channelNameMap = {
          青色: "Cyan",
          洋红色: "Magenta",
          黄色: "Yellow",
          黑色: "Black",
        };
        const colorConverterName = channelNameMap[ink.name] || ink.name;
        this._colorFilterConfig.setVisibility(colorConverterName, ink.visible);
        // 保持向后兼容：同时更新ColorConverter
        ColorConverter.updateColorState(colorConverterName, ink.visible);

        // 更新CMYK组图标状态
        this.updateCMYKGroupVisibility();

        // 触发当前页面的颜色过滤更新
        this._triggerCurrentPageColorFilter();
      }
    });

    // Assemble ink item
    eyeContainer.append(eyeIcon);
    inkItem.append(eyeContainer);
    inkItem.append(colorSwatch);
    inkItem.append(colorName);

    // 保存眼睛图标的引用
    this.eyeIcons[ink.name] = eyeIcon;

    return inkItem;
  }

  /**
   * 更新CMYK组图标的可见性状态
   */
  updateCMYKGroupVisibility() {
    const cmykGroupInk = this.inks.find(
      ink => ink.name === "CMYK" && ink.isGroup
    );
    const cmykGroupEyeIcon = this.eyeIcons.CMYK;

    if (cmykGroupInk && cmykGroupEyeIcon) {
      // 检查四个通道是否都可见
      const channelNames = ["青色", "洋红色", "黄色", "黑色"];
      const allChannelsVisible = channelNames.every(channelName => {
        const channelInk = this.inks.find(ink => ink.name === channelName);
        return channelInk && channelInk.visible;
      });

      // 检查是否有通道不可见
      const anyChannelInvisible = channelNames.some(channelName => {
        const channelInk = this.inks.find(ink => ink.name === channelName);
        return channelInk && !channelInk.visible;
      });

      // 更新组图标的状态
      cmykGroupInk.visible = allChannelsVisible;
      // 更新当前页面的持久化存储
      this._setInkVisibility(
        this.currentPageNumber,
        "CMYK",
        allChannelsVisible
      );
      cmykGroupEyeIcon.classList.toggle("eyeHidden", anyChannelInvisible);
      cmykGroupEyeIcon.classList.toggle("eyeVisible", allChannelsVisible);
    }
  }

  /**
   * Render the ink list with current color configuration
   */
  render() {
    // Clear previous content
    this.reset();

    // 检查是否有当前页面的颜色数据，如果有则只显示当前页面
    const currentState = this.pageColorStates.get(this.currentPageNumber);
    if (currentState && currentState.isLoaded) {
      // 使用当前页面的颜色数据
      this.inks = [];
      this.nextId = 1;

      // 添加默认的CMYK组和通道，从当前页面的持久化存储恢复可见性状态
      this.inks.push(
        {
          id: this.nextId++,
          name: "CMYK",
          color: "#000000",
          visible: this._getInkVisibility(this.currentPageNumber, "CMYK", true),
          isGroup: true,
        },
        {
          id: this.nextId++,
          name: "青色",
          color: "#00A0E9",
          visible: this._getInkVisibility(this.currentPageNumber, "青色", true),
          isGroup: false,
        },
        {
          id: this.nextId++,
          name: "洋红色",
          color: "#E4007F",
          visible: this._getInkVisibility(
            this.currentPageNumber,
            "洋红色",
            true
          ),
          isGroup: false,
        },
        {
          id: this.nextId++,
          name: "黄色",
          color: "#FFF100",
          visible: this._getInkVisibility(this.currentPageNumber, "黄色", true),
          isGroup: false,
        },
        {
          id: this.nextId++,
          name: "黑色",
          color: "#231815",
          visible: this._getInkVisibility(this.currentPageNumber, "黑色", true),
          isGroup: false,
        }
      );

      // 添加当前页面的专色，从当前页面的持久化存储恢复可见性状态
      for (const colorInfo of currentState.colors) {
        const visible = this._getInkVisibility(
          this.currentPageNumber,
          colorInfo.name,
          colorInfo.visible
        );
        this._addSpotColorToInkList(colorInfo.name, visible, colorInfo.value);
      }

      // 直接渲染当前页面的油墨清单
      this._renderCurrentPageInks();
      return;
    }

    // 如果没有当前页面数据，则使用原来的逻辑（显示所有颜色）
    // 从ColorConverter获取当前的颜色配置
    const colorConfig = ColorConverter.getColorFilterConfig();

    // 初始化inks数组
    const inks = [];
    let nextId = 1;

    // 检查是否包含CMYK通道
    const hasCyan = "Cyan" in colorConfig.colors;
    const hasMagenta = "Magenta" in colorConfig.colors;
    const hasYellow = "Yellow" in colorConfig.colors;
    const hasBlack = "Black" in colorConfig.colors;
    const hasCmyk = hasCyan && hasMagenta && hasYellow && hasBlack;

    // 添加CMYK组和通道，优先使用当前页面的持久化状态
    if (hasCmyk) {
      inks.push(
        {
          id: nextId++,
          name: "CMYK",
          color: "#000000",
          visible: this._getInkVisibility(this.currentPageNumber, "CMYK", true),
          isGroup: true,
        },
        {
          id: nextId++,
          name: "青色",
          color: "#00A0E9",
          visible: this._getInkVisibility(
            this.currentPageNumber,
            "青色",
            colorConfig.colors.Cyan !== false
          ),
          isGroup: false,
        },
        {
          id: nextId++,
          name: "洋红色",
          color: "#E4007F",
          visible: this._getInkVisibility(
            this.currentPageNumber,
            "洋红色",
            colorConfig.colors.Magenta !== false
          ),
          isGroup: false,
        },
        {
          id: nextId++,
          name: "黄色",
          color: "#FFF100",
          visible: this._getInkVisibility(
            this.currentPageNumber,
            "黄色",
            colorConfig.colors.Yellow !== false
          ),
          isGroup: false,
        },
        {
          id: nextId++,
          name: "黑色",
          color: "#231815",
          visible: this._getInkVisibility(
            this.currentPageNumber,
            "黑色",
            colorConfig.colors.Black !== false
          ),
          isGroup: false,
        }
      );
    }

    // 添加检测到的专色
    for (const [colorName, visible] of Object.entries(colorConfig.colors)) {
      if (
        colorName === "Cyan" ||
        colorName === "Magenta" ||
        colorName === "Yellow" ||
        colorName === "Black"
      ) {
        continue; // 跳过CMYK通道，已经添加过了
      }

      // 检查是否已经为该专色生成过颜色，优先级：
      // 1. spotColorMap中已存在的颜色
      // 2. 生成新的随机颜色
      let color;
      if (this.spotColorMap.has(colorName)) {
        color = this.spotColorMap.get(colorName);
      } else {
        color = this._generateRandomColor();
        this.spotColorMap.set(colorName, color);
      }

      // 优先使用当前页面的持久化状态，如果没有则使用 ColorConverter 中的可见性状态
      const actualVisible = this._getInkVisibility(
        this.currentPageNumber,
        colorName,
        visible !== false
      );

      inks.push({
        id: nextId++,
        name: colorName,
        color,
        visible: actualVisible,
        isGroup: false,
      });
    }

    this.inks = inks;

    // Create fragment for better performance
    const fragment = document.createDocumentFragment();

    // Create inks container
    this.inksContainer = document.createElement("div");
    this.inksContainer.className = "inksContainer";

    // Add control buttons row first
    const controlRow = this._createControlButtonsRow();
    this.inksContainer.append(controlRow);

    // Add inks
    for (const ink of this.inks) {
      const inkElement = this._createInkElement(ink);
      this.inksContainer.append(inkElement);
    }

    // Append to fragment
    fragment.append(this.inksContainer);

    // Update DOM
    this._finishRendering(fragment, this.inks.length, false);
  }
}

export { PDFInkListViewer };
