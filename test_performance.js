// 性能测试脚本
// 模拟颜色过滤功能的性能测试
function testColorFilterPerformance() {
  console.log('开始颜色过滤功能性能测试...');
  
  // 模拟CMYK颜色数据
  const testCMYKData = Array(1000000).fill([0.5, 0.5, 0.5, 0.5]);
  
  // 模拟颜色过滤器配置
  class MockColorConverter {
    static #colorFilterConfig = {
      enabled: true,
      colors: new Map([
        ["Cyan", true],
        ["Magenta", true],
        ["Yellow", true],
        ["Black", true],
      ]),
    };
    
    static setColorFilterConfig(config) {
      if (config?.enabled !== undefined) {
        this.#colorFilterConfig.enabled = !!config.enabled;
      }
      if (config?.colors && typeof config.colors === "object") {
        this.#colorFilterConfig.colors = new Map(Object.entries(config.colors));
      }
    }
    
    static filterCMYK(cmyk) {
      if (!this.#colorFilterConfig.enabled) return [...cmyk];
      
      const filtered = [...cmyk];
      const colors = this.#colorFilterConfig.colors;
      
      if (!colors.get("Cyan")) filtered[0] = 0;
      if (!colors.get("Magenta")) filtered[1] = 0;
      if (!colors.get("Yellow")) filtered[2] = 0;
      if (!colors.get("Black")) filtered[3] = 0;
      
      return filtered;
    }
    
    static cmykToRgb(cmyk) {
      const [c, m, y, k] = cmyk;
      const r = 255 * (1 - c) * (1 - k);
      const g = 255 * (1 - m) * (1 - k);
      const b = 255 * (1 - y) * (1 - k);
      return [Math.round(r), Math.round(g), Math.round(b)];
    }
    
    static cmykToRgbWithFilter(cmyk) {
      return this.cmykToRgb(this.filterCMYK(cmyk));
    }
  }
  
  // 测试1: 禁用颜色过滤
  console.log('\n测试1: 禁用颜色过滤');
  MockColorConverter.setColorFilterConfig({ enabled: false });
  
  const startTime1 = performance.now();
  let result1 = 0;
  for (const cmyk of testCMYKData) {
    const rgb = MockColorConverter.cmykToRgbWithFilter(cmyk);
    result1 += rgb[0] + rgb[1] + rgb[2];
  }
  const endTime1 = performance.now();
  console.log(`执行时间: ${endTime1 - startTime1} ms`);
  console.log(`结果校验: ${result1}`);
  
  // 测试2: 启用颜色过滤
  console.log('\n测试2: 启用颜色过滤');
  MockColorConverter.setColorFilterConfig({ enabled: true });
  
  const startTime2 = performance.now();
  let result2 = 0;
  for (const cmyk of testCMYKData) {
    const rgb = MockColorConverter.cmykToRgbWithFilter(cmyk);
    result2 += rgb[0] + rgb[1] + rgb[2];
  }
  const endTime2 = performance.now();
  console.log(`执行时间: ${endTime2 - startTime2} ms`);
  console.log(`结果校验: ${result2}`);
  
  // 测试3: 启用颜色过滤并禁用部分通道
  console.log('\n测试3: 启用颜色过滤并禁用部分通道');
  MockColorConverter.setColorFilterConfig({
    enabled: true,
    colors: {
      Cyan: false,
      Magenta: true,
      Yellow: false,
      Black: true,
    },
  });
  
  const startTime3 = performance.now();
  let result3 = 0;
  for (const cmyk of testCMYKData) {
    const rgb = MockColorConverter.cmykToRgbWithFilter(cmyk);
    result3 += rgb[0] + rgb[1] + rgb[2];
  }
  const endTime3 = performance.now();
  console.log(`执行时间: ${endTime3 - startTime3} ms`);
  console.log(`结果校验: ${result3}`);
  
  // 输出性能比较
  console.log('\n性能比较:');
  console.log(`禁用颜色过滤: ${endTime1 - startTime1} ms`);
  console.log(`启用颜色过滤: ${endTime2 - startTime2} ms`);
  console.log(`启用颜色过滤并禁用部分通道: ${endTime3 - startTime3} ms`);
  
  const overhead = ((endTime2 - startTime2) - (endTime1 - startTime1));
  console.log(`\n性能开销: ${overhead.toFixed(2)} ms (${((overhead / (endTime1 - startTime1)) * 100).toFixed(2)}%)`);
  
  console.log('\n性能测试完成!');
}

testColorFilterPerformance();
