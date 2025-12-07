# PDF分色预览预处理开发计划

## 项目概述

基于《PDF分色预览预处理开发方案.md》，在PDF.js查看器中实现PDF分色预览预处理功能。该功能将在PDF加载后自动提取所有颜色信息，创建对应的OCG图层，为分色预览功能提供基础支持。

## 实施对象

- **主要文件**: `web/viewer.html`
- **相关目录**: `web/` 目录下的相关JavaScript文件
- **依赖库**: pdf-lib (需要集成到项目中)

## 开发阶段划分

### 阶段一：环境准备和依赖集成 (预计1-2天)

#### 1.1 安装pdf-lib依赖

- [ ] 在项目根目录执行 `cnpm install pdf-lib`
- [ ] 验证pdf-lib安装成功
- [ ] 检查pdf-lib版本兼容性

#### 1.2 配置模块导入

- [ ] 在 `web/viewer.html` 的 importmap 中添加 pdf-lib 映射
- [ ] 或在 `web/viewer.js` 中配置动态导入
- [ ] 测试pdf-lib在浏览器环境中的加载

#### 1.3 创建预处理模块目录结构

```
web/
├── color-layer-processor/          # 新建目录
│   ├── index.js                    # 主入口文件
│   ├── color-extractor.js          # 颜色提取模块
│   ├── ocg-creator.js              # OCG创建模块
│   ├── content-stream.js           # 内容流创建模块
│   ├── oc-properties.js            # OCProperties更新模块
│   └── utils.js                    # 工具函数
```

### 阶段二：核心功能模块开发 (预计3-5天)

#### 2.1 颜色提取模块 (`color-extractor.js`)

**功能目标**：

- 从PDF内容流中提取所有使用的颜色信息
- 支持CMYK、专色、RGB、灰度等颜色模式
- 颜色去重和规范化

**实现要点**：

- [ ] 实现PDF内容流解析函数
- [ ] 识别颜色操作符（`k`, `K`, `rg`, `RG`, `g`, `G`, `cs`, `CS`, `scn`, `SCN`）
- [ ] 提取CMYK颜色值
- [ ] 提取专色名称（从Separation颜色空间）
- [ ] RGB/Gray颜色转换为CMYK
- [ ] 颜色去重和规范化处理
- [ ] 生成唯一颜色标识符（如 `CMYK_100_0_0_0`, `PANTONE_485`）

**关键函数**：

```javascript
/**
 * 从PDF文档中提取所有颜色信息
 * @param {PDFDocument} pdfDoc - pdf-lib的PDFDocument对象
 * @returns {Promise<Array<ColorInfo>>} 颜色信息数组
 */
async function extractColors(pdfDoc)

/**
 * 解析页面内容流，提取颜色操作符
 * @param {PDFPage} page - PDF页面对象
 * @returns {Array<ColorInfo>} 该页面的颜色信息
 */
function parseContentStream(page)

/**
 * 生成颜色唯一标识符
 * @param {ColorInfo} color - 颜色信息对象
 * @returns {string} 颜色标识符
 */
function generateColorKey(color)
```

#### 2.2 OCG创建模块 (`ocg-creator.js`)

**功能目标**：

- 为每个提取到的颜色创建独立的OCG图层
- 创建白色背景OCG图层
- 建立OCG引用映射

**实现要点**：

- [ ] 创建颜色OCG对象
- [ ] 创建白色背景OCG对象
- [ ] 设置OCG属性（Type, Name）
- [ ] 维护OCG引用映射表

**关键函数**：

```javascript
/**
 * 创建所有OCG对象
 * @param {PDFDocument} pdfDoc - PDF文档对象
 * @param {Array<ColorInfo>} extractedColors - 提取的颜色信息
 * @returns {Object} OCG对象集合 {whiteBackground, colors}
 */
function createOCGs(pdfDoc, extractedColors)
```

#### 2.3 内容流创建模块 (`content-stream.js`)

**功能目标**：

- 创建白色背景内容流
- 创建颜色矩形内容流
- 设置混合模式（Lighten）
- 将内容流添加到页面

**实现要点**：

- [ ] 创建白色背景内容流（CMYK(0,0,0,0)）
- [ ] 创建颜色矩形内容流（全页面尺寸）
- [ ] 设置混合模式为Lighten（`/BM /Lighten`）
- [ ] 关联OCG标记（OCMD）
- [ ] 将内容流按正确顺序添加到页面

**关键函数**：

