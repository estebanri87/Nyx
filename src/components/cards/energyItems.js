/**
 * Shared model for the compact layout of the energy card.
 *
 * The card shows a row of freely defined sensor readouts instead of the
 * flow diagram. Each item is stored as
 * `{ id, label, entityId, icon, min, max }` and is display-only — unlike the
 * cover rows there is no toggle or action type.
 *
 * Header items are the two large values above the row, e.g. produced and
 * consumed energy for the day.
 */

import {
  createCustomItemId,
  formatItemValue,
  getEntityNumericValue,
  normalizeCustomItems,
} from './customItems';

// Re-exported under the names the energy card already uses.
export const createEnergyItemId = createCustomItemId;
export const normalizeEnergyItems = normalizeCustomItems;
export const formatEnergyValue = formatItemValue;
export { getEntityNumericValue };

/** An item with `source: 'home'` has no sensor of its own; see `resolveHomeItemEntity`. */
export const ENERGY_SOURCE_HOME = 'home';

/** Below this magnitude a power readout counts as idle rather than flowing. */
export const POWER_IDLE_THRESHOLD_W = 10;

export const ENERGY_CHARGE_COLOR = '#22c55e';
export const ENERGY_DISCHARGE_COLOR = '#f97316';

/**
 * Raw status strings (Vaillant, GoodWe, ...) -> status key. Compared lower-cased
 * with spaces and dashes folded to underscores.
 */
const STATUS_KEY_MAP = {
  heating: 'heating',
  heat: 'heating',
  central_heating: 'heating',
  domestic_hot_water: 'dhw',
  hot_water: 'dhw',
  dhw: 'dhw',
  warm_water: 'dhw',
  standby: 'standby',
  stand_by: 'standby',
  off: 'standby',
  idle: 'idle',
  // GoodWe grid mode
  importing: 'importing',
  exporting: 'exporting',
  // GoodWe PV string mode
  'pv_panels_connected,_producing_power': 'producing',
  pv_panels_not_connected: 'inactive',
  cooling: 'cooling',
  cool: 'cooling',
  defrost: 'defrost',
  defrosting: 'defrost',
  charge: 'charging',
  charging: 'charging',
  discharge: 'discharging',
  discharging: 'discharging',
};

/** Status key -> badge icon name (resolved by the card from the icon set). */
export const STATUS_BADGE_ICONS = {
  heating: 'Flame',
  dhw: 'Droplets',
  standby: 'Moon',
  idle: 'Moon',
  importing: 'ArrowDown',
  exporting: 'ArrowUp',
  producing: 'Sun',
  inactive: 'Moon',
  cooling: 'Snowflake',
  defrost: 'Snowflake',
  charging: 'ArrowUp',
  discharging: 'ArrowDown',
};

const normalizeStatusValue = (value) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');

/**
 * Charge/discharge direction of a signed power value. By default a positive
 * value means discharging (GoodWe and the energy card's own convention);
 * `invert` flips it for sensors that report the other way round.
 */
export const getPowerDirection = (power, invert = false) => {
  if (power === null || Math.abs(power) < POWER_IDLE_THRESHOLD_W) return 'idle';
  const discharging = invert ? power < 0 : power > 0;
  return discharging ? 'discharging' : 'charging';
};

/**
 * Second line below an item's label.
 *
 * A numeric status entity is read as signed power: arrow plus magnitude, so a
 * battery shows "▼ 1.2 kW" while discharging. Anything else is a text state
 * mapped to a translated label; unknown values are shown as they are.
 *
 * @returns {{ text: string, statusKey: string | null, color: string | null } | null}
 */
export const getItemStatus = (statusEntity, item, translate) => {
  const raw = statusEntity?.state;
  if (raw === undefined || raw === null || raw === 'unavailable' || raw === 'unknown') return null;

  const power = getEntityNumericValue(statusEntity);
  if (power !== null) {
    const direction = getPowerDirection(power, !!item?.statusInvert);
    if (direction === 'idle') {
      return { text: translate('energyFlow.status.idle'), statusKey: 'standby', color: null };
    }
    const unit = statusEntity.attributes?.unit_of_measurement || '';
    const magnitude =
      unit === 'W' && Math.abs(power) >= 1000
        ? `${(Math.abs(power) / 1000).toFixed(1)} kW`
        : `${Math.round(Math.abs(power))} ${unit}`.trim();
    return {
      text: `${direction === 'charging' ? '▲' : '▼'} ${magnitude}`,
      statusKey: direction,
      color: direction === 'charging' ? ENERGY_CHARGE_COLOR : ENERGY_DISCHARGE_COLOR,
    };
  }

  const statusKey = STATUS_KEY_MAP[normalizeStatusValue(raw)] || null;
  if (!statusKey) return { text: String(raw), statusKey: null, color: null };
  const key = `energyFlow.status.${statusKey}`;
  const translated = translate(key);
  return {
    text: translated && translated !== key ? translated : String(raw),
    statusKey,
    color: null,
  };
};

/**
 * House consumption from the three power flows: PV + grid + battery, where grid
 * is positive when importing and battery positive when discharging. Missing
 * flows count as zero; with none at all there is nothing to calculate.
 */
