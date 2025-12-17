/**
 * 几何图形可见性测试脚本
 *
 * 使用方法：
 * 1. 在浏览器中打开 PDF
 * 2. 打开开发者工具控制台
 * 3. 复制粘贴此脚本并执行
 * 4. 按照提示操作
 */

(function () {
  console.log("=== 几何图形可见性测试开始 ===");

  // 获取基本对象
  const app = window.PDFViewerApplication;
  if (!app) {
    console.error("❌ PDFViewerApplication 未找到");
    return;
  }

  const page = app.pdfViewer._pages[0];
  if (!page) {
    console.error("❌ 页面未找到");
    return;
  }

  console.log("✅ 页面对象:", page);

  // 1. 检查 DrawLayer
  console.log("\n--- 1. DrawLayer 检查 ---");
  const drawLayerBuilder = page.drawLayer;
  const drawLayer = drawLayerBuilder?.getDrawLayer();

  if (!drawLayer) {
    console.error("❌ DrawLayer 未找到");
    return;
  }

  console.log("✅ DrawLayer 存在:", drawLayer);
  console.log("   页面索引:", drawLayer.pageIndex);

  // 检查 parent（私有字段，需要通过反射访问）
  // 注意：无法直接访问私有字段，但可以通过测试来验证

  // 2. 检查 AnnotationEditorLayer
  console.log("\n--- 2. AnnotationEditorLayer 检查 ---");
  const editorLayerBuilder = page.annotationEditorLayer;
  const editorLayer = editorLayerBuilder?.annotationEditorLayer;

  if (!editorLayer) {
    console.error("❌ AnnotationEditorLayer 未找到");
    return;
  }

  console.log("✅ AnnotationEditorLayer 存在");
  console.log("   编辑器层 div:", editorLayer.div);
  console.log("   编辑器层 drawLayer:", editorLayer.drawLayer);
  console.log("   drawLayer 相同:", editorLayer.drawLayer === drawLayer);

  // 3. 创建测试矩形
  console.log("\n--- 3. 创建测试矩形 ---");

  try {
    const { id, clipPathId } = drawLayer.draw(
      {
        bbox: [0.1, 0.1, 0.3, 0.3], // 从 (10%, 10%) 到 (40%, 40%)
        root: {
          stroke: "red",
          "stroke-width": 5,
          fill: "rgba(255, 0, 0, 0.3)",
        },
        shape: {
          x: "0",
          y: "0",
          width: "100%",
          height: "100%",
        },
      },
      false,
      false,
      "rect"
    );

    console.log("✅ 测试矩形已创建");
    console.log("   ID:", id);
    console.log("   clipPathId:", clipPathId);

    // 4. 检查 SVG 是否在 DOM 中
    setTimeout(() => {
      console.log("\n--- 4. DOM 结构检查 ---");

      // 查找所有 SVG 元素
      const svgs = page.div.querySelectorAll("svg");
      console.log(`找到 ${svgs.length} 个 SVG 元素`);

      svgs.forEach((svg, i) => {
        const bbox = svg.getBoundingClientRect();
        console.log(`SVG ${i}:`, {
          parent: svg.parentElement?.className,
          visible: bbox.width > 0 && bbox.height > 0,
          bbox: {
            width: bbox.width,
            height: bbox.height,
            top: bbox.top,
            left: bbox.left,
          },
          style: {
            top: svg.style.top,
            left: svg.style.left,
            width: svg.style.width,
            height: svg.style.height,
          },
          inDOM: document.body.contains(svg),
        });

        // 检查内部元素
        const rect = svg.querySelector("rect");
        if (rect) {
          console.log(`  矩形元素:`, {
            id: rect.id,
            x: rect.getAttribute("x"),
            y: rect.getAttribute("y"),
            width: rect.getAttribute("width"),
            height: rect.getAttribute("height"),
            stroke: rect.getAttribute("stroke"),
          });
        }

        // 检查 use 元素
        const use = svg.querySelector("use");
        if (use) {
          console.log(`  use 元素:`, {
            href: use.getAttribute("href"),
          });
        }
      });

      // 5. 检查编辑器实例
      console.log("\n--- 5. 编辑器实例检查 ---");
      const editors = editorLayer._editors;
      console.log(`找到 ${editors?.size || 0} 个编辑器`);

      if (editors && editors.size > 0) {
        for (const [id, editor] of editors) {
          const bbox = editor.div?.getBoundingClientRect();
          console.log(`编辑器 ${id}:`, {
            type: editor.constructor.name,
            drawId: editor._drawId,
            hasDiv: !!editor.div,
            visible: bbox && bbox.width > 0 && bbox.height > 0,
            bbox: bbox
              ? {
                  width: bbox.width,
                  height: bbox.height,
                  top: bbox.top,
                  left: bbox.left,
                }
              : null,
          });
        }
      }

      // 6. 总结
      console.log("\n--- 6. 测试总结 ---");

      const visibleSVGs = Array.from(svgs).filter(svg => {
        const bbox = svg.getBoundingClientRect();
        return bbox.width > 0 && bbox.height > 0;
      });

      if (visibleSVGs.length > 0) {
        console.log("✅ 测试通过！找到可见的 SVG 元素");
        console.log("   建议：使用几何工具绘制形状，应该能看到红色测试矩形");
      } else {
        console.log("⚠️ 警告：未找到可见的 SVG 元素");
        console.log("   请检查 DrawLayer parent 是否正确设置");
      }
    }, 100);
  } catch (error) {
    console.error("❌ 创建测试矩形失败:", error);
  }

  console.log("\n=== 测试脚本执行完毕 ===");
  console.log("提示：请使用几何形状工具（矩形/圆形/箭头）绘制形状进行验证");
})();
