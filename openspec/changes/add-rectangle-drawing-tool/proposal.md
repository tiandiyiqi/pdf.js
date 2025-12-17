# Change: 实现矩形绘图工具

## Why

当前 PDF.js 已经实现了自由绘图工具（InkEditor），并且预留了几何工具的 UI 框架（包括矩形、圆形、箭头按钮），但几何工具的编辑器类尚未实现。用户无法使用矩形工具在 PDF 上绘制矩形批注。

实现矩形绘图工具将：

- 填补几何工具功能的空缺
- 提供标准的矩形批注能力
- 为其他几何工具（圆形、箭头）建立实现模式

## What Changes

- **新增** `RectangleEditor` 类，继承自 `DrawingEditor`
- **新增** `RectDrawOutliner` 和 `RectDrawOutline` 类，用于管理矩形绘制过程和轮廓
- **新增** `RectDrawingOptions` 类，管理矩形绘图参数（颜色、粗细、填充等）
- **修改** `annotation_editor_layer.js`，注册 `RectangleEditor` 到编辑器类型映射
- **新增** 矩形绘图文件 `src/display/editor/rectangle.js`
- **新增** 矩形绘制器文件 `src/display/editor/drawers/rectangledraw.js`
- **修改** `web/annotation_editor_params.js`，支持矩形工具参数配置
- **修改** `web/viewer.html` 和 `web/viewer.css`，完善矩形工具的样式和图标

## Impact

- **新增 capability**: `rectangle-drawing-tool`
- **影响的代码文件**:
  - `src/display/editor/annotation_editor_layer.js` - 注册新编辑器
  - `src/display/editor/rectangle.js` - 新文件
  - `src/display/editor/drawers/rectangledraw.js` - 新文件
  - `web/annotation_editor_params.js` - 添加参数绑定
  - `web/viewer.html` - 完善 HTML 结构
  - `web/viewer.css` - 添加样式
  - `src/shared/util.js` - 可能需要添加参数类型常量

- **用户影响**:
  - 用户可以点击矩形按钮进入矩形绘制模式
  - 用户可以通过拖拽绘制矩形
  - 矩形支持编辑（移动、缩放、旋转）
  - 矩形可以保存到 PDF 批注中
- **开发者影响**:
  - 为后续实现圆形、箭头等几何工具提供参考模式
  - 建立几何工具的标准架构
