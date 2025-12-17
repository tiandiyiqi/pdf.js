# 几何图形可见性修复 - 实施摘要

**变更 ID**: `fix-geoshape-visibility`  
**日期**: 2025年12月17日  
**状态**: ✅ 核心修复完成，待用户验证

---

## 问题

用户使用几何形状工具绘制时，图形完全不可见。

## 根本原因

DrawLayer 的 parent 被设置为 `canvasWrapper`，但编辑器 div 在 `annotationEditorLayer` 中，导致 SVG 元素和编辑器 div 不在同一个父容器，定位无法对齐。

## 修复方案

在 `AnnotationEditorLayer` 构造函数中重新设置 DrawLayer parent：

```javascript
// src/display/editor/annotation_editor_layer.js:162-165
if (this.drawLayer) {
  this.drawLayer.setParent(this.div);
}
```

## 修改文件

1. **src/display/editor/annotation_editor_layer.js** - 核心修复（3行）
2. **src/display/editor/geoshape.js** - 最小尺寸保护 + 调试日志
3. **src/display/draw_layer.js** - 调试日志

## 验证步骤

### 快速测试

1. 启动: `gulp server`
2. 打开: http://localhost:8888/web/viewer.html
3. 执行测试脚本: `dev/geoshape-visibility-test.js`
4. 手动绘制: 点击几何工具按钮，拖动鼠标绘制

### 预期结果

✅ 绘制的形状立即可见  
✅ 位置和尺寸正确  
✅ 矩形、圆形、箭头三种工具都正常

## 详细文档

- **修复报告**: `dev/几何图形可见性修复报告.md`
- **测试脚本**: `dev/geoshape-visibility-test.js`
- **任务清单**: `openspec/changes/fix-geoshape-visibility/tasks.md`
- **提案**: `openspec/changes/fix-geoshape-visibility/proposal.md`

---

**实施**: AI 编程助手  
**时间**: 2小时  
**风险**: 低（最小化修改，API已有支持）
