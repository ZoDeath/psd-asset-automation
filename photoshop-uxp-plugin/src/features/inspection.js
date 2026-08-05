const { app, core, action } = require("photoshop");
const { findLayer, findLayerMatching, findMemberPhotoLayer, readActiveDocument } = require("../photoshop/layers");

function memberLayerPattern(member) {
  const key = String(member || "RM").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
  return new RegExp(`^(?:${key}|photo${key}|00${key})$`, "i");
}

function createInspectionFeature({ ui, sendSnapshot }) {
  async function inspectMember(member = "RM") {
    const normalizedMember = String(member || "RM").trim().toUpperCase();
    if (ui.inspectButton) ui.inspectButton.disabled = true;
    try {
      const source = findMemberPhotoLayer(normalizedMember);
      if (!source) throw new Error(`${normalizedMember} photo smart object was not found.`);
      await core.executeAsModal(async () => {
        const parentId = app.activeDocument?.id;
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
        const error = result.find((entry) => entry?._obj === "error" || entry?.result < 0);
        if (error) throw new Error(error.message || `${normalizedMember} smart-object open failed.`);
        if (!app.activeDocument || app.activeDocument.id === parentId) throw new Error("The embedded PSB did not open.");
        console.log(`RHV ${normalizedMember} smart-object structure`, JSON.stringify(readActiveDocument()));
      }, { commandName: `Inspect ${normalizedMember} smart object` });
      ui.statusElement.textContent = `${normalizedMember} smart object opened for inspection.`;
      await sendSnapshot();
    } catch (error) {
      console.error(`RHV ${normalizedMember} smart-object inspection failed`, error);
      ui.statusElement.textContent = `${normalizedMember} smart-object inspection failed.`;
      throw error;
    } finally {
      if (ui.inspectButton) ui.inspectButton.disabled = false;
    }
  }

  async function cleanupMember(member = "RM") {
    const normalizedMember = String(member || "RM").trim().toUpperCase();
    await core.executeAsModal(async () => {
      const inner = app.activeDocument;
      if (!inner || !/\.psb$/i.test(String(inner.name || ""))) throw new Error("Open the member photo PSB first.");
      const matches = memberLayerPattern(normalizedMember);
      const photoLayers = [];
      const collect = (layers) => {
        for (const layer of Array.from(layers || [])) {
          const key = String(layer.name || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
          if (layer?.kind === "smartObject" && matches.test(key)) photoLayers.push(layer);
          if (layer?.layers) collect(layer.layers);
        }
      };
      collect(inner.layers);
      for (const layer of photoLayers) await layer.delete();
      const dummy = findLayer(inner.layers, "Shape 5")
        || findLayerMatching(inner.layers, (layer) => /^(dummy|heads*guide)$/i.test(String(layer.name || "")));
      if (dummy) dummy.visible = true;
      await inner.save();
      await action.batchPlay([{
        _obj: "close",
        _target: [{ _ref: "document", _enum: "ordinal", _value: "targetEnum" }],
        saving: { _enum: "yesNo", _value: "no" },
        _options: { dialogOptions: "dontDisplay" },
      }], { synchronousExecution: true });
    }, { commandName: `Clean duplicate ${normalizedMember} layers` });
  }

  return { inspectMember, cleanupMember };
}

module.exports = { createInspectionFeature };
