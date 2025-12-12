PDF.js 颜色转换路径与规则
一、CMYK基础色转换为RGB的路径
路径1：DeviceCMYK（标准CMYK）
位置：src/core/colorspace.js - DeviceCmykCS.#toRgb() (行775-877)
调用链：
DeviceCmykCS.getRgbItem() (行879-887) → #toRgb()
DeviceCmykCS.getRgbBuffer() (行889-900) → 循环调用 #toRgb()
当前过滤：已在 #toRgb() 中应用 ColorConverter.filterCMYK()
路径2：ICC-based CMYK（您的PDF使用此路径）
位置：src/core/icc_colorspace.js - IccColorSpace.getRgbItem() (行113-195) 和 getRgbBuffer() (行197-272)
调用链：
IccColorSpace.getRgbItem() → 调用 ColorConverter.filterCMYK() → #convertPixel()
IccColorSpace.getRgbBuffer() → 批量调用 ColorConverter.filterCMYK() → qcms_convert_array()
当前过滤：已在两个方法中添加过滤

二、专色转换为RGB的路径
路径：AlternateCS（Separation/DeviceN）
位置：src/core/colorspace.js - AlternateCS.getRgbItem() (行467-477) 和 getRgbBuffer() (行479-521)
转换流程：
调用 tintFn() 将专色值转换为基础颜色空间（通常是CMYK）
调用 base.getRgbItem() 或 base.getRgbBuffer() 将基础色转换为RGB
问题位置：行513和行519
// 行513: 单个像素
base.getRgbItem(tinted, 0, baseBuf, pos);

// 行519: 批量转换
base.getRgbBuffer(baseBuf, 0, count, dest, destOffset, 8, alpha01);
// 行513: 单个像素 base.getRgbItem(tinted, 0, baseBuf, pos); // 行519: 批量转换 base.getRgbBuffer(baseBuf, 0, count, dest, destOffset, 8, alpha01);
当前问题：专色的CMYK替代色（tinted）被 base.getRgbItem() 中的 filterCMYK() 过滤了
三、当前过滤机制的问题
问题1：专色的CMYK替代色被错误过滤
位置：src/core/colorspace.js:513 和 519
原因：AlternateCS 将专色转换为CMYK后，调用 base.getRgbItem()，而该方法会应用 filterCMYK()，导致专色的CMYK替代色被按通道过滤
期望：专色应为“全有或全无”，不应按CMYK通道过滤
问题2：CMYK基础色过滤可能未生效
可能原因：
缓存问题：过滤后的值被缓存，未重新渲染
调用路径：某些渲染路径未经过过滤点
四、正确的过滤规则
CMYK基础色（Cyan, Magenta, Yellow, Black）
规则：通道级过滤
示例：C30M20，Cyan=false → [0, 0.20, 0, 0] → 转RGB
应用位置：
DeviceCmykCS.#toRgb() ✅ 已添加
IccColorSpace.getRgbItem() ✅ 已添加
IccColorSpace.getRgbBuffer() ✅ 已添加
专色（DIC 275s等）
规则：二元过滤（全有或全无）
示例：DIC 234s=false → 完全不显示（白色）
应用位置：
AlternateCS.getRgbItem() ❌ 需要修改
AlternateCS.getRgbBuffer() ❌ 需要修改
实现方式：在调用 base.getRgbItem() 之前，检查专色可见性；如果不可见，直接返回白色RGB
五、需要修改的位置
src/core/colorspace.js:467-477 - AlternateCS.getRgbItem()
在调用 base.getRgbItem() 前检查专色可见性
如果专色不可见，直接返回 [255, 255, 255]
src/core/colorspace.js:479-521 - AlternateCS.getRgbBuffer()
在批量转换前检查专色可见性
如果专色不可见，批量填充白色
确保CMYK过滤在正确位置生效
检查是否有其他颜色转换路径未经过过滤点
六、总结
CMYK过滤位置：
DeviceCmykCS.#toRgb() ✅
IccColorSpace.getRgbItem() ✅
IccColorSpace.getRgbBuffer() ✅
专色过滤位置（需要修改）：
AlternateCS.getRgbItem() ❌ 当前错误地过滤了CMYK替代色
AlternateCS.getRgbBuffer() ❌ 当前错误地过滤了CMYK替代色
核心问题：AlternateCS 在将专色转换为CMYK后，直接调用 base.getRgbItem()，导致专色的CMYK替代色被按通道过滤。应在 AlternateCS 层面实现专色的“全有或全无”过滤，而不是让CMYK过滤作用于专色的替代色。
