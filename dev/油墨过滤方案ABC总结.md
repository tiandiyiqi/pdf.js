# 油墨过滤方案A、B、C总结

## 背景

在实现油墨过滤功能时，遇到了一个核心问题：**主线程和Worker线程的ColorConverter是独立的实例**。当在主线程更新ColorConverter配置后，Worker线程中的ColorConverter仍然使用旧配置，导致颜色过滤不生效。

为了解决这个问题，我们提出了三种方案：方案A、方案B和方案C。

---

## 方案A：强制重新加载文档

### 核心思路

完全重新加载PDF文档，在文档重新加载后同步Worker配置，然后清除缓存并重新渲染。

### 主要实现

**文件**: `web/app.js` (第2249-2343行)

**工作流程**:

1. 用户点击油墨眼睛图标
2. 主线程更新ColorConverter配置
3. 触发`inkstatechanged`事件
4. 保存当前视图状态（页码、缩放、滚动位置）
5. 调用`this.open({ url: this.url })`重新加载文档
6. 等待初始渲染完成
7. 同步配置到新的Worker线程（`updateColorFilterConfig`）
8. 恢复视图状态
9. 清除operatorList缓存
10. 触发重新渲染

**关键代码**:

```javascript
// 重新打开文档
await this.open({ url: this.url });

// 等待初始渲染完成
await new Promise(resolve => {
  const checkRendering = () => {
    const visiblePages = this.pdfViewer._getVisiblePages();
    const allFinished = visiblePages.views.every(
      ({ view }) => view.renderingState === 3
    );
    if (allFinished) {
      resolve();
    } else {
      setTimeout(checkRendering, 50);
    }
  };
  setTimeout(checkRendering, 100);
});

// 同步配置到Worker线程
await this.pdfDocument.updateColorFilterConfig(config);

// 清除缓存并重新渲染
const visiblePages = this.pdfViewer._getVisiblePages();
for (const { view: pageView } of visiblePages.views) {
  if (pageView.pdfPage && pageView.pdfPage.clearOperatorListCache) {
    pageView.pdfPage.clearOperatorListCache();
  }
  pageView.reset();
}
this.forceRendering();
```

**依赖的Worker通信代码**:

- `src/core/worker.js`: `UpdateColorFilterConfig`消息处理器
- `src/display/api.js`: `PDFDocumentProxy.updateColorFilterConfig()`方法
- `src/display/api.js`: `WorkerTransport.updateColorFilterConfig()`方法

### 优点

1. **可靠性高**：完全重新加载文档，确保Worker线程使用新配置
2. **彻底解决**：重新创建Worker实例，避免配置不同步问题
3. **实现简单**：逻辑清晰，易于理解和维护

### 缺点

1. **性能开销大**：需要完全重新加载和解析PDF文档
2. **用户体验差**：文档重新加载会有明显的延迟和闪烁
3. **资源消耗**：重新创建Worker线程，消耗更多内存和CPU
4. **需要Worker通信**：必须保留主线程和Worker线程之间的通信机制

### 适用场景

- 文档较小，重新加载速度快
- 对性能要求不高
- 需要确保配置完全同步的场景

---

## 方案B：使用PDFPage.cleanup()

### 核心思路

使用PDFPageProxy的`cleanup()`方法来清除页面缓存，然后重置页面状态并触发重新渲染。

### 主要实现

**文件**: `web/app.js`

**工作流程**:

1. 用户点击油墨眼睛图标
2. 主线程更新ColorConverter配置
3. 触发`inkstatechanged`事件
4. 调用`pageView.pdfPage.cleanup()`清除页面缓存
5. 调用`pageView.reset()`重置页面状态
6. 触发`forceRendering()`重新渲染

**关键代码**:

```javascript
// 清除页面缓存
if (pageView.pdfPage) {
  await pageView.pdfPage.cleanup();
}
pageView.reset();
this.forceRendering();
```

**cleanup()方法说明**:

