# 添加运行时动态专色注册功能

## 方案概述

根据专色名称获取补充说明文档中的方案B，我将修改ColorConverter类的deviceNToRgbWithFilter方法，添加运行时动态添加专色名称的功能。

## 核心实现

### 修改deviceNToRgbWithFilter方法

在 `src/core/color_converter.js` 中修改deviceNToRgbWithFilter方法，添加以下功能：

1. 检查channels.spots是否存在
2. 如果存在，遍历所有spot名称
3. 检查每个spot名称是否已经在配置中
4. 如果不在，自动添加到配置中

### 具体代码修改

```javascript
static deviceNToRgbWithFilter(channels) {
  // 先处理专色名称的自动注册
  if (channels.spots) {
    for (const [name] of Object.entries(channels.spots)) {
      // 如果专色尚未在配置中，自动添加
      if (!this.#colorFilterConfig.colors.has(name)) {
        this.#colorFilterConfig.colors.set(name, true);
      }
    }
  }

  const cmyk = channels.cmyk ? this.filterCMYK(channels.cmyk) : [0, 0, 0, 0];

  let totalSpot = 0;
  if (channels.spots) {
    for (const [name, value] of Object.entries(channels.spots)) {
      totalSpot += this.filterSpot(name, value);
    }
  }

  cmyk[3] = Math.min(1, cmyk[3] + totalSpot * 0.3);
  return this.cmykToRgb(cmyk);
}
```

## 预期效果

1. **无需预扫描**：避免了预扫描PDF文件的性能开销
2. **按需注册**：只在遇到专色时才添加到配置中
3. **自动完成**：用户无需手动配置专色名称
4. **兼容性好**：适用于各种PDF文件

## 测试计划

1. 编写单元测试，验证专色自动注册功能
2. 测试不同类型的PDF文件，确保专色能够正确自动注册
3. 验证现有功能不受影响

## 风险评估

1. **性能影响**：添加的代码逻辑简单，性能影响可忽略不计
2. **兼容性问题**：保持了原有方法的签名和功能，不会破坏现有代码
3. **内存使用**：只存储实际遇到的专色名称，内存使用合理