```javascript
/**
 * 创建白色背景内容流
 * @param {PDFDocument} pdfDoc - PDF文档对象
 * @param {number} width - 页面宽度
 * @param {number} height - 页面高度
 * @param {PDFRef} ocgRef - 白色背景OCG引用
 * @returns {PDFContentStream} 内容流对象
 */
function createWhiteBackgroundStream(pdfDoc, width, height, ocgRef)

/**
 * 创建颜色矩形内容流
 * @param {PDFDocument} pdfDoc - PDF文档对象
 * @param {number} width - 页面宽度
 * @param {number} height - 页面高度
 * @param {ColorInfo} color - 颜色信息
 * @param {PDFRef} ocgRef - 颜色OCG引用
 * @returns {PDFContentStream} 内容流对象
 */
function createColorRectangleStream(pdfDoc, width, height, color, ocgRef)

/**
 * 为所有页面添加颜色图层
 * @param {PDFDocument} pdfDoc - PDF文档对象
 * @param {Array<ColorInfo>} extractedColors - 提取的颜色信息
 * @param {Object} ocgs - OCG对象集合
 */
async function addColorLayersToPages(pdfDoc, extractedColors, ocgs)
```

#### 2.4 OCProperties更新模块 (`oc-properties.js`)

**功能目标**：

- 更新PDF的OCProperties字典
- 配置图层显示顺序
- 设置默认显示状态

**实现要点**：

- [ ] 收集所有OCG引用
- [ ] 创建OCProperties字典
- [ ] 设置Order数组（控制图层顺序）
- [ ] 设置ON/OFF数组（控制默认显示状态）
- [ ] 更新Catalog的OCProperties

**关键函数**：

```javascript
/**
 * 更新PDF的OCProperties
 * @param {PDFDocument} pdfDoc - PDF文档对象
 * @param {Object} ocgs - OCG对象集合
 */
function updateOCProperties(pdfDoc, ocgs)
```

#### 2.5 工具函数模块 (`utils.js`)

**功能目标**：

- 提供通用的工具函数
- 颜色转换函数
- 错误处理函数

**实现要点**：

- [ ] RGB转CMYK转换函数
- [ ] Gray转CMYK转换函数
- [ ] 颜色值规范化函数
- [ ] 错误处理和日志记录

**关键函数**：

```javascript
/**
 * RGB颜色转换为CMYK
 * @param {number} r - 红色值 (0-255)
 * @param {number} g - 绿色值 (0-255)
 * @param {number} b - 蓝色值 (0-255)
 * @returns {Array<number>} [c, m, y, k] 值 (0-1)
 */
function rgbToCmyk(r, g, b)

/**
 * 灰度颜色转换为CMYK
 * @param {number} gray - 灰度值 (0-1)
 * @returns {Array<number>} [c, m, y, k] 值 (0-1)
 */
function grayToCmyk(gray)

/**
 * 规范化CMYK值
 * @param {Array<number>} cmyk - CMYK值数组
 * @returns {Array<number>} 规范化后的CMYK值
 */
function normalizeCmyk(cmyk)
```

### 阶段三：主入口模块开发 (预计1-2天)

#### 3.1 主入口文件 (`index.js`)

**功能目标**：

- 整合所有模块
- 提供统一的预处理接口
- 处理PDF文档的加载和修改流程

**实现要点**：

- [ ] 实现主预处理函数
- [ ] 协调各模块调用顺序
- [ ] 错误处理和异常捕获
- [ ] 进度反馈机制（可选）

**关键函数**：

```javascript
/**
 * PDF分色预览预处理主函数
 * @param {Uint8Array} pdfBytes - PDF文件的字节数组
 * @param {Object} options - 配置选项
 * @returns {Promise<Uint8Array>} 处理后的PDF字节数组
 */
async function processPDFForColorSeparation(pdfBytes, options = {})

/**
 * 预处理流程控制
 * @param {PDFDocument} pdfDoc - PDF文档对象
 * @returns {Promise<void>}
 */
async function processDocument(pdfDoc)
```

**处理流程**：

```
1. 加载PDF文档 (pdf-lib)
2. 提取颜色信息 (color-extractor)
3. 创建OCG对象 (ocg-creator)
4. 添加颜色图层到页面 (content-stream)
5. 更新OCProperties (oc-properties)
6. 保存修改后的PDF
7. 返回处理后的PDF字节数组
```

### 阶段四：查看器集成 (预计2-3天)

#### 4.1 在viewer.js中集成预处理功能

**集成方案**：

- [ ] 在PDF加载完成后触发预处理
- [ ] 获取PDF原始字节数据
- [ ] 调用预处理函数
- [ ] 使用处理后的PDF替换原始PDF
- [ ] 重新加载处理后的PDF

**集成位置**：

