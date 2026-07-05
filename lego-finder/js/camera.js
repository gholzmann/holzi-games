// js/camera.js — Kamerazugriff und Canvas-Hilfsfunktionen (nur Browser)

export async function startCamera(video) {
  const stream = await navigator.mediaDevices.getUserMedia({
    // Möglichst hohe Auflösung: bei einem Weitfoto der Kiste bleiben so mehr
    // Pixel pro Stein übrig — entscheidend, damit Brickognize die Crops erkennt.
    video: {
      facingMode: { ideal: 'environment' },
      width: { ideal: 3840 },
      height: { ideal: 2160 },
    },
    audio: false,
  });
  video.srcObject = stream;
  await video.play();
  return stream;
}

export function stopCamera(video) {
  const stream = video.srcObject;
  if (stream) stream.getTracks().forEach((t) => t.stop());
  video.srcObject = null;
}

function scaledCanvas(source, srcW, srcH, maxWidth) {
  const scale = Math.min(1, maxWidth / srcW);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(srcW * scale);
  canvas.height = Math.round(srcH * scale);
  canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export function captureFrame(video, maxWidth = 1600) {
  return scaledCanvas(video, video.videoWidth, video.videoHeight, maxWidth);
}

export function canvasFromFile(file, maxWidth = 1600) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(scaledCanvas(img, img.naturalWidth, img.naturalHeight, maxWidth));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Bild konnte nicht geladen werden'));
    };
    img.src = url;
  });
}

export function canvasToBlob(canvas, quality = 0.85) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Bild-Export fehlgeschlagen'))),
      'image/jpeg', quality);
  });
}

// Ausschnitt einer Box mit relativem Rand, an die Bildgrenzen geklemmt.
export function cropToBlob(canvas, box, margin = 0.15, quality = 0.85) {
  const mx = Math.round(box.w * margin);
  const my = Math.round(box.h * margin);
  const x = Math.max(0, box.x - mx);
  const y = Math.max(0, box.y - my);
  const w = Math.min(canvas.width - x, box.w + 2 * mx);
  const h = Math.min(canvas.height - y, box.h + 2 * my);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  c.getContext('2d').drawImage(canvas, x, y, w, h, 0, 0, w, h);
  return canvasToBlob(c, quality);
}

export function downscaleImageData(canvas, maxWidth) {
  const small = scaledCanvas(canvas, canvas.width, canvas.height, maxWidth);
  return small.getContext('2d').getImageData(0, 0, small.width, small.height);
}
