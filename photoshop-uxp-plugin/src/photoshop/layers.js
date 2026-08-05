const { app } = require("photoshop");

function snapshotLayer(layer) {
  const children = layer.layers ? Array.from(layer.layers).map(snapshotLayer) : [];
  let bounds = null;
  try {
    const value = layer.bounds;
    if (value) bounds = { left: Number(value.left), top: Number(value.top), right: Number(value.right), bottom: Number(value.bottom) };
  } catch { /* Some Photoshop layer types do not expose bounds. */ }
  return {
    id: layer.id,
    name: layer.name,
    kind: String(layer.kind),
    visible: layer.visible,
    opacity: layer.opacity,
    ...(bounds ? { bounds } : {}),
    ...(children.length ? { children } : {}),
  };
}

function readActiveDocument() {
  try {
    const doc = app.activeDocument;
    if (!doc) return null;
    return {
      name: doc.name,
      width: Number(doc.width),
      height: Number(doc.height),
      resolution: Number(doc.resolution),
      layers: Array.from(doc.layers).map(snapshotLayer),
    };
  } catch {
    return null;
  }
}

function findLayer(layers, name) {
  for (const layer of Array.from(layers || [])) {
    if (layer.name === name) return layer;
    const nested = layer.layers ? findLayer(layer.layers, name) : null;
    if (nested) return nested;
  }
  return null;
}

function findLayerMatching(layers, predicate) {
  for (const layer of Array.from(layers || [])) {
    if (predicate(layer)) return layer;
    const nested = layer.layers ? findLayerMatching(layer.layers, predicate) : null;
    if (nested) return nested;
  }
  return null;
}

function collectLayerIds(layers, ids = new Set()) {
  for (const layer of Array.from(layers || [])) {
    ids.add(layer.id);
    if (layer.layers) collectLayerIds(layer.layers, ids);
  }
  return ids;
}

function findMemberPhotoLayer(member) {
  const doc = app.activeDocument;
  if (!doc) return null;
  const normalizedMember = String(member || "RM").trim().toUpperCase();
  const topLayers = Array.from(doc.layers || []);
  const sourceGroup = topLayers.find((layer) => layer.name === `Card_Photo_${normalizedMember}_BTS`)
    || topLayers.find((layer) => layer.name === `${normalizedMember}_L`);
  if (!sourceGroup) return null;
  const children = Array.from(sourceGroup.layers || []);
  return children.find((layer) => layer.name === `Photo_${normalizedMember}_BTS`)
    || children.find((layer) => layer.name === (normalizedMember === "RM" ? "photo copy 2" : "photo"));
}

function findMemberPreviewPhotoLayer(member) {
  const doc = app.activeDocument;
  if (!doc) return null;
  const normalizedMember = String(member || "RM").trim().toUpperCase();
  const topLayers = Array.from(doc.layers || []);
  const previewGroup = topLayers.find((layer) => layer.name === `Card_Preview_${normalizedMember}_BTS`)
    || topLayers.find((layer) => layer.name === `${normalizedMember}_L_view`);
  if (!previewGroup) return null;
  return Array.from(previewGroup.layers || []).find((layer) => layer.name === "photo") || null;
}

function readLayerBounds(layer) {
  if (!layer?.bounds) return null;
  const value = layer.bounds;
  const bounds = { left: Number(value.left), top: Number(value.top), right: Number(value.right), bottom: Number(value.bottom) };
  if (![bounds.left, bounds.top, bounds.right, bounds.bottom].every(Number.isFinite)) return null;
  return {
    ...bounds,
    width: bounds.right - bounds.left,
    height: bounds.bottom - bounds.top,
    centerX: (bounds.left + bounds.right) / 2,
    centerY: (bounds.top + bounds.bottom) / 2,
  };
}

module.exports = {
  snapshotLayer,
  readActiveDocument,
  findLayer,
  findLayerMatching,
  collectLayerIds,
  findMemberPhotoLayer,
  findMemberPreviewPhotoLayer,
  readLayerBounds,
};
