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
 * Manages the real-time drawing process for arrow annotations.
 * Tracks the start and end points, normalizes coordinates, and generates SVG properties.
 */
class ArrowDrawOutliner {
  #startX;

  #startY;

  #endX;

  #endY;

  #parentWidth;

  #parentHeight;

  #rotation;

  #thickness;

  #headSize = 0.02; // Default arrow head size (2% of viewport)

  #outlines = new ArrowDrawOutline();

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
   * Update property of the arrow (e.g., stroke-width, arrow-head-size).
   */
  updateProperty(name, value) {
    if (name === "stroke-width") {
      this.#thickness = value;
    } else if (name === "arrow-head-size") {
      this.#headSize = value;
    }
  }

  /**
   * Check if the arrow is empty (too small to be valid).
   */
  isEmpty() {
    const threshold = 0.005; // ~5px in a 1000px viewport
    const dx = this.#endX - this.#startX;
    const dy = this.#endY - this.#startY;
    const length = Math.sqrt(dx * dx + dy * dy);
    return length < threshold;
  }

  /**
   * Check if the drawing can be cancelled (very small arrow).
   */
  isCancellable() {
    return this.isEmpty();
  }

  /**
   * Add a point (alias for update for arrow drawing).
   * This method is called by DrawingEditor._drawMove during drawing.
   */
  add(x, y) {
    return this.update(x, y);
  }

