const fs = require("uxp").storage.localFileSystem;

const PHOTO_FOLDER_TOKEN_KEY = "rhv.photoFolderToken";
const EXTENSIONS = ["png", "jpg", "jpeg", "webp"];

async function getPhotoFolder(folderPath = null) {
  if (folderPath) {
    const normalized = String(folderPath).replace(/\\/g, "/");
    const url = normalized.startsWith("file:") ? normalized : `file:/${normalized.replace(/^\/+/, "")}`;
    try {
      const entry = await fs.getEntryWithUrl(url);
      if (entry?.isFolder) return entry;
    } catch (error) {
      console.warn("RHV direct photo-folder access unavailable; using saved permission", error);
    }
  }
  const savedToken = localStorage.getItem(PHOTO_FOLDER_TOKEN_KEY);
  if (savedToken) {
    try {
      const entry = await fs.getEntryForPersistentToken(savedToken);
      if (entry?.isFolder) return entry;
    } catch (error) {
      console.warn("RHV saved photo-folder permission expired", error);
      localStorage.removeItem(PHOTO_FOLDER_TOKEN_KEY);
    }
  }
  const selected = await fs.getFolder();
  if (selected) {
    try { localStorage.setItem(PHOTO_FOLDER_TOKEN_KEY, await fs.createPersistentToken(selected)); }
    catch (error) { console.warn("RHV photo-folder permission could not be saved", error); }
  }
  return selected;
}

async function indexPhotoFolder(folder) {
  const files = new Map();
  for (const entry of await folder.getEntries()) {
    if (entry?.name) files.set(String(entry.name).toLowerCase(), entry);
  }
  return files;
}

async function findMemberFile(folder, member, fileIndex = null) {
  const files = fileIndex || await indexPhotoFolder(folder);
  const key = String(member || "").trim().toLowerCase();
  return EXTENSIONS.map((extension) => files.get(`${key}.${extension}`)).find(Boolean) || null;
}

module.exports = { getPhotoFolder, indexPhotoFolder, findMemberFile, EXTENSIONS };
