"""Return lightweight face geometry for a local image.

This is intentionally a small local helper for the Photoshop development
bridge. It returns normalized coordinates so the UXP panel can apply the final
transform in Photoshop without moving the image file to the server.
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

DEPS = Path(__file__).resolve().parent.parent / "vision-deps"
if DEPS.exists():
    sys.path.insert(0, str(DEPS))

import cv2
import numpy as np

CASCADE_ROOT = Path(cv2.data.haarcascades)
FACE_DETECTORS = [
    (cv2.CascadeClassifier(str(CASCADE_ROOT / "haarcascade_frontalface_alt2.xml")), "frontal-alt"),
    (cv2.CascadeClassifier(str(CASCADE_ROOT / "haarcascade_frontalface_default.xml")), "frontal"),
]
EYE_DETECTOR = cv2.CascadeClassifier(str(CASCADE_ROOT / "haarcascade_eye_tree_eyeglasses.xml"))


def _as_candidate(rect, image_width, image_height, source, rotation=0.0, detection_rect=None):
    x, y, width, height = [int(value) for value in rect]
    candidate = {
        "x": x / image_width,
        "y": y / image_height,
        "width": width / image_width,
        "height": height / image_height,
        "source": source,
        "rotation": rotation,
    }
    if detection_rect is not None:
        dx, dy, detection_width, detection_height = [float(value) for value in detection_rect]
        candidate["_detection"] = {
            "x": dx / image_width,
            "y": dy / image_height,
            "width": detection_width / image_width,
            "height": detection_height / image_height,
        }
    return candidate


def _detect_faces(gray, image_width, image_height):
    candidates = []
    minimum = max(48, min(image_width, image_height) // 10)
    center = (image_width / 2, image_height / 2)

    def scan(rotation):
        matrix = cv2.getRotationMatrix2D(center, rotation, 1.0)
        rotated = cv2.warpAffine(gray, matrix, (image_width, image_height)) if rotation else gray
        inverse = cv2.invertAffineTransform(matrix)
        for detector, source in FACE_DETECTORS:
            if detector.empty():
                continue
            rectangles = detector.detectMultiScale(rotated, scaleFactor=1.06, minNeighbors=4, minSize=(minimum, minimum))
            for rectangle in rectangles:
                x, y, width, height = [float(value) for value in rectangle]
                corners = cv2.transform(np.array([[[x, y], [x + width, y], [x + width, y + height], [x, y + height]]], dtype="float32"), inverse)[0]
                left, top = corners.min(axis=0)
                right, bottom = corners.max(axis=0)
                candidates.append(_as_candidate(
                    (left, top, right - left, bottom - top),
                    image_width,
                    image_height,
                    source,
                    rotation,
                    detection_rect=(x, y, width, height),
                ))

    # Most portraits are upright, so avoid two extra full-image scans unless
    # the fast zero-degree pass fails. Tilted assets still get both fallbacks.
    scan(0)
    if not candidates:
        scan(-35)
        scan(35)
    return candidates


def _estimate_angle(gray, face):
    if EYE_DETECTOR.empty():
        return -float(face.get("rotation", 0.0))
    rotation = float(face.get("rotation", 0.0))
    if rotation:
        height, width = gray.shape[:2]
        matrix = cv2.getRotationMatrix2D((width / 2, height / 2), rotation, 1.0)
        working = cv2.warpAffine(gray, matrix, (width, height))
        bounds = face.get("_detection", face)
    else:
        working = gray
        bounds = face
    height, width = working.shape[:2]
    left = max(0, int(bounds["x"] * width))
    top = max(0, int(bounds["y"] * height))
    right = min(width, int((bounds["x"] + bounds["width"]) * width))
    bottom = min(height, int((bounds["y"] + bounds["height"]) * height))
    region = working[top:bottom, left:right]
    if region.size == 0:
        return -rotation
    eyes = EYE_DETECTOR.detectMultiScale(region, scaleFactor=1.08, minNeighbors=5, minSize=(max(12, region.shape[1] // 10), max(12, region.shape[0] // 10)))
    if len(eyes) < 2:
        return -rotation
    centers = sorted(((x + w / 2, y + h / 2) for x, y, w, h in eyes[:4]), key=lambda point: point[0])[:2]
    dx = centers[1][0] - centers[0][0]
    dy = centers[1][1] - centers[0][1]
    return math.degrees(math.atan2(dy, dx)) - rotation


def analyze(path):
    image = cv2.imread(str(path), cv2.IMREAD_UNCHANGED)
    if image is None:
        raise RuntimeError(f"Unable to read image: {path}")
    if len(image.shape) == 2:
        bgr = cv2.cvtColor(image, cv2.COLOR_GRAY2BGR)
    elif image.shape[2] == 4:
        # Composite transparency on a neutral background for Haar detection.
        alpha = image[:, :, 3:4].astype("float32") / 255.0
        rgb = image[:, :, :3].astype("float32")
        bgr = (rgb * alpha + 245.0 * (1.0 - alpha)).astype("uint8")
    else:
        bgr = image[:, :, :3]
    height, width = bgr.shape[:2]
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    # Detection does not need the source resolution. Keeping the long edge at
    # 1200px greatly reduces the cost while normalized coordinates stay exact.
    detection_limit = 1200
    longest = max(gray.shape[:2])
    if longest > detection_limit:
        ratio = detection_limit / float(longest)
        gray = cv2.resize(gray, (max(1, int(gray.shape[1] * ratio)), max(1, int(gray.shape[0] * ratio))), interpolation=cv2.INTER_AREA)
    detection_height, detection_width = gray.shape[:2]
    gray = cv2.equalizeHist(gray)
    faces = _detect_faces(gray, detection_width, detection_height)
    if not faces:
        return {"ok": False, "width": width, "height": height, "faces": [], "message": "No face detected"}
    priority = {"frontal-alt": 3, "frontal": 2, "profile": 1, "profile-mirrored": 1}
    face = max(faces, key=lambda item: (item["width"] * item["height"], priority.get(item["source"], 0)))
    face["angle"] = _estimate_angle(gray, face)
    face["center"] = {"x": face["x"] + face["width"] / 2, "y": face["y"] + face["height"] / 2}
    for candidate in faces:
        candidate.pop("_detection", None)
    return {"ok": True, "width": width, "height": height, "face": face, "faces": faces, "detector": "opencv-haar"}


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: analyze_face.py IMAGE_PATH")
    print(json.dumps(analyze(Path(sys.argv[1])), ensure_ascii=False))