  /**
   * Update the end point of the arrow as the user drags.
   */
  update(x, y) {
    [this.#endX, this.#endY] = this.#normalizePoint(x, y);

    return this.#getCurrentArrowSVGProperties();
  }

  /**
   * End the drawing process.
   */
  end(x, y) {
    [this.#endX, this.#endY] = this.#normalizePoint(x, y);

    return this.#getCurrentArrowSVGProperties();
  }

  /**
   * Calculate arrow head coordinates.
   */
  #calculateArrowHead() {
    const dx = this.#endX - this.#startX;
    const dy = this.#endY - this.#startY;
    const angle = Math.atan2(dy, dx);
    const headLength = this.#headSize;
    const headAngle = Math.PI / 6; // 30 degrees

    // Calculate the two wing points of the arrow head
    const wing1X = this.#endX - headLength * Math.cos(angle - headAngle);
    const wing1Y = this.#endY - headLength * Math.sin(angle - headAngle);
    const wing2X = this.#endX - headLength * Math.cos(angle + headAngle);
    const wing2Y = this.#endY - headLength * Math.sin(angle + headAngle);

    return { wing1X, wing1Y, wing2X, wing2Y };
  }

  /**
   * Generate SVG properties for the current arrow state.
   */
  #getCurrentArrowSVGProperties() {
    const { wing1X, wing1Y, wing2X, wing2Y } = this.#calculateArrowHead();

    return {
      line: {
        x1: Outline.svgRound(this.#startX),
        y1: Outline.svgRound(this.#startY),
        x2: Outline.svgRound(this.#endX),
        y2: Outline.svgRound(this.#endY),
      },
      path: {
        d: `M${Outline.svgRound(this.#endX)} ${Outline.svgRound(this.#endY)}L${Outline.svgRound(wing1X)} ${Outline.svgRound(wing1Y)}L${Outline.svgRound(wing2X)} ${Outline.svgRound(wing2Y)}Z`,
      },
    };
  }

  /**
   * Get the final outlines for the arrow.
   */
  getOutlines(parentWidth, parentHeight, scale, innerMargin) {
    this.#outlines.build(
      [this.#startX, this.#startY, this.#endX, this.#endY, this.#headSize],
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
   * Default SVG properties for the arrow drawing.
   */
  get defaultSVGProperties() {
    const props = this.#getCurrentArrowSVGProperties();
    return {
      root: {
        viewBox: "0 0 10000 10000",
      },
      rootClass: {
        draw: true,
      },
      ...props,
      bbox: [0, 0, 1, 1],
    };
  }
}

/**
 * Stores the finalized arrow outline data.
 * Manages bounding box calculation, serialization, and transformations.
 */
class ArrowDrawOutline extends Outline {
  #bbox;

  #currentRotation = 0;

  #innerMargin;

  #arrow; // [startX, startY, endX, endY, headSize] in normalized coordinates

  #parentWidth;

  #parentHeight;

  #parentScale;

  #rotation;

  #thickness;

  /**
   * Build the outline from normalized arrow coordinates.
   */
  build(
    arrow,
    parentWidth,
    parentHeight,
    parentScale,
    rotation,
    thickness,
    innerMargin
  ) {
    this.#arrow = new Float32Array(arrow);
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
   * Calculate arrow head coordinates.
   */
  #calculateArrowHead() {
    const [startX, startY, endX, endY, headSize] = this.#arrow;
    const dx = endX - startX;
    const dy = endY - startY;
    const angle = Math.atan2(dy, dx);
    const headLength = headSize;
    const headAngle = Math.PI / 6; // 30 degrees

    const wing1X = endX - headLength * Math.cos(angle - headAngle);
    const wing1Y = endY - headLength * Math.sin(angle - headAngle);
    const wing2X = endX - headLength * Math.cos(angle + headAngle);
    const wing2Y = endY - headLength * Math.sin(angle + headAngle);

    return { wing1X, wing1Y, wing2X, wing2Y };
  }

  /**
   * Generate SVG path representation.
   */
  toSVGPath() {
    const [startX, startY, endX, endY] = this.#arrow;
    const { wing1X, wing1Y, wing2X, wing2Y } = this.#calculateArrowHead();

    // Combine line and arrow head into one path
    return (
      `M${Outline.svgRound(startX)} ${Outline.svgRound(startY)}` +
      `L${Outline.svgRound(endX)} ${Outline.svgRound(endY)}` +
      `M${Outline.svgRound(endX)} ${Outline.svgRound(endY)}` +
      `L${Outline.svgRound(wing1X)} ${Outline.svgRound(wing1Y)}` +
      `L${Outline.svgRound(wing2X)} ${Outline.svgRound(wing2Y)}Z`
    );
  }

  /**
   * Serialize the arrow for saving.
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
      arrowData: this.#arrow.slice(),
    };
  }

  /**
   * Deserialize an arrow from saved data.
   */
  static deserialize(
    pageX,
    pageY,
    pageWidth,
    pageHeight,
    innerMargin,
    { arrowData, rotation, thickness }
  ) {
    const outline = new this();
    outline.build(
      arrowData,
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
    const [startX, startY, endX, endY, headSize] = this.#arrow;
    const { wing1X, wing1Y, wing2X, wing2Y } = this.#calculateArrowHead();

    // Find bounding box of all points (start, end, and arrow head wings)
    const minX = Math.min(startX, endX, wing1X, wing2X);
    const minY = Math.min(startY, endY, wing1Y, wing2Y);
    const maxX = Math.max(startX, endX, wing1X, wing2X);
    const maxY = Math.max(startY, endY, wing1Y, wing2Y);

    const x = minX;
    const y = minY;
    const width = maxX - minX;
    const height = maxY - minY;

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
   * Update a property (e.g., stroke-width, arrow-head-size).
   */
  updateProperty(name, value) {
    if (name === "stroke-width") {
      return this.#updateThickness(value);
    } else if (name === "arrow-head-size") {
      this.#arrow[4] = value;
      this.#computeBbox();
      return this.#bbox;
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
      ...this.#getArrowSVGProperties(),
      transform: this.rotationTransform,
    };
  }

  /**
   * Get current arrow SVG properties.
   */
  #getArrowSVGProperties() {
    const [startX, startY, endX, endY] = this.#arrow;
    const { wing1X, wing1Y, wing2X, wing2Y } = this.#calculateArrowHead();

    return {
      line: {
        x1: Outline.svgRound(startX),
        y1: Outline.svgRound(startY),
        x2: Outline.svgRound(endX),
        y2: Outline.svgRound(endY),
      },
      path: {
        d: `M${Outline.svgRound(endX)} ${Outline.svgRound(endY)}L${Outline.svgRound(wing1X)} ${Outline.svgRound(wing1Y)}L${Outline.svgRound(wing2X)} ${Outline.svgRound(wing2Y)}Z`,
      },
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
      ...this.#getArrowSVGProperties(),
      lineTransformOrigin: `${Outline.svgRound(x)} ${Outline.svgRound(y)}`,
      pathTransformOrigin: `${Outline.svgRound(x)} ${Outline.svgRound(y)}`,
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
      // Center the arrow in the new bounding box
      const tx = newX + newWidth / 2 - (x + width / 2);
      const ty = newY + newHeight / 2 - (y + height / 2);
      return {
        lineTransformOrigin: `${Outline.svgRound(newX)} ${Outline.svgRound(newY)}`,
        pathTransformOrigin: `${Outline.svgRound(newX)} ${Outline.svgRound(newY)}`,
        transform: `${this.rotationTransform} translate(${tx} ${ty})`,
      };
    }

    const s1x = (newWidth - 2 * marginX) / (width - 2 * marginX);
    const s1y = (newHeight - 2 * marginY) / (height - 2 * marginY);
    const s2x = width / newWidth;
    const s2y = height / newHeight;

    return {
      lineTransformOrigin: `${Outline.svgRound(x)} ${Outline.svgRound(y)}`,
      pathTransformOrigin: `${Outline.svgRound(x)} ${Outline.svgRound(y)}`,
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

    // Update the arrow coordinates
    const scaleX = (newWidth - 2 * marginX) / (width - 2 * marginX);
    const scaleY = (newHeight - 2 * marginY) / (height - 2 * marginY);
    const [startX, startY, endX, endY, headSize] = this.#arrow;

    this.#arrow[0] = (startX - x - marginX) * scaleX + newX + marginX;
    this.#arrow[1] = (startY - y - marginY) * scaleY + newY + marginY;
    this.#arrow[2] = (endX - x - marginX) * scaleX + newX + marginX;
    this.#arrow[3] = (endY - y - marginY) * scaleY + newY + marginY;
    // Keep head size proportional
    this.#arrow[4] = headSize * Math.sqrt(scaleX * scaleY);

    return {
      root: {
        viewBox: this.viewBox,
      },
      ...this.#getArrowSVGProperties(),
      lineTransformOrigin: `${Outline.svgRound(newX)} ${Outline.svgRound(newY)}`,
      pathTransformOrigin: `${Outline.svgRound(newX)} ${Outline.svgRound(newY)}`,
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
      this.#arrow[0] += tx;
      this.#arrow[1] += ty;
      this.#arrow[2] += tx;
      this.#arrow[3] += ty;
    } else {
      // Translation with parent dimension change
      const sx = this.#parentWidth / newParentWidth;
      const sy = this.#parentHeight / newParentHeight;
      this.#parentWidth = newParentWidth;
      this.#parentHeight = newParentHeight;

      this.#arrow[0] = tx + this.#arrow[0] * sx;
      this.#arrow[1] = ty + this.#arrow[1] * sy;
      this.#arrow[2] = tx + this.#arrow[2] * sx;
      this.#arrow[3] = ty + this.#arrow[3] * sy;
      bbox[2] *= sx;
      bbox[3] *= sy;
    }
    bbox[0] = newX;
    bbox[1] = newY;

    return {
      root: {
        viewBox: this.viewBox,
      },
      ...this.#getArrowSVGProperties(),
      lineTransformOrigin: `${Outline.svgRound(newX)} ${Outline.svgRound(newY)}`,
      pathTransformOrigin: `${Outline.svgRound(newX)} ${Outline.svgRound(newY)}`,
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
      ...this.#getArrowSVGProperties(),
      lineTransformOrigin: `${Outline.svgRound(bbox[0])} ${Outline.svgRound(bbox[1])}`,
      pathTransformOrigin: `${Outline.svgRound(bbox[0])} ${Outline.svgRound(bbox[1])}`,
      transform: this.rotationTransform || null,
      bbox,
    };
  }
}

export { ArrowDrawOutline, ArrowDrawOutliner };
