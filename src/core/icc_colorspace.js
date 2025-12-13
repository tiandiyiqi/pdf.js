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

import {
  DataType,
  initSync,
  Intent,
  qcms_convert_array,
  qcms_convert_four,
  qcms_convert_one,
  qcms_convert_three,
  qcms_drop_transformer,
  qcms_transformer_from_memory,
} from "../../external/qcms/qcms.js";
import { shadow, Util, warn } from "../shared/util.js";
import { ColorConverter } from "./color_converter.js";
import { ColorSpace } from "./colorspace.js";
import { QCMS } from "../../external/qcms/qcms_utils.js";

function fetchSync(url) {
  // Parsing and using color spaces is still synchronous,
  // so we must load the wasm module synchronously.
  // TODO: Make the color space stuff asynchronous and use fetch.
  const xhr = new XMLHttpRequest();
  xhr.open("GET", url, false);
  xhr.responseType = "arraybuffer";
  xhr.send(null);
  return xhr.response;
}

class IccColorSpace extends ColorSpace {
  #transformer;

  #convertPixel;

  static #useWasm = true;

  static #wasmUrl = null;

  static #finalizer = null;

  constructor(iccProfile, name, numComps) {
    if (!IccColorSpace.isUsable) {
      throw new Error("No ICC color space support");
    }

    super(name, numComps);

    let inType;
    switch (numComps) {
      case 1:
        inType = DataType.Gray8;
        this.#convertPixel = (src, srcOffset, css) =>
          qcms_convert_one(this.#transformer, src[srcOffset] * 255, css);
        break;
      case 3:
        inType = DataType.RGB8;
        this.#convertPixel = (src, srcOffset, css) =>
          qcms_convert_three(
            this.#transformer,
            src[srcOffset] * 255,
            src[srcOffset + 1] * 255,
            src[srcOffset + 2] * 255,
            css
          );
        break;
      case 4:
        inType = DataType.CMYK;
        this.#convertPixel = (src, srcOffset, css) =>
          qcms_convert_four(
            this.#transformer,
            src[srcOffset] * 255,
            src[srcOffset + 1] * 255,
            src[srcOffset + 2] * 255,
            src[srcOffset + 3] * 255,
            css
          );
        break;
      default:
        throw new Error(`Unsupported number of components: ${numComps}`);
    }
    this.#transformer = qcms_transformer_from_memory(
      iccProfile,
      inType,
      Intent.Perceptual
    );
    if (!this.#transformer) {
      throw new Error("Failed to create ICC color space");
    }
    IccColorSpace.#finalizer ||= new FinalizationRegistry(transformer => {
      qcms_drop_transformer(transformer);
    });
    IccColorSpace.#finalizer.register(this, this.#transformer);
  }

  getRgbHex(src, srcOffset, colorFilterConfig = null) {
    // 处理CMYK颜色空间（4个组件）
    if (this.numComps === 4) {
      // 创建过滤后的数据副本
      const filteredSrc = new Float32Array(4);
      filteredSrc[0] = src[srcOffset]; // C分量
      filteredSrc[1] = src[srcOffset + 1]; // M分量
      filteredSrc[2] = src[srcOffset + 2]; // Y分量
      filteredSrc[3] = src[srcOffset + 3]; // K分量
      // 应用颜色过滤算法（使用传递的配置或回退到静态类）
      const filtered = colorFilterConfig
        ? colorFilterConfig.filterCMYK([
            filteredSrc[0],
            filteredSrc[1],
            filteredSrc[2],
            filteredSrc[3],
          ])
        : ColorConverter.filterCMYK([
            filteredSrc[0],
            filteredSrc[1],
            filteredSrc[2],
            filteredSrc[3],
          ]);
      // 将过滤后的值复制回临时数组
      filteredSrc[0] = filtered[0];
      filteredSrc[1] = filtered[1];
      filteredSrc[2] = filtered[2];
      filteredSrc[3] = filtered[3];
      // 使用过滤后的数据进行转换
      this.#convertPixel(filteredSrc, 0, /* css */ true);
    } else {
      // 非CMYK颜色空间（如RGB或灰度）：直接使用原始数据转换
      this.#convertPixel(src, srcOffset, /* css */ true);
    }
    return QCMS._cssColor;
  }

  getRgbItem(
    src,
    srcOffset,
    dest,
    destOffset,
    skipFilter = false,
    colorFilterConfig = null
  ) {
    // 处理CMYK颜色空间（4个组件）
    if (this.numComps === 4 && !skipFilter) {
      // 创建过滤后的数据副本
      const filteredSrc = new Float32Array(4);
      filteredSrc[0] = src[srcOffset]; // C分量
      filteredSrc[1] = src[srcOffset + 1]; // M分量
      filteredSrc[2] = src[srcOffset + 2]; // Y分量
      filteredSrc[3] = src[srcOffset + 3]; // K分量

      // 应用颜色过滤算法（使用传递的配置或回退到静态类）
      const filtered = colorFilterConfig
        ? colorFilterConfig.filterCMYK([
            filteredSrc[0],
            filteredSrc[1],
            filteredSrc[2],
            filteredSrc[3],
          ])
        : ColorConverter.filterCMYK([
            filteredSrc[0],
            filteredSrc[1],
            filteredSrc[2],
            filteredSrc[3],
          ]);

      // 将过滤后的值复制回临时数组
      filteredSrc[0] = filtered[0];
      filteredSrc[1] = filtered[1];
      filteredSrc[2] = filtered[2];
      filteredSrc[3] = filtered[3];

      // 使用QCMS库进行CMYK到RGB的颜色转换
      QCMS._destBuffer = dest; // 设置目标RGB缓冲区
      QCMS._destOffset = destOffset; // 设置目标偏移量
      QCMS._destLength = 3; // 输出RGB三通道
      this.#convertPixel(filteredSrc, 0, /* css */ false); // 执行转换
      QCMS._destBuffer = null; // 清理目标缓冲区引用
    } else {
      // 非CMYK颜色空间（如RGB或灰度）：直接使用原始数据转换
      // 或者CMYK但skipFilter为true时，也直接使用原始数据转换
      QCMS._destBuffer = dest;
      QCMS._destOffset = destOffset;
      QCMS._destLength = 3;
      this.#convertPixel(src, srcOffset, /* css */ false);
      QCMS._destBuffer = null;
    }
  }
  //批量像素的CMYK颜色转换为RGB
  getRgbBuffer(
    src,
    srcOffset,
    count,
    dest,
    destOffset,
    bits,
    alpha01,
    colorFilterConfig = null
  ) {
    // 准备数据：截取需要处理的数据段
    src = src.subarray(srcOffset, srcOffset + count * this.numComps);

    // 位深转换：如果不是8位数据，进行归一化处理
    if (bits !== 8) {
      const scale = 255 / ((1 << bits) - 1);
      for (let i = 0, ii = src.length; i < ii; i++) {
        src[i] *= scale;
      }
    }

    // CMYK 特殊处理：应用颜色过滤
    if (this.numComps === 4) {
      // 创建过滤后的数据副本
      const filteredSrc = new Float32Array(src.length);

      // 高性能批量过滤：直接操作TypedArray，避免创建临时数组
      if (colorFilterConfig) {
        // 获取通道可见性（只查询一次）- 使用isVisible方法而不是直接get
        const cVisible = colorFilterConfig.isVisible("Cyan");
        const mVisible = colorFilterConfig.isVisible("Magenta");
        const yVisible = colorFilterConfig.isVisible("Yellow");
        const kVisible = colorFilterConfig.isVisible("Black");

        // 批量过滤：直接在循环中应用过滤
        for (let i = 0; i < src.length; i += 4) {
          filteredSrc[i] = cVisible ? src[i] : 0; // C
          filteredSrc[i + 1] = mVisible ? src[i + 1] : 0; // M
          filteredSrc[i + 2] = yVisible ? src[i + 2] : 0; // Y
          filteredSrc[i + 3] = kVisible ? src[i + 3] : 0; // K
        }
      } else {
        // 回退到静态ColorConverter（兼容性）
        for (let i = 0; i < count; i++) {
          const offset = i * 4;
          const filtered = ColorConverter.filterCMYK([
            src[offset],
            src[offset + 1],
            src[offset + 2],
            src[offset + 3],
          ]);
          filteredSrc[offset] = filtered[0];
          filteredSrc[offset + 1] = filtered[1];
          filteredSrc[offset + 2] = filtered[2];
          filteredSrc[offset + 3] = filtered[3];
        }
      }

      // 执行实际的颜色转换（使用过滤后的数据）
      QCMS._mustAddAlpha = alpha01 && dest.buffer === filteredSrc.buffer;
      QCMS._destBuffer = dest;
      QCMS._destOffset = destOffset;
      QCMS._destLength = count * (3 + alpha01);
      qcms_convert_array(this.#transformer, filteredSrc);
      // 清理状态
      QCMS._mustAddAlpha = false;
      QCMS._destBuffer = null;
    } else {
      // 非 CMYK 颜色空间：直接转换原始数据
      QCMS._mustAddAlpha = alpha01 && dest.buffer === src.buffer;
      QCMS._destBuffer = dest;
      QCMS._destOffset = destOffset;
      QCMS._destLength = count * (3 + alpha01);
      qcms_convert_array(this.#transformer, src);
      // 清理状态
      QCMS._mustAddAlpha = false;
      QCMS._destBuffer = null;
    }
  }

  getOutputLength(inputLength, alpha01) {
    return ((inputLength / this.numComps) * (3 + alpha01)) | 0;
  }

  static setOptions({ useWasm, useWorkerFetch, wasmUrl }) {
    if (!useWorkerFetch) {
      this.#useWasm = false;
      return;
    }
    this.#useWasm = useWasm;
    this.#wasmUrl = wasmUrl;
  }

  static get isUsable() {
    let isUsable = false;
    if (this.#useWasm) {
      if (this.#wasmUrl) {
        try {
          this._module = initSync({
            module: fetchSync(`${this.#wasmUrl}qcms_bg.wasm`),
          });
          isUsable = !!this._module;
          QCMS._memory = this._module.memory;
          QCMS._makeHexColor = Util.makeHexColor;
        } catch (e) {
          warn(`ICCBased color space: "${e}".`);
        }
      } else {
        warn("No ICC color space support due to missing `wasmUrl` API option");
      }
    }

    return shadow(this, "isUsable", isUsable);
  }
}

class CmykICCBasedCS extends IccColorSpace {
  static #iccUrl;

  constructor() {
    const iccProfile = new Uint8Array(
      fetchSync(`${CmykICCBasedCS.#iccUrl}CGATS001Compat-v2-micro.icc`)
    );
    super(iccProfile, "DeviceCMYK", 4);
  }

  static setOptions({ iccUrl }) {
    this.#iccUrl = iccUrl;
  }

  static get isUsable() {
    let isUsable = false;
    if (IccColorSpace.isUsable) {
      if (this.#iccUrl) {
        isUsable = true;
      } else {
        warn("No CMYK ICC profile support due to missing `iccUrl` API option");
      }
    }

    return shadow(this, "isUsable", isUsable);
  }
}

export { CmykICCBasedCS, IccColorSpace };
