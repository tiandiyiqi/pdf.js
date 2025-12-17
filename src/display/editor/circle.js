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

import {
  AnnotationEditorParamsType,
  AnnotationEditorType,
  shadow,
  Util,
} from "../../shared/util.js";
import { DrawingEditor, DrawingOptions } from "./draw.js";
import { CircDrawOutline, CircDrawOutliner } from "./drawers/circledraw.js";
import { AnnotationEditor } from "./editor.js";
import { BasicColorPicker } from "./color_picker.js";
import { SquareAnnotationElement } from "../annotation_layer.js";

/**
 * Drawing options specific to circle annotations.
 */
class CircDrawingOptions extends DrawingOptions {
  constructor(viewerParameters) {
    super();
    this._viewParameters = viewerParameters;

    super.updateProperties({
      fill: "none",
      stroke: "#ff0000", // 默认红色
      "stroke-opacity": 1,
      "stroke-width": 1,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    });
  }

  updateSVGProperty(name, value) {
    if (name === "stroke-width") {
      value ??= this["stroke-width"];
      value *= this._viewParameters.realScale;
    }
    super.updateSVGProperty(name, value);
  }

  clone() {
    const clone = new CircDrawingOptions(this._viewParameters);
    clone.updateAll(this);
    return clone;
  }
}

/**
 * Circle drawing editor for creating circular/elliptical annotations.
 */
class CircleEditor extends DrawingEditor {
  static _type = "circle";

  static _editorType = AnnotationEditorType.GEOSHAPE;

  static _defaultDrawingOptions = null;

  constructor(params) {
    super({ ...params, name: "circleEditor" });
    this._willKeepAspectRatio = false; // Allow ellipse (8 handles)
    this.defaultL10nId = "pdfjs-editor-circle-editor";
  }

  /** @inheritdoc */
  static initialize(l10n, uiManager) {
    AnnotationEditor.initialize(l10n, uiManager);
    this._defaultDrawingOptions = new CircDrawingOptions(
      uiManager.viewParameters
    );
  }

  /** @inheritdoc */
  static getDefaultDrawingOptions(options) {
    const clone = this._defaultDrawingOptions.clone();
    clone.updateProperties(options);
    return clone;
  }

  /** @inheritdoc */
  static get supportMultipleDrawings() {
    return false;
  }

  /** @inheritdoc */
  static get typesMap() {
    return shadow(
      this,
      "typesMap",
      new Map([
        [AnnotationEditorParamsType.CIRCLE_THICKNESS, "stroke-width"],
        [AnnotationEditorParamsType.CIRCLE_COLOR, "stroke"],
        [AnnotationEditorParamsType.CIRCLE_OPACITY, "stroke-opacity"],
      ])
    );
  }

  /** @inheritdoc */
  static createDrawerInstance(x, y, parentWidth, parentHeight, rotation) {
    return new CircDrawOutliner(
      x,
      y,
      parentWidth,
      parentHeight,
      rotation,
      this._defaultDrawingOptions["stroke-width"]
    );
  }

  /** @inheritdoc */
  static deserializeDraw(
    pageX,
    pageY,
    pageWidth,
    pageHeight,
    innerMargin,
    data
  ) {
    return CircDrawOutline.deserialize(
      pageX,
      pageY,
      pageWidth,
      pageHeight,
      innerMargin,
      data
    );
  }

