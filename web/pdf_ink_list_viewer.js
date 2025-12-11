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

    // 添加专色事件监听器
    this._handleSpotColorAdded = this._handleSpotColorAdded.bind(this);
    ColorConverter.addEventListener(
      "spotColorAdded",
      this._handleSpotColorAdded
    );
  }

  reset() {
    super.reset();
    this.inks = [];
    this.nextId = 6;
    this.inksContainer = null;
  }

  destroy() {
    // 移除事件监听器
    ColorConverter.removeEventListener(
      "spotColorAdded",
      this._handleSpotColorAdded
    );
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
    colorSwatch.style.backgroundColor = ink.color;

    // Create color name
    const colorName = document.createElement("div");
    colorName.className = "colorName";
    colorName.textContent = ink.name;

    // Bind click event to eye icon
    eyeIcon.addEventListener("click", () => {
      ink.visible = !ink.visible;
      if (ink.visible) {
        eyeIcon.classList.remove("eyeHidden");
        eyeIcon.classList.add("eyeVisible");
        ColorConverter.updateColorState(ink.name, true);
      } else {
        eyeIcon.classList.remove("eyeVisible");
        eyeIcon.classList.add("eyeHidden");
        ColorConverter.updateColorState(ink.name, false);
      }
    });

    // Assemble ink item
    eyeContainer.appendChild(eyeIcon);
    inkItem.appendChild(eyeContainer);
    inkItem.appendChild(colorSwatch);
    inkItem.appendChild(colorName);

    return inkItem;
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

    // 初始化inks数组，添加CMYK组和通道
    const inks = [
      { id: 1, name: "CMYK", color: "#000000", visible: true, isGroup: true },
      {
        id: 2,
        name: "青色",
        color: "#00A0E9",
        visible: colorConfig.colors["Cyan"] !== false,
        isGroup: false,
      },
      {
        id: 3,
        name: "洋红色",
        color: "#E4007F",
        visible: colorConfig.colors["Magenta"] !== false,
        isGroup: false,
      },
      {
        id: 4,
        name: "黄色",
        color: "#FFF100",
        visible: colorConfig.colors["Yellow"] !== false,
        isGroup: false,
      },
      {
        id: 5,
        name: "黑色",
        color: "#231815",
        visible: colorConfig.colors["Black"] !== false,
        isGroup: false,
      },
    ];

    // 添加检测到的专色
    let nextId = 6;
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

    // Add demo inks
    for (const ink of this.inks) {
      const inkElement = this._createInkElement(ink);
      this.inksContainer.appendChild(inkElement);
      console.log(
        `[${new Date().toISOString()}] PDFInkListViewer: 添加演示油墨项到容器:`,
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
