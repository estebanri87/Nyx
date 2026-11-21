// Pure helpers for the energy page: entity slots, value formatting and the
// "where does the power go" split. Kept free of React so they can be tested.

/** Power below this many watts counts as "no flow". */
export const FLOW_THRESHOLD_W = 10;

/**
 * Entity slots a user can map in edit mode, grouped by the component they
 * belong to. `power` slots are read as watts for the flow calculation.
 */
export const ENERGY_SLOT_GROUPS = [
  { id: 'pv', slots: ['pvPower', 'pvToday', 'pvTotal', 'weather'] },
  { id: 'wr', slots: ['inverterMode', 'emsMode', 'inverterTemp'] },
  { id: 'bkw', slots: ['bkwPower', 'bkwToday', 'bkwTotal'] },
  {
    id: 'batt',
    slots: ['battSoc', 'battPower', 'battChargeToday', 'battDischargeToday', 'battSoh', 'battTemp'],
  },
  { id: 'netz', slots: ['gridPower', 'gridImportToday', 'gridExportToday'] },
  { id: 'haus', slots: ['houseConsumption', 'houseToday'] },
  { id: 'wp', slots: ['wpPower', 'wpToday', 'wpEfficiency', 'wpState', 'wpControl'] },
  { id: 'aussen', slots: ['outdoorTemp'] },
  {
    id: 'vorlauf',
    slots: ['flowTemp', 'flowSetpoint', 'systemFlowTemp', 'heatingCurve', 'pressure'],
  },
  { id: 'ww', slots: ['dhwTemp', 'dhwSetpoint'] },
];

/** Which page view shows a component's full detail. */
export const COMPONENT_OWNER = {
  haus: 'gesamt',
  pv: 'pv',
  wr: 'pv',
  bkw: 'pv',
  batt: 'pv',
  netz: 'pv',
  wp: 'wp',
  aussen: 'wp',
  vorlauf: 'wp',
  ww: 'wp',
};

export const DEFAULT_ENERGY_CONFIG = {
  slots: {},
  extras: {},
  strings: [],
  aliases: [],
  names: {},
  devices: [],
  advice: {},
  bkwBehindMeter: true,
  invertBattery: false,
  invertGrid: false,
};

export function normalizeEnergyConfig(raw) {
  const cfg = raw && typeof raw === 'object' ? raw : {};
  return {
    ...DEFAULT_ENERGY_CONFIG,
    ...cfg,
    slots: cfg.slots && typeof cfg.slots === 'object' ? cfg.slots : {},
    extras: cfg.extras && typeof cfg.extras === 'object' ? cfg.extras : {},
    strings: Array.isArray(cfg.strings) ? cfg.strings : [],
    aliases: Array.isArray(cfg.aliases) ? cfg.aliases : [],
    names: cfg.names && typeof cfg.names === 'object' ? cfg.names : {},
    devices: Array.isArray(cfg.devices) ? cfg.devices : [],
    advice: cfg.advice && typeof cfg.advice === 'object' ? cfg.advice : {},
  };
}

/** Numeric state of an entity, or null when missing or not a number. */
export function readNumber(entities, entityId) {
  if (!entityId) return null;
  const state = entities?.[entityId]?.state;
  if (state === undefined || state === null || state === '') return null;
  const value = Number(state);
  return Number.isFinite(value) ? value : null;
}

/** Slots holding power, read as watts whatever unit the sensor reports. */
export const POWER_SLOTS = new Set([
  'pvPower',
  'bkwPower',
  'battPower',
  'gridPower',
  'houseConsumption',
  'wpPower',
]);

/** Slots holding energy, read as kWh whatever unit the sensor reports. */
export const ENERGY_SLOTS = new Set([
  'pvToday',
  'pvTotal',
  'bkwToday',
  'bkwTotal',
  'battChargeToday',
  'battDischargeToday',
  'gridImportToday',
  'gridExportToday',
  'houseToday',
  'wpToday',
]);

const POWER_FACTOR = { mW: 0.001, W: 1, kW: 1000, MW: 1000000 };
const ENERGY_FACTOR = { Wh: 0.001, kWh: 1, MWh: 1000 };

const unitOf = (entities, entityId) => entities?.[entityId]?.attributes?.unit_of_measurement;

/** Power in watts; kW and MW sensors are converted. */
export function readPowerW(entities, entityId) {
  const value = readNumber(entities, entityId);
  if (value === null) return null;
  return value * (POWER_FACTOR[unitOf(entities, entityId)] ?? 1);
}

/** Energy in kWh; Wh and MWh sensors are converted. */
export function readEnergyKwh(entities, entityId) {
  const value = readNumber(entities, entityId);
  if (value === null) return null;
  return value * (ENERGY_FACTOR[unitOf(entities, entityId)] ?? 1);
}

/** Replace a raw HA state with the user's display name for it, if one is set. */
export function applyAlias(value, aliases) {
  if (value === null || value === undefined) return value;
  const match = (aliases || []).find(
    (a) => a && typeof a.from === 'string' && a.from.trim() === String(value).trim()
  );
  return match && match.to ? match.to : value;
}

export function formatNumber(value, locale, maxDecimals = 1) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '–';
  const decimals = Number.isInteger(value) ? 0 : maxDecimals;
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function formatWatts(value, locale) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '–';
  return `${formatNumber(Math.round(value), locale)} W`;
}

