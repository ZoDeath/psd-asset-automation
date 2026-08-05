const fs = require("uxp").storage.localFileSystem;
const { createPhotoAnalyzer } = require("./photoAnalysis");
const { getPhotoFolder, indexPhotoFolder, findMemberFile } = require("./photoFiles");
const {
  closeTransientSmartObjectIfOpen,
  placeMemberPhotoContents,
  saveParentDocument,
} = require("./smartObjectPlacement");

const PHOTO_TYPES = ["png", "jpg", "jpeg", "webp"];

function emptyResult(extra = {}) {
  return { placed: [], missing: [], failed: [], ...extra };
}

function createPhotoPlacement({ bridgeUrl, getActiveTemplate, ui }) {
  const analyzer = createPhotoAnalyzer({ bridgeUrl });

  async function placeAnalyzedMember(member, file, options = {}) {
    const analysis = await analyzer.analyzePhotoFile(file);
    return placeMemberPhotoContents({
      member,
      file,
      analysis,
      getActiveTemplate,
      saveParent: options.saveParent !== false,
    });
  }

  async function placeMemberPhoto() {
    const member = String(ui.memberSelect?.value || "RM").trim().toUpperCase();
    if (ui.placeButton) ui.placeButton.disabled = true;
    try {
      const file = await fs.getFileForOpening({ types: PHOTO_TYPES });
      if (!file) return;
      const fit = await placeAnalyzedMember(member, file);
      ui.statusElement.textContent = fit.applied ? `${member} photo placement complete` : `${member} photo placement incomplete`;
      await ui.sendSnapshot();
    } catch (error) {
      console.error("RHV photo placement failed", error);
      ui.statusElement.textContent = `${member} photo placement failed: ${error?.message || error}`;
    } finally {
      if (ui.placeButton) ui.placeButton.disabled = false;
    }
  }

  async function placeMemberFromFolder(member, options = {}) {
    const normalizedMember = String(member || "").trim().toUpperCase();
    if (!normalizedMember) return emptyResult({ missing: ["member"], failed: ["Member name is required"] });
    try {
      await closeTransientSmartObjectIfOpen();
      const folder = await getPhotoFolder(options.folderPath || options.path || null);
      if (!folder) return emptyResult({ cancelled: true });
      const file = await findMemberFile(folder, normalizedMember);
      if (!file) return emptyResult({ missing: [`${normalizedMember.toLowerCase()}.png/jpg/jpeg/webp`] });
      const fit = await placeAnalyzedMember(normalizedMember, file);
      ui.statusElement.textContent = `${normalizedMember} photo placement complete`;
      await ui.sendSnapshot();
      return emptyResult({ placed: [fit.applied ? `${normalizedMember}: applied` : `${normalizedMember}: placed`] });
    } catch (error) {
      console.error(`RHV member placement failed for ${normalizedMember}`, error);
      return emptyResult({ failed: [`${normalizedMember}: ${error?.message || String(error)}`] });
    }
  }

  async function batchPlacePhotos(options = {}) {
    if (ui.batchPlaceButton) ui.batchPlaceButton.disabled = true;
    if (ui.placeButton) ui.placeButton.disabled = true;
    const outcome = emptyResult();
    let parentDocumentId = null;
    try {
      await closeTransientSmartObjectIfOpen();
      const folder = await getPhotoFolder(options.folderPath || options.path || null);
      if (!folder) return { ...outcome, cancelled: true };
      const fileIndex = await indexPhotoFolder(folder);
      const profileMembers = Array.from(getActiveTemplate()?.memberMappings || [], (mapping) => mapping[0]);
      const requestedMembers = Array.from(new Set(
        (Array.isArray(options.members) && options.members.length ? options.members : profileMembers.length ? profileMembers : ["RM"])
          .map((member) => String(member || "").trim().toUpperCase())
          .filter(Boolean),
      ));
      for (const memberValue of requestedMembers) {
        const member = memberValue;
        const file = await findMemberFile(folder, member, fileIndex);
        if (!file) {
          outcome.missing.push(`${member.toLowerCase()}.png/jpg/jpeg/webp`);
          continue;
        }
        try {
          const fit = await placeAnalyzedMember(member, file, { saveParent: false });
          parentDocumentId = fit.parentDocumentId;
          outcome.placed.push(fit.applied ? `${member}: applied` : `${member}: placed`);
        } catch (error) {
          outcome.failed.push(`${member}: ${error?.message || String(error)}`);
        }
      }
      if (outcome.placed.length && parentDocumentId !== null) {
        await saveParentDocument(parentDocumentId);
      }
      ui.summaryElement.textContent = [
        `Placement complete: ${outcome.placed.length}${outcome.placed.length ? ` (${outcome.placed.join(", ")})` : ""}`,
        outcome.missing.length ? `Files missing: ${outcome.missing.join(", ")}` : "No files missing",
        outcome.failed.length ? `Failed: ${outcome.failed.join(" | ")}` : "No failures",
      ].join("\n");
      ui.statusElement.textContent = `Batch placement complete · ${outcome.placed.length} applied`;
      if (outcome.placed.length) await ui.sendSnapshot();
      return outcome;
    } finally {
      if (ui.batchPlaceButton) ui.batchPlaceButton.disabled = false;
      if (ui.placeButton) ui.placeButton.disabled = false;
    }
  }

  return { placeMemberPhoto, batchPlacePhotos, placeMemberFromFolder, closeTransientSmartObjectIfOpen };
}

module.exports = { createPhotoPlacement };
