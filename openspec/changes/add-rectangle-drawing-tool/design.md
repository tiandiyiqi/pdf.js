# 设计文档：矩形绘图工具

## Context

PDF.js 已经实现了完善的绘图基础架构，包括：

- `DrawingEditor` 抽象基类，提供绘图编辑器的核心功能
- `DrawLayer` SVG 渲染层，管理绘图的可视化
- 批注系统集成，支持保存和加载

当前系统中，`InkEditor` 作为自由绘图工具的实现，展示了如何使用这个架构。几何工具的 UI 框架已经存在（按钮、事件处理），但编辑器实现缺失。

**约束条件**:

- 必须继承自 `DrawingEditor` 以复用绘图基础设施
- 必须与现有的批注系统兼容
- 需要支持 PDF 的坐标系统和旋转变换
- 应遵循 InkEditor 建立的模式以保持一致性

**利益相关者**:

- 最终用户：需要简单直观的矩形绘制体验
- 开发者：需要清晰的实现模式用于后续几何工具
- 维护者：需要可测试、可维护的代码

## Goals / Non-Goals

### Goals

- 实现完整的矩形绘制功能（拖拽创建、编辑、保存）
- 支持矩形参数配置（颜色、粗细、填充）
- 与现有批注系统无缝集成
- 建立几何工具的实现模式

### Non-Goals

- 本次不实现圆形、箭头等其他几何工具（留待后续）
- 不实现复杂的形状变换（倾斜、透视）
- 不实现矩形的圆角功能（可选的未来增强）
- 不改变现有的绘图基础架构

## Decisions

### 决策 1: 类层次结构

**选择**: `RectangleEditor extends DrawingEditor`

**原因**:

- `DrawingEditor` 提供了绘图编辑器的所有基础设施
- 与 `InkEditor` 和 `SignatureEditor` 保持一致的继承模式
- 自动获得缩放、旋转、移动等编辑功能
- 自动集成到批注系统

**备选方案**:

- 直接继承 `AnnotationEditor`：需要重复实现大量绘图逻辑
- 创建新的几何工具基类：过度设计，当前只实现一个工具

### 决策 2: 绘制交互模式

**选择**: 拖拽模式（点击起点 → 拖动 → 释放终点）

**原因**:

- 符合用户对矩形工具的预期（类似 Photoshop、Sketch）
- 实时预览，用户可以在绘制过程中看到矩形
- 实现简单，只需处理 pointerdown、pointermove、pointerup 事件

**备选方案**:

- 点击四个角模式：不符合矩形工具的用户习惯
- 中心点+尺寸模式：增加复杂度，不常用

### 决策 3: SVG 表示方式

**选择**: 使用 SVG `<rect>` 元素

**原因**:

- 语义清晰，直接表达矩形的意图
- 浏览器原生优化，渲染性能好
- 支持标准的 SVG 属性（stroke、fill、width、height）

**备选方案**:

- 使用 `<path>` 元素：更灵活但对于矩形过于复杂
- 使用四条 `<line>` 元素：难以管理，无法表达填充

### 决策 4: 参数类型映射

**选择**: 新增参数类型常量

```javascript
AnnotationEditorParamsType.RECTANGLE_COLOR;
AnnotationEditorParamsType.RECTANGLE_THICKNESS;
AnnotationEditorParamsType.RECTANGLE_OPACITY;
AnnotationEditorParamsType.RECTANGLE_FILL;
```

**原因**:

- 与现有的 `INK_COLOR`、`INK_THICKNESS` 等保持一致
- 允许矩形工具独立配置参数，不影响其他工具
- 便于后续添加矩形特有的参数（如填充颜色、填充透明度）

**备选方案**:

- 复用 INK\_ 参数：语义不清晰，难以独立控制
- 使用通用 DRAWING\_ 参数：需要改动现有代码

### 决策 5: 绘制器架构

**选择**: 创建 `RectDrawOutliner` 和 `RectDrawOutline`，模仿 `InkDrawOutliner` 的模式

**结构**:

```
RectDrawOutliner (绘制过程管理)
  - 管理起点和终点坐标
  - 生成实时预览的 SVG 属性
  - 归一化坐标到 [0,1] 范围

RectDrawOutline (轮廓数据)
  - 存储矩形的最终几何信息
  - 处理旋转和缩放变换
  - 序列化/反序列化
```

**原因**:

- 保持与 InkEditor 架构的一致性
- 分离绘制过程和结果数据的关注点
- 便于后续添加其他几何工具

## Architecture

### 类图

```
AnnotationEditor
    ↓
DrawingEditor
    ↓
RectangleEditor
    ↓ (uses)
RectDrawOutliner → RectDrawOutline
```

### 交互流程

```
1. 用户点击矩形按钮
   ↓
2. toolbar.js 派发 switchannotationeditormode 事件
   ↓
3. annotation_editor_layer.js 更新模式为 GEOSHAPE (矩形)
   ↓
4. 设置 CSS 类 .geoshapeRectEditing
   ↓
5. 启用点击事件监听
   ↓
6. 用户在页面上 pointerdown
   ↓
7. RectangleEditor.startDrawing() 初始化
   ↓
8. 创建 RectDrawOutliner 实例，记录起点
   ↓
9. 在 DrawLayer 中创建 SVG <rect> 元素
   ↓
10. 用户移动鼠标 (pointermove)
   ↓
11. RectDrawOutliner.update() 更新矩形尺寸
   ↓
12. 更新 DrawLayer 的 SVG 属性
   ↓
13. 用户释放鼠标 (pointerup)
   ↓
14. RectangleEditor.endDrawing() 创建编辑器实例
   ↓
15. RectDrawOutliner.getOutlines() 生成 RectDrawOutline
   ↓
16. 创建 RectangleEditor 实例并添加到层
```

