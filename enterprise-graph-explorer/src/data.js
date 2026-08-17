const VALID_FAMILY_DIRECTIONS = new Set(["directed", "undirected"]);

export function validateDataset(dataset) {
  const errors = [];
  if (!dataset || typeof dataset !== "object") return ["root must be an object"];
  if (!Array.isArray(dataset.nodes) || dataset.nodes.length === 0) errors.push("nodes must be a non-empty array");
  if (!Array.isArray(dataset.families) || dataset.families.length === 0) errors.push("families must be a non-empty array");
  if (errors.length > 0) return errors;

  const nodeIds = new Set();
  dataset.nodes.forEach((node, index) => {
    if (!node.id || typeof node.id !== "string") errors.push(`nodes[${index}].id must be a string`);
    if (!node.name || typeof node.name !== "string") errors.push(`nodes[${index}].name must be a string`);
    if (nodeIds.has(node.id)) errors.push(`duplicate node id: ${node.id}`);
    nodeIds.add(node.id);
  });

  const familyKeys = new Set();
  dataset.families.forEach((family, familyIndex) => {
    if (!family.key || typeof family.key !== "string") errors.push(`families[${familyIndex}].key must be a string`);
    if (familyKeys.has(family.key)) errors.push(`duplicate family key: ${family.key}`);
    familyKeys.add(family.key);
    if (!VALID_FAMILY_DIRECTIONS.has(family.direction)) {
      errors.push(`families[${familyIndex}].direction must be directed or undirected`);
    }
    if (!Array.isArray(family.edges)) {
      errors.push(`families[${familyIndex}].edges must be an array`);
      return;
    }
    family.edges.forEach((edge, edgeIndex) => {
      if (!nodeIds.has(edge.source)) errors.push(`${family.key}.edges[${edgeIndex}] has unknown source: ${edge.source}`);
      if (!nodeIds.has(edge.target)) errors.push(`${family.key}.edges[${edgeIndex}] has unknown target: ${edge.target}`);
      if (edge.source === edge.target) errors.push(`${family.key}.edges[${edgeIndex}] is a self-loop`);
      if (!Number.isFinite(edge.weight) || edge.weight < 0 || edge.weight > 1) {
        errors.push(`${family.key}.edges[${edgeIndex}].weight must be between 0 and 1`);
      }
    });
  });

  return errors;
}

export function normalizeDataset(dataset) {
  return {
    ...dataset,
    metadata: {
      name: "Imported dataset",
      description: "",
      synthetic: false,
      ...dataset.metadata,
    },
    nodes: dataset.nodes.map((node) => ({
      code: "",
      sector: "未分類",
      description: "",
      ...node,
      searchText: `${node.id} ${node.code || ""} ${node.name} ${node.sector || ""}`.toLowerCase(),
    })),
    families: dataset.families.map((family) => ({
      title: family.key,
      shortTitle: family.title || family.key,
      description: "",
      sourceNote: "",
      ...family,
      edges: family.edges.map((edge, index) => ({
        id: `${family.key}-${index + 1}`,
        relationType: family.key,
        observedAt: "",
        evidence: "",
        sourceLabel: "",
        ...edge,
      })),
    })),
  };
}

export function endpointId(endpoint) {
  return typeof endpoint === "object" ? endpoint.id : endpoint;
}

export function neighborhood(edges, centerId, hops) {
  if (!centerId) return null;
  const visible = new Set([centerId]);
  let frontier = new Set([centerId]);
  for (let step = 0; step < hops; step += 1) {
    const next = new Set();
    edges.forEach((edge) => {
      const source = endpointId(edge.source);
      const target = endpointId(edge.target);
      if (frontier.has(source) && !visible.has(target)) next.add(target);
      if (frontier.has(target) && !visible.has(source)) next.add(source);
    });
    next.forEach((id) => visible.add(id));
    frontier = next;
  }
  return visible;
}
