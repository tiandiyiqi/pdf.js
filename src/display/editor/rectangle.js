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
import { RectDrawOutline, RectDrawOutliner } from "./drawers/rectangledraw.js";
import { AnnotationEditor } from "./editor.js";
import { BasicColorPicker } from "./color_picker.js";
import { SquareAnnotationElement } from "../annotation_layer.js";

/**
 * Drawing options specific to rectangle annotations.
 */
class RectDrawingOptions extends DrawingOptions {
  constructor(viewerParameters) {
    super();
    this._viewParameters = viewerParameters;

    super.updateProperties({
      fill: "none",
      stroke: AnnotationEditor._defaultLineColor,
      "stroke-opacity": 1,
      "stroke-width": 1,
      "stroke-linecap": "square",
      "stroke-linejoin": "miter",
      "stroke-miterlimit": 10,
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
    const clone = new RectDrawingOptions(this._viewParameters);
    clone.updateAll(this);
    return clone;
  }
}

/**
 * Rectangle drawing editor for creating rectangular annotations.
 */
class RectangleEditor extends DrawingEditor {
  static _type = "rectangle";

  static _editorType = AnnotationEditorType.GEOSHAPE;

  static _defaultDrawingOptions = null;

  constructor(params) {
    super({ ...params, name: "rectangleEditor" });
    this._willKeepAspectRatio = false;
    this.defaultL10nId = "pdfjs-editor-rectangle-editor";
  }

  /** @inheritdoc */
  static initialize(l10n, uiManager) {
    AnnotationEditor.initialize(l10n, uiManager);
    this._defaultDrawingOptions = new RectDrawingOptions(
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
        [AnnotationEditorParamsType.RECTANGLE_THICKNESS, "stroke-width"],
        [AnnotationEditorParamsType.RECTANGLE_COLOR, "stroke"],
        [AnnotationEditorParamsType.RECTANGLE_OPACITY, "stroke-opacity"],
      ])
    );
  }

  /** @inheritdoc */
  static createDrawerInstance(x, y, parentWidth, parentHeight, rotation) {
    return new RectDrawOutliner(
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
    return RectDrawOutline.deserialize(
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

      // Convert rect to rectData (normalized coordinates)
      // For now, we'll use a simplified conversion
      const [x1, y1, x2, y2] = rect;
      const rectData = new Float32Array([
        Math.min(x1, x2),
        Math.min(y1, y2),
        Math.abs(x2 - x1),
        Math.abs(y2 - y1),
      ]);

      initialData = data = {
        annotationType: AnnotationEditorType.GEOSHAPE,
        color: Array.from(color),
        thickness,
        opacity,
        rect: rect.slice(0),
        rectData,
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
    return AnnotationEditorParamsType.RECTANGLE_COLOR;
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
    this._drawingOptions = RectangleEditor.getDefaultDrawingOptions({
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

    const { rect, rectData } = this.serializeDraw(isForCopying);
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
      rectData,
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

export { RectDrawingOptions, RectangleEditor };