/** Entity state for display: number with unit, or the (aliased) text state. */
export function formatEntityState(entity, locale, aliases) {
  if (!entity) return '–';
  const { state, attributes } = entity;
  if (state === 'unavailable' || state === 'unknown') return '–';
  const value = Number(state);
  if (state !== '' && Number.isFinite(value)) {
    const unit = attributes?.unit_of_measurement;
    // Number entities (e.g. a heating curve with step 0.05) keep their step's precision.
    const stepDecimals = (String(attributes?.step ?? '').split('.')[1] || '').length;
    const decimals = unit === 'V' ? 3 : unit === 'W' ? 0 : Math.max(1, stepDecimals);
    const rounded = unit === 'W' ? Math.round(value) : value;
    const text = formatNumber(rounded, locale, decimals);
    return unit ? `${text} ${unit}` : text;
  }
  return String(applyAlias(state, aliases));
}

/**
 * Split the current power into where it comes from and where it goes.
 * Sign conventions match the GoodWe integration: battery power > 0 is
 * discharging, grid power > 0 is export. `invert*` flips them for others.
 */
export function computeEnergyFlow({
  pv = null,
  bkw = null,
  house = null,
  wp = null,
  battery = null,
  grid = null,
  bkwBehindMeter = true,
  invertBattery = false,
  invertGrid = false,
}) {
  const pvTotal = Math.max(0, pv || 0) + Math.max(0, bkw || 0);
  const batt = battery === null ? 0 : invertBattery ? -battery : battery;
  const gridValue = grid === null ? 0 : invertGrid ? -grid : grid;
  const battDischarge = Math.max(0, batt);
  const battCharge = Math.max(0, -batt);
  const gridExport = Math.max(0, gridValue);
  const gridImport = Math.max(0, -gridValue);

  const houseTotal =
    house === null ? null : Math.max(0, house) + (bkwBehindMeter ? Math.max(0, bkw || 0) : 0);
  const heat =
    houseTotal === null ? Math.max(0, wp || 0) : Math.min(Math.max(0, wp || 0), houseTotal);
  const houseRest = houseTotal === null ? 0 : Math.max(0, houseTotal - heat);

  const keep = (item) => item.w >= FLOW_THRESHOLD_W;
  const sources = [
    { key: 'sun', w: pvTotal },
    { key: 'battery', w: battDischarge },
    { key: 'grid', w: gridImport },
  ].filter(keep);
  const uses = [
    { key: 'house', w: houseRest },
    { key: 'heat', w: heat },
    { key: 'battery', w: battCharge },
    { key: 'grid', w: gridExport },
  ].filter(keep);

  const total = uses.reduce((sum, u) => sum + u.w, 0);
  const usesWithShare = uses.map((u) => ({
    ...u,
    share: total > 0 ? Math.round((u.w / total) * 100) : 0,
  }));
  const headline =
    sources.length === 0 ? 'idle' : sources.length === 1 ? `only_${sources[0].key}` : 'mixed';

  return {
    pvTotal,
    houseTotal,
    battCharge,
    battDischarge,
    gridExport,
    gridImport,
    sources,
    uses: usesWithShare,
    total,
    headline,
  };
}

// Meteocons icon per Home Assistant weather condition, as in the weather card.
const WEATHER_ICON = {
  'clear-night': 'clear-night',
  cloudy: 'overcast',
  fog: 'fog',
  hail: 'hail',
  lightning: 'thunderstorms',
  'lightning-rainy': 'thunderstorms-rain',
  partlycloudy: 'partly-cloudy-day',
  pouring: 'extreme-rain',
  rainy: 'rain',
  snowy: 'snow',
  'snowy-rainy': 'sleet',
  sunny: 'clear-day',
  windy: 'wind',
  'windy-variant': 'wind',
  exceptional: 'not-available', // Meteocons has no "extreme" icon
};
// After sunset the day icons swap to their night variant.
const NIGHT_ICON = {
  'clear-day': 'clear-night',
  'partly-cloudy-day': 'partly-cloudy-night',
  overcast: 'overcast-night',
  fog: 'fog-night',
  rain: 'partly-cloudy-night-rain',
  snow: 'partly-cloudy-night-snow',
};

/** Animated weather icon URL for a condition, or null when unknown. */
export function weatherIconUrl(condition, isNight) {
  const day = WEATHER_ICON[condition];
  if (!day) return null;
  const icon = isNight ? NIGHT_ICON[day] || day : day;
  return `https://cdn.jsdelivr.net/gh/basmilius/meteocons@v2.0.0/production/fill/all/${icon}.svg`;
}

/** Heat pump draw above its standby electronics (e.g. 10 W) means the compressor runs. */
export const HEAT_PUMP_RUN_W = 50;

/**
 * Which heat circuits are active. The heat pump state (HEATING, DHW, STANDBY)
 * decides between space heating and hot water; without a usable state the
 * power alone decides and both circuits follow it.
 */
export function heatPumpActivity(state, powerW) {
  const running = (powerW || 0) >= HEAT_PUMP_RUN_W;
  const mode = String(state ?? '').trim().toUpperCase();
  if (mode === 'HEATING') return { running, heating: true, dhw: false };
  if (mode === 'DHW') return { running, heating: false, dhw: true };
  if (mode === 'STANDBY') return { running, heating: false, dhw: false };
  return { running, heating: running, dhw: running };
}

/** Share of today's consumption not drawn from the grid, in percent. */
export function computeAutarky(consumptionToday, importToday) {
  if (!Number.isFinite(consumptionToday) || consumptionToday <= 0) return null;
  if (!Number.isFinite(importToday)) return null;
  const ratio = 1 - importToday / consumptionToday;
  return Math.round(Math.max(0, Math.min(1, ratio)) * 100);
}