export const computeHomeConsumption = ({ grid, solar, battery }) => {
  if (grid === null && solar === null && battery === null) return null;
  return Math.max(0, (solar ?? 0) + (grid ?? 0) + (battery ?? 0));
};

/**
 * Stand-in entity for a calculated house-consumption item, shaped like a real
 * power sensor so the ring renders it like any other item.
 */
export const resolveHomeItemEntity = (item, entities) => {
  const value = computeHomeConsumption({
    grid: getEntityNumericValue(entities?.[item.homeGridId]),
    solar: getEntityNumericValue(entities?.[item.homeSolarId]),
    battery: getEntityNumericValue(entities?.[item.homeBatteryId]),
  });
  return {
    entity_id: `calculated.${item.id}`,
    state: value === null ? 'unavailable' : String(Math.round(value)),
    attributes: { unit_of_measurement: 'W', friendly_name: item.label || '' },
  };
};

/** The entity an item reads: its sensor, or the calculated house stand-in. */
export const resolveEnergyItemEntity = (item, entities) =>
  item.source === ENERGY_SOURCE_HOME
    ? resolveHomeItemEntity(item, entities)
    : entities?.[item.entityId];

/** Items ready to render; calculated house items need no sensor of their own. */
export const getRenderableEnergyItems = (items, entities) =>
  normalizeCustomItems(items).filter((item) =>
    item.source === ENERGY_SOURCE_HOME
      ? !!(item.homeGridId || item.homeSolarId || item.homeBatteryId)
      : item.entityId && entities?.[item.entityId]
  );

export const MAX_ENERGY_ITEMS = 8;
export const MAX_ENERGY_HEADER_ITEMS = 2;

/** Named colours kept for configurations written before free colours. */
export const ENERGY_THRESHOLD_COLOR_MAP = {
  red: 'var(--color-red-500)',
  amber: 'var(--color-amber-400)',
  green: 'var(--color-green-400)',
};

export const MIN_THRESHOLD_STEPS = 1;
export const MAX_THRESHOLD_STEPS = 6;

/** Suggested colours offered as swatches; any other value is allowed too. */
export const ENERGY_COLOR_SWATCHES = [
  '#ef4444',
  '#f97316',
  '#facc15',
  '#22c55e',
  '#14b8a6',
  '#38bdf8',
  '#6366f1',
  '#a855f7',
  '#ec4899',
  '#94a3b8',
];

export const DEFAULT_ENERGY_COLOR_THRESHOLDS = [
  { limit: 20, color: '#ef4444' },
  { limit: 60, color: '#facc15' },
  { limit: 100, color: '#22c55e' },
];

/** Resolves a stored colour, which is either a legacy name or a CSS colour. */
export const resolveThresholdColor = (color) =>
  ENERGY_THRESHOLD_COLOR_MAP[color] || color || 'var(--accent-color)';

/** One to six steps, sorted by limit; anything unusable falls back to the defaults. */
export const normalizeEnergyThresholds = (thresholds) => {
  const source =
    Array.isArray(thresholds) && thresholds.length > 0
      ? thresholds.slice(0, MAX_THRESHOLD_STEPS)
      : DEFAULT_ENERGY_COLOR_THRESHOLDS;
  const cleaned = source
    .filter((item) => item && typeof item === 'object')
    .map((item, index) => {
      const parsedLimit = parseFloat(item.limit);
      const fallback =
        DEFAULT_ENERGY_COLOR_THRESHOLDS[
          Math.min(index, DEFAULT_ENERGY_COLOR_THRESHOLDS.length - 1)
        ];
      return {
        limit: Number.isFinite(parsedLimit) ? parsedLimit : fallback.limit,
        color: item.color || fallback.color,
      };
    })
    .sort((a, b) => a.limit - b.limit);
  return cleaned.length ? cleaned : DEFAULT_ENERGY_COLOR_THRESHOLDS;
};

/** Where the value sits between the item's min and max, as 0..1. */
export const getEnergyItemRatio = (value, item) => {
  if (value === null) return 0;
  const min = Number.isFinite(Number(item?.min)) ? Number(item.min) : 0;
  const max = Number.isFinite(Number(item?.max)) ? Number(item.max) : 100;
  if (max === min) return 0;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
};

/**
 * Effective threshold settings for one item. Each readout carries its own
 * scale, because a value range that is "good" for one sensor says nothing
 * about another. Items configured before the per-item scale existed fall
 * back to the card-wide values, so their colours do not change.
 */
export const resolveItemThresholds = (item, cardSettings) => ({
  useThresholds: item?.useColorThresholds ?? cardSettings?.useColorThresholds ?? true,
  thresholds: item?.colorThresholds ?? cardSettings?.colorThresholds,
});

/**
 * Ring colour for one item. With thresholds enabled the percentage of the
 * item's range decides the step, mirroring how the sensor card colours its
 * gauge; otherwise the accent colour is used.
 */
export const getEnergyItemColor = (value, item, cardSettings) => {
  const { useThresholds, thresholds } = resolveItemThresholds(item, cardSettings);
  if (!useThresholds || value === null) return 'var(--accent-color)';
  const percent = getEnergyItemRatio(value, item) * 100;
  const steps = normalizeEnergyThresholds(thresholds);
  const matched = steps.find((step) => percent <= step.limit);
  return resolveThresholdColor(matched?.color || steps[steps.length - 1]?.color);
};
