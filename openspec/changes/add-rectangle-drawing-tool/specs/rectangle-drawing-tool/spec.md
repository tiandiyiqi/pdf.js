## ADDED Requirements

### Requirement: Rectangle Editor Class

The system SHALL provide a `RectangleEditor` class that extends `DrawingEditor` to enable rectangle drawing functionality in PDF documents.

#### Scenario: Rectangle editor initialization

- **WHEN** a `RectangleEditor` instance is created with required parameters
- **THEN** the editor SHALL inherit all base drawing capabilities from `DrawingEditor`
- **AND** the editor SHALL have `_type` set to `"rectangle"`
- **AND** the editor SHALL have `_editorType` set to `AnnotationEditorType.RECTANGLE`

#### Scenario: Rectangle editor registration

- **WHEN** the annotation editor layer is initialized
- **THEN** `RectangleEditor` SHALL be registered in the editor types map
- **AND** the system SHALL be able to create rectangle editors on demand

### Requirement: Rectangle Drawing Interaction

The system SHALL allow users to draw rectangles by dragging from a start point to an end point.

#### Scenario: Start rectangle drawing

- **WHEN** user performs pointerdown in rectangle editing mode
- **THEN** the system SHALL record the starting point coordinates
- **AND** the system SHALL create a `RectDrawOutliner` instance
- **AND** the system SHALL create an SVG rect element in the DrawLayer

#### Scenario: Update rectangle during dragging

- **WHEN** user moves pointer while drawing a rectangle
- **THEN** the system SHALL update the rectangle's width and height based on pointer position
- **AND** the SVG rect element SHALL be updated in real-time
- **AND** negative dimensions SHALL be normalized to maintain valid rectangle geometry

#### Scenario: Complete rectangle drawing

- **WHEN** user releases pointer after dragging
- **THEN** the system SHALL finalize the rectangle geometry
- **AND** if the rectangle dimensions are valid (width and height > minimum threshold)
- **THEN** a `RectangleEditor` instance SHALL be created and added to the layer
- **AND** the rectangle SHALL enter edit mode automatically

#### Scenario: Cancel invalid rectangle

- **WHEN** user releases pointer without sufficient dragging distance
- **THEN** the system SHALL NOT create a rectangle editor
- **AND** the temporary SVG element SHALL be removed
- **AND** the drawing session SHALL end cleanly

### Requirement: Rectangle Geometry Management

The system SHALL manage rectangle geometry using normalized coordinates and support transformations.

#### Scenario: Normalize rectangle coordinates

- **WHEN** a rectangle is being drawn or edited
- **THEN** all coordinates SHALL be normalized to the range [0, 1] relative to page dimensions
- **AND** the normalized coordinates SHALL account for page rotation

#### Scenario: Handle negative dimensions

- **WHEN** user drags from bottom-right to top-left
- **THEN** the system SHALL swap coordinates to ensure positive width and height
- **AND** the rectangle SHALL be displayed correctly regardless of drag direction

#### Scenario: Generate SVG attributes

- **WHEN** rectangle geometry needs to be rendered
- **THEN** the system SHALL convert normalized coordinates to SVG rect attributes (x, y, width, height)
- **AND** the system SHALL apply stroke, fill, and opacity properties
- **AND** the viewBox SHALL be calculated to fit the rectangle bounds

### Requirement: Rectangle Drawing Options

The system SHALL provide configurable drawing options for rectangle appearance.

#### Scenario: Initialize default drawing options

- **WHEN** a rectangle editor is created
- **THEN** default drawing options SHALL be initialized with:
  - stroke color (default line color)
  - stroke width (default: 1)
  - stroke opacity (default: 1)
  - fill (default: "none")
  - stroke-linecap: "square"
  - stroke-linejoin: "miter"

#### Scenario: Update rectangle color

- **WHEN** user changes the rectangle stroke color
- **THEN** the color SHALL be applied to the SVG rect element
- **AND** the change SHALL be undoable
- **AND** the color picker SHALL reflect the current color

#### Scenario: Update rectangle thickness

- **WHEN** user changes the rectangle stroke thickness
- **THEN** the stroke-width SHALL be updated on the SVG element
- **AND** the bounding box SHALL be adjusted for the new thickness
- **AND** the change SHALL be undoable

