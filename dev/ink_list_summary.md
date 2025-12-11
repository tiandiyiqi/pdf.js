# PDF.js 油墨列表功能总结

## 1. 概述
PDF.js 油墨列表功能用于显示和控制 PDF 文件中的油墨通道，包括 CMYK 通道和专色通道。用户可以通过油墨列表查看当前 PDF 包含的所有油墨，并通过点击眼睛图标来控制各油墨的显示/隐藏状态。

## 2. 外观设计

### 2.1 整体布局
油墨列表采用侧边栏形式展示，包含以下主要元素：
- **油墨容器**：一个包含所有油墨项的主容器
- **油墨项**：每个油墨项包含眼睛图标、颜色样本和油墨名称
- **CMYK 组**：特殊的分组项，用于组织 CMYK 通道

### 2.2 油墨项样式
每个油墨项包含：
- **眼睛图标**：表示油墨的可见性状态
  - `eyeVisible` 类：表示油墨可见
  - `eyeHidden` 类：表示油墨隐藏
- **颜色样本**：
  - 对于 CMYK 组：使用 SVG 绘制 CMYK 色标
  - 对于普通油墨：使用实心颜色块
- **油墨名称**：显示油墨的名称

### 2.3 CSS 类命名
- `inksContainer`：油墨列表主容器
- `inkItem`：单个油墨项容器
- `inkGroup`：油墨分组项（如 CMYK 组）
- `eyeContainer`：眼睛图标容器
- `eyeIcon`：眼睛图标
- `eyeVisible`：眼睛可见状态
- `eyeHidden`：眼睛隐藏状态
- `colorSwatch`：颜色样本
- `colorName`：油墨名称

## 3. 加载方法

### 3.1 初始化流程
1. **构造函数**：
   - 初始化内部状态
   - 注册专色事件监听器
   - 设置初始 ID 计数器

2. **渲染流程**：
   - 调用 `reset()` 清除之前的内容
   - 从 `ColorConverter` 获取当前颜色配置
   - 构建油墨列表数据结构
   - 创建 DOM 元素并添加到容器中
   - 触发 `inksloaded` 事件

3. **初始数据加载**：
   - 检查是否包含完整的 CMYK 通道
   - 如果包含 CMYK 通道，则添加 CMYK 组和各个通道
   - 添加所有检测到的专色
   - 为每个专色生成随机颜色

### 3.2 渲染方法
```javascript
render() {
  // 清除之前的内容
  this.reset();
  
  // 获取当前颜色配置
  const colorConfig = ColorConverter.getColorFilterConfig();
  
  // 构建油墨列表
  const inks = [];
  // 添加 CMYK 组和通道
  // 添加专色
  
  // 创建 DOM 元素
  const fragment = document.createDocumentFragment();
  // 创建油墨容器
  // 添加油墨项到容器
  
  // 更新 DOM
  this._finishRendering(fragment, this.inks.length, false);
}
```

## 4. 更新清单的方法

### 4.1 事件驱动更新
油墨列表通过事件系统实现动态更新：

1. **专色添加事件**：
   - 当 `ColorConverter` 检测到新的专色时，触发 `spotColorAdded` 事件
   - 油墨列表监听器 `_handleSpotColorAdded` 处理该事件
   - 调用 `_addSpotColorToInkList` 将新专色添加到列表中

2. **处理流程**：
   ```javascript
   _handleSpotColorAdded(data) {
     // 调用添加专色方法
     this._addSpotColorToInkList(data.name, data.visible);
   }
   
   _addSpotColorToInkList(name, visible) {
     // 检查是否已存在
     // 生成随机颜色
     // 创建新的油墨项
     // 添加到油墨列表
     // 如果容器已创建，直接添加到 DOM
     // 触发更新事件
   }
   ```

### 4.2 手动更新
- **重置方法**：`reset()` 清除所有内部状态
- **销毁方法**：`destroy()` 移除事件监听器并清理资源

### 4.3 颜色状态更新
当用户点击眼睛图标时，触发颜色状态更新：
```javascript
eyeIcon.addEventListener("click", () => {
  ink.visible = !ink.visible;
  // 更新眼睛图标样式
  // 调用 ColorConverter 更新颜色状态
  ColorConverter.updateColorState(ink.name, ink.visible);
});
```

## 5. 事件系统

### 5.1 事件类型
- **spotColorAdded**：当检测到新专色时触发
- **inksloaded**：当油墨列表加载完成时触发

### 5.2 事件处理
- 油墨列表监听 `ColorConverter` 的 `spotColorAdded` 事件
- 当油墨列表更新完成后，触发 `inksloaded` 事件通知其他组件

