const { app, core, action, constants } = require("photoshop");
const { findLayer, readLayerBounds } = require("./layers");
const { selectDocument } = require("./documents");

function resolveDocumentTarget(target = {}) {
  const documents = Array.from(app.documents || []);
  if (target.documentId !== undefined || target.id !== undefined) {
    const requestedId = Number(target.documentId ?? target.id);
    const match = documents.find((document) => Number(document.id) === requestedId);
    if (match) return match;
  }
  if (target.documentName || target.name) {
    const requestedName = String(target.documentName || target.name);
    const match = documents.find((document) => String(document.name) === requestedName);
    if (match) return match;
  }
  return app.activeDocument || null;
}

function resolveLayerTarget(document, target = {}) {
  const layerId = target.layerId ?? (target.documentId === undefined ? target.id : undefined);
  if (layerId !== undefined && layerId !== null) {
    const findById = (layers) => {
      for (const layer of Array.from(layers || [])) {
        if (Number(layer.id) === Number(layerId)) return layer;
        const nested = layer.layers ? findById(layer.layers) : null;
        if (nested) return nested;
      }
      return null;
    };
    const match = findById(document.layers);
    if (match) return match;
  }
  if (target.layerName) return findLayer(document.layers, String(target.layerName));
  return Array.from(document.activeLayers || [])[0] || null;
}

function layerResult(layer) {
  if (!layer) return null;
  const bounds = readLayerBounds(layer);
  return { id: layer.id, name: layer.name, kind: String(layer.kind), visible: Boolean(layer.visible), ...(bounds ? { bounds } : {}) };
}

async function activateTargetDocument(target = {}) {
  const document = resolveDocumentTarget(target);
  if (!document) throw new Error("The requested Photoshop document is not open.");
  const identity = { id: Number(document.id), name: String(document.name) };
  if (app.activeDocument?.id !== document.id) await selectDocument({ id: identity.id });
  return identity;
}

async function closeDocument(target = {}) {
  const identity = await activateTargetDocument(target);
  await core.executeAsModal(async () => {
    if (target.save) await app.activeDocument.save();
    const result = await action.batchPlay([{
      _obj: "close",
      _target: [{ _ref: "document", _enum: "ordinal", _value: "targetEnum" }],
      saving: { _enum: "yesNo", _value: "no" },
      _options: { dialogOptions: "dontDisplay" },
    }], { synchronousExecution: true });
    const error = result.find((entry) => entry?._obj === "error" || entry?.result < 0);
    if (error) throw new Error(error.message || "Could not close the Photoshop document.");
  }, { commandName: `Close Photoshop document ${identity.name}` });
  return { ...identity, closed: true };
}

async function saveDocument(target = {}) {
  const identity = await activateTargetDocument(target);
  await core.executeAsModal(async () => { await app.activeDocument.save(); }, { commandName: `Save Photoshop document ${identity.name}` });
  return { ...identity, saved: true };
}

async function setLayerVisibility(target = {}) {
  await activateTargetDocument(target);
  let result;
  await core.executeAsModal(async () => {
    const layer = resolveLayerTarget(app.activeDocument, target);
    if (!layer) throw new Error("The requested Photoshop layer was not found.");
    layer.visible = Boolean(target.visible);
    result = layerResult(layer);
  }, { commandName: `Set Photoshop layer visibility ${target.layerName || target.layerId || "active"}` });
  return result;
}

async function deleteLayer(target = {}) {
  await activateTargetDocument(target);
  const result = { id: target.layerId ?? null, name: target.layerName ?? null, deleted: false };
  await core.executeAsModal(async () => {
    const layer = resolveLayerTarget(app.activeDocument, target);
    if (!layer) throw new Error("The requested Photoshop layer was not found.");
    result.id = layer.id;
    result.name = layer.name;
    await layer.delete();
    result.deleted = true;
  }, { commandName: `Delete Photoshop layer ${target.layerName || target.layerId || "active"}` });
  return result;
}

async function transformLayer(target = {}) {
  await activateTargetDocument(target);
  let result;
  await core.executeAsModal(async () => {
    const layer = resolveLayerTarget(app.activeDocument, target);
    if (!layer) throw new Error("The requested Photoshop layer was not found.");
    const selectResult = await action.batchPlay([{
      _obj: "select",
      _target: [{ _ref: "layer", _id: layer.id }],
      makeVisible: true,
      _options: { dialogOptions: "dontDisplay" },
    }], { synchronousExecution: true });
    const selectError = selectResult.find((entry) => entry?._obj === "error" || entry?.result < 0);
    if (selectError) throw new Error(selectError.message || "Could not select the Photoshop layer.");
    const proxy = Array.from(app.activeDocument.activeLayers || [])[0] || layer;
    const scale = Number(target.scale ?? 100);
    const scaleX = Number(target.scaleX ?? scale);
    const scaleY = Number(target.scaleY ?? scale);
    if (!target.allowNonUniform && Math.abs(scaleX - scaleY) > 0.0001) {
      throw new Error("Non-uniform scaling is disabled. Use the same scale for X and Y.");
    }
    const rotation = Number(target.rotation ?? target.rotate ?? 0);
    const translateX = Number(target.translateX ?? target.x ?? 0);
    const translateY = Number(target.translateY ?? target.y ?? 0);
    if (Number.isFinite(scaleX) && Number.isFinite(scaleY) && (scaleX !== 100 || scaleY !== 100)) {
      await proxy.scale(scaleX, scaleY, constants.AnchorPosition.MIDDLECENTER);
    }
    if (Number.isFinite(rotation) && rotation !== 0) await proxy.rotate(rotation, constants.AnchorPosition.MIDDLECENTER);
    if (Number.isFinite(translateX) && Number.isFinite(translateY) && (translateX !== 0 || translateY !== 0)) {
      await proxy.translate(translateX, translateY);
    }
    if (target.save) await app.activeDocument.save();
    result = layerResult(proxy);
  }, { commandName: `Transform Photoshop layer ${target.layerName || target.layerId || "active"}` });
  return result;
}

module.exports = {
  closeDocument,
  saveDocument,
  setLayerVisibility,
  deleteLayer,
  transformLayer,
};
