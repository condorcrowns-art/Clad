/**
 * One place for the things you are most likely to change.
 *
 * The avatar is `brunette.glb`, the ready-made female model that ships with
 * met4citizen/TalkingHead (built with Ready Player Me, CC BY-NC 4.0 — free for
 * non-commercial use). Keep the version here in step with the `talkinghead`
 * entry in the import map in index.html.
 */

export const TALKINGHEAD_VERSION = '1.7';

const CDN = `https://cdn.jsdelivr.net/gh/met4citizen/TalkingHead@${TALKINGHEAD_VERSION}`;

/** Passed straight to `head.showAvatar()`. */
export const AVATAR = {
  url: `${CDN}/avatars/brunette.glb`,
  body: 'F',
  avatarMood: 'neutral',
  lipsyncLang: 'en'
};

/** Passed to the `TalkingHead` constructor. */
export const HEAD_OPTIONS = {
  lipsyncModules: ['en'],
  lipsyncLang: 'en',
  cameraView: 'upper',
  cameraRotateEnable: true,
  cameraZoomEnable: true,
  modelFPS: 30,
  modelPixelRatio: Math.min(window.devicePixelRatio || 1, 2),
  lightAmbientIntensity: 2.2,
  lightDirectIntensity: 26,
  avatarIdleEyeContact: 0.35,
  avatarSpeakingEyeContact: 0.7
};
