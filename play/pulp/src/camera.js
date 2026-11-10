// Webcam: open a camera and skip ones that only deliver black frames (on this Mac an
// iPhone Continuity Camera can take the default slot, and the FaceTime camera sometimes
// opens but stays black).

const probe = document.createElement('canvas');
probe.width = 32; probe.height = 18;
const pctx = probe.getContext('2d', { willReadFrequently: true });

export function frameBrightness(video) {
  if (video.readyState < 2) return 0;
  pctx.drawImage(video, 0, 0, 32, 18);
  const d = pctx.getImageData(0, 0, 32, 18).data;
  let s = 0;
  for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2];
  return s / (d.length / 4) / 3;
}

export async function listCameras() {
  const all = await navigator.mediaDevices.enumerateDevices();
  return all.filter((d) => d.kind === 'videoinput');
}

function stop(video) {
  const s = video.srcObject;
  if (s) s.getTracks().forEach((t) => t.stop());
  video.srcObject = null;
}

async function open(video, deviceId) {
  stop(video);
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { deviceId: deviceId ? { exact: deviceId } : undefined, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 60 } },
  });
  video.srcObject = stream;
  await video.play();
  const track = stream.getVideoTracks()[0];
  return { deviceId: track.getSettings().deviceId, label: track.label };
}

async function isLive(video, ms = 1800) {
  const t0 = performance.now();
  while (performance.now() - t0 < ms) {
    await new Promise((r) => setTimeout(r, 120));
    if (frameBrightness(video) > 6) return true;
  }
  return false;
}

// Try the preferred camera, then the default, then every other one. Returns {deviceId, label, live}.
export async function openBestCamera(video, preferredId, onStatus = () => {}) {
  const tried = new Set();
  const attempt = async (id) => {
    try {
      const info = await open(video, id);
      tried.add(info.deviceId);
      onStatus(`Checking ${info.label || 'camera'}…`);
      if (await isLive(video)) return { ...info, live: true };
    } catch (e) {
      if (e.name === 'NotAllowedError') throw e;
      console.warn('camera failed', id, e);
    }
    return null;
  };
  let got = preferredId && (await attempt(preferredId));
  if (got) return got;
  got = await attempt(undefined);
  if (got) return got;
  for (const cam of await listCameras()) {
    if (tried.has(cam.deviceId)) continue;
    got = await attempt(cam.deviceId);
    if (got) return got;
  }
  // Nothing looked live: keep whatever is open (maybe a very dark room).
  const track = video.srcObject?.getVideoTracks()[0];
  if (!track) throw new Error('No camera could be opened');
  return { deviceId: track.getSettings().deviceId, label: track.label, live: false };
}

export async function switchCamera(video, deviceId) { return open(video, deviceId); }
