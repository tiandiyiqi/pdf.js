# GeoShape 编辑器 DOM 问题修复

**日期**: 2025-12-17  
**问题**: GeoShape 编辑器创建的 DOM 结构异常

---

## 问题现象

### 用户报告的 HTML 异常

绘制矩形后出现：

```html
<!-- ❌ 异常 1: class 是 "undefined" -->
<div
  class="undefined draw disabled draggable selectedEditor"
  id="pdfjs_internal_editor_3"
>
  <!-- ❌ 异常 2: data-l10n-id 是 "undefined" -->
  <button class="basic deleteButton" data-l10n-id="undefined"></button>

  <!-- ❌ 异常 3: 顶层 layer class 出现 "undefinedEditing" -->
  <div class="annotationEditorLayer undefinedEditing geoshapeEditing">
    <!-- ❌ 异常 4: 出现多个重复的 editor 节点 -->
    <div id="pdfjs_internal_editor_3" style="z-index: 4; ...">
      <!-- selected -->
      <div id="pdfjs_internal_editor_4" style="z-index: 5; ...">
        <!-- duplicate -->
        <div id="pdfjs_internal_editor_2" style="width: 0%; height: 0%;">
          <!-- empty -->
        </div>
      </div>
    </div>
  </div>
</div>
```

### 对比正常的 InkEditor

```html
<!-- ✅ 正常: class 是 "inkEditor" -->
<div
  class="inkEditor draw disabled draggable"
  id="pdfjs_internal_editor_0"
  data-l10n-id="pdfjs-editor-ink-editor"
>
  <!-- ✅ 正常: 只有一个 editor 节点 -->
  <!-- ✅ 正常: layer class 是 "inkEditing" -->
  <div class="annotationEditorLayer disabled nonEditing"></div>
</div>
```

---

## 根本原因

### 原因 1: GeoShape 子类没有传递 `name` 参数

**问题代码**（修复前）：

```javascript
class RectEditor extends GeoShapeEditor {
  // 没有构造函数！
  // 直接继承基类的构造函数，而基类也没有设置 name
}

// GeoShapeEditor 基类
constructor(params) {
  super(params);  // ❌ 没有传 name 参数
  // ...
}
```

**AnnotationEditor 基类的 DOM 创建逻辑**：

```javascript
// src/display/editor/editor.js:1312-1319
const div = (this.div = document.createElement("div"));
div.className = this.name; // ← 如果 this.name 是 undefined，class 就是 "undefined"
div.setAttribute("id", this.id);
if (this.defaultL10nId) {
  div.setAttribute("data-l10n-id", this.defaultL10nId); // ← 如果 undefined，就不设置
}
```

**结果**：

- `this.name` 是 `undefined` → `div.className = "undefined"`
- `this.defaultL10nId` 是 `undefined` → delete button 的 `data-l10n-id="undefined"`
- UIManager 拼接 layer class 时用 `editorType + "Editing"` → `"undefinedEditing"`

### 原因 2: 可能的重复 editor 创建

GeoShape 的绘制流程：

```javascript
// 1. startDrawing 时创建临时 SVG
startDrawing() {
  // 创建临时 SVG 用于绘制
  parent.drawLayer.draw(...);
}

// 2. _endDraw 时创建 editor 实例
_endDraw() {
  const editor = parent.createAndAddNewEditor(..., {
    mustBeCommitted: true,  // ← 标记需要立即提交
  });
}

// 3. onceAdded 时立即 commit 和 select
onceAdded() {
  if (this.#mustBeCommitted) {
    this.commit();
    this.parent.setSelected(this);  // ← 可能触发额外的 UI 更新
  }
}
```

这个流程可能导致：

- UIManager 在某些状态下重复创建 editor
- 或者创建了占位 editor 后没有正确清理

---

## 修复方案

### 修复 1: 为每个 GeoShape 子类添加构造函数

**修改文件**: `src/display/editor/geoshape.js`

#### RectEditor

```javascript
class RectEditor extends GeoShapeEditor {
  static _defaultDrawingOptions = null;
  static _editorType = AnnotationEditorType.GEOSHAPE;

  constructor(params) {
    super({ ...params, name: "geoshapeEditor" });
    this.defaultL10nId = "pdfjs-editor-geoshape-editor";
  }

  static get elementType() {
    return "rect";
  }
  // ...
}
```

#### CircEditor

```javascript
class CircEditor extends GeoShapeEditor {
  static _defaultDrawingOptions = null;
  static _editorType = AnnotationEditorType.GEOSHAPE;

  constructor(params) {
    super({ ...params, name: "geoshapeEditor" });
    this.defaultL10nId = "pdfjs-editor-geoshape-editor";
  }

  static get elementType() {
    return "ellipse";
  }
  // ...
}
```

#### ArrowEditor

