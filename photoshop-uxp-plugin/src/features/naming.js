const { app, core } = require("photoshop");
const { findLayer, readActiveDocument } = require("../photoshop/layers");

function createNamingFeature({ getActiveTemplate, ui }) {
  async function applyRhvNames() {
    if (ui.renameButton) ui.renameButton.disabled = true;
    ui.statusElement.textContent = "Applying RHV names...";
    try {
      const result = await core.executeAsModal(async () => {
        const doc = app.activeDocument;
        const activeTemplate = getActiveTemplate() || {};
        if (!activeTemplate.memberMappings) throw new Error(`${activeTemplate.label || "Template"} mapping is not registered yet.`);
        const topLayers = doc ? doc.layers : [];
        const renamed = [];
        const missing = [];

        for (const [member, sourcePhotoName] of activeTemplate.memberMappings) {
          const source = findLayer(topLayers, `${member}_L`) || findLayer(topLayers, `Card_Photo_${member}_BTS`);
          const sourceTarget = `Card_Photo_${member}_BTS`;
          if (source) {
            source.name = sourceTarget;
            renamed.push(sourceTarget);
            const photo = findLayer(source.layers, sourcePhotoName) || findLayer(source.layers, `Photo_${member}_BTS`);
            if (photo) {
              photo.name = `Photo_${member}_BTS`;
              renamed.push(`Photo_${member}_BTS`);
            } else {
              missing.push(`${member}: ${sourceTarget}/${sourcePhotoName}`);
            }
          } else {
            missing.push(`${member}: ${sourceTarget}`);
          }

          const preview = findLayer(topLayers, `${member}_L_view`) || findLayer(topLayers, `Card_Preview_${member}_BTS`);
          if (preview) {
            preview.name = `Card_Preview_${member}_BTS`;
            renamed.push(`Card_Preview_${member}_BTS`);
            const frame = findLayer(preview.layers, "frame") || findLayer(preview.layers, "Card_Frame");
            if (frame) {
              frame.name = "Card_Frame";
              renamed.push(`Card_Frame (${member})`);
            } else {
              missing.push(`${member}: preview frame`);
            }
          } else {
            missing.push(`${member}: Card_Preview_${member}_BTS`);
          }
        }
        return { renamed, missing };
      }, { commandName: "RHV naming convention" });
      ui.statusElement.textContent = `Names applied · ${result.renamed.length} changes`;
      ui.summaryElement.textContent = result.missing.length
        ? `Changed: ${result.renamed.length}\nNot found:\n${result.missing.join("\n")}`
        : `Changed: ${result.renamed.length}\nAll BTS card, preview, photo, and frame names were applied.`;
      await ui.sendSnapshot();
    } catch (error) {
      console.error("RHV naming update failed", error);
      ui.statusElement.textContent = `Name update failed: ${error?.message || error}`;
    } finally {
      if (ui.renameButton) ui.renameButton.disabled = false;
    }
  }

  return { applyRhvNames };
}

module.exports = { createNamingFeature };
