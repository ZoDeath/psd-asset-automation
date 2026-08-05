// Built-in guide geometry calibrated from the BTS Card_Photo RM Face_Guide.
// Keep this separate so guide revisions only require changing this module.
const FACE_GUIDES = {
  BTS_CARD_COMMON: {
    canvas: { width: 390, height: 512 },
    bounds: { left: 19, top: 1, right: 372, bottom: 429 },
    faceFillRatio: 0.67,
  },
};

function getFaceGuide(id = "BTS_CARD_COMMON") {
  const guide = FACE_GUIDES[id] || FACE_GUIDES.BTS_CARD_COMMON;
  const { canvas, bounds } = guide;
  const width = bounds.right - bounds.left;
  const height = bounds.bottom - bounds.top;
  return {
    ...guide,
    normalized: {
      left: bounds.left / canvas.width,
      top: bounds.top / canvas.height,
      right: bounds.right / canvas.width,
      bottom: bounds.bottom / canvas.height,
      centerX: (bounds.left + bounds.right) / 2 / canvas.width,
      centerY: (bounds.top + bounds.bottom) / 2 / canvas.height,
      width: width / canvas.width,
      height: height / canvas.height,
    },
  };
}

module.exports = { FACE_GUIDES, getFaceGuide };