- 在 `app.js` 的 `load` 方法中，PDF加载成功后
- 或在 `getDocument` 的回调中处理

**实现要点**：

- [ ] 导入预处理模块
- [ ] 添加预处理开关配置
- [ ] 实现异步预处理流程
- [ ] 处理预处理失败的情况
- [ ] 添加用户提示（处理中/完成/失败）

**关键代码位置**：

```javascript
// 在 app.js 中
import { processPDFForColorSeparation } from './color-layer-processor/index.js';

// 在 load 方法中
async load(pdfDocument) {
  // ... 现有代码 ...

  // 添加预处理逻辑
  if (AppOptions.get('enableColorSeparationPreprocess')) {
    try {
      const originalBytes = await pdfDocument.getData();
      const processedBytes = await processPDFForColorSeparation(originalBytes);

      // 如果PDF被修改，重新加载
      if (processedBytes !== originalBytes) {
        // 重新加载处理后的PDF
        await this._reloadProcessedPDF(processedBytes);
      }
    } catch (error) {
      console.error('颜色预处理失败:', error);
      // 继续使用原始PDF
    }
  }
}
```

#### 4.2 在viewer.html中添加配置选项

**UI增强**（可选）：

- [ ] 在工具栏添加"分色预览"按钮
- [ ] 添加预处理状态提示
- [ ] 添加预处理开关选项

**HTML修改**：

```html
<!-- 在 viewer.html 的工具栏区域添加 -->
<div id="colorSeparationOptionContainer" class="toolbarButtonWithContainer">
  <button
    id="colorSeparationButton"
    class="toolbarButton"
    type="button"
    tabindex="0"
    title="分色预览"
  >
    <span>分色预览</span>
  </button>
</div>
```

#### 4.3 配置选项管理

**在app_options.js中添加配置**：

- [ ] 添加 `enableColorSeparationPreprocess` 选项
- [ ] 添加默认值配置
- [ ] 支持通过URL参数控制

### 阶段五：测试和优化 (预计2-3天)

#### 5.1 功能测试

**测试用例**：

- [ ] 测试CMYK颜色提取
- [ ] 测试专色提取（PANTONE、DIC、TOYO等）
- [ ] 测试RGB颜色转换和提取
- [ ] 测试灰度颜色转换和提取
- [ ] 测试多页面PDF处理
- [ ] 测试大型PDF文件处理
- [ ] 测试已包含OCG的PDF文件
- [ ] 测试错误处理和异常情况

**测试文件**：

- 使用 `study/PDF samples/` 目录下的测试PDF文件
- 创建专门的测试用例PDF

#### 5.2 性能优化

**优化方向**：

- [ ] 大型PDF文件的增量处理
- [ ] 颜色提取的缓存机制
- [ ] 异步处理优化
- [ ] 内存使用优化
- [ ] 处理进度反馈

#### 5.3 错误处理完善

**错误处理**：

- [ ] 网络错误处理
- [ ] PDF解析错误处理
- [ ] 颜色提取失败处理
- [ ] OCG创建失败处理
- [ ] 用户友好的错误提示

#### 5.4 兼容性测试

**测试环境**：

- [ ] Chrome浏览器
- [ ] Firefox浏览器
- [ ] Safari浏览器
- [ ] Edge浏览器
- [ ] 移动端浏览器（如需要）

### 阶段六：文档和清理 (预计1天)

#### 6.1 代码注释和文档

- [ ] 添加完整的代码注释
- [ ] 编写API文档
- [ ] 更新README或使用说明

#### 6.2 代码清理

- [ ] 移除调试代码
- [ ] 代码格式化和规范化
- [ ] 优化代码结构

## 技术难点和解决方案

### 难点1：pdf-lib与PDF.js的集成

**问题**：pdf-lib和PDF.js使用不同的PDF文档对象模型

**解决方案**：

- 在PDF加载时获取原始字节数据
- 使用pdf-lib加载和处理PDF
- 处理完成后，将修改后的PDF字节数据重新加载到PDF.js

**实现方式**：

```javascript
// 1. 从PDF.js获取原始字节
const originalBytes = await PDFViewerApplication.pdfDocument.getData();

// 2. 使用pdf-lib处理
const pdfDoc = await PDFDocument.load(originalBytes);
// ... 处理逻辑 ...

// 3. 获取处理后的字节
const processedBytes = await pdfDoc.save();

// 4. 重新加载到PDF.js
await PDFViewerApplication.open(processedBytes);
```

### 难点2：内容流解析

**问题**：pdf-lib不直接提供内容流解析API

**解决方案**：

- 使用pdf-lib的底层API访问内容流
- 手动解析PDF操作符字符串
- 使用正则表达式或状态机解析操作符和参数

