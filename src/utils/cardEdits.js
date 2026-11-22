/**
 * Duplicating a card and changing the entity a card shows, from the edit popup.
 * Card settings are stored per page under "<pageId>::<cardId>".
 */

/** The page a card's settings key belongs to. */
export function pageOfSettingsKey(settingsKey) {
  const index = typeof settingsKey === 'string' ? settingsKey.indexOf('::') : -1;
  return index > 0 ? settingsKey.slice(0, index) : null;
}

/** Cards named after their entity ("light.kitchen"); their id is the entity they show. */
function isDirectEntityCard(cardId) {
  return cardId.includes('.');
}

/**
 * Whether the edit popup offers Duplicate. Cards named after their entity cannot be on one
 * page twice, and the legacy media player, legacy light and car cards, spacers and people have
 * no use for a copy.
 */
export function canDuplicateCard(cardId, pageId, pagesConfig) {
  if (!cardId || !pageId || !Array.isArray(pagesConfig?.[pageId])) return false;
  if (pageId === 'header' || pageId === 'settings') return false;
  if (isDirectEntityCard(cardId)) return false;
  return (
    cardId !== 'media_player' &&
    cardId !== 'car' &&
    !cardId.startsWith('light_') &&
    !cardId.startsWith('spacer_card_')
  );
}

const deepCopy = (value) => JSON.parse(JSON.stringify(value ?? {}));

/**
 * A copy of the card right after it, with its own id and a copy of its settings.
 * @returns {{ newCardId: string, pagesConfig: object, cardSettings: object } | null}
 */
export function duplicateCard({ cardId, pageId, pagesConfig, cardSettings, now = Date.now() }) {
  if (!canDuplicateCard(cardId, pageId, pagesConfig)) return null;
  const unique = `${now.toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const newCardId = `${cardId.replace(/__dup_[a-z0-9]+$/, '')}__dup_${unique}`;

  const list = [...pagesConfig[pageId]];
  const index = list.indexOf(cardId);
  list.splice(index === -1 ? list.length : index + 1, 0, newCardId);

  const source = cardSettings[`${pageId}::${cardId}`] || cardSettings[cardId] || {};
  return {
    newCardId,
    pagesConfig: { ...pagesConfig, [pageId]: list },
    cardSettings: { ...cardSettings, [`${pageId}::${newCardId}`]: deepCopy(source) },
  };
}

const field = (settingKey, domain, labelKey = 'editCard.entityRequired', required = true) => ({
  settingKey,
  labelKey,
  domains: [domain],
  required,
});

/**
 * The entities a card can swap in place. `settingKey` is the card setting its renderer reads;
 * null means the card is named after its entity, so changing it gives the card a new id.
 */
export function getCardEntityFields(cardId) {
  if (!cardId) return [];
  if (cardId.startsWith('cover_card_')) return [field('coverId', 'cover')];
  if (cardId.startsWith('climate_card_')) return [field('climateId', 'climate')];
  if (cardId.startsWith('alarm_card_')) return [field('alarmId', 'alarm_control_panel')];
  if (cardId.startsWith('camera_card_')) return [field('cameraId', 'camera')];
  if (cardId.startsWith('lock_card_')) return [field('lockId', 'lock')];
  if (cardId.startsWith('weather_temp_')) return [field('weatherId', 'weather')];
  if (cardId.startsWith('nordpool_card_')) return [field('nordpoolId', 'sensor')];
  if (cardId.startsWith('androidtv_card_')) {
    return [
      field('mediaPlayerId', 'media_player', 'addCard.mediaPlayerRequired'),
      field('remoteId', 'remote', 'addCard.remoteOptional', false),
    ];
  }
  if (isDirectEntityCard(cardId) && !cardId.startsWith('person.')) {
    return [field(null, cardId.slice(0, cardId.indexOf('.')))];
  }
  return [];
}

/**
 * Gives a card named after its entity the new entity: the card takes the new id in the same
 * place, and keeps its settings, name and icon.
 * @returns {{ pagesConfig: object, cardSettings: object, customNames: object, customIcons: object } | null}
 *   null when the page already shows the new entity.
 */
export function replaceCardEntity({
  cardId,
  newEntityId,
  pageId,
  pagesConfig,
  cardSettings,
  customNames,
  customIcons,
}) {
  const list = pagesConfig?.[pageId];
  if (!Array.isArray(list) || !newEntityId || newEntityId === cardId) return null;
  if (list.includes(newEntityId)) return null;

  const oldKey = `${pageId}::${cardId}`;
  const nextSettings = { ...cardSettings };
  const settings = cardSettings[oldKey] || cardSettings[cardId];
  if (settings) nextSettings[`${pageId}::${newEntityId}`] = deepCopy(settings);
  delete nextSettings[oldKey];

  // Names and icons are shared by every page that shows the entity; the old ones stay.
  const carry = (map) =>
    map?.[cardId] && !map[newEntityId] ? { ...map, [newEntityId]: map[cardId] } : map;

  return {
    pagesConfig: {
      ...pagesConfig,
      [pageId]: list.map((id) => (id === cardId ? newEntityId : id)),
    },
    cardSettings: nextSettings,
    customNames: carry(customNames),
    customIcons: carry(customIcons),
  };
}
