const { app, imaging, core } = require("photoshop");
const { readActiveDocument } = require("../photoshop/layers");

function createSnapshotFeature({ bridgeUrl, templateProfiles, templateSelect, getActiveTemplate, setActiveTemplate, updateTemplateControls, ui }) {
  async function createDocumentPreview() {
    const doc = app.activeDocument;
    if (!doc) return null;
    const image = await imaging.getPixels({ documentID: doc.id, targetSize: { width: 900 }, applyAlpha: true });
    try {
      return await imaging.encodeImageData({ imageData: image.imageData, base64: true });
    } finally {
      image.imageData.dispose();
    }
  }

  async function sendSnapshot() {
    const documentSnapshot = readActiveDocument();
    if (!templateSelect?.value || templateSelect.value === "auto") {
      const haystack = String(documentSnapshot?.name || "").toUpperCase();
      const detected = Object.values(templateProfiles).find((profile) => profile.aliases.some((alias) => haystack.includes(alias))) || null;
      setActiveTemplate(detected);
      if (detected && templateSelect?.value === "auto") templateSelect.value = detected.id;
    } else if (templateSelect) {
      setActiveTemplate(templateProfiles[templateSelect.value] || null);
    }
    updateTemplateControls();
    ui.summaryElement.textContent = documentSnapshot
      ? `${documentSnapshot.name}\n${documentSnapshot.width} × ${documentSnapshot.height}px · ${documentSnapshot.resolution}ppi\nLayers: ${documentSnapshot.layers.length}`
      : "No Photoshop document is open.";
    try {
      const previewJpeg = documentSnapshot
        ? await core.executeAsModal(() => createDocumentPreview(), { commandName: "RHV preview capture" })
        : null;
      const response = await fetch(`${bridgeUrl}/snapshot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "documentSnapshot", capturedAt: new Date().toISOString(), document: documentSnapshot, previewJpeg }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      ui.statusElement.textContent = "MCP server connected · read-only";
    } catch (error) {
      console.error("PSD Inspector: snapshot delivery failed", error);
      ui.statusElement.textContent = "MCP server connection error. Refresh and try again.";
    }
  }

  return { sendSnapshot };
}

module.exports = { createSnapshotFeature };
