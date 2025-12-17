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
 * Manages the real-time drawing process for circle/ellipse annotations.
 * Tracks the center point and radii, normalizes coordinates, and generates SVG properties.
 */
class CircDrawOutliner {
  #centerX;

  #centerY;

  #radiusX;

  #radiusY;

  #parentWidth;

  #parentHeight;

  #rotation;

  #thickness;

  #outlines = new CircDrawOutline();

  constructor(x, y, parentWidth, parentHeight, rotation, thickness) {
    this.#parentWidth = parentWidth;
    this.#parentHeight = parentHeight;
    this.#rotation = rotation;
    this.#thickness = thickness;

    // Normalize the starting point (center)
    [this.#centerX, this.#centerY] = this.#normalizePoint(x, y);
    this.#radiusX = 0;
    this.#radiusY = 0;
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
   * Update property of the circle (e.g., stroke-width).
   */
  updateProperty(name, value) {
    if (name === "stroke-width") {
      this.#thickness = value;
    }
  }

  /**
   * Check if the circle is empty (too small to be valid).
   */
  isEmpty() {
    const threshold = 0.0025; // ~2.5px in a 1000px viewport
    return this.#radiusX < threshold || this.#radiusY < threshold;
  }

  /**
   * Check if the drawing can be cancelled (very small circle).
   */
  isCancellable() {
    return this.isEmpty();
  }

  /**
   * Add a point (alias for update for circle drawing).
   * This method is called by DrawingEditor._drawMove during drawing.
   */
  add(x, y) {
    return this.update(x, y);
  }

  /**
   * Update the radius as the user drags.
   */
  update(x, y) {
    const [endX, endY] = this.#normalizePoint(x, y);

    // Calculate radii from center to current point
    this.#radiusX = Math.abs(endX - this.#centerX);
    this.#radiusY = Math.abs(endY - this.#centerY);

    return {
      ellipse: this.#getCurrentEllipseSVGProperties(),
    };
  }

  /**
   * End the drawing process.
   */
  end(x, y) {
    const [endX, endY] = this.#normalizePoint(x, y);

    this.#radiusX = Math.abs(endX - this.#centerX);
    this.#radiusY = Math.abs(endY - this.#centerY);

    return {
      ellipse: this.#getCurrentEllipseSVGProperties(),
    };
  }

  /**
   * Generate SVG properties for the current ellipse state.
   */
  #getCurrentEllipseSVGProperties() {
    return {
      cx: Outline.svgRound(this.#centerX),
      cy: Outline.svgRound(this.#centerY),
      rx: Outline.svgRound(this.#radiusX),
      ry: Outline.svgRound(this.#radiusY),
    };
  }

  /**
   * Get the final outlines for the circle.
   */
  getOutlines(parentWidth, parentHeight, scale, innerMargin) {
    this.#outlines.build(
      [this.#centerX, this.#centerY, this.#radiusX, this.#radiusY],
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
   * Default SVG properties for the circle drawing.
   */
  get defaultSVGProperties() {
    return {
      root: {
        viewBox: "0 0 10000 10000",
      },
      rootClass: {
        draw: true,
      },
      ellipse: this.#getCurrentEllipseSVGProperties(),
      bbox: [0, 0, 1, 1],
    };
  }
}

/**
 * Stores the finalized circle outline data.
 * Manages bounding box calculation, serialization, and transformations.
 */
class CircDrawOutline extends Outline {
  #bbox;

  #currentRotation = 0;

  #innerMargin;

  #ellipse; // [cx, cy, rx, ry] in normalized coordinates

  #parentWidth;

  #parentHeight;

  #parentScale;

  #rotation;

  #thickness;

  /**
   * Build the outline from normalized ellipse coordinates.
   */
  build(
    ellipse,
    parentWidth,
    parentHeight,
    parentScale,
    rotation,
    thickness,
    innerMargin
  ) {
    this.#ellipse = new Float32Array(ellipse);
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
   * Generate SVG path representation.
   */
  toSVGPath() {
    const [cx, cy, rx, ry] = this.#ellipse;
    // Approximate ellipse with bezier curves
    const kappa = 0.5522848;
    const ox = rx * kappa;
    const oy = ry * kappa;

    const x0 = Outline.svgRound(cx - rx);
    const x1 = Outline.svgRound(cx - ox);
    const x2 = Outline.svgRound(cx);
    const x3 = Outline.svgRound(cx + ox);
    const x4 = Outline.svgRound(cx + rx);

    const y0 = Outline.svgRound(cy - ry);
    const y1 = Outline.svgRound(cy - oy);
    const y2 = Outline.svgRound(cy);
    const y3 = Outline.svgRound(cy + oy);
    const y4 = Outline.svgRound(cy + ry);

    return (
      `M${x0} ${y2}` +
      `C${x0} ${y1} ${x1} ${y0} ${x2} ${y0}` +
      `C${x3} ${y0} ${x4} ${y1} ${x4} ${y2}` +
      `C${x4} ${y3} ${x3} ${y4} ${x2} ${y4}` +
      `C${x1} ${y4} ${x0} ${y3} ${x0} ${y2}Z`
    );
  }

  /**
   * Serialize the circle for saving.
   */
  serialize([pageX, pageY, pageWidth, pageHeight], isForCopying) {
    const [cx, cy, rx, ry] = this.#getBBoxWithNoMargin();
    let x1, y1, x2, y2;

    // Convert center and radii to bounding box
    const x = cx - rx;
    const y = cy - ry;
    const width = 2 * rx;
    const height = 2 * ry;

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
      ellipseData: this.#ellipse.slice(),
    };
  }

  /**
   * Deserialize a circle from saved data.
   */
  static deserialize(
    pageX,
    pageY,
    pageWidth,
    pageHeight,
    innerMargin,
    { ellipseData, rotation, thickness }
  ) {
    const outline = new this();
    outline.build(
      ellipseData,
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
    const [cx, cy, rx, ry] = this.#ellipse;
    return [cx, cy, rx, ry];
  }

  /**
   * Compute the bounding box with margins.
   */
  #computeBbox() {
    const [cx, cy, rx, ry] = this.#ellipse;
    const [marginX, marginY] = this.#getMarginComponents();

    // Bounding box is center - radius - margin to center + radius + margin
    const x = cx - rx;
    const y = cy - ry;
    const width = 2 * rx;
    const height = 2 * ry;

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
      ellipse: this.#getEllipseSVGProperties(),
      transform: this.rotationTransform,
    };
  }

  /**
   * Get current ellipse SVG properties.
   */
  #getEllipseSVGProperties() {
    const [cx, cy, rx, ry] = this.#ellipse;
    return {
      cx: Outline.svgRound(cx),
      cy: Outline.svgRound(cy),
      rx: Outline.svgRound(rx),
      ry: Outline.svgRound(ry),
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
      ellipse: this.#getEllipseSVGProperties(),
      ellipseTransformOrigin: `${Outline.svgRound(x)} ${Outline.svgRound(y)}`,
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
      // Center the ellipse in the new bounding box
      const tx = newX + newWidth / 2 - (x + width / 2);
      const ty = newY + newHeight / 2 - (y + height / 2);
      return {
        ellipseTransformOrigin: `${Outline.svgRound(newX)} ${Outline.svgRound(newY)}`,
        transform: `${this.rotationTransform} translate(${tx} ${ty})`,
      };
    }

    const s1x = (newWidth - 2 * marginX) / (width - 2 * marginX);
    const s1y = (newHeight - 2 * marginY) / (height - 2 * marginY);
    const s2x = width / newWidth;
    const s2y = height / newHeight;

    return {
      ellipseTransformOrigin: `${Outline.svgRound(x)} ${Outline.svgRound(y)}`,
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

    // Update the ellipse coordinates
    const scaleX = (newWidth - 2 * marginX) / (width - 2 * marginX);
    const scaleY = (newHeight - 2 * marginY) / (height - 2 * marginY);
    const [cx, cy, rx, ry] = this.#ellipse;

    // Update center position
    const oldCenterX = x + width / 2;
    const oldCenterY = y + height / 2;
    const newCenterX = newX + newWidth / 2;
    const newCenterY = newY + newHeight / 2;

    this.#ellipse[0] = cx - oldCenterX + newCenterX;
    this.#ellipse[1] = cy - oldCenterY + newCenterY;
    this.#ellipse[2] = rx * scaleX;
    this.#ellipse[3] = ry * scaleY;

    return {
      root: {
        viewBox: this.viewBox,
      },
      ellipse: this.#getEllipseSVGProperties(),
      ellipseTransformOrigin: `${Outline.svgRound(newX)} ${Outline.svgRound(newY)}`,
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
      this.#ellipse[0] += tx;
      this.#ellipse[1] += ty;
    } else {
      // Translation with parent dimension change
      const sx = this.#parentWidth / newParentWidth;
      const sy = this.#parentHeight / newParentHeight;
      this.#parentWidth = newParentWidth;
      this.#parentHeight = newParentHeight;

      this.#ellipse[0] = tx + this.#ellipse[0] * sx;
      this.#ellipse[1] = ty + this.#ellipse[1] * sy;
      this.#ellipse[2] *= sx;
      this.#ellipse[3] *= sy;
      bbox[2] *= sx;
      bbox[3] *= sy;
    }
    bbox[0] = newX;
    bbox[1] = newY;

    return {
      root: {
        viewBox: this.viewBox,
      },
      ellipse: this.#getEllipseSVGProperties(),
      ellipseTransformOrigin: `${Outline.svgRound(newX)} ${Outline.svgRound(newY)}`,
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
      ellipse: this.#getEllipseSVGProperties(),
      ellipseTransformOrigin: `${Outline.svgRound(bbox[0])} ${Outline.svgRound(bbox[1])}`,
      transform: this.rotationTransform || null,
      bbox,
    };
  }
}

export { CircDrawOutline, CircDrawOutliner };