#### Scenario: Update rectangle opacity

- **WHEN** user changes the rectangle stroke opacity
- **THEN** the stroke-opacity SHALL be applied to the SVG element
- **AND** the change SHALL be undoable

### Requirement: Rectangle Editor Lifecycle

The system SHALL manage the complete lifecycle of rectangle editors including creation, editing, and removal.

#### Scenario: Create rectangle from drawing

- **WHEN** a valid rectangle is drawn by the user
- **THEN** a new `RectangleEditor` instance SHALL be created with:
  - unique ID
  - geometry from `RectDrawOutline`
  - current drawing options
  - parent layer reference
- **AND** the editor SHALL be added to the undo stack

#### Scenario: Enable rectangle editing

- **WHEN** a rectangle editor is selected
- **THEN** the editor SHALL display resize handles
- **AND** the editor SHALL be movable by dragging
- **AND** the editor SHALL be resizable by dragging handles
- **AND** the editor SHALL maintain aspect ratio constraints if configured

#### Scenario: Disable rectangle editing

- **WHEN** the user exits editing mode
- **THEN** the rectangle editor SHALL hide interactive elements
- **AND** the rectangle SHALL remain visible as a static annotation
- **AND** changes SHALL be committed or rolled back as appropriate

#### Scenario: Remove rectangle editor

- **WHEN** a rectangle editor is deleted
- **THEN** the SVG rect element SHALL be removed from the DrawLayer
- **AND** the editor SHALL be removed from the annotation layer
- **AND** the deletion SHALL be undoable

### Requirement: Rectangle Serialization

The system SHALL serialize and deserialize rectangle data for persistence and copying.

#### Scenario: Serialize rectangle to data

- **WHEN** a rectangle editor needs to be saved
- **THEN** the system SHALL serialize the rectangle to include:
  - geometry data (x, y, width, height, rotation)
  - appearance properties (color, thickness, opacity)
  - annotation metadata (ID, page index, timestamps)
- **AND** the serialized data SHALL be compatible with PDF annotation format

#### Scenario: Deserialize rectangle from data

- **WHEN** loading a saved rectangle annotation
- **THEN** the system SHALL create a `RectangleEditor` instance from the data
- **AND** the rectangle SHALL be rendered at the correct position and size
- **AND** all appearance properties SHALL be restored
- **AND** the rectangle SHALL be editable

#### Scenario: Copy rectangle

- **WHEN** user copies a rectangle editor
- **THEN** the system SHALL serialize the rectangle with `isForCopying` flag
- **AND** the copied data SHALL be placed on the clipboard
- **AND** the user SHALL be able to paste the rectangle on any page

### Requirement: Rectangle Outline Management

The system SHALL use `RectDrawOutliner` and `RectDrawOutline` classes to manage rectangle drawing and geometry.

#### Scenario: Create draw outliner

- **WHEN** starting a new rectangle drawing session
- **THEN** a `RectDrawOutliner` instance SHALL be created with:
  - start point coordinates (normalized)
  - parent dimensions (width, height)
  - rotation angle
- **AND** the outliner SHALL be ready to accept pointer move updates

#### Scenario: Update outliner during draw

- **WHEN** the outliner receives a pointer move event
- **THEN** the outliner SHALL calculate the current rectangle bounds
- **AND** the outliner SHALL return updated SVG rect attributes
- **AND** the rectangle SHALL be displayed with current dimensions

#### Scenario: Finalize draw outline

- **WHEN** the drawing is complete
- **THEN** the outliner SHALL generate a `RectDrawOutline` instance
- **AND** the outline SHALL contain:
  - final normalized rectangle bounds [x, y, width, height]
  - bounding box with margins
  - SVG properties for rendering

#### Scenario: Update outline on resize

- **WHEN** a rectangle editor is resized
- **THEN** the `RectDrawOutline` SHALL recalculate geometry
- **AND** the outline SHALL update SVG properties for the new size
- **AND** the bounding box SHALL include stroke width margins

### Requirement: Rectangle Tool UI Integration

The system SHALL integrate rectangle drawing with the existing toolbar and parameter controls.

#### Scenario: Activate rectangle tool

