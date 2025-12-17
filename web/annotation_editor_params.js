/* Copyright 2022 Mozilla Foundation
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

/** @typedef {import("./event_utils.js").EventBus} EventBus */

import { AnnotationEditorParamsType } from "pdfjs-lib";

/**
 * @typedef {Object} AnnotationEditorParamsOptions
 * @property {HTMLInputElement} editorFreeTextFontSize
 * @property {HTMLInputElement} editorFreeTextColor
 * @property {HTMLInputElement} editorInkColor
 * @property {HTMLInputElement} editorInkThickness
 * @property {HTMLInputElement} editorInkOpacity
 * @property {HTMLInputElement} editorGeoShapeColor
 * @property {HTMLInputElement} editorGeoShapeThickness
 * @property {HTMLInputElement} editorGeoShapeOpacity
 * @property {HTMLButtonElement} editorStampAddImage
 * @property {HTMLInputElement} editorFreeHighlightThickness
 * @property {HTMLButtonElement} editorHighlightShowAll
 * @property {HTMLButtonElement} editorSignatureAddSignature
 */

class AnnotationEditorParams {
  #currentGeoShapeType = "geoshapeRect"; // Track current geoshape tool type

  /**
   * @param {AnnotationEditorParamsOptions} options
   * @param {EventBus} eventBus
   */
  constructor(options, eventBus) {
    this.eventBus = eventBus;
    this.#bindListeners(options);
    // Listen for geoshape tool changes to track current tool type
    this.eventBus.on("geoshapetoolchanged", ({ shapeType }) => {
      this.#currentGeoShapeType = shapeType;
    });
  }