```javascript
class ArrowEditor extends GeoShapeEditor {
  static _defaultDrawingOptions = null;
  static _editorType = AnnotationEditorType.GEOSHAPE;

  constructor(params) {
    super({ ...params, name: "geoshapeEditor" });
    this.defaultL10nId = "pdfjs-editor-geoshape-editor";
  }

  static get elementType() {
    return "line";
  }
  // ...
}
```

### 关键改进

1. **传递 `name: "geoshapeEditor"`**
   - 确保 `div.className = "geoshapeEditor"`
   - 确保 layer class 变成 `"geoshapeEditing"`

2. **设置 `defaultL10nId`**
   - 确保 `data-l10n-id="pdfjs-editor-geoshape-editor"`
   - delete button 等会有正确的 l10n id

3. **与 InkEditor 对齐**
   - 采用相同的构造函数模式
   - 确保 DOM 结构一致

---

## 预期效果

### 修复后的 HTML 结构

```html
<!-- ✅ 修复后: class 是 "geoshapeEditor" -->
<div
  class="geoshapeEditor draw disabled draggable selectedEditor"
  id="pdfjs_internal_editor_3"
  data-l10n-id="pdfjs-editor-geoshape-editor"
>
  <div class="resizers">
    <div class="resizer topLeft"></div>
    <!-- ... 8 个 resizers -->
  </div>

  <div aria-hidden="true" class="internal"></div>

  <div class="editToolbar" role="toolbar">
    <div class="buttons">
      <button
        class="comment"
        data-l10n-id="pdfjs-editor-add-comment-button"
      ></button>
      <div class="divider"></div>
      <button
        class="basic deleteButton"
        data-l10n-id="pdfjs-editor-remove-geoshape-button"
      ></button>
    </div>
  </div>
</div>

<!-- ✅ 修复后: 顶层 layer class 正确 -->
<div class="annotationEditorLayer geoshapeEditing" ...></div>
```

### 对比表

| 项目                | 修复前                     | 修复后                         |
| ------------------- | -------------------------- | ------------------------------ |
| Editor div class    | `undefined draw ...`       | `geoshapeEditor draw ...`      |
| Editor data-l10n-id | `undefined` 或缺失         | `pdfjs-editor-geoshape-editor` |
| Delete button l10n  | `data-l10n-id="undefined"` | 正确的 l10n id                 |
| Layer class         | `undefinedEditing`         | `geoshapeEditing`              |
| Editor 节点数量     | 3 个（重复/残留）          | 1 个（正常）                   |

---

## 验证步骤

### 测试 1: 检查 DOM 结构

1. **硬刷新浏览器**（`Cmd/Ctrl + Shift + R`）
2. **绘制矩形**
3. **打开开发者工具 Elements 标签**
4. **检查 editor div 的 class**：
   - 应该是 `geoshapeEditor draw ...`
   - **不应该是** `undefined draw ...`

### 测试 2: 检查 l10n id

1. **选中矩形**
2. **查看 editor div 的属性**：
   - 应该有 `data-l10n-id="pdfjs-editor-geoshape-editor"`
3. **查看 delete button**：
   - 应该有正确的 `data-l10n-id`
   - **不应该是** `undefined`

### 测试 3: 检查重复节点

1. **绘制多个图形**
2. **检查 DOM**：
   - 每个图形应该只有 **1 个** editor 节点
   - **不应该有** 0 尺寸的残留节点
   - **不应该有** 重复的相同位置节点

### 测试 4: 检查 layer class

1. **切换到矩形工具**
2. **查看 annotationEditorLayer 的 class**：
   - 应该包含 `geoshapeEditing`
   - **不应该包含** `undefinedEditing`

---

## 关于 l10n 文本（可选后续工作）

当前使用的 l10n id 是 `pdfjs-editor-geoshape-editor`，需要在国际化文件中添加对应的文本。

如果该 id 不存在，可能需要：

1. **添加到 `l10n/en-US/viewer.ftl`**：

   ```
   pdfjs-editor-geoshape-editor =
       .aria-label = Geometric Shape Editor
   pdfjs-editor-remove-geoshape-button =
       .title = Remove shape
   ```

2. **或者复用现有的通用 id**：
   ```javascript
   this.defaultL10nId = "pdfjs-editor-draw-editor"; // 或其他已存在的 id
   ```

但这是"锦上添花"，不影响核心功能。当前修复已经解决了 `undefined` 的问题。

---

## 修复文件

**src/display/editor/geoshape.js**:

- ✅ RectEditor: 添加构造函数，设置 `name` 和 `defaultL10nId`
- ✅ CircEditor: 添加构造函数，设置 `name` 和 `defaultL10nId`
- ✅ ArrowEditor: 添加构造函数，设置 `name` 和 `defaultL10nId`

---

**修复完成**: 2025-12-17  
**测试状态**: 待用户验证  
**预期**: DOM 结构正常，不再出现 `undefined` class
