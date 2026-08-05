const { app, core, action } = require("photoshop");
const { snapshotLayer } = require("./layers");

function documentSummary(document) {
  return {
    id: document.id,
    name: document.name,
    width: Number(document.width),
    height: Number(document.height),
    resolution: Number(document.resolution),
    active: app.activeDocument?.id === document.id,
  };
}

function listOpenDocuments() {
  return Array.from(app.documents || []).map(documentSummary);
}

function findDocument({ id, name } = {}) {
  const documents = Array.from(app.documents || []);
  if (id !== undefined && id !== null) {
    const numericId = Number(id);
    const byId = documents.find((document) => Number(document.id) === numericId);
    if (byId) return byId;
  }
  if (name) return documents.find((document) => String(document.name) === String(name)) || null;
  return null;
}

async function selectDocument(target = {}) {
  const document = findDocument(target);
  if (!document) throw new Error("The requested Photoshop document is not open.");
  await core.executeAsModal(async () => {
    const result = await action.batchPlay([{
      _obj: "select",
      _target: [{ _ref: "document", _id: document.id }],
      _options: { dialogOptions: "dontDisplay" },
    }], { synchronousExecution: true });
    const error = result.find((entry) => entry?._obj === "error" || entry?.result < 0);
    if (error) throw new Error(error.message || `Could not select document ${document.name}`);
  }, { commandName: `Select Photoshop document ${document.name}` });
  return documentSummary(app.activeDocument || document);
}

function snapshotOpenDocuments() {
  return Array.from(app.documents || []).map((document) => ({
    ...documentSummary(document),
    layers: Array.from(document.layers || []).map(snapshotLayer),
  }));
}

module.exports = { listOpenDocuments, selectDocument, snapshotOpenDocuments };
