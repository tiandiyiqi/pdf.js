# PDF分色预览预处理开发方案

## 目的

打开PDF文件后，为了能够正确地进行分色预览，做一些准备工作。这些准备工作包括从PDF中提取所有使用的颜色信息，并创建对应的颜色图层，为后续的分色预览功能提供基础数据支持。

## 准备工作内容

### 1. 颜色信息提取

从当前文件中提取所有使用的颜色信息，包括但不限于：

- **CMYK颜色值**：如 `C=100, M=0, Y=0, K=0`（表示为 `CMYK_100_0_0_0`）
- **PANTONE色号**：如 `PANTONE 485`、`PANTONE 321 C` 等
- **其他专色**：如 `DIC 123`、`TOYO 456` 等
- **RGB颜色**：如 `RGB(255, 0, 0)`（转换为CMYK后处理）
- **灰度颜色**：如 `Gray(50%)`（转换为CMYK后处理）

确保完整识别所有颜色模式和色值表示方式。

### 2. 颜色图层创建

在现有所有图层之上创建新图层，要求：

- 每个提取到的颜色名称对应一个独立图层
- 图层命名需与颜色名称完全一致（如 `CMYK_100_0_0_0`、`PANTONE_485`）
- 保持图层创建顺序与颜色提取顺序一致
- 图层类型为 PDF 原生 Optional Content Groups (OCG)

### 3. 颜色矩形绘制

为每个新建的颜色图层添加一个与页面尺寸完全相同的矩形形状：

- 矩形尺寸：与页面尺寸完全一致（`width × height`）
- 填充色：当前图层对应的颜色（100%浓度）
- 混合模式：应用"变亮"混合模式（PDF中对应 `/BM /Lighten` 或 `/BM /Screen`）
- 不透明度：100%（`/CA 1.0` 和 `/ca 1.0`）

### 4. 白色背景层创建

在所有图层（包括现有图层和新建的颜色图层）的最底部创建一个新图层：

- 图层名称：`WhiteBackground`
- 矩形尺寸：与页面尺寸完全一致
- CMYK颜色值：`CMYK(0, 0, 0, 0)`（即白色）
- 混合模式：正常模式（`/BM /Normal`）
- 不透明度：100%

## 方案介绍

### 技术选型：pdf-lib

本方案采用 **pdf-lib** 作为核心库来实现PDF的解析和修改功能。pdf-lib 是一个纯 JavaScript 库，可以在浏览器、Node.js、Deno 和 React Native 环境中运行，提供了完整的PDF操作能力。

**选择 pdf-lib 的原因：**

1. **纯JavaScript实现**：无需依赖原生库，跨平台兼容性好
2. **完整的PDF操作能力**：支持读取、修改、创建PDF文档
3. **内容流操作**：可以直接操作PDF内容流（Content Stream），便于提取颜色和添加图层
4. **OCG支持**：支持创建和管理 Optional Content Groups（可选内容组）
5. **混合模式支持**：内置支持多种混合模式（BlendMode）
6. **活跃维护**：项目活跃，文档完善

### 方案架构

```
┌─────────────────────────────────────────┐
│  阶段1: PDF内容流解析（pdf-lib）        │
│  - 解析PDF内容流                        │
│  - 提取颜色操作符                       │
│  - 识别CMYK和专色                       │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│  阶段2: 颜色信息整理                    │
│  - 去重和规范化                         │
│  - 生成唯一颜色标识                     │
│  - 建立颜色映射表                       │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│  阶段3: PDF图层创建（pdf-lib）          │
│  - 创建OCG对象                          │
│  - 设置图层属性                         │
│  - 建立图层层次关系                     │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│  阶段4: 内容流添加（pdf-lib）          │
│  - 创建白色背景内容流                   │
│  - 创建颜色矩形内容流                   │
│  - 设置混合模式                         │
│  - 插入到页面内容流                     │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│  阶段5: OCG属性更新（pdf-lib）          │
│  - 更新OCProperties                     │
│  - 设置图层显示顺序                     │
│  - 配置默认显示状态                     │
└─────────────────────────────────────────┘
```

## 方案步骤

### 步骤1：PDF内容流解析和颜色提取

**目标**：从PDF内容流中提取所有使用的颜色信息

**实现方式**：

1. **加载PDF文档**
   ```javascript
   const pdfDoc = await PDFDocument.load(pdfBytes);
   ```

2. **遍历所有页面**
   ```javascript
   const pages = pdfDoc.getPages();
   for (const page of pages) {
     // 处理每一页
   }
   ```

3. **解析页面内容流**
   - 获取页面的内容流对象（Content Stream）
   - 解析PDF操作符（Operators）
   - 识别颜色相关操作符：
     - `k` / `K`：设置CMYK填充/描边颜色
     - `rg` / `RG`：设置RGB填充/描边颜色
     - `g` / `G`：设置灰度填充/描边颜色
     - `cs` / `CS`：设置颜色空间
     - `scn` / `SCN`：设置颜色（支持专色）