`PDFPageProxy.cleanup()`方法会：

- 清除`_intentStates`中的所有渲染状态
- 清除`objs`缓存
- 只有在渲染任务完成且operatorList已完全生成时才会执行清理

### 优点

1. **实现简单**：使用现有的API，代码简洁
2. **性能较好**：不需要重新加载文档
3. **资源清理彻底**：cleanup()会清除所有相关缓存

### 缺点

1. **清理条件限制**：cleanup()只有在渲染完全完成时才会执行，可能无法及时清理
2. **配置同步问题**：与方案C类似，无法解决主线程和Worker线程的ColorConverter配置同步问题
3. **可靠性较低**：如果Worker线程的ColorConverter配置没有更新，过滤不会生效
4. **异步操作**：cleanup()是异步的，需要await，增加了代码复杂度

### 适用场景

- 文档渲染已完成
- 需要彻底清理页面缓存
- 可以确保Worker线程配置同步的场景

### 实施状态

方案B作为备选方案被提出，但最终未实施，因为存在与方案C类似的配置同步问题。

---

## 方案C：清除operatorList缓存

### 核心思路

不重新加载文档，而是清除已缓存的operatorList，强制Worker重新生成operatorList时使用新的ColorConverter配置。

### 主要实现

**文件**: `src/display/api.js` (第1827-1844行)

**新增方法**:

```javascript
/**
 * Clears the operator list cache for all rendering intents.
 * This forces the page to regenerate the operator list on next render.
 */
clearOperatorListCache() {
  for (const intentState of this._intentStates.values()) {
    intentState.displayReadyCapability = null;
    intentState.operatorList = {
      fnArray: [],
      argsArray: [],
      lastChunk: false,
      separateAnnots: null,
    };
  }
}
```

**工作流程**:

1. 用户点击油墨眼睛图标
2. 主线程更新ColorConverter配置
3. 触发`inkstatechanged`事件
4. 调用`pageView.pdfPage.clearOperatorListCache()`清除缓存
5. 调用`pageView.reset()`重置页面状态
6. 触发`forceRendering()`重新渲染
7. Worker重新生成operatorList时使用新的ColorConverter配置

**关键代码**:

```javascript
// 清除operatorList缓存
if (pageView.pdfPage && pageView.pdfPage.clearOperatorListCache) {
  pageView.pdfPage.clearOperatorListCache();
}
pageView.reset();
this.forceRendering();
```

### 优点

1. **性能好**：不需要重新加载文档，响应速度快
2. **用户体验好**：无明显的延迟和闪烁
3. **资源消耗低**：不需要重新创建Worker线程
4. **代码简洁**：不需要Worker通信机制

### 缺点

1. **配置同步问题**：主线程和Worker线程的ColorConverter是独立实例，清除缓存后Worker仍可能使用旧配置
2. **可靠性较低**：如果Worker线程的ColorConverter配置没有更新，过滤不会生效
3. **需要确保配置同步**：必须确保Worker线程的ColorConverter配置与主线程一致

### 适用场景

- 文档较大，重新加载慢
- 对性能要求高
- 可以确保Worker线程配置同步的场景

### 实施状态

方案C已经实施，但发现存在配置同步问题，因此最终采用了方案A。

---

## 方案对比

| 特性               | 方案A         | 方案B                 | 方案C                 |
| ------------------ | ------------- | --------------------- | --------------------- |
| **实施状态**       | ✅ 已实施     | ❌ 未实施（备选方案） | ✅ 已实施（但有问题） |
| **性能**           | ⭐⭐ 差       | ⭐⭐⭐ 中             | ⭐⭐⭐⭐ 好           |
| **用户体验**       | ⭐⭐ 差       | ⭐⭐⭐ 中             | ⭐⭐⭐⭐ 好           |
| **可靠性**         | ⭐⭐⭐⭐⭐ 高 | ⭐⭐⭐ 中             | ⭐⭐⭐ 中             |
| **实现复杂度**     | ⭐⭐⭐ 中     | ⭐⭐⭐⭐ 简单         | ⭐⭐⭐⭐ 简单         |
| **资源消耗**       | ⭐⭐ 高       | ⭐⭐⭐ 中             | ⭐⭐⭐⭐ 低           |
| **需要Worker通信** | ✅ 是         | ❌ 否                 | ❌ 否                 |
| **清理彻底性**     | ⭐⭐⭐⭐⭐ 高 | ⭐⭐⭐⭐ 高           | ⭐⭐⭐ 中             |

