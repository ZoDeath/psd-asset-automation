const { action, constants } = require("photoshop");
const { readLayerBounds } = require("../photoshop/layers");
const { getFaceGuide } = require("./faceGuide");

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

async function transformPhotoToGuide({ innerDocument, innerLayer, analysis, placement = {} }) {
  if (!analysis?.ok || !analysis.face) throw new Error("Face analysis is required before automatic placement.");
  const face = analysis.face;
  const selectResult = await action.batchPlay([{
    _obj: "select",
    _target: [{ _ref: "layer", _id: innerLayer.id }],
    makeVisible: true,
    _options: { dialogOptions: "dontDisplay" },
  }], { synchronousExecution: true });
  const selectError = selectResult.find((entry) => entry?._obj === "error" || entry?.result < 0);
  if (selectError) throw new Error(selectError.message || "Could not select the placed photo layer.");
  const layer = Array.from(innerDocument.activeLayers || [])[0] || innerLayer;
  const bounds = readLayerBounds(layer);
  if (!bounds) throw new Error("Could not read the placed photo bounds.");
  const canvasWidth = Number(innerDocument.width);
  const canvasHeight = Number(innerDocument.height);
  if (!(canvasWidth > 0 && canvasHeight > 0)) throw new Error("Could not read the smart-object canvas size.");

  const guide = getFaceGuide(placement.faceGuide || "BTS_CARD_COMMON");
  const sourceFace = {
    x: bounds.left + bounds.width * Number(face.center.x),
    y: bounds.top + bounds.height * Number(face.center.y),
  };
  const sourceCenter = { x: bounds.centerX, y: bounds.centerY };
  const relativeFace = { x: sourceFace.x - sourceCenter.x, y: sourceFace.y - sourceCenter.y };
  const targetFace = {
    x: canvasWidth * clamp(Number(guide.normalized.centerX), 0, 1),
    y: canvasHeight * clamp(Number(guide.normalized.centerY), 0, 1),
  };
  const desiredFaceHeight = canvasHeight * guide.normalized.height * Number(guide.faceFillRatio || 0.67);
  const currentFaceHeight = Math.max(1, bounds.height * Number(face.height || 0));
  const scale = clamp(desiredFaceHeight / currentFaceHeight, 0.1, 8);
  const rotation = clamp((Number(placement.targetRotation) || 0) - Number(face.angle || 0), -60, 60);
  const radians = rotation * Math.PI / 180;
  const rotatedFace = {
    x: relativeFace.x * Math.cos(radians) - relativeFace.y * Math.sin(radians),
    y: relativeFace.x * Math.sin(radians) + relativeFace.y * Math.cos(radians),
  };

  if (rotation !== 0) await layer.rotate(rotation, constants.AnchorPosition.MIDDLECENTER);
  if (scale !== 1) await layer.scale(scale * 100, scale * 100, constants.AnchorPosition.MIDDLECENTER);
  await layer.translate(
    targetFace.x - (sourceCenter.x + rotatedFace.x * scale),
    targetFace.y - (sourceCenter.y + rotatedFace.y * scale),
  );
  return { applied: true, scale, rotation, guide: placement.faceGuide || "BTS_CARD_COMMON", face: { ...face.center, width: face.width, height: face.height } };
}

module.exports = { transformPhotoToGuide };