  /** @inheritdoc */
  static async deserialize(data, parent, uiManager) {
    let initialData = null;
    if (data instanceof SquareAnnotationElement) {
      const {
        data: {
          rect,
          rotation,
          id,
          color,
          opacity,
          borderStyle: { rawWidth: thickness },
          popupRef,
          richText,
          contentsObj,
          creationDate,
          modificationDate,
        },
        parent: {
          page: { pageNumber },
        },
      } = data;

      // Convert rect to ellipseData (center and radii)
      const [x1, y1, x2, y2] = rect;
      const cx = (x1 + x2) / 2;
      const cy = (y1 + y2) / 2;
      const rx = Math.abs(x2 - x1) / 2;
      const ry = Math.abs(y2 - y1) / 2;
      const ellipseData = new Float32Array([cx, cy, rx, ry]);

      initialData = data = {
        annotationType: AnnotationEditorType.GEOSHAPE,
        color: Array.from(color),
        thickness,
        opacity,
        rect: rect.slice(0),
        ellipseData,
        pageIndex: pageNumber - 1,
        rotation,
        annotationElementId: id,
        id,
        deleted: false,
        popupRef,
        richText,
        comment: contentsObj?.str || null,
        creationDate,
        modificationDate,
      };
    }

    const editor = await super.deserialize(data, parent, uiManager);
    editor._initialData = initialData;
    if (data.comment) {
      editor.setCommentData(data);
    }

    return editor;
  }

  /** @inheritdoc */
  get toolbarButtons() {
    this._colorPicker ||= new BasicColorPicker(this);
    return [["colorPicker", this._colorPicker]];
  }

  get colorType() {
    return AnnotationEditorParamsType.CIRCLE_COLOR;
  }

  get color() {
    return this._drawingOptions.stroke;
  }

  get opacity() {
    return this._drawingOptions["stroke-opacity"];
  }

  /** @inheritdoc */
  onScaleChanging() {
    if (!this.parent) {
      return;
    }
    super.onScaleChanging();
    const { _drawId, _drawingOptions, parent } = this;
    _drawingOptions.updateSVGProperty("stroke-width");
    parent.drawLayer.updateProperties(
      _drawId,
      _drawingOptions.toSVGProperties()
    );
  }

  static onScaleChangingWhenDrawing() {
    const parent = this._currentParent;
    if (!parent) {
      return;
    }
    super.onScaleChangingWhenDrawing();
    this._defaultDrawingOptions.updateSVGProperty("stroke-width");
    parent.drawLayer.updateProperties(
      this._currentDrawId,
      this._defaultDrawingOptions.toSVGProperties()
    );
  }

  /** @inheritdoc */
  createDrawingOptions({ color, thickness, opacity }) {
    this._drawingOptions = CircleEditor.getDefaultDrawingOptions({
      stroke: Util.makeHexColor(...color),
      "stroke-width": thickness,
      "stroke-opacity": opacity,
    });
  }

  /** @inheritdoc */
  serialize(isForCopying = false) {
    if (this.isEmpty()) {
      return null;
    }

    if (this.deleted) {
      return this.serializeDeleted();
    }

    const { rect, ellipseData } = this.serializeDraw(isForCopying);
    const {
      _drawingOptions: {
        stroke,
        "stroke-opacity": opacity,
        "stroke-width": thickness,
      },
    } = this;
    const serialized = Object.assign(super.serialize(isForCopying), {
      color: AnnotationEditor._colorManager.convert(stroke),
      opacity,
      thickness,
      rect,
      ellipseData,
    });
    this.addComment(serialized);

    if (isForCopying) {
      serialized.isCopy = true;
      return serialized;
    }

    if (this.annotationElementId && !this.#hasElementChanged(serialized)) {
      return null;
    }

    serialized.id = this.annotationElementId;
    return serialized;
  }

  #hasElementChanged(serialized) {
    if (!this._initialData) {
      return true;
    }
    const { color, thickness, opacity, pageIndex } = this._initialData;
    return (
      this.hasEditedComment ||
      this._hasBeenMoved ||
      this._hasBeenResized ||
      serialized.color.some((c, i) => c !== color[i]) ||
      serialized.thickness !== thickness ||
      serialized.opacity !== opacity ||
      serialized.pageIndex !== pageIndex
    );
  }

  /** @inheritdoc */
  renderAnnotationElement(annotation) {
    if (this.deleted) {
      annotation.hide();
      return null;
    }
    const { rect } = this.serializeDraw(/* isForCopying = */ false);
    annotation.updateEdited({
      rect,
      thickness: this._drawingOptions["stroke-width"],
      popup: this.comment,
    });

    return null;
  }
}

export { CircDrawingOptions, CircleEditor };
