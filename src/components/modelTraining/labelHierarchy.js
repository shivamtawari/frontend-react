const idKey = (id) => String(id);

/**
 * Keep the hierarchy fields returned by the labels endpoint while shaping the
 * response for the training form. A missing parent is a root label.
 */
export const normalizeLabelMetadata = (labelMap) => {
  if (!labelMap || typeof labelMap !== "object") return [];

  return Object.values(labelMap)
    .filter((label) => label && label.id != null && typeof label.name === "string")
    .map((label) => ({
      id: label.id,
      name: label.name,
      parent_id: label.parent_id ?? null,
    }));
};

/**
 * A single selected label is valid even when it is a child. If a selected
 * label has a selected ancestor, every label between the two must also be
 * selected so the backend can represent the complete hierarchy path.
 */
export const validateLabelSelection = (labels, selectedLabelIds) => {
  const labelById = new Map(labels.map((label) => [idKey(label.id), label]));
  const selected = new Set([...selectedLabelIds].map(idKey));
  const missingById = new Map();
  const skippedPaths = [];

  labels.forEach((descendant) => {
    if (!selected.has(idKey(descendant.id))) return;

    const path = [];
    const visited = new Set();
    let ancestorId = descendant.parent_id;

    while (ancestorId != null && !visited.has(idKey(ancestorId))) {
      const ancestorKey = idKey(ancestorId);
      visited.add(ancestorKey);
      const ancestor = labelById.get(ancestorKey);

      // An incomplete parent reference cannot identify a selectable skipped
      // level. The server remains authoritative for invalid metadata.
      if (!ancestor) break;

      path.push(ancestor);
      if (selected.has(ancestorKey)) {
        const skipped = path.slice(0, -1).filter(
          (label) => !selected.has(idKey(label.id)),
        );
        skipped.forEach((label) => missingById.set(idKey(label.id), label));
        if (skipped.length > 0) {
          skippedPaths.push({ descendant, ancestor, skipped });
        }
        break;
      }

      ancestorId = ancestor.parent_id;
    }
  });

  const missingLabels = [...missingById.values()];
  return {
    valid: missingLabels.length === 0,
    missingLabels,
    skippedPaths,
  };
};

export const getLabelSelectionError = (validation) => {
  if (!validation || validation.valid) return null;

  const names = validation.missingLabels.map((label) => label.name).join(", ");
  return `Select the intermediate label${validation.missingLabels.length === 1 ? "" : "s"} ${names} before training; selected ancestor and descendant paths cannot skip levels.`;
};