---

## 当前实施方案

**当前采用方案A**，原因：

1. **方案B和方案C都存在配置同步问题**：无法确保Worker线程使用正确的ColorConverter配置
2. **方案A可靠性最高**：虽然性能较差，但能确保配置完全同步，可靠性高
3. **方案A已实现并测试通过**：实现已经完成，功能正常
4. **方案B的限制**：cleanup()方法有清理条件限制，可能无法及时清理缓存

---

## 技术细节

### 核心问题

**主线程和Worker线程的ColorConverter是独立的实例**

- 主线程的ColorConverter：在`web/app.js`等UI代码中使用
- Worker线程的ColorConverter：在`src/core/worker.js`中，用于PDF解析和渲染

当在主线程更新ColorConverter配置时，Worker线程的ColorConverter不会自动更新。

### 解决方案

**方案A**通过重新加载文档来创建新的Worker实例，然后在文档加载完成后同步配置。

**方案B**使用`PDFPageProxy.cleanup()`方法来清除页面缓存，但同样无法解决配置同步问题，且cleanup()有清理条件限制。

**方案C**尝试通过清除operatorList缓存来强制重新生成operatorList，但无法解决配置同步问题。

### Worker通信机制

方案A需要以下Worker通信机制：

1. **消息定义** (`src/core/worker.js`):

   ```javascript
   handler.on("UpdateColorFilterConfig", async function (data) {
     const { ColorConverter } = await import("./color_converter.js");
     ColorConverter.setColorFilterConfig(data.config);
     return true;
   });
   ```

2. **传输层** (`src/display/api.js` - WorkerTransport):

   ```javascript
   updateColorFilterConfig(config) {
     return this.messageHandler.sendWithPromise("UpdateColorFilterConfig", {
       config,
     });
   }
   ```

3. **代理层** (`src/display/api.js` - PDFDocumentProxy):
   ```javascript
   updateColorFilterConfig(config) {
     return this._transport.updateColorFilterConfig(config);
   }
   ```

---

## 未来优化方向

1. **改进方案B和方案C**：实现主线程和Worker线程的ColorConverter配置自动同步机制，解决配置同步问题
2. **混合方案**：结合方案A、B、C的优点，先尝试方案B或方案C，如果失败再使用方案A
3. **配置共享**：使用SharedArrayBuffer或其他机制实现配置共享，避免同步问题
4. **优化cleanup()方法**：改进方案B中cleanup()的清理条件，使其能够更及时地清理缓存

---

## 相关文件

- `web/app.js` - 方案A的主要实现
- `src/display/api.js` - clearOperatorListCache方法（方案C）和Worker通信（方案A）
- `src/core/worker.js` - Worker消息处理器（方案A）
- `src/core/color_converter.js` - ColorConverter配置管理
- `web/pdf_ink_list_viewer.js` - 油墨列表UI和事件触发

---

## 总结

三种方案各有优缺点：

- **方案A**：可靠性最高，但性能较差，需要重新加载文档
- **方案B**：实现简单，清理彻底，但存在配置同步问题和清理条件限制
- **方案C**：性能最好，实现简单，但存在配置同步问题

当前采用方案A是因为它能确保配置完全同步，虽然性能较差但可靠性高。方案B和方案C都存在配置同步问题，无法确保Worker线程使用正确的ColorConverter配置。

未来可以考虑优化方案B和方案C，实现配置自动同步机制，以获得更好的性能和用户体验。
