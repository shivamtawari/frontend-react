import {
  getLabelSelectionError,
  normalizeLabelMetadata,
  validateLabelSelection,
} from "./labelHierarchy";

const hierarchy = {
  1: { id: 1, name: "Root", parent_id: null },
  2: { id: 2, name: "Intermediate", parent_id: 1 },
  3: { id: 3, name: "Leaf", parent_id: 2 },
};

describe("label hierarchy selection", () => {
  test("preserves parent_id and allows a single child label", () => {
    const labels = normalizeLabelMetadata(hierarchy);

    expect(labels).toEqual([
      { id: 1, name: "Root", parent_id: null },
      { id: 2, name: "Intermediate", parent_id: 1 },
      { id: 3, name: "Leaf", parent_id: 2 },
    ]);
    expect(validateLabelSelection(labels, new Set([3]))).toMatchObject({ valid: true });
  });

  test("reports every skipped level when an ancestor and descendant are selected", () => {
    const labels = normalizeLabelMetadata(hierarchy);
    const validation = validateLabelSelection(labels, new Set([1, 3]));

    expect(validation.valid).toBe(false);
    expect(validation.missingLabels).toEqual([
      { id: 2, name: "Intermediate", parent_id: 1 },
    ]);
    expect(getLabelSelectionError(validation)).toContain("Intermediate");
  });

  test("accepts a complete selected path", () => {
    const labels = normalizeLabelMetadata(hierarchy);

    expect(validateLabelSelection(labels, new Set([1, 2, 3]))).toMatchObject({ valid: true });
  });
});
