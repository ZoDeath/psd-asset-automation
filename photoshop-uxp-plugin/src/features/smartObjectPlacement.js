const { app, core, action, constants } = require("photoshop");
const fs = require("uxp").storage.localFileSystem;
const { findLayer, findLayerMatching, collectLayerIds, findMemberPhotoLayer } = require("../photoshop/layers");
const { transformPhotoToGuide } = require("./photoTransform");

function commandError(result) {
  return Array.from(result || []).find((entry) => entry?._obj === "error" || entry?.result < 0);
}

function memberPhotoPattern(member) {
  const key = String(member || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
  return new RegExp(`^(?:${key}|photo${key}|00${key})$`, "i");
}

function collectStalePhotoLayers(layers, member) {
  const stale = [];
  const matchesMember = memberPhotoPattern(member);
  const visit = (items) => {
    for (const layer of Array.from(items || [])) {
      const key = String(layer.name || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
      if (layer?.kind === "smartObject" && matchesMember.test(key)) stale.push(layer);
      if (layer?.layers) visit(layer.layers);
    }
  };
  visit(layers);
  return stale;
}

async function closeActiveDocumentWithoutSaving(commandName) {
  const result = await action.batchPlay([{
    _obj: "close",
    _target: [{ _ref: "document", _enum: "ordinal", _value: "targetEnum" }],
    saving: { _enum: "yesNo", _value: "no" },
    _options: { dialogOptions: "dontDisplay" },
  }], { synchronousExecution: true });
  const error = commandError(result);
  if (error) throw new Error(error.message || `${commandName} failed.`);
}

async function closeTransientSmartObjectIfOpen() {
  const active = app.activeDocument;
  if (!active || !/\.psb$/i.test(String(active.name || ""))) return false;
  await core.executeAsModal(
    async () => closeActiveDocumentWithoutSaving("Smart-object close"),
    { commandName: "Close active inspected smart object" },
  );
  return true;
}

async function closeFailedInnerDocument(parentDocumentId) {
  if (!app.activeDocument || Number(app.activeDocument.id) === Number(parentDocumentId)) return;
  try {
    await core.executeAsModal(
      async () => closeActiveDocumentWithoutSaving("Failed placement cleanup"),
      { commandName: "Discard failed photo placement" },
    );
  } catch (error) {
    console.warn("RHV could not close the failed placement PSB", error);
  }
}

async function openMemberSmartObject(source, parentDocumentId) {
  const result = await action.batchPlay([
    {
      _obj: "select",
      _target: [{ _ref: "layer", _id: source.id }],
      makeVisible: true,
      _options: { dialogOptions: "dontDisplay" },
    },
    {
      _obj: "placedLayerEditContents",
      _target: [{ _ref: "layer", _id: source.id }],
      _options: { dialogOptions: "dontDisplay" },
    },
  ], { synchronousExecution: true });
  const error = commandError(result);
  if (error) throw new Error(error.message || "Smart-object open failed.");
  const document = app.activeDocument;
  if (!document || Number(document.id) === Number(parentDocumentId)) {
    throw new Error("Could not open the embedded smart-object document.");
  }
  return document;
}

async function placeFile(token, innerDocument) {
  const existingIds = collectLayerIds(innerDocument.layers);
  const result = await action.batchPlay([{
    _obj: "placeEvent",
    null: { _kind: "local", _path: token },
    linked: false,
    _options: { dialogOptions: "dontDisplay" },
  }], { synchronousExecution: true });
  const error = commandError(result);
  if (error) throw new Error(error.message || "Photo place failed.");
  const layer = findLayerMatching(innerDocument.layers, (candidate) => !existingIds.has(candidate.id))
    || Array.from(innerDocument.activeLayers || [])[0];
  if (!layer) throw new Error("The placed photo layer could not be found.");
  return layer;
}

async function moveLayerInside(layer, group) {
  if (typeof layer.move === "function") {
    await layer.move(group, constants.ElementPlacement?.PLACEINSIDE || "placeInside");
    return;
  }
  const result = await action.batchPlay([{
    _obj: "move",
    _target: [{ _ref: "layer", _id: layer.id }],
    to: [{ _ref: "layer", _id: group.id }],
    _options: { dialogOptions: "dontDisplay" },
  }], { synchronousExecution: true });
  const error = commandError(result);
  if (error) throw new Error(error.message || "Could not move the photo into the placement group.");
}

async function saveParentDocument(parentDocumentId, member) {
  await core.executeAsModal(async () => {
    if (Number(app.activeDocument?.id) !== Number(parentDocumentId)) {
      const result = await action.batchPlay([{
        _obj: "select",
        _target: [{ _ref: "document", _id: parentDocumentId }],
        _options: { dialogOptions: "dontDisplay" },
      }], { synchronousExecution: true });
      const error = commandError(result);
      if (error) throw new Error(error.message || "Could not reactivate the parent PSD.");
    }
    await app.activeDocument.save();
  }, { commandName: member ? `Save parent document after placing ${member}` : "Save parent document after batch placement" });
}

async function placeMemberPhotoContents({ member, file, analysis, getActiveTemplate, skipTransform = false, saveParent = true }) {
  const normalizedMember = String(member || "").trim().toUpperCase();
  const parentDocument = app.activeDocument;
  const parentDocumentId = Number(parentDocument?.id);
  const source = findMemberPhotoLayer(normalizedMember);
  if (!parentDocument || !source) throw new Error(`${normalizedMember} photo smart object was not found.`);
  if (!skipTransform && (!analysis?.ok || !analysis.face)) throw new Error(`${normalizedMember} face analysis is required.`);

  const token = await fs.createSessionToken(file);
  let operationStage = "initializing";
  let placementResult = null;
  try {
    await core.executeAsModal(async () => {
      operationStage = "open-smart-object";
      const innerDocument = await openMemberSmartObject(source, parentDocumentId);
      const innerDocumentName = String(innerDocument.name);
      const targetGroup = findLayerMatching(
        innerDocument.layers,
        (layer) => /drop\s*shadow/i.test(String(layer.name || "")) && Boolean(layer.layers),
      ) || findLayer(innerDocument.layers, "Group 1");
      if (!targetGroup?.layers) throw new Error("Smart-object placement group was not found.");
      const targetGroupName = String(targetGroup.name || "Group 1");
      const dummy = findLayer(innerDocument.layers, "Shape 5")
        || findLayerMatching(innerDocument.layers, (layer) => /^(dummy|heads*guide)$/i.test(String(layer.name || "")));
      const stalePhotoLayers = collectStalePhotoLayers(innerDocument.layers, normalizedMember);

      operationStage = "place-file";
      const innerLayer = await placeFile(token, innerDocument);
      operationStage = skipTransform ? "raw-place" : "fit-photo";
      const fit = skipTransform
        ? { applied: false, rawPlaced: true, reason: "transform-skipped" }
        : await transformPhotoToGuide({
          innerDocument,
          innerLayer,
          analysis,
          placement: getActiveTemplate()?.placement || {},
        });

      operationStage = "move-photo-inside-group";
      await moveLayerInside(innerLayer, targetGroup);
      if (dummy) dummy.visible = false;

      operationStage = "remove-old-photo";
      for (const staleLayer of stalePhotoLayers) await staleLayer.delete();

      operationStage = "save-psb";
      await innerDocument.save();
      operationStage = "close-psb";
      await closeActiveDocumentWithoutSaving("Embedded PSB close");
      placementResult = {
        ...fit,
        member: normalizedMember,
        parentDocumentId,
        movedIntoDropShadow: true,
        dummyHidden: Boolean(dummy),
        targetGroup: targetGroupName,
        innerDocument: innerDocumentName,
      };
    }, { commandName: `Place ${normalizedMember} photo inside smart object` });

    if (saveParent) {
      operationStage = "save-parent-psd";
      await saveParentDocument(parentDocumentId, normalizedMember);
    }
    return placementResult;
  } catch (error) {
    await closeFailedInnerDocument(parentDocumentId);
    throw new Error(`${operationStage}: ${error?.message || String(error)}`);
  }
}

module.exports = {
  closeTransientSmartObjectIfOpen,
  placeMemberPhotoContents,
  saveParentDocument,
};