4. **提取颜色信息**
   - **CMYK颜色**：从 `k`/`K` 操作符中提取 `[c, m, y, k]` 值
   - **专色**：从颜色空间定义中提取专色名称
     - 解析 `/Separation` 颜色空间
     - 提取专色名称（如 `PANTONE 485`）
   - **RGB/Gray颜色**：转换为CMYK后处理

5. **颜色去重和规范化**
   - 相同CMYK值合并
   - 相同专色名称合并
   - 生成唯一颜色标识符

**关键代码结构**：
```javascript
async function extractColors(pdfDoc) {
  const colorMap = new Map();
  const pages = pdfDoc.getPages();
  
  for (const page of pages) {
    const contentStream = page.node.getContentStream();
    // 解析内容流，提取颜色操作符
    const colors = parseContentStream(contentStream);
    
    for (const color of colors) {
      const key = generateColorKey(color);
      if (!colorMap.has(key)) {
        colorMap.set(key, color);
      }
    }
  }
  
  return Array.from(colorMap.values());
}
```

### 步骤2：创建Optional Content Groups（OCG）

**目标**：为每个提取到的颜色创建独立的OCG图层

**实现方式**：

1. **创建颜色OCG对象**
   ```javascript
   const colorOCGs = {};
   for (const color of extractedColors) {
     const ocgRef = pdfDoc.context.register(
       pdfDoc.context.obj({
         Type: 'OCG',
         Name: color.name // 如 "CMYK_100_0_0_0" 或 "PANTONE_485"
       })
     );
     colorOCGs[color.name] = ocgRef;
   }
   ```

2. **创建白色背景OCG**
   ```javascript
   const whiteBackgroundOCG = pdfDoc.context.register(
     pdfDoc.context.obj({
       Type: 'OCG',
       Name: 'WhiteBackground'
     })
   );
   ```

3. **建立OCG引用映射**
   - 维护颜色名称到OCG引用的映射表
   - 便于后续内容流关联使用

**关键代码结构**：
```javascript
function createOCGs(pdfDoc, extractedColors) {
  const ocgs = {
    whiteBackground: null,
    colors: {}
  };
  
  // 创建白色背景OCG
  ocgs.whiteBackground = pdfDoc.context.register(
    pdfDoc.context.obj({
      Type: 'OCG',
      Name: 'WhiteBackground'
    })
  );
  
  // 创建颜色OCG
  for (const color of extractedColors) {
    ocgs.colors[color.name] = pdfDoc.context.register(
      pdfDoc.context.obj({
        Type: 'OCG',
        Name: color.name
      })
    );
  }
  
  return ocgs;
}
```

### 步骤3：创建内容流并添加颜色矩形

**目标**：为每个颜色图层和白色背景层创建内容流，绘制矩形

**实现方式**：

1. **创建白色背景内容流**
   ```javascript
   function createWhiteBackgroundStream(pdfDoc, width, height, ocgRef) {
     const contentStream = pdfDoc.context.createContentStream(
       // 标记内容开始（关联OCG）
       pdfDoc.context.obj({
         Type: 'OCMD',
         OCGs: [ocgRef],
         P: 'AllOn'
       }),
       // 设置颜色空间为CMYK
       '/DeviceCMYK cs',
       // 设置CMYK颜色为白色 (0, 0, 0, 0)
       '0 0 0 0 k',
       // 绘制矩形路径
       `0 0 ${width} ${height} re`,
       // 填充
       'f'
     );
     return contentStream;
   }
   ```

2. **创建颜色矩形内容流**
   ```javascript
   function createColorRectangleStream(pdfDoc, width, height, color, ocgRef) {
     const { type, values, name } = color;
     
     let colorCommand = '';
     if (type === 'CMYK') {
       const [c, m, y, k] = values;
       colorCommand = `${c} ${m} ${y} ${k} k`;
     } else if (type === 'Spot') {
       // 专色需要先设置颜色空间，然后设置颜色值
       colorCommand = `/${name} cs 1 scn`;
     }
     
     const contentStream = pdfDoc.context.createContentStream(
       // 标记内容开始（关联OCG）
       pdfDoc.context.obj({
         Type: 'OCMD',
         OCGs: [ocgRef],
         P: 'AllOn'
       }),
       // 设置图形状态（混合模式）
       '/ExtGState << /BM /Lighten >> gs',
       // 设置颜色空间
       type === 'CMYK' ? '/DeviceCMYK cs' : `/${name} cs`,
       // 设置颜色
       colorCommand,
       // 绘制矩形路径
       `0 0 ${width} ${height} re`,
       // 填充
       'f'
     );
     return contentStream;
   }
   ```

