// MediaPipe landmarkers, served locally (vendor/ + models/) so the game works offline.
import { FilesetResolver, HandLandmarker, FaceLandmarker } from '../../../assets/mediapipe/vision_bundle.mjs';

let fileset = null;
const files = async () => (fileset ??= await FilesetResolver.forVisionTasks(new URL('../../../assets/mediapipe/wasm', import.meta.url).href));
const model = (name) => new URL(`../../../assets/mediapipe/${name}`, import.meta.url).href;

async function withGpuFallback(make) {
  try { return await make('GPU'); } catch (e) {
    console.warn('GPU delegate failed, using CPU', e);
    return make('CPU');
  }
}

export async function createHands() {
  const fs = await files();
  return withGpuFallback((delegate) => HandLandmarker.createFromOptions(fs, {
    baseOptions: { modelAssetPath: model('hand_landmarker.task'), delegate },
    runningMode: 'VIDEO', numHands: 2,
    minHandDetectionConfidence: 0.55, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5,
  }));
}

export async function createFace() {
  const fs = await files();
  return withGpuFallback((delegate) => FaceLandmarker.createFromOptions(fs, {
    baseOptions: { modelAssetPath: model('face_landmarker.task'), delegate },
    runningMode: 'VIDEO', numFaces: 1,
    outputFaceBlendshapes: true, outputFacialTransformationMatrixes: false,
    minFaceDetectionConfidence: 0.5, minFacePresenceConfidence: 0.5, minTrackingConfidence: 0.5,
  }));
}