- **WHEN** user clicks the rectangle tool button
- **THEN** the button SHALL toggle to active state
- **AND** the annotation editor layer SHALL switch to GEOSHAPE mode with rectangle sub-type
- **AND** the page cursor SHALL change to rectangle drawing cursor
- **AND** the CSS class `geoshapeRectEditing` SHALL be applied

#### Scenario: Deactivate rectangle tool

- **WHEN** user clicks the active rectangle tool button OR selects another tool
- **THEN** the rectangle tool button SHALL return to inactive state
- **AND** any in-progress drawing SHALL be committed or canceled
- **AND** the editor mode SHALL switch to NONE or the selected tool

#### Scenario: Display rectangle parameters toolbar

- **WHEN** rectangle tool is active
- **THEN** the parameters toolbar SHALL display rectangle options
- **AND** color picker SHALL be available
- **AND** thickness slider SHALL be available
- **AND** opacity slider SHALL be available
- **AND** parameter changes SHALL apply to new rectangles

### Requirement: Rectangle Transformation Support

The system SHALL support rectangle transformations including rotation, scaling, and translation.

#### Scenario: Rotate rectangle with page

- **WHEN** the PDF page is rotated
- **THEN** the rectangle SHALL rotate to maintain its relative position
- **AND** the SVG transform SHALL be updated accordingly
- **AND** the rectangle SHALL remain editable in the new orientation

#### Scenario: Scale rectangle with zoom

- **WHEN** the page zoom level changes
- **THEN** the rectangle SHALL scale proportionally
- **AND** the stroke width SHALL remain visually consistent
- **AND** the resize handles SHALL remain at appropriate sizes

#### Scenario: Translate rectangle position

- **WHEN** a rectangle is moved to a different position
- **THEN** the normalized coordinates SHALL be updated
- **AND** the SVG rect element SHALL be repositioned
- **AND** the bounding box SHALL be recalculated

#### Scenario: Resize rectangle dimensions

- **WHEN** a rectangle is resized via handles
- **THEN** the width and height SHALL be updated
- **AND** the aspect ratio SHALL be maintained if constrained
- **AND** the minimum size SHALL be enforced
- **AND** the SVG shall update in real-time during resize

### Requirement: Rectangle Drawing Session Management

The system SHALL manage rectangle drawing sessions including multi-finger detection and cancellation.

#### Scenario: Start drawing session

- **WHEN** user initiates rectangle drawing with valid pointer
- **THEN** a drawing session SHALL be created
- **AND** pointer events SHALL be captured
- **AND** the session SHALL track the pointer ID and type

#### Scenario: Handle multi-finger gesture

- **WHEN** user touches with a second finger during rectangle drawing
- **THEN** the current drawing SHALL be cancelled
- **AND** the temporary rectangle SHALL be removed
- **AND** the system SHALL allow pinch-zoom gesture

#### Scenario: Cancel drawing on blur

- **WHEN** the editor layer loses focus during drawing
- **THEN** the current drawing session SHALL be committed or removed
- **AND** event listeners SHALL be cleaned up

#### Scenario: End drawing session

- **WHEN** the drawing session completes normally
- **THEN** pointer event listeners SHALL be removed
- **AND** the drawing session state SHALL be cleared
- **AND** the system SHALL be ready for a new drawing

### Requirement: Rectangle Annotation Compatibility

The system SHALL ensure rectangle annotations are compatible with PDF specifications and other PDF viewers.

#### Scenario: Render as PDF Square annotation

- **WHEN** a rectangle is saved to PDF
- **THEN** the rectangle SHALL be saved as a Square annotation type
- **AND** the annotation dictionary SHALL include:
  - Rect (bounding rectangle)
  - C (stroke color in RGB)
  - Border (stroke width and style)
  - CA (stroke opacity)
- **AND** the annotation SHALL be viewable in other PDF readers

#### Scenario: Load PDF Square annotation

- **WHEN** opening a PDF with Square annotations
- **THEN** the system SHALL detect Square annotations
- **AND** each Square annotation SHALL be convertible to a `RectangleEditor`
- **AND** the rectangle SHALL be editable when entering edit mode

#### Scenario: Update existing annotation

- **WHEN** a rectangle editor modifies an existing Square annotation
- **THEN** the annotation data SHALL be updated
- **AND** the PDF SHALL reflect the changes when saved
- **AND** the annotation appearance SHALL match the edited rectangle
