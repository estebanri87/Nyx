/**
 * Entity ids a service call is aimed at, from `entity_id` or `target.entity_id`.
 * @param {any} data
 * @returns {string[]}
 */
export function getServiceTargetEntityIds(data) {
  const raw = data?.target?.entity_id ?? data?.entity_id;
  const ids = Array.isArray(raw) ? raw : [raw];
  return ids.filter((id) => typeof id === 'string' && id.includes('.'));
}

/**
 * Targets Home Assistant reports as unavailable. A call is refused only when every target
 * is: a group with one dead member still reaches the others. `unknown` is left alone, since
 * buttons, scenes and scripts sit in it until first used.
 * @param {any} data
 * @param {Record<string, { state?: string }>} entities
 * @returns {string[]}
 */
export function getUnavailableServiceTargets(data, entities) {
  const ids = getServiceTargetEntityIds(data);
  if (ids.length === 0) return [];
  const unavailable = ids.filter((id) => entities?.[id]?.state === 'unavailable');
  return unavailable.length === ids.length ? unavailable : [];
}
