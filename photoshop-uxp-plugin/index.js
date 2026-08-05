const { createPhotoPlacement } = require("./src/features/placementController");
const { createNamingFeature } = require("./src/features/naming");
const { createSnapshotFeature } = require("./src/features/snapshot");
const { createInspectionFeature } = require("./src/features/inspection");
const { createRemoteCommandPoller } = require("./src/bridge/remoteCommands");
const { listOpenDocuments, selectDocument, snapshotOpenDocuments } = require("./src/photoshop/documents");
const { closeDocument, saveDocument, setLayerVisibility, deleteLayer, transformLayer } = require("./src/photoshop/operations");

const BRIDGE_URL = "http://127.0.0.1:61234";
const templateProfiles = globalThis.RHV_TEMPLATE_PROFILES || {};
const elements = {
  statusElement: document.getElementById("status"),
  summaryElement: document.getElementById("summary"),
  refreshButton: document.getElementById("refresh"),
  renameButton: document.getElementById("rename"),
  templateSelect: document.getElementById("template"),
  memberSelect: document.getElementById("member"),
  placeButton: document.getElementById("place"),
  batchPlaceButton: document.getElementById("batch-place"),
  inspectButton: document.getElementById("inspect-rm"),
};

let activeTemplate = null;
const getActiveTemplate = () => activeTemplate;
const setActiveTemplate = (template) => { activeTemplate = template || null; };
const updateTemplateControls = () => { if (elements.renameButton) elements.renameButton.disabled = false; };

const ui = {
  ...elements,
  sendSnapshot: async () => {},
};

const snapshot = createSnapshotFeature({
  bridgeUrl: BRIDGE_URL,
  templateProfiles,
  templateSelect: elements.templateSelect,
  getActiveTemplate,
  setActiveTemplate,
  updateTemplateControls,
  ui,
});
ui.sendSnapshot = snapshot.sendSnapshot;

const placement = createPhotoPlacement({ bridgeUrl: BRIDGE_URL, getActiveTemplate, ui });
const naming = createNamingFeature({ getActiveTemplate, ui });
const inspection = createInspectionFeature({ ui, sendSnapshot: snapshot.sendSnapshot });

const remote = createRemoteCommandPoller({
  bridgeUrl: BRIDGE_URL,
  handlers: {
    batchPlacePhotos: placement.batchPlacePhotos,
    placeMemberFromFolder: placement.placeMemberFromFolder,
    sendSnapshot: snapshot.sendSnapshot,
    inspectRm: () => inspection.inspectMember("RM"),
    inspectMember: inspection.inspectMember,
    cleanupRm: () => inspection.cleanupMember("RM"),
    applyRhvNames: naming.applyRhvNames,
    listDocuments: listOpenDocuments,
    selectDocument,
    inspectDocuments: snapshotOpenDocuments,
    closeDocument,
    saveDocument,
    setLayerVisibility,
    deleteLayer,
    transformLayer,
  },
  ui,
});

if (elements.templateSelect) {
  Object.values(templateProfiles).forEach((profile) => {
    const option = document.createElement("option");
    option.value = profile.id;
    option.textContent = profile.label;
    elements.templateSelect.appendChild(option);
  });
  elements.templateSelect.addEventListener("change", () => {
    setActiveTemplate(templateProfiles[elements.templateSelect.value] || null);
    updateTemplateControls();
  });
}

elements.refreshButton?.addEventListener("click", () => { void snapshot.sendSnapshot(); });
elements.renameButton?.addEventListener("click", () => { void naming.applyRhvNames(); });
elements.placeButton?.addEventListener("click", () => { void placement.placeMemberPhoto(); });
elements.batchPlaceButton?.addEventListener("click", () => { void placement.batchPlacePhotos(); });
elements.inspectButton?.addEventListener("click", () => { void inspection.inspectMember("RM"); });

setTimeout(() => { void snapshot.sendSnapshot(); }, 500);
setInterval(() => { void remote.pollRemoteCommands(); }, 700);
