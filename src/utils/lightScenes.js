export const MAX_LIGHT_SCENES = 3;

const isSceneId = (value) =>
  typeof value === 'string' && value.startsWith('scene.') && value.length > 'scene.'.length;

/**
 * Scenes picked for a light card (`cardSettings[key].lightScenes`): scene ids only, at most three.
 * @param {unknown} value
 * @returns {string[]}
 */
export function resolveLightScenes(value) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter(isSceneId))).slice(0, MAX_LIGHT_SCENES);
}

/**
 * @param {unknown} value
 * @param {unknown} sceneId
 * @returns {string[]}
 */
export function addLightScene(value, sceneId) {
  const current = resolveLightScenes(value);
  if (!isSceneId(sceneId) || current.includes(sceneId) || current.length >= MAX_LIGHT_SCENES) {
    return current;
  }
  return [...current, sceneId];
}

/**
 * @param {unknown} value
 * @param {string} sceneId
 * @returns {string[]}
 */
export function removeLightScene(value, sceneId) {
  return resolveLightScenes(value).filter((id) => id !== sceneId);
}