  /**
   * @param {AnnotationEditorParamsOptions} options
   */
  #bindListeners({
    editorFreeTextFontSize,
    editorFreeTextColor,
    editorInkColor,
    editorInkThickness,
    editorInkOpacity,
    editorGeoShapeColor,
    editorGeoShapeThickness,
    editorGeoShapeOpacity,
    editorStampAddImage,
    editorFreeHighlightThickness,
    editorHighlightShowAll,
    editorSignatureAddSignature,
  }) {
    const { eventBus } = this;

    const dispatchEvent = (typeStr, value) => {
      eventBus.dispatch("switchannotationeditorparams", {
        source: this,
        type: AnnotationEditorParamsType[typeStr],
        value,
      });
    };
    editorFreeTextFontSize.addEventListener("input", function () {
      dispatchEvent("FREETEXT_SIZE", this.valueAsNumber);
    });
    editorFreeTextColor.addEventListener("input", function () {
      dispatchEvent("FREETEXT_COLOR", this.value);
    });
    editorInkColor.addEventListener("input", function () {
      dispatchEvent("INK_COLOR", this.value);
    });
    editorInkThickness.addEventListener("input", function () {
      dispatchEvent("INK_THICKNESS", this.valueAsNumber);
    });
    editorInkOpacity.addEventListener("input", function () {
      dispatchEvent("INK_OPACITY", this.valueAsNumber);
    });
    if (editorGeoShapeColor) {
      editorGeoShapeColor.addEventListener("input", () => {
        const paramType = this.#getGeoShapeColorParam();
        dispatchEvent(paramType, editorGeoShapeColor.value);
      });
    }
    if (editorGeoShapeThickness) {
      editorGeoShapeThickness.addEventListener("input", () => {
        const paramType = this.#getGeoShapeThicknessParam();
        dispatchEvent(paramType, editorGeoShapeThickness.valueAsNumber);
      });
    }
    if (editorGeoShapeOpacity) {
      editorGeoShapeOpacity.addEventListener("input", () => {
        const paramType = this.#getGeoShapeOpacityParam();
        dispatchEvent(paramType, editorGeoShapeOpacity.valueAsNumber);
      });
    }
    editorStampAddImage.addEventListener("click", () => {
      eventBus.dispatch("reporttelemetry", {
        source: this,
        details: {
          type: "editing",
          data: { action: "pdfjs.image.add_image_click" },
        },
      });
      dispatchEvent("CREATE");
    });
    editorFreeHighlightThickness.addEventListener("input", function () {
      dispatchEvent("HIGHLIGHT_THICKNESS", this.valueAsNumber);
    });
    editorHighlightShowAll.addEventListener("click", function () {
      const checked = this.getAttribute("aria-pressed") === "true";
      this.setAttribute("aria-pressed", !checked);
      dispatchEvent("HIGHLIGHT_SHOW_ALL", !checked);
    });
    editorSignatureAddSignature.addEventListener("click", () => {
      dispatchEvent("CREATE");
    });

    eventBus._on("annotationeditorparamschanged", evt => {
      for (const [type, value] of evt.details) {
        switch (type) {
          case AnnotationEditorParamsType.FREETEXT_SIZE:
            editorFreeTextFontSize.value = value;
            break;
          case AnnotationEditorParamsType.FREETEXT_COLOR:
            editorFreeTextColor.value = value;
            break;
          case AnnotationEditorParamsType.INK_COLOR:
            editorInkColor.value = value;
            break;
          case AnnotationEditorParamsType.INK_THICKNESS:
            editorInkThickness.value = value;
            break;
          case AnnotationEditorParamsType.INK_OPACITY:
            editorInkOpacity.value = value;
            break;
          case AnnotationEditorParamsType.RECTANGLE_COLOR:
          case AnnotationEditorParamsType.CIRCLE_COLOR:
          case AnnotationEditorParamsType.ARROW_COLOR:
            if (editorGeoShapeColor) {
              editorGeoShapeColor.value = value;
            }
            break;
          case AnnotationEditorParamsType.RECTANGLE_THICKNESS:
          case AnnotationEditorParamsType.CIRCLE_THICKNESS:
          case AnnotationEditorParamsType.ARROW_THICKNESS:
            if (editorGeoShapeThickness) {
              editorGeoShapeThickness.value = value;
            }
            break;
          case AnnotationEditorParamsType.RECTANGLE_OPACITY:
          case AnnotationEditorParamsType.CIRCLE_OPACITY:
          case AnnotationEditorParamsType.ARROW_OPACITY:
            if (editorGeoShapeOpacity) {
              editorGeoShapeOpacity.value = value;
            }
            break;
          case AnnotationEditorParamsType.HIGHLIGHT_COLOR:
            eventBus.dispatch("mainhighlightcolorpickerupdatecolor", {
              source: this,
              value,
            });
            break;
          case AnnotationEditorParamsType.HIGHLIGHT_THICKNESS:
            editorFreeHighlightThickness.value = value;
            break;
          case AnnotationEditorParamsType.HIGHLIGHT_FREE:
            editorFreeHighlightThickness.disabled = !value;
            break;
          case AnnotationEditorParamsType.HIGHLIGHT_SHOW_ALL:
            editorHighlightShowAll.setAttribute("aria-pressed", value);
            break;
        }
      }
    });
  }

  /**
   * Get the appropriate color parameter type based on current geoshape tool
   */
  #getGeoShapeColorParam() {
    switch (this.#currentGeoShapeType) {
      case "geoshapeCirc":
        return "CIRCLE_COLOR";
      case "geoshapeArrow":
        return "ARROW_COLOR";
      case "geoshape":
      case "geoshapeRect":
      default:
        return "RECTANGLE_COLOR";
    }
  }

  /**
   * Get the appropriate thickness parameter type based on current geoshape tool
   */
  #getGeoShapeThicknessParam() {
    switch (this.#currentGeoShapeType) {
      case "geoshapeCirc":
        return "CIRCLE_THICKNESS";
      case "geoshapeArrow":
        return "ARROW_THICKNESS";
      case "geoshape":
      case "geoshapeRect":
      default:
        return "RECTANGLE_THICKNESS";
    }
  }

  /**
   * Get the appropriate opacity parameter type based on current geoshape tool
   */
  #getGeoShapeOpacityParam() {
    switch (this.#currentGeoShapeType) {
      case "geoshapeCirc":
        return "CIRCLE_OPACITY";
      case "geoshapeArrow":
        return "ARROW_OPACITY";
      case "geoshape":
      case "geoshapeRect":
      default:
        return "RECTANGLE_OPACITY";
    }
  }
}

export { AnnotationEditorParams };