### 数据结构

**归一化坐标**（存储格式）:

```javascript
{
  x: 0.1,        // 左上角 X (相对于页面宽度)
  y: 0.2,        // 左上角 Y (相对于页面高度)
  width: 0.3,    // 宽度 (相对于页面宽度)
  height: 0.2,   // 高度 (相对于页面高度)
  rotation: 0    // 旋转角度
}
```

**SVG 属性**（渲染格式）:

```javascript
{
  root: {
    viewBox: "0 0 10000 10000"
  },
  rect: {
    x: "1000",
    y: "2000",
    width: "3000",
    height: "2000",
    stroke: "#ff0000",
    "stroke-width": "2",
    "stroke-opacity": "1",
    fill: "none"
  },
  bbox: [0.1, 0.2, 0.3, 0.2]  // 编辑器边界框
}
```

## Risks / Trade-offs

### 风险 1: 与 GeoShape 类型冲突

**描述**: 当前 UI 使用 `AnnotationEditorType.GEOSHAPE` 作为统一的几何工具类型，但我们需要区分矩形、圆形、箭头。

**缓解措施**:

- 在 UI 层保持使用 `GEOSHAPE` 类型
- 在编辑器层使用具体的工具类型（通过 `shapeType` 参数区分）
- 使用 `geoshapetoolchanged` 事件传递具体的工具类型
- 在 `createAndAddNewEditor` 时根据当前工具类型创建对应的编辑器

**后续计划**:

- 考虑引入 `AnnotationEditorType.RECTANGLE`, `CIRCLE`, `ARROW`
- 或在 `RectangleEditor` 中添加静态方法 `_shapeType = "rectangle"`

### 风险 2: 填充颜色与批注系统兼容性

**描述**: PDF 批注的矩形可能有填充颜色，但当前 DrawingEditor 主要处理描边。

**缓解措施**:

- 第一版只实现描边矩形（与 InkEditor 一致）
- 在 `RectDrawingOptions` 中预留 `fill` 和 `fill-opacity` 属性
- 后续版本可以添加填充功能

### 风险 3: 尺寸为零的矩形

**描述**: 用户可能只是点击而不拖动，创建尺寸为零的矩形。

**缓解措施**:

- 在 `pointerup` 时检查矩形尺寸
- 如果宽度或高度小于阈值（如 5px），则不创建编辑器
- 类似于 InkEditor 的 `isEmpty()` 检查

## Migration Plan

### 阶段 1: 核心实现（本次变更）

1. 创建 `RectangleEditor` 类
2. 创建 `RectDrawOutliner` 和 `RectDrawOutline` 类
3. 注册到编辑器系统
4. 基本的绘制、编辑、保存功能

### 阶段 2: 参数配置（可选）

1. 添加矩形工具参数面板
2. 支持颜色、粗细、透明度配置
3. 添加填充选项

### 阶段 3: 批注系统集成（可选）

1. 支持从 PDF 批注加载矩形
2. 支持将矩形保存为 PDF Square 批注
3. 处理旋转页面的矩形

### 阶段 4: 其他几何工具（未来）

1. 实现 CircleEditor（圆形/椭圆）
2. 实现 ArrowEditor（箭头）
3. 统一几何工具的参数配置

## Implementation Notes

### 关键代码位置

1. **注册编辑器** (`annotation_editor_layer.js:102-110`):

```javascript
static #editorTypes = new Map(
  [
    FreeTextEditor,
    InkEditor,
    RectangleEditor,  // 添加这里
    StampEditor,
    HighlightEditor,
    SignatureEditor,
  ].map(type => [type._editorType, type])
);
```

2. **工具类型判断** (`annotation_editor_layer.js:~924-952`):

```javascript
pointerdown(event) {
  // ...
  if (this.#currentEditorType?.isDrawer) {
    // 需要判断当前是矩形工具还是自由绘图工具
    this.startDrawingSession(event);
    return;
  }
  // ...
}
```

3. **DrawLayer SVG 生成** (`draw_layer.js:98-125`):
   - 目前使用 `<path>` 元素
   - 需要支持 `<rect>` 元素（可能需要添加新的方法或参数）

### 测试策略

1. **单元测试**:
   - `RectDrawOutliner` 的坐标归一化
   - `RectDrawOutline` 的序列化/反序列化
   - SVG 属性生成

2. **集成测试**:
   - 创建矩形编辑器
   - 编辑矩形（移动、缩放）
   - 保存和加载
   - 旋转页面的矩形

3. **手动测试**:
   - 不同浏览器的兼容性
   - 触摸设备的交互
   - 性能测试（大量矩形）

## Open Questions

1. **是否需要支持圆角矩形？**
   - 建议：第一版不支持，后续作为增强功能
2. **矩形的最小尺寸限制？**
   - 建议：设置为 10px × 10px（缩放后的实际像素）
3. **是否支持正方形约束（按住 Shift 键）？**
   - 建议：第一版不支持，后续添加
4. **矩形的 PDF 批注类型？**
   - 使用 Square 批注类型（与 Adobe Acrobat 兼容）
5. **是否需要统一的 GeoShapeEditor 基类？**
   - 建议：等实现了 2-3 个几何工具后再重构

## References

- InkEditor 实现：`src/display/editor/ink.js`
- InkDrawOutliner：`src/display/editor/drawers/inkdraw.js`
- DrawingEditor 基类：`src/display/editor/draw.js`
- 绘图工具实现分析：`dev/绘图工具实现分析.md`
