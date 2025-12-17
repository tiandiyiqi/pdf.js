/* Copyright 2024 Mozilla Foundation
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

import { MathClamp } from "../../../shared/util.js";
import { Outline } from "./outline.js";

/**
 * Manages the real-time drawing process for rectangle annotations.
 * Tracks the start and end points, normalizes coordinates, and generates SVG properties.
 */
class RectDrawOutliner {
  #startX;

  #startY;

  #endX;

  #endY;

  #parentWidth;

  #parentHeight;

  #rotation;

  #thickness;

  #outlines = new RectDrawOutline();

  constructor(x, y, parentWidth, parentHeight, rotation, thickness) {
    this.#parentWidth = parentWidth;
    this.#parentHeight = parentHeight;
    this.#rotation = rotation;
    this.#thickness = thickness;

    // Normalize the starting point
    [this.#startX, this.#startY] = this.#normalizePoint(x, y);
    [this.#endX, this.#endY] = [this.#startX, this.#startY];
  }

  /**
   * Normalize a point from canvas coordinates to [0,1] range.
   */
  #normalizePoint(x, y) {
    return Outline._normalizePoint(
      x,
      y,
      this.#parentWidth,
      this.#parentHeight,
      this.#rotation
    );
  }

  /**
   * Update property of the rectangle (e.g., stroke-width).
   */
  updateProperty(name, value) {
    if (name === "stroke-width") {
      this.#thickness = value;
    }
  }

  /**
   * Check if the rectangle is empty (too small to be valid).
   */
  isEmpty() {
    const threshold = 0.005; // ~5px in a 1000px viewport
    const width = Math.abs(this.#endX - this.#startX);
    const height = Math.abs(this.#endY - this.#startY);
    return width < threshold || height < threshold;
  }

  /**
   * Check if the drawing can be cancelled (very small rectangle).
   */
  isCancellable() {
    return this.isEmpty();
  }

  /**
   * Add a point (alias for update for rectangle drawing).
   * This method is called by DrawingEditor._drawMove during drawing.
   */
  add(x, y) {
    return this.update(x, y);
  }

  /**
   * Update the end point of the rectangle as the user drags.
   */
  update(x, y) {
    [this.#endX, this.#endY] = this.#normalizePoint(x, y);

    return {
      rect: this.#getCurrentRectSVGProperties(),
    };
  }

  /**
   * End the drawing process.
   */
  end(x, y) {
    [this.#endX, this.#endY] = this.#normalizePoint(x, y);

    return {
      rect: this.#getCurrentRectSVGProperties(),
    };
  }

  /**
   * Generate SVG properties for the current rectangle state.
   */
  #getCurrentRectSVGProperties() {
    const [x, y, width, height] = this.#normalizeRect();
    return {
      x: Outline.svgRound(x),
      y: Outline.svgRound(y),
      width: Outline.svgRound(width),
      height: Outline.svgRound(height),
    };
  }

  /**
   * Normalize the rectangle to ensure positive width and height.
   * Handles negative dimensions (e.g., dragging from bottom-right to top-left).
   */
  #normalizeRect() {
    let x = this.#startX;
    let y = this.#startY;
    let width = this.#endX - this.#startX;
    let height = this.#endY - this.#startY;

    // Swap if width is negative
    if (width < 0) {
      x = this.#endX;
      width = -width;
    }

    // Swap if height is negative
    if (height < 0) {
      y = this.#endY;
      height = -height;
    }

    return [x, y, width, height];
  }

  /**
   * Get the final outlines for the rectangle.
   */
  getOutlines(parentWidth, parentHeight, scale, innerMargin) {
    this.#outlines.build(
      this.#normalizeRect(),
      parentWidth,
      parentHeight,
      scale,
      this.#rotation,
      this.#thickness,
      innerMargin
    );

    return this.#outlines;
  }

  /**
   * Default SVG properties for the rectangle drawing.
   */
  get defaultSVGProperties() {
    return {
      root: {
        viewBox: "0 0 10000 10000",
      },
      rootClass: {
        draw: true,
      },
      rect: this.#getCurrentRectSVGProperties(),
      bbox: [0, 0, 1, 1],
    };
  }
}

/**
 * Stores the finalized rectangle outline data.
 * Manages bounding box calculation, serialization, and transformations.
 */
class RectDrawOutline extends Outline {
  #bbox;

  #currentRotation = 0;

  #innerMargin;

  #rect; // [x, y, width, height] in normalized coordinates

  #parentWidth;

  #parentHeight;

  #parentScale;

  #rotation;

  #thickness;

  /**
   * Build the outline from normalized rectangle coordinates.
   */
  build(
    rect,
    parentWidth,
    parentHeight,
    parentScale,
    rotation,
    thickness,
    innerMargin
  ) {
    this.#rect = new Float32Array(rect);
    this.#parentWidth = parentWidth;
    this.#parentHeight = parentHeight;
    this.#parentScale = parentScale;
    this.#rotation = rotation;
    this.#thickness = thickness;
    this.#innerMargin = innerMargin ?? 0;

    this.#computeBbox();
  }

  get thickness() {
    return this.#thickness;
  }

  /**
   * Generate SVG path representation (for compatibility, though rect uses attributes).
   */
  toSVGPath() {
    // Rectangles typically use SVG <rect> attributes, but we can generate a path for consistency
    const [x, y, width, height] = this.#rect;
    const x1 = Outline.svgRound(x);
    const y1 = Outline.svgRound(y);
    const x2 = Outline.svgRound(x + width);
    const y2 = Outline.svgRound(y + height);

    return `M${x1} ${y1}L${x2} ${y1}L${x2} ${y2}L${x1} ${y2}Z`;
  }

  /**
   * Serialize the rectangle for saving.
   */
  serialize([pageX, pageY, pageWidth, pageHeight], isForCopying) {
    const [x, y, width, height] = this.#getBBoxWithNoMargin();
    let x1, y1, x2, y2;

    switch (this.#rotation) {
      case 0:
        x1 = pageX + x * pageWidth;
        y1 = pageY + (1 - y - height) * pageHeight;
        x2 = pageX + (x + width) * pageWidth;
        y2 = pageY + (1 - y) * pageHeight;
        break;
      case 90:
        x1 = pageX + y * pageWidth;
        y1 = pageY + x * pageHeight;
        x2 = pageX + (y + height) * pageWidth;
        y2 = pageY + (x + width) * pageHeight;
        break;
      case 180:
        x1 = pageX + (1 - x - width) * pageWidth;
        y1 = pageY + y * pageHeight;
        x2 = pageX + (1 - x) * pageWidth;
        y2 = pageY + (y + height) * pageHeight;
        break;
      case 270:
        x1 = pageX + (1 - y - height) * pageWidth;
        y1 = pageY + (1 - x - width) * pageHeight;
        x2 = pageX + (1 - y) * pageWidth;
        y2 = pageY + (1 - x) * pageHeight;
        break;
    }

    return {
      rect: [x1, y1, x2, y2],
      rectData: this.#rect.slice(),
    };
  }

  /**
   * Deserialize a rectangle from saved data.
   */
  static deserialize(
    pageX,
    pageY,
    pageWidth,
    pageHeight,
    innerMargin,
    { rectData, rotation, thickness }
  ) {
    const outline = new this();
    outline.build(
      rectData,
      pageWidth,
      pageHeight,
      1,
      rotation,
      thickness,
      innerMargin
    );

    return outline;
  }

  /**
   * Get margin components based on thickness.
   */
  #getMarginComponents(thickness = this.#thickness) {
    const margin = this.#innerMargin + (thickness / 2) * this.#parentScale;
    return this.#rotation % 180 === 0
      ? [margin / this.#parentWidth, margin / this.#parentHeight]
      : [margin / this.#parentHeight, margin / this.#parentWidth];
  }

  /**
   * Get bounding box without margin.
   */
  #getBBoxWithNoMargin() {
    const [x, y, width, height] = this.#bbox;
    const [marginX, marginY] = this.#getMarginComponents(0);

    return [
      x + marginX,
      y + marginY,
      width - 2 * marginX,
      height - 2 * marginY,
    ];
  }

  /**
   * Compute the bounding box with margins.
   */
  #computeBbox() {
    const [x, y, width, height] = this.#rect;
    const [marginX, marginY] = this.#getMarginComponents();

    this.#bbox = new Float32Array([
      MathClamp(x - marginX, 0, 1),
      MathClamp(y - marginY, 0, 1),
      Math.min(width + 2 * marginX, 1 - x + marginX),
      Math.min(height + 2 * marginY, 1 - y + marginY),
    ]);
  }

  get box() {
    return this.#bbox;
  }

  /**
   * Update a property (e.g., stroke-width).
   */
  updateProperty(name, value) {
    if (name === "stroke-width") {
      return this.#updateThickness(value);
    }
    return null;
  }

  #updateThickness(thickness) {
    const [oldMarginX, oldMarginY] = this.#getMarginComponents();
    this.#thickness = thickness;
    const [newMarginX, newMarginY] = this.#getMarginComponents();
    const [diffMarginX, diffMarginY] = [
      newMarginX - oldMarginX,
      newMarginY - oldMarginY,
    ];
    const bbox = this.#bbox;
    bbox[0] -= diffMarginX;
    bbox[1] -= diffMarginY;
    bbox[2] += 2 * diffMarginX;
    bbox[3] += 2 * diffMarginY;

    return bbox;
  }

  /**
   * Update parent dimensions (e.g., on zoom).
   */
  updateParentDimensions([width, height], scale) {
    const [oldMarginX, oldMarginY] = this.#getMarginComponents();
    this.#parentWidth = width;
    this.#parentHeight = height;
    this.#parentScale = scale;
    const [newMarginX, newMarginY] = this.#getMarginComponents();
    const diffMarginX = newMarginX - oldMarginX;
    const diffMarginY = newMarginY - oldMarginY;

    const bbox = this.#bbox;
    bbox[0] -= diffMarginX;
    bbox[1] -= diffMarginY;
    bbox[2] += 2 * diffMarginX;
    bbox[3] += 2 * diffMarginY;

    return bbox;
  }

  /**
   * Update rotation.
   */
  updateRotation(rotation) {
    this.#currentRotation = rotation;
    return {
      rect: this.#getRectSVGProperties(),
      transform: this.rotationTransform,
    };
  }

  /**
   * Get current rectangle SVG properties.
   */
  #getRectSVGProperties() {
    const [x, y, width, height] = this.#rect;
    return {
      x: Outline.svgRound(x),
      y: Outline.svgRound(y),
      width: Outline.svgRound(width),
      height: Outline.svgRound(height),
    };
  }

  get viewBox() {
    return this.#bbox.map(Outline.svgRound).join(" ");
  }

  get defaultProperties() {
    const [x, y] = this.#bbox;
    return {
      root: {
        viewBox: this.viewBox,
      },
      rect: this.#getRectSVGProperties(),
      rectTransformOrigin: `${Outline.svgRound(x)} ${Outline.svgRound(y)}`,
    };
  }

  get rotationTransform() {
    const [, , width, height] = this.#bbox;
    let a = 0,
      b = 0,
      c = 0,
      d = 0,
      e = 0,
      f = 0;
    switch (this.#currentRotation) {
      case 90:
        b = height / width;
        c = -width / height;
        e = width;
        break;
      case 180:
        a = -1;
        d = -1;
        e = width;
        f = height;
        break;
      case 270:
        b = -height / width;
        c = width / height;
        f = height;
        break;
      default:
        return "";
    }
    return `matrix(${a} ${b} ${c} ${d} ${Outline.svgRound(e)} ${Outline.svgRound(f)})`;
  }

  /**
   * Get SVG properties during resize.
   */
  getPathResizingSVGProperties([newX, newY, newWidth, newHeight]) {
    const [marginX, marginY] = this.#getMarginComponents();
    const [x, y, width, height] = this.#bbox;

    if (
      Math.abs(width - marginX) <= Outline.PRECISION ||
      Math.abs(height - marginY) <= Outline.PRECISION
    ) {
      // Center the rectangle in the new bounding box
      const tx = newX + newWidth / 2 - (x + width / 2);
      const ty = newY + newHeight / 2 - (y + height / 2);
      return {
        rectTransformOrigin: `${Outline.svgRound(newX)} ${Outline.svgRound(newY)}`,
        transform: `${this.rotationTransform} translate(${tx} ${ty})`,
      };
    }

    const s1x = (newWidth - 2 * marginX) / (width - 2 * marginX);
    const s1y = (newHeight - 2 * marginY) / (height - 2 * marginY);
    const s2x = width / newWidth;
    const s2y = height / newHeight;

    return {
      rectTransformOrigin: `${Outline.svgRound(x)} ${Outline.svgRound(y)}`,
      transform:
        `${this.rotationTransform} scale(${s2x} ${s2y}) ` +
        `translate(${Outline.svgRound(marginX)} ${Outline.svgRound(marginY)}) scale(${s1x} ${s1y}) ` +
        `translate(${Outline.svgRound(-marginX)} ${Outline.svgRound(-marginY)})`,
    };
  }

  /**
   * Get SVG properties after resize is complete.
   */
  getPathResizedSVGProperties([newX, newY, newWidth, newHeight]) {
    const [marginX, marginY] = this.#getMarginComponents();
    const bbox = this.#bbox;
    const [x, y, width, height] = bbox;

    bbox[0] = newX;
    bbox[1] = newY;
    bbox[2] = newWidth;
    bbox[3] = newHeight;

    // Update the rect coordinates
    const scaleX = (newWidth - 2 * marginX) / (width - 2 * marginX);
    const scaleY = (newHeight - 2 * marginY) / (height - 2 * marginY);
    const [rx, ry, rw, rh] = this.#rect;

    this.#rect[0] = (rx - x - marginX) * scaleX + newX + marginX;
    this.#rect[1] = (ry - y - marginY) * scaleY + newY + marginY;
    this.#rect[2] = rw * scaleX;
    this.#rect[3] = rh * scaleY;

    return {
      root: {
        viewBox: this.viewBox,
      },
      rect: this.#getRectSVGProperties(),
      rectTransformOrigin: `${Outline.svgRound(newX)} ${Outline.svgRound(newY)}`,
      transform: this.rotationTransform || null,
    };
  }

  /**
   * Get SVG properties after translation.
   */
  getPathTranslatedSVGProperties([newX, newY], parentDimensions) {
    const [newParentWidth, newParentHeight] = parentDimensions;
    const bbox = this.#bbox;
    const tx = newX - bbox[0];
    const ty = newY - bbox[1];

    if (
      this.#parentWidth === newParentWidth &&
      this.#parentHeight === newParentHeight
    ) {
      // Simple translation
      this.#rect[0] += tx;
      this.#rect[1] += ty;
    } else {
      // Translation with parent dimension change
      const sx = this.#parentWidth / newParentWidth;
      const sy = this.#parentHeight / newParentHeight;
      this.#parentWidth = newParentWidth;
      this.#parentHeight = newParentHeight;

      this.#rect[0] = tx + this.#rect[0] * sx;
      this.#rect[1] = ty + this.#rect[1] * sy;
      this.#rect[2] *= sx;
      this.#rect[3] *= sy;
      bbox[2] *= sx;
      bbox[3] *= sy;
    }
    bbox[0] = newX;
    bbox[1] = newY;

    return {
      root: {
        viewBox: this.viewBox,
      },
      rect: this.#getRectSVGProperties(),
      rectTransformOrigin: `${Outline.svgRound(newX)} ${Outline.svgRound(newY)}`,
    };
  }

  get defaultSVGProperties() {
    const bbox = this.#bbox;
    return {
      root: {
        viewBox: this.viewBox,
      },
      rootClass: {
        draw: true,
      },
      rect: this.#getRectSVGProperties(),
      rectTransformOrigin: `${Outline.svgRound(bbox[0])} ${Outline.svgRound(bbox[1])}`,
      transform: this.rotationTransform || null,
      bbox,
    };
  }
}

export { RectDrawOutline, RectDrawOutliner };