### 难点3：专色颜色空间定义

**问题**：专色需要先定义颜色空间才能使用

**解决方案**：

- 在页面资源字典中定义专色颜色空间
- 使用`/Separation`颜色空间定义
- 指定基础颜色空间（通常是CMYK）
- 定义tint转换函数

### 难点4：混合模式设置

**问题**：PDF中的混合模式需要设置图形状态（ExtGState）

**解决方案**：

- 在内容流中使用`/ExtGState`资源
- 定义图形状态字典，设置`/BM`属性
- 使用`/gs`操作符应用图形状态

### 难点5：图层顺序控制

**问题**：OCG的显示顺序需要正确配置

**解决方案**：

- 严格按照添加顺序创建内容流
- 在`OCProperties.D.Order`中正确设置顺序
- 白色背景层始终在最底层

## 文件修改清单

### 新建文件

1. `web/color-layer-processor/index.js` - 主入口文件
2. `web/color-layer-processor/color-extractor.js` - 颜色提取模块
3. `web/color-layer-processor/ocg-creator.js` - OCG创建模块
4. `web/color-layer-processor/content-stream.js` - 内容流创建模块
5. `web/color-layer-processor/oc-properties.js` - OCProperties更新模块
6. `web/color-layer-processor/utils.js` - 工具函数模块

### 修改文件

1. `web/viewer.html` - 添加pdf-lib的importmap配置（如需要）
2. `web/app.js` - 集成预处理功能调用
3. `web/app_options.js` - 添加预处理配置选项

### 配置文件

1. `package.json` - 添加pdf-lib依赖

## 开发时间估算

| 阶段     | 任务               | 预计时间    |
| -------- | ------------------ | ----------- |
| 阶段一   | 环境准备和依赖集成 | 1-2天       |
| 阶段二   | 核心功能模块开发   | 3-5天       |
| 阶段三   | 主入口模块开发     | 1-2天       |
| 阶段四   | 查看器集成         | 2-3天       |
| 阶段五   | 测试和优化         | 2-3天       |
| 阶段六   | 文档和清理         | 1天         |
| **总计** |                    | **10-16天** |

## 风险评估

### 高风险项

1. **pdf-lib与PDF.js的兼容性**
   - 风险：两个库的PDF对象模型不同，可能导致集成困难
   - 缓解：提前进行技术验证，准备备选方案

2. **内容流解析复杂度**
   - 风险：PDF内容流解析可能比预期复杂
   - 缓解：深入研究pdf-lib API，必要时参考PDF规范

3. **性能问题**
   - 风险：大型PDF文件处理可能很慢
   - 缓解：实现增量处理，添加进度反馈，考虑异步处理

### 中风险项

1. **专色颜色空间处理**
   - 风险：不同专色系统的处理方式可能不同
   - 缓解：先实现常见专色系统，逐步扩展

2. **浏览器兼容性**
   - 风险：某些浏览器可能不支持某些API
   - 缓解：进行多浏览器测试，提供降级方案

## 后续优化方向

1. **性能优化**
   - 增量处理大型PDF文件
   - 颜色提取结果缓存
   - Web Worker异步处理

2. **功能扩展**
   - 支持更多颜色空间
   - 颜色相似度合并
   - 自定义颜色映射规则

3. **用户体验**
   - 处理进度显示
   - 处理结果预览
   - 错误恢复机制

4. **可视化增强**
   - 颜色信息面板
   - 图层控制界面
   - 分色预览切换

## 开发注意事项

1. **代码规范**
   - 遵循项目现有的代码风格
   - 使用ES6+语法
   - 添加适当的注释

2. **错误处理**
   - 所有异步操作都要有错误处理
   - 提供用户友好的错误提示
   - 记录详细的错误日志

3. **性能考虑**
   - 避免阻塞主线程
   - 合理使用异步处理
   - 注意内存使用

4. **测试**
   - 每个模块都要有单元测试
   - 进行集成测试
   - 使用真实PDF文件测试

5. **文档**
   - 及时更新代码注释
   - 记录重要的设计决策
   - 编写使用说明

## 参考资料

1. [PDF分色预览预处理开发方案.md](./PDF分色预览预处理开发方案.md)
2. [pdf-lib官方文档](https://pdf-lib.js.org/)
3. [PDF规范 (ISO 32000)](https://www.adobe.com/content/dam/acom/en/devnet/pdf/pdfs/PDF32000_2008.pdf)
4. [PDF.js官方文档](https://mozilla.github.io/pdf.js/)

---

**制定日期**: 2024年
**最后更新**: 2024年
**状态**: 待实施