3. **将内容流添加到页面**
   ```javascript
   for (const page of pages) {
     const { width, height } = page.getSize();
     
     // 1. 添加白色背景（最底层）
     const whiteStream = createWhiteBackgroundStream(
       pdfDoc, width, height, ocgs.whiteBackground
     );
     page.node.addContentStream(whiteStream);
     
     // 2. 添加颜色图层
     for (const color of extractedColors) {
       const colorStream = createColorRectangleStream(
         pdfDoc, width, height, color, ocgs.colors[color.name]
       );
       page.node.addContentStream(colorStream);
     }
   }
   ```

**关键点**：
- 白色背景层必须先添加（最底层）
- 颜色图层按提取顺序添加
- 混合模式使用 `/BM /Lighten` 实现变亮效果
- CMYK颜色直接使用 `k` 操作符
- 专色需要先定义颜色空间，再使用 `scn` 操作符

### 步骤4：更新OCProperties

**目标**：配置OCG的显示属性和顺序

**实现方式**：

1. **收集所有OCG引用**
   ```javascript
   const allOCGs = [
     ocgs.whiteBackground,
     ...Object.values(ocgs.colors)
   ];
   ```

2. **创建OCProperties字典**
   ```javascript
   const ocProperties = pdfDoc.context.obj({
     OCGs: pdfDoc.context.obj(allOCGs), // OCG数组
     D: pdfDoc.context.obj({
       Order: [
         ocgs.whiteBackground, // 最底层
         ...Object.values(ocgs.colors) // 颜色图层按顺序
       ],
       RBGroups: pdfDoc.context.obj([]), // 单选组（空）
       ON: pdfDoc.context.obj(allOCGs), // 默认显示所有图层
       OFF: pdfDoc.context.obj([]) // 默认隐藏（空）
     })
   });
   ```

3. **更新Catalog**
   ```javascript
   const catalog = pdfDoc.catalog;
   catalog.set('OCProperties', ocProperties);
   ```

**关键点**：
- `Order` 数组控制图层显示顺序（从下到上）
- `ON` 数组控制默认显示的图层
- `OFF` 数组控制默认隐藏的图层
- 白色背景必须在 `Order` 的第一位

### 步骤5：保存修改后的PDF

**目标**：保存包含颜色图层的PDF文件

**实现方式**：

```javascript
const modifiedPdfBytes = await pdfDoc.save();
// 返回修改后的PDF字节数组
return modifiedPdfBytes;
```

## 技术难点和解决方案

### 难点1：内容流解析

**问题**：pdf-lib 不直接提供内容流解析API，需要手动解析PDF操作符

**解决方案**：
- 使用 pdf-lib 的底层API访问内容流对象
- 解析PDF操作符字符串
- 使用正则表达式或状态机解析操作符和参数

### 难点2：专色颜色空间定义

**问题**：专色（Separation）需要先定义颜色空间，才能使用

**解决方案**：
- 在页面资源字典中定义专色颜色空间
- 使用 `/Separation` 颜色空间定义
- 指定基础颜色空间（通常是CMYK）
- 定义tint转换函数

### 难点3：混合模式设置

**问题**：PDF中的混合模式需要设置图形状态（ExtGState）

**解决方案**：
- 在内容流中使用 `/ExtGState` 资源
- 定义图形状态字典，设置 `/BM` 属性
- 使用 `/gs` 操作符应用图形状态

### 难点4：图层顺序控制

**问题**：OCG的显示顺序需要正确配置

**解决方案**：
- 严格按照添加顺序创建内容流
- 在 `OCProperties.D.Order` 中正确设置顺序
- 白色背景层始终在最底层

## 实现文件结构

```
study/
├── PDF分色预览预处理开发方案.md  (本文档)
└── color-layer-processor/
    ├── index.js              # 主入口文件
    ├── color-extractor.js    # 颜色提取模块
    ├── ocg-creator.js        # OCG创建模块
    ├── content-stream.js     # 内容流创建模块
    ├── oc-properties.js      # OCProperties更新模块
    └── utils.js              # 工具函数
```

## 预期效果

完成预处理后，PDF文件将包含：

1. **颜色信息**：所有使用的颜色已被提取和记录
2. **颜色图层**：每个颜色对应一个独立的OCG图层
3. **颜色矩形**：每个颜色图层包含一个全页面的颜色矩形，使用Lighten混合模式
4. **白色背景层**：最底层包含一个白色矩形
5. **图层控制**：可以通过OCG控制显示/隐藏各个颜色图层

这些预处理工作为后续的分色预览功能提供了基础，用户可以通过控制OCG的显示状态来查看不同颜色的分色效果。

## 后续优化方向

1. **性能优化**：对于大型PDF文件，可以考虑增量处理
2. **颜色合并**：相似颜色可以合并处理，减少图层数量
3. **缓存机制**：提取的颜色信息可以缓存，避免重复处理
4. **错误处理**：增强错误处理和异常情况的处理能力
5. **进度反馈**：添加处理进度反馈，提升用户体验

