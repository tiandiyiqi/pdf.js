# PDF.JS 集成示例

本文件夹包含两种在web项目中集成PDF.JS的示例：

1. `core-integration.html` - 直接使用PDF.JS核心库
2. `viewer-integration.html` - 使用完整的PDF.JS查看器

## 核心库集成示例

使用编译后的核心库文件：

- pdf.mjs (主文件)
- pdf.worker.mjs (worker文件)

## 查看器集成示例

使用完整的PDF.JS查看器，包括UI组件。

## 如何使用

1. 确保你已经编译了PDF.JS（运行 `npx gulp server` 或相关构建命令）
2. 将编译后的文件从 `build/dev/build` 和 `build/dev/web` 复制到你的项目中
3. 参考示例HTML文件中的集成方式
4. 在浏览器中打开示例HTML文件
