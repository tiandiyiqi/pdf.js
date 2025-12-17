/* Copyright 2023 Mozilla Foundation
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

import { DOMSVGFactory } from "./svg_factory.js";
import { shadow } from "../shared/util.js";

/**
 * Manage the SVGs drawn on top of the page canvas.
 * It's important to have them directly on top of the canvas because we want to
 * be able to use mix-blend-mode for some of them.
 */
class DrawLayer {
  #parent = null;

  #mapping = new Map();

  #toUpdate = new Map();

  static #id = 0;

  constructor({ pageIndex }) {
    this.pageIndex = pageIndex;
  }

  setParent(parent) {
    if (!this.#parent) {
      this.#parent = parent;
      return;
    }

    if (this.#parent !== parent) {
      if (this.#mapping.size > 0) {
        for (const root of this.#mapping.values()) {
          root.remove();
          parent.append(root);
        }
      }
      this.#parent = parent;
    }
  }

  static get _svgFactory() {
    return shadow(this, "_svgFactory", new DOMSVGFactory());
  }

  static #setBox(element, [x, y, width, height]) {
    const { style } = element;
    style.top = `${100 * y}%`;
    style.left = `${100 * x}%`;
    style.width = `${100 * width}%`;
    style.height = `${100 * height}%`;
  }

  #createSVG() {
    const svg = DrawLayer._svgFactory.create(1, 1, /* skipDimensions = */ true);
    this.#parent.append(svg);
    svg.setAttribute("aria-hidden", true);

    return svg;
  }

  #createClipPath(defs, pathId) {
    const clipPath = DrawLayer._svgFactory.createElement("clipPath");
    defs.append(clipPath);
    const clipPathId = `clip_${pathId}`;
    clipPath.setAttribute("id", clipPathId);
    clipPath.setAttribute("clipPathUnits", "objectBoundingBox");
    const clipPathUse = DrawLayer._svgFactory.createElement("use");
    clipPath.append(clipPathUse);
    clipPathUse.setAttribute("href", `#${pathId}`);
    clipPathUse.classList.add("clip");

    return clipPathId;
  }

  #updateProperties(element, properties) {
    for (const [key, value] of Object.entries(properties)) {
      if (value === null) {
        element.removeAttribute(key);
      } else {
        element.setAttribute(key, value);
      }
    }
  }

  draw(properties, isPathUpdatable = false, hasClip = false) {
    const id = DrawLayer.#id++;
    const root = this.#createSVG();

    const defs = DrawLayer._svgFactory.createElement("defs");
    root.append(defs);

    // Determine element type: rect, ellipse, or path
    let elementType;
    if (properties.rect !== undefined) {
      elementType = "rect";
    } else if (properties.ellipse !== undefined) {
      elementType = "ellipse";
    } else {
      elementType = "path";
    }

    const element = DrawLayer._svgFactory.createElement(elementType);
    defs.append(element);
    const elementId = `${elementType}_p${this.pageIndex}_${id}`;
    element.setAttribute("id", elementId);
    element.setAttribute("vector-effect", "non-scaling-stroke");

    // For arrows, also create a line element
    if (properties.line !== undefined) {
      const lineElement = DrawLayer._svgFactory.createElement("line");
      defs.append(lineElement);
      const lineId = `line_p${this.pageIndex}_${id}`;
      lineElement.setAttribute("id", lineId);
      lineElement.setAttribute("vector-effect", "non-scaling-stroke");

      const lineUse = DrawLayer._svgFactory.createElement("use");
      root.append(lineUse);
      lineUse.setAttribute("href", `#${lineId}`);
    }

    if (isPathUpdatable) {
      this.#toUpdate.set(id, element);
    }

    // Create the clipping path for the editor div.
    const clipPathId = hasClip ? this.#createClipPath(defs, elementId) : null;

    const use = DrawLayer._svgFactory.createElement("use");
    root.append(use);
    use.setAttribute("href", `#${elementId}`);
    this.updateProperties(root, properties);

    this.#mapping.set(id, root);

    return { id, clipPathId: `url(#${clipPathId})` };
  }

  drawOutline(properties, mustRemoveSelfIntersections) {
    // We cannot draw the outline directly in the SVG for highlights because
    // it composes with its parent with mix-blend-mode: multiply.
    // But the outline has a different mix-blend-mode, so we need to draw it in
    // its own SVG.
    const id = DrawLayer.#id++;
    const root = this.#createSVG();
    const defs = DrawLayer._svgFactory.createElement("defs");
    root.append(defs);
    const path = DrawLayer._svgFactory.createElement("path");
    defs.append(path);
    const pathId = `path_p${this.pageIndex}_${id}`;
    path.setAttribute("id", pathId);
    path.setAttribute("vector-effect", "non-scaling-stroke");

    let maskId;
    if (mustRemoveSelfIntersections) {
      const mask = DrawLayer._svgFactory.createElement("mask");
      defs.append(mask);
      maskId = `mask_p${this.pageIndex}_${id}`;
      mask.setAttribute("id", maskId);
      mask.setAttribute("maskUnits", "objectBoundingBox");
      const rect = DrawLayer._svgFactory.createElement("rect");
      mask.append(rect);
      rect.setAttribute("width", "1");
      rect.setAttribute("height", "1");
      rect.setAttribute("fill", "white");
      const use = DrawLayer._svgFactory.createElement("use");
      mask.append(use);
      use.setAttribute("href", `#${pathId}`);
      use.setAttribute("stroke", "none");
      use.setAttribute("fill", "black");
      use.setAttribute("fill-rule", "nonzero");
      use.classList.add("mask");
    }

    const use1 = DrawLayer._svgFactory.createElement("use");
    root.append(use1);
    use1.setAttribute("href", `#${pathId}`);
    if (maskId) {
      use1.setAttribute("mask", `url(#${maskId})`);
    }
    const use2 = use1.cloneNode();
    root.append(use2);
    use1.classList.add("mainOutline");
    use2.classList.add("secondaryOutline");

    this.updateProperties(root, properties);

    this.#mapping.set(id, root);

    return id;
  }

  finalizeDraw(id, properties) {
    this.#toUpdate.delete(id);
    this.updateProperties(id, properties);
  }

  updateProperties(elementOrId, properties) {
    if (!properties) {
      return;
    }
    const {
      root,
      bbox,
      rootClass,
      path,
      rect,
      rectTransformOrigin,
      ellipse,
      ellipseTransformOrigin,
      line,
      lineTransformOrigin,
      pathTransformOrigin,
      transform,
    } = properties;
    const element =
      typeof elementOrId === "number"
        ? this.#mapping.get(elementOrId)
        : elementOrId;
    if (!element) {
      return;
    }
    if (root) {
      this.#updateProperties(element, root);
    }
    if (bbox) {
      DrawLayer.#setBox(element, bbox);
    }
    if (rootClass) {
      const { classList } = element;
      for (const [className, value] of Object.entries(rootClass)) {
        classList.toggle(className, value);
      }
    }
    if (path) {
      const defs = element.firstElementChild;
      const pathElement = defs.querySelector("path");
      if (pathElement) {
        this.#updateProperties(pathElement, path);
      }
    }
    if (rect) {
      const defs = element.firstElementChild;
      const rectElement = defs.querySelector("rect");
      if (rectElement) {
        this.#updateProperties(rectElement, rect);
      }
    }
    if (ellipse) {
      const defs = element.firstElementChild;
      const ellipseElement = defs.querySelector("ellipse");
      if (ellipseElement) {
        this.#updateProperties(ellipseElement, ellipse);
      }
    }
    if (line) {
      const defs = element.firstElementChild;
      const lineElement = defs.querySelector("line");
      if (lineElement) {
        this.#updateProperties(lineElement, line);
      }
    }
    if (rectTransformOrigin) {
      const use = element.querySelector("use[href*='rect']");
      if (use) {
        use.style.transformOrigin = rectTransformOrigin;
      }
    }
    if (ellipseTransformOrigin) {
      const use = element.querySelector("use[href*='ellipse']");
      if (use) {
        use.style.transformOrigin = ellipseTransformOrigin;
      }
    }
    if (lineTransformOrigin) {
      const use = element.querySelector("use[href*='line']");
      if (use) {
        use.style.transformOrigin = lineTransformOrigin;
      }
    }
    if (pathTransformOrigin) {
      const use = element.querySelector("use[href*='path']");
      if (use) {
        use.style.transformOrigin = pathTransformOrigin;
      }
    }
    if (transform !== undefined) {
      const uses = element.querySelectorAll("use");
      for (const use of uses) {
        use.setAttribute("transform", transform || "");
      }
    }
  }

  updateParent(id, layer) {
    if (layer === this) {
      return;
    }
    const root = this.#mapping.get(id);
    if (!root) {
      return;
    }
    layer.#parent.append(root);
    this.#mapping.delete(id);
    layer.#mapping.set(id, root);
  }

  remove(id) {
    this.#toUpdate.delete(id);
    if (this.#parent === null) {
      return;
    }
    this.#mapping.get(id).remove();
    this.#mapping.delete(id);
  }

  destroy() {
    this.#parent = null;
    for (const root of this.#mapping.values()) {
      root.remove();
    }
    this.#mapping.clear();
    this.#toUpdate.clear();
  }
}

export { DrawLayer };
