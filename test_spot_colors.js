/* Copyright 2025 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// 简单的测试脚本，用于检查PDF文件的颜色空间定义

import fs from 'fs';
import * as pdfjsLib from './build/generic/build/pdf.mjs';

async function testSpotColors() {
  try {
    // 读取PDF文件
    const pdfPath = './web/compressed.tracemonkey-pldi-09.pdf';
    const pdfData = new Uint8Array(fs.readFileSync(pdfPath));
    
    // 加载PDF文档
    const loadingTask = pdfjsLib.getDocument({
      data: pdfData,
      useWorkerFetch: false,
    });
    
    const pdfDoc = await loadingTask.promise;
    
    console.log('PDF文档加载成功');
    console.log(`页数: ${pdfDoc.numPages}`);
    
    // 获取第一页
    const page = await pdfDoc.getPage(1);
    
    console.log('页面加载成功');
    
    // 获取页面内容
    const content = await page.getTextContent();
    console.log('页面内容:', content);
    
  } catch (error) {
    console.error('错误:', error);
  }
}

testSpotColors();