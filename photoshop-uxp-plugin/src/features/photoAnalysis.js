function createPhotoAnalyzer({ bridgeUrl }) {
  async function analyzePhotoFile(file) {
    const nativePath = file?.nativePath;
    if (!nativePath) throw new Error("The selected photo has no local path.");
    const response = await fetch(`${bridgeUrl}/analyze-face`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: nativePath }),
    });
    if (!response.ok) throw new Error(`Vision bridge HTTP ${response.status}`);
    const analysis = await response.json();
    if (!analysis?.ok || !analysis.face) throw new Error(analysis?.message || "No face was detected.");
    return analysis;
  }

  return { analyzePhotoFile };
}

module.exports = { createPhotoAnalyzer };
