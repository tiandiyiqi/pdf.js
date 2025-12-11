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
import { ColorConverter } from "../src/core/color_converter.js";

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

    // 添加专色事件监听器（虽然worker线程的事件无法传递到主线程，但保留以备将来扩展）
    console.log(
      `[${new Date().toISOString()}] PDFInkListViewer.constructor: 添加专色事件监听器`
    );
    this._handleSpotColorAdded = this._handleSpotColorAdded.bind(this);
    ColorConverter.addEventListener(
      "spotColorAdded",
      this._handleSpotColorAdded
    );

    // 监听页面渲染事件，在第一页渲染完成后更新油墨列表
    this._handlePageRendered = this._handlePageRendered.bind(this);
    this.eventBus._on("pagerendered", this._handlePageRendered);
    console.log(
      `[${new Date().toISOString()}] PDFInkListViewer.constructor: 添加页面渲染事件监听器`
    );
  }

  /**
   * Handle page rendered event
   */
  async _handlePageRendered(evt) {
    // 只在第一页渲染完成时更新一次
    if (!this._firstPageRendered && evt.pageNumber === 1) {
      this._firstPageRendered = true;
      console.log(
        `[${new Date().toISOString()}] PDFInkListViewer: 第一页渲染完成，尝试提取专色信息`
      );

      try {
        // 从evt.source获取页面代理对象
        const pageView = evt.source;
        if (pageView && pageView.pdfPage) {
          const opList = await pageView.pdfPage.getOperatorList();
          console.log(
            `[${new Date().toISOString()}] PDFInkListViewer: 获取到operatorList，spotColors:`,
            opList.spotColors
          );

          // 如果operatorList包含专色信息，将它们添加到主线程的ColorConverter中
          if (
            opList.spotColors &&
            Array.isArray(opList.spotColors) &&
            opList.spotColors.length > 0
          ) {
            for (const spotName of opList.spotColors) {
              console.log(
                `[${new Date().toISOString()}] PDFInkListViewer: 从operatorList添加专色: ${spotName}`
              );
              ColorConverter.addSpotColor(spotName, true);
            }
          }
        }
      } catch (error) {
        console.error(
          `[${new Date().toISOString()}] PDFInkListViewer: 提取专色信息时出错:`,
          error
        );
      }

      // 延迟一小段时间后重新render
      setTimeout(() => {
        this.render();
      }, 100);
    }
  }

  reset() {
    super.reset();
    this.inks = [];
    this.nextId = 6;
    this.inksContainer = null;
    this.eyeIcons = {};
    // 注意：不要在这里重置_firstPageRendered，因为reset会在render中被调用
  }

  destroy() {
    // 移除事件监听器
    ColorConverter.removeEventListener(
      "spotColorAdded",
      this._handleSpotColorAdded
    );
    this.eventBus._off("pagerendered", this._handlePageRendered);
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
   * Handle spot color added event
   */
  _handleSpotColorAdded(data) {
    console.log(
      `[${new Date().toISOString()}] PDFInkListViewer: 接收到专色添加事件，数据:`,
      data
    );
    // 添加新的专色到油墨列表
    this._addSpotColorToInkList(data.name, data.visible);
  }

  /**
   * Add a spot color to the ink list
   */
  _addSpotColorToInkList(name, visible) {
    console.log(
      `[${new Date().toISOString()}] PDFInkListViewer: 尝试添加专色到油墨列表，名称: ${name}，可见性: ${visible}`
    );

    // 检查是否已经存在
    if (this.inks.some(ink => ink.name === name)) {
      console.log(
        `[${new Date().toISOString()}] PDFInkListViewer: 专色 ${name} 已存在于油墨列表中，跳过`
      );
      return;
    }

    // 生成随机颜色
    const randomColor = this._generateRandomColor();
    console.log(
      `[${new Date().toISOString()}] PDFInkListViewer: 为专色 ${name} 生成随机颜色: ${randomColor}`
    );

    // 创建新的油墨项
    const newInk = {
      id: this.nextId++,
      name: name,
      color: randomColor,
      visible: visible,
      isGroup: false,
    };
    console.log(
      `[${new Date().toISOString()}] PDFInkListViewer: 创建新的油墨项:`,
      newInk
    );

    // 添加到油墨列表
    this.inks.push(newInk);
    console.log(
      `[${new Date().toISOString()}] PDFInkListViewer: 油墨列表更新后:`,
      this.inks
    );

    // 如果油墨容器已经创建，直接添加到DOM
    if (this.inksContainer) {
      console.log(
        `[${new Date().toISOString()}] PDFInkListViewer: 油墨容器已存在，创建并添加DOM元素`
      );
      const inkElement = this._createInkElement(newInk);
      this.inksContainer.appendChild(inkElement);

      // 更新事件
      this._dispatchEvent(this.inks.length);
      console.log(
        `[${new Date().toISOString()}] PDFInkListViewer: 触发油墨列表更新事件，当前油墨数量: ${this.inks.length}`
      );
    } else {
      console.log(
        `[${new Date().toISOString()}] PDFInkListViewer: 油墨容器尚未创建，等待render()调用`
      );
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
            channelEyeIcon.classList.toggle("eyeHidden", !allVisible);
            channelEyeIcon.classList.toggle("eyeVisible", allVisible);
            ColorConverter.updateColorState(colorConverterName, allVisible);
          }
        }
      } else {
        // 单个通道或专色点击事件
        ink.visible = !ink.visible;

        // 更新当前图标状态
        eyeIcon.classList.toggle("eyeHidden", !ink.visible);
        eyeIcon.classList.toggle("eyeVisible", ink.visible);

        // 更新ColorConverter
        const channelNameMap = {
          青色: "Cyan",
          洋红色: "Magenta",
          黄色: "Yellow",
          黑色: "Black",
        };
        const colorConverterName = channelNameMap[ink.name] || ink.name;
        ColorConverter.updateColorState(colorConverterName, ink.visible);

        // 更新CMYK组图标状态
        this.updateCMYKGroupVisibility();
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
    const cmykGroupEyeIcon = this.eyeIcons["CMYK"];

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
      cmykGroupEyeIcon.classList.toggle("eyeHidden", anyChannelInvisible);
      cmykGroupEyeIcon.classList.toggle("eyeVisible", allChannelsVisible);
    }
  }

  /**
   * Render the ink list with current color configuration
   */
  render() {
    console.log(
      `[${new Date().toISOString()}] PDFInkListViewer: 开始render()方法`
    );

    // Clear previous content
    this.reset();
    console.log(
      `[${new Date().toISOString()}] PDFInkListViewer: 重置后状态，inks:`,
      this.inks,
      `inksContainer:`,
      this.inksContainer
    );

    // 从ColorConverter获取当前的颜色配置
    const colorConfig = ColorConverter.getColorFilterConfig();
    console.log(
      `[${new Date().toISOString()}] PDFInkListViewer: 获取颜色配置:`,
      colorConfig
    );

    // 初始化inks数组
    const inks = [];
    let nextId = 1;

    // 检查是否包含CMYK通道
    const hasCyan = "Cyan" in colorConfig.colors;
    const hasMagenta = "Magenta" in colorConfig.colors;
    const hasYellow = "Yellow" in colorConfig.colors;
    const hasBlack = "Black" in colorConfig.colors;
    const hasCmyk = hasCyan && hasMagenta && hasYellow && hasBlack;

    // 添加CMYK组和通道
    if (hasCmyk) {
      inks.push({
        id: nextId++,
        name: "CMYK",
        color: "#000000",
        visible: true,
        isGroup: true,
      });
      inks.push({
        id: nextId++,
        name: "青色",
        color: "#00A0E9",
        visible: colorConfig.colors["Cyan"] !== false,
        isGroup: false,
      });
      inks.push({
        id: nextId++,
        name: "洋红色",
        color: "#E4007F",
        visible: colorConfig.colors["Magenta"] !== false,
        isGroup: false,
      });
      inks.push({
        id: nextId++,
        name: "黄色",
        color: "#FFF100",
        visible: colorConfig.colors["Yellow"] !== false,
        isGroup: false,
      });
      inks.push({
        id: nextId++,
        name: "黑色",
        color: "#231815",
        visible: colorConfig.colors["Black"] !== false,
        isGroup: false,
      });
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

      // 为专色生成随机颜色
      const randomColor = this._generateRandomColor();
      inks.push({
        id: nextId++,
        name: colorName,
        color: randomColor,
        visible: visible !== false,
        isGroup: false,
      });
    }

    this.inks = inks;
    console.log(
      `[${new Date().toISOString()}] PDFInkListViewer: 初始化inks数组:`,
      this.inks
    );

    // Create fragment for better performance
    const fragment = document.createDocumentFragment();

    // Create inks container
    this.inksContainer = document.createElement("div");
    this.inksContainer.className = "inksContainer";
    console.log(
      `[${new Date().toISOString()}] PDFInkListViewer: 创建油墨容器:`,
      this.inksContainer
    );

    // Add inks
    for (const ink of this.inks) {
      const inkElement = this._createInkElement(ink);
      this.inksContainer.appendChild(inkElement);
      console.log(
        `[${new Date().toISOString()}] PDFInkListViewer: 添加${ink.isGroup ? "CMYK组" : "油墨项"}到容器:`,
        ink
      );
    }

    // Append to fragment
    fragment.appendChild(this.inksContainer);

    // Update DOM
    console.log(
      `[${new Date().toISOString()}] PDFInkListViewer: 更新DOM前，当前inks数组:`,
      this.inks
    );
    this._finishRendering(fragment, this.inks.length, false);
    console.log(
      `[${new Date().toISOString()}] PDFInkListViewer: render()方法完成`
    );
  }
}

export { PDFInkListViewer };