## 6. 与 ColorConverter 的集成

### 6.1 颜色配置管理
- `ColorConverter` 负责管理所有颜色的过滤配置
- 油墨列表从 `ColorConverter` 获取当前配置
- 当用户修改油墨可见性时，通过 `ColorConverter.updateColorState()` 更新配置

### 6.2 专色注册
- 当 PDF 包含 Separation、DeviceN 或 NChannel 颜色空间时，颜色空间解析器会提取通道名称
- 通道名称通过 `ColorConverter.addSpotColor()` 注册到颜色配置中
- 注册新专色时，触发 `spotColorAdded` 事件通知油墨列表

## 7. 颜色空间处理

### 7.1 CMYK 处理
- 当检测到完整的 CMYK 通道（Cyan、Magenta、Yellow、Black）时，添加 CMYK 组
- CMYK 组包含四个子通道：青色、洋红色、黄色、黑色
- 使用特殊的 SVG 图标表示 CMYK 组

### 7.2 专色处理
- 支持 Separation、DeviceN 和 NChannel 颜色空间中的专色
- 自动从颜色空间中提取专色名称
- 为每个专色生成随机的鲜艳颜色
- 专色按添加顺序显示在 CMYK 组之后

## 8. 性能优化

### 8.1 DOM 操作优化
- 使用 `DocumentFragment` 批量添加 DOM 元素
- 只有在容器已创建时，才动态添加新的油墨项

### 8.2 避免重复渲染
- 检查专色是否已存在，避免重复添加
- 只有在检测到完整 CMYK 通道时才添加 CMYK 组

## 9. 代码结构

### 9.1 主要文件
- **web/pdf_ink_list_viewer.js**：油墨列表主类 `PDFInkListViewer`
- **src/core/color_converter.js**：颜色配置管理
- **src/core/colorspace.js**：颜色空间处理
- **src/core/colorspace_utils.js**：颜色空间解析

### 9.2 核心类和方法

#### PDFInkListViewer 类
| 方法 | 功能 |
|------|------|
| `constructor(options)` | 初始化油墨列表 |
| `render()` | 渲染油墨列表 |
| `reset()` | 重置内部状态 |
| `destroy()` | 销毁组件 |
| `_handleSpotColorAdded(data)` | 处理专色添加事件 |
| `_addSpotColorToInkList(name, visible)` | 添加专色到列表 |
| `_createInkElement(ink)` | 创建油墨项 DOM 元素 |
| `_generateRandomColor()` | 生成随机颜色 |
| `_dispatchEvent(inksCount)` | 触发事件 |

#### ColorConverter 相关方法
| 方法 | 功能 |
|------|------|
| `getColorFilterConfig()` | 获取当前颜色配置 |
| `updateColorState(colorName, visible)` | 更新颜色可见性 |
| `addSpotColor(spotName, visible)` | 添加新专色 |
| `addEventListener(eventName, listener)` | 添加事件监听器 |
| `removeEventListener(eventName, listener)` | 移除事件监听器 |

## 10. 初始化和配置

### 10.1 初始化流程
在 app.js 中初始化油墨列表：
```javascript
if (appConfig.sidebar?.inksView) {
  this.pdfInkListViewer = new PDFInkListViewer({
    container: appConfig.sidebar.inksView,
    eventBus,
    l10n,
  });
  // 初始渲染
  this.pdfInkListViewer.render();
}
```

### 10.2 配置项
- **container**：油墨列表的 DOM 容器元素
- **eventBus**：应用事件总线
- **l10n**：本地化对象

## 11. 调试和日志

油墨列表功能包含详细的日志记录，使用以下格式：
```javascript
console.log(`[${new Date().toISOString()}] PDFInkListViewer: 日志消息`);
```

主要日志点：
- 构造函数和事件监听器注册
- 渲染流程
- 专色添加事件处理
- 颜色状态更新

## 12. 未来改进方向

1. **支持自定义颜色**：允许用户自定义专色的显示颜色
2. **油墨排序**：支持按名称或类型排序油墨
3. **搜索功能**：添加搜索框快速查找特定油墨
4. **批量操作**：支持同时显示/隐藏多个油墨
5. **油墨信息扩展**：显示油墨的更多信息，如类型、通道数量等

## 13. 总结

PDF.js 油墨列表功能提供了一个直观的界面，用于查看和控制 PDF 文件中的油墨通道。它通过事件驱动的方式动态更新，与颜色转换系统紧密集成，支持 CMYK 和各种专色。功能设计考虑了性能优化和可扩展性，为用户提供了良好的交互体验。