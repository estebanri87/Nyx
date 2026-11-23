import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { UtilityPole } from 'lucide-react';
import { Battery, Flame, Home, Sun, Zap } from '../../icons';
import { useConfig, usePages } from '../../contexts';
import { getLocaleForLanguage } from '../../i18n';
import { getHistory, getStatistics } from '../../services/haClient';
import { downsampleTimeSeries } from '../../utils';
import SparkLine from '../charts/SparkLine';
import WeatherEffects from '../effects/WeatherEffects';
import EnergyScene from './energy/EnergyScene';
import EnergyConfigPanel from './energy/EnergyConfigPanel';
import EnergyAdviceCard from './energy/EnergyAdviceCard';
import { useEnergyAdvice } from './energy/useEnergyAdvice';
import {
  COMPONENT_OWNER,
  ENERGY_SLOTS,
  FLOW_THRESHOLD_W,
  POWER_SLOTS,
  computeAutarky,
  computeEnergyFlow,
  formatEntityState,
  formatNumber,
  formatWatts,
  heatPumpActivity,
  weatherIconUrl,
  normalizeEnergyConfig,
  readEnergyKwh,
  readNumber,
  readPowerW,
} from './energy/energyModel';

const CARD = 'rounded-3xl border border-[var(--glass-border)] bg-[var(--card-bg)]';
const LABEL = 'text-[11px] font-bold tracking-[0.14em] text-[var(--text-muted)] uppercase';

const TONE = {
  pv: '#facc15',
  bkw: '#facc15',
  wr: '#facc15',
  haus: '#34d399',
  batt: '#60a5fa',
  netz: '#94a3b8',
  wp: '#f59e0b',
  aussen: '#93c5fd',
  vorlauf: '#f59e0b',
  ww: '#f97316',
};

// Badge anchor points in percent of the 1600×900 scene, per view.
const SPOTS = {
  gesamt: [
    ['pv', 50, 19],
    ['bkw', 10, 57],
    ['haus', 78, 38],
    ['wp', 26, 62],
    ['batt', 52, 89],
    ['netz', 90, 68],
  ],
  pv: [
    ['pv', 50, 19],
    ['bkw', 11, 63],
    ['wr', 42, 61],
    ['batt', 52, 89],
    ['haus', 78, 38],
    ['netz', 90, 68],
  ],
  wp: [
    ['aussen', 22, 40],
    ['wp', 22, 62],
    ['vorlauf', 70, 50],
    ['ww', 68, 89],
  ],
};

const DEFAULT_SELECTION = { gesamt: 'haus', pv: 'pv', wp: 'wp' };

const USE_STYLE = {
  house: { Icon: Home, color: '#34d399', tint: 'rgba(52,211,153,0.14)' },
  heat: { Icon: Flame, color: '#f59e0b', tint: 'rgba(245,158,11,0.14)' },
  battery: { Icon: Battery, color: '#60a5fa', tint: 'rgba(96,165,250,0.14)' },
  grid: { Icon: UtilityPole, color: '#94a3b8', tint: 'rgba(148,163,184,0.14)' },
};

/** Last numeric state of an entity within the past 30 days, with its time. */
async function fetchLastNumeric(conn, entityId) {
  const end = new Date();
  const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
  const rows = await getHistory(conn, { entityId, start, end, minimal_response: true });
  for (let i = (rows || []).length - 1; i >= 0; i -= 1) {
    const row = rows[i];
    const raw = row.state !== undefined ? row.state : row.s;
    const value = Number(raw);
    if (raw !== '' && raw !== null && Number.isFinite(value)) {
      const time = row.last_changed
        ? new Date(row.last_changed)
        : new Date((row.lc || row.lu) * 1000);
      return { value, time };
    }
  }
  return null;
}

function EnergyPage({ entities, conn, pageSettings, pageId, savePageSetting, editMode, t }) {
  const { language } = useConfig();
  const { cardSettings } = usePages();
  const locale = getLocaleForLanguage(language);
  const config = useMemo(
    () => normalizeEnergyConfig(pageSettings?.[pageId]?.energy),
    [pageSettings, pageId]
  );
  const saveConfig = useCallback(
    (next) => savePageSetting?.(pageId, 'energy', next),
    [savePageSetting, pageId]
  );

  const slot = (key) => config.slots[key] || null;
  // Power slots are read in W and energy slots in kWh, whatever the sensor's unit.
  const num = (key) =>
    POWER_SLOTS.has(key)
      ? readPowerW(entities, slot(key))
      : ENERGY_SLOTS.has(key)
        ? readEnergyKwh(entities, slot(key))
        : readNumber(entities, slot(key));
  const fmt = (key) =>
    formatEntityState(slot(key) ? entities[slot(key)] : null, locale, config.aliases);
  const W = (value) => formatWatts(value, locale);
  const label = (key) => t(`energy.slot.${key}`);

  const has = {
    pv: !!slot('pvPower'),
    bkw: !!slot('bkwPower'),
    batt: !!(slot('battSoc') || slot('battPower')),
    netz: !!slot('gridPower'),
    haus: !!slot('houseConsumption'),
    wp: !!(slot('wpPower') || slot('flowTemp') || slot('dhwTemp')),
  };
  const configured = Object.values(config.slots).some(Boolean);
  const views = ['gesamt', ...(has.pv ? ['pv'] : []), ...(has.wp ? ['wp'] : [])];

  const [view, setView] = useState('gesamt');
  const [selected, setSelected] = useState(DEFAULT_SELECTION.gesamt);
  const activeView = views.includes(view) ? view : 'gesamt';

  const flow = computeEnergyFlow({
    pv: num('pvPower'),
    bkw: num('bkwPower'),
    house: num('houseConsumption'),
    wp: num('wpPower'),
    battery: num('battPower'),
    grid: num('gridPower'),
    bkwBehindMeter: config.bkwBehindMeter !== false,
    invertBattery: config.invertBattery,
    invertGrid: config.invertGrid,
  });
  const soc = num('battSoc');
  const advice = useEnergyAdvice(entities, conn, config);
  const wpPower = num('wpPower');
  // Without an own weather entity, use the one of the weather card.
  const weatherId =
    slot('weather') ||
    Object.values(/** @type {Record<string, any>} */ (cardSettings || {})).find(
      (s) => s?.weatherId && entities[s.weatherId]
    )?.weatherId;
  const weatherState = weatherId ? entities[weatherId]?.state : null;
  const isNight = entities['sun.sun']?.state === 'below_horizon';
  const heat = heatPumpActivity(slot('wpState') ? entities[slot('wpState')]?.state : null, wpPower);
  const battState =
    flow.battCharge >= FLOW_THRESHOLD_W
      ? 'charging'
      : flow.battDischarge >= FLOW_THRESHOLD_W
        ? 'discharging'
        : 'standby';
  const gridText =
    flow.gridExport >= FLOW_THRESHOLD_W
      ? `↑ ${W(flow.gridExport)}`
      : flow.gridImport >= FLOW_THRESHOLD_W
        ? `↓ ${W(flow.gridImport)}`
        : W(0);
  const bkwBehind = config.bkwBehindMeter !== false;

  // ── Today's energy totals ────────────────────────────────────────────
  const pvToday = num('pvToday');
  const bkwToday = num('bkwToday');
  const pvTodayTotal =
    pvToday === null && bkwToday === null ? null : (pvToday || 0) + (bkwToday || 0);
  const houseTodayRaw = num('houseToday');
  const houseToday =
    houseTodayRaw === null ? null : houseTodayRaw + (bkwBehind ? bkwToday || 0 : 0);
  const importToday = num('gridImportToday');
  const autarky = computeAutarky(houseToday, importToday);
  const wpToday = num('wpToday');
  const kwh = (value) => (value === null ? '–' : `${formatNumber(value, locale)} kWh`);

  // ── Efficiency: current value, else last known one ───────────────────
  const effId = slot('wpEfficiency');
  const effNow = num('wpEfficiency');
  const [effLast, setEffLast] = useState(null);
  const [effMonths, setEffMonths] = useState([]);
  useEffect(() => {
    if (!conn || !effId || effNow !== null || activeView !== 'wp') return undefined;
    let cancelled = false;
    fetchLastNumeric(conn, effId)
      .then((res) => !cancelled && setEffLast(res))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [conn, effId, effNow, activeView]);
  useEffect(() => {
    if (!conn || !effId || activeView !== 'wp') return undefined;
    let cancelled = false;
    const end = new Date();
    const start = new Date(end.getFullYear(), end.getMonth() - 6, 1);
    getStatistics(conn, { statisticId: effId, start, end, period: 'month', types: ['mean'] })
      .then((rows) => {
        if (cancelled) return;
        setEffMonths(
          rows
            .filter((r) => Number.isFinite(r.mean))
            .map((r) => ({ start: new Date(r.start), value: r.mean }))
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [conn, effId, activeView]);
  const effText =
    effNow !== null
      ? formatNumber(effNow, locale)
      : effLast
        ? formatNumber(effLast.value, locale)
        : '–';
  const effSince =
    effNow === null && effLast
      ? effLast.time.toLocaleString(locale, {
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        })
      : null;

  // ── Badges ───────────────────────────────────────────────────────────
  const badgeValue = (id) => {
    switch (id) {
      case 'pv':
        return activeView === 'gesamt'
          ? has.pv || has.bkw
            ? W(flow.pvTotal)
            : null
          : has.pv
            ? W(num('pvPower'))
            : null;
      case 'bkw':
        return has.bkw ? W(num('bkwPower')) : null;
      case 'wr':
        return slot('inverterMode')
          ? fmt('inverterMode')
          : slot('inverterTemp')
            ? fmt('inverterTemp')
            : null;
      case 'haus':
        return flow.houseTotal === null ? null : W(flow.houseTotal);
      case 'batt': {
        if (!has.batt) return null;
        const state =
          activeView === 'pv' && battState !== 'standby'
            ? `${t(`energy.batt.${battState}`)} ${W(battState === 'charging' ? flow.battCharge : flow.battDischarge)}`
            : t(`energy.batt.${battState}`);
        return soc === null ? state : `${formatNumber(soc, locale)} % · ${state}`;
      }
      case 'netz':
        return has.netz ? gridText : null;
      case 'wp':
        return wpPower === null ? null : W(wpPower);
      case 'aussen':
        return slot('outdoorTemp') ? fmt('outdoorTemp') : null;
      case 'vorlauf':
        if (!slot('flowTemp')) return null;
        return slot('flowSetpoint')
          ? `${formatNumber(num('flowTemp'), locale)} / ${formatNumber(num('flowSetpoint'), locale)} °C`
          : fmt('flowTemp');
      case 'ww':
        if (!slot('dhwTemp')) return null;
        return slot('dhwSetpoint')
          ? `${formatNumber(num('dhwTemp'), locale)} / ${formatNumber(num('dhwSetpoint'), locale)} °C`
          : fmt('dhwTemp');
      default:
        return null;
    }
  };
  const badgeLabel = (id) =>
    id === 'pv' && activeView === 'gesamt'
      ? t('energy.badge.pvTotal')
      : id === 'vorlauf'
        ? t('energy.badge.flow')
        : t(`energy.component.${id}`);
  const spots = SPOTS[activeView]
    .map(([id, left, top]) => ({ id, left, top, value: badgeValue(id) }))
    .filter((s) => s.value !== null);
  const selectedId = spots.some((s) => s.id === selected)
    ? selected
    : spots.find((s) => s.id === DEFAULT_SELECTION[activeView])?.id || spots[0]?.id || null;

  // ── Detail rows per component ────────────────────────────────────────
  const slotValue = (key) =>
    POWER_SLOTS.has(key) ? W(num(key)) : ENERGY_SLOTS.has(key) ? kwh(num(key)) : fmt(key);
  const slotRow = (key, overrideValue) =>
    slot(key) ? { label: label(key), value: overrideValue ?? slotValue(key) } : null;
  const extrasRows = (group) =>
    (config.extras[group] || [])
      .filter((id) => entities[id])
      .map((id) => ({
        label: config.names[id] || entities[id]?.attributes?.friendly_name || id,
        value: formatEntityState(entities[id], locale, config.aliases),
      }));

  const buildDetail = (id) => {
    const rows = [];
    let primary = null;
    if (id === 'haus') {
      primary = slot('houseConsumption');
      if (flow.houseTotal !== null)
        rows.push({ label: t('energy.detail.now'), value: W(flow.houseTotal) });
      if (wpPower !== null && flow.houseTotal) {
        const pct = Math.round((Math.min(wpPower, flow.houseTotal) / flow.houseTotal) * 100);
        rows.push({ label: t('energy.detail.ofWhichHeat'), value: `${W(wpPower)} (${pct} %)` });
      }
      if (houseToday !== null)
        rows.push({ label: t('energy.detail.today'), value: kwh(houseToday) });
      if (has.bkw && bkwBehind && has.haus) {
        rows.push({ label: t('energy.detail.inverter'), value: W(num('houseConsumption')) });
        rows.push({ label: t('energy.detail.plusBkw'), value: W(num('bkwPower')) });
      }
    } else if (id === 'pv') {
      primary = slot('pvPower');
      rows.push(slotRow('pvPower', W(num('pvPower'))));
      if (has.bkw) {
        rows.push({ label: t('energy.detail.plusBkw'), value: W(num('bkwPower')) });
        rows.push({ label: t('energy.detail.pvTotal'), value: W(flow.pvTotal) });
      }
      rows.push(slotRow('pvToday'));
      config.strings.forEach((s, i) => {
        if (!s.power) return;
        const parts = [W(readPowerW(entities, s.power))];
        if (s.voltage) parts.push(formatEntityState(entities[s.voltage], locale));
        if (s.current) parts.push(formatEntityState(entities[s.current], locale));
        rows.push({
          label: t('energy.string.name').replace('{n}', String(i + 1)),
          value: parts.join(' · '),
        });
      });
      rows.push(slotRow('pvTotal'));
    } else if (id === 'batt') {
      primary = slot('battSoc') || slot('battPower');
      rows.push(slotRow('battSoc'));
      if (slot('battPower')) {
        const value =
          battState === 'standby'
            ? t('energy.batt.standby')
            : `${t(`energy.batt.${battState}`)} ${W(battState === 'charging' ? flow.battCharge : flow.battDischarge)}`;
        rows.push({ label: label('battPower'), value });
      }
      ['battChargeToday', 'battDischargeToday', 'battSoh', 'battTemp'].forEach((k) =>
        rows.push(slotRow(k))
      );
    } else if (id === 'netz') {
      primary = slot('gridPower');
      if (has.netz) {
        const value =
          flow.gridExport >= FLOW_THRESHOLD_W
            ? `${t('energy.grid.export')} ${W(flow.gridExport)}`
            : flow.gridImport >= FLOW_THRESHOLD_W
              ? `${t('energy.grid.import')} ${W(flow.gridImport)}`
              : W(0);
        rows.push({ label: label('gridPower'), value });
      }
      rows.push(slotRow('gridImportToday'));
      rows.push(slotRow('gridExportToday'));
    } else if (id === 'vorlauf') {
      primary = slot('flowTemp');
      rows.push(slotRow('flowTemp'));
      rows.push(slotRow('flowSetpoint'));
      const ist = num('flowTemp');
      const soll = num('flowSetpoint');
      if (ist !== null && soll !== null) {
        const diff = ist - soll;
        rows.push({
          label: t('energy.detail.deviation'),
          value: `${diff > 0 ? '+' : diff < 0 ? '−' : ''}${formatNumber(Math.abs(diff), locale)} K`,
        });
      }
      ['systemFlowTemp', 'heatingCurve', 'pressure'].forEach((k) => rows.push(slotRow(k)));
    } else if (id === 'wp') {
      primary = slot('wpPower');
      rows.push(slotRow('wpPower', wpPower === null ? undefined : W(wpPower)));
      rows.push(slotRow('wpToday'));
      if (effId) {
        rows.push({
          label: label('wpEfficiency'),
          value: effSince
            ? `${effText} · ${t('energy.eff.lastShort').replace('{time}', effSince)}`
            : effText,
        });
      }
      rows.push(slotRow('wpState'));
      rows.push(slotRow('wpControl'));
    } else {
      const group =
        {
          bkw: ['bkwPower', 'bkwToday', 'bkwTotal'],
          wr: ['inverterMode', 'emsMode', 'inverterTemp'],
          aussen: ['outdoorTemp'],
          ww: ['dhwTemp', 'dhwSetpoint'],
        }[id] || [];
      primary = slot(group[0]);
      group.forEach((k) =>
        rows.push(slotRow(k, k === 'bkwPower' ? W(num('bkwPower')) : undefined))
      );
    }
    return { rows: [...rows.filter(Boolean), ...extrasRows(id)], primary };
  };

  const detail = selectedId ? buildDetail(selectedId) : { rows: [], primary: null };
  const detailOwner = selectedId ? COMPONENT_OWNER[selectedId] : 'gesamt';
  const compact =
    activeView === 'gesamt' && detailOwner !== 'gesamt' && views.includes(detailOwner);
  const detailRows = compact ? detail.rows.slice(0, 3) : detail.rows;

  // ── 24 h history of the selected component ───────────────────────────
  const [history, setHistory] = useState([]);
  const historyId = detail.primary;
  useEffect(() => {
    setHistory([]);
    if (!conn || !historyId) return undefined;
    let cancelled = false;
    const end = new Date();
    const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
    getHistory(conn, { entityId: historyId, start, end, minimal_response: true })
      .then((rows) => {
        if (cancelled) return;
        const points = (rows || [])
          .map((d) => {
            const value = Number(d.state !== undefined ? d.state : d.s);
            if (!Number.isFinite(value)) return null;
            const time = d.last_changed
              ? new Date(d.last_changed)
              : new Date((d.lc || d.lu) * 1000);
            return Number.isNaN(time.getTime()) ? null : { value, time };
          })
          .filter(Boolean);
        setHistory(points.length > 1 ? downsampleTimeSeries(points) : []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [conn, historyId]);

  // ── KPI tiles per view ───────────────────────────────────────────────
  const kpis = (() => {
    const list = [];
    const add = (cond, kpi) => cond && list.push(kpi);
    if (activeView === 'gesamt') {
      add(pvTodayTotal !== null, {
        label: t('energy.kpi.pvToday'),
        value: kwh(pvTodayTotal),
        hint:
          has.bkw && pvToday !== null && bkwToday !== null
            ? t('energy.kpi.pvSplit')
                .replace('{pv}', formatNumber(pvToday, locale))
                .replace('{bkw}', formatNumber(bkwToday, locale))
            : t('energy.kpi.sinceMidnight'),
      });
      add(houseToday !== null, {
        label: t('energy.kpi.consumptionToday'),
        value: kwh(houseToday),
        hint: t('energy.kpi.wholeHouse'),
      });
      add(num('gridExportToday') !== null, {
        label: label('gridExportToday'),
        value: kwh(num('gridExportToday')),
        hint: t('energy.kpi.exportHint'),
      });
      add(autarky !== null, {
        label: t('energy.kpi.autarky'),
        value: `${autarky} %`,
        hint: t('energy.kpi.autarkyHint'),
      });
      add(wpToday !== null, {
        label: t('energy.kpi.heatToday'),
        value: kwh(wpToday),
        hint: houseToday
          ? t('energy.kpi.shareOfHouse').replace(
              '{pct}',
              String(Math.round((wpToday / houseToday) * 100))
            )
          : t('energy.kpi.sinceMidnight'),
      });
    } else if (activeView === 'pv') {
      add(pvTodayTotal !== null, {
        label: t('energy.kpi.pvToday'),
        value: kwh(pvTodayTotal),
        hint: t('energy.kpi.sinceMidnight'),
      });
      add(importToday !== null, {
        label: label('gridImportToday'),
        value: kwh(importToday),
        hint: t('energy.kpi.importHint'),
      });
      add(num('gridExportToday') !== null, {
        label: label('gridExportToday'),
        value: kwh(num('gridExportToday')),
        hint: t('energy.kpi.exportHint'),
      });
      add(num('battChargeToday') !== null, {
        label: label('battChargeToday'),
        value: kwh(num('battChargeToday')),
        hint:
          num('battDischargeToday') !== null
            ? `${label('battDischargeToday')} ${kwh(num('battDischargeToday'))}`
            : '',
      });
      add(autarky !== null, {
        label: t('energy.kpi.autarky'),
        value: `${autarky} %`,
        hint: t('energy.kpi.autarkyHint'),
      });
    } else {
      const ist = num('flowTemp');
      const soll = num('flowSetpoint');
      add(ist !== null, {
        label: label('flowTemp'),
        value: `${formatNumber(ist, locale)} °C`,
        hint: soll !== null ? `${label('flowSetpoint')} ${formatNumber(soll, locale)} °C` : '',
      });
      add(!!slot('heatingCurve'), {
        label: label('heatingCurve'),
        value: fmt('heatingCurve'),
        hint: '',
      });
      add(wpPower !== null, {
        label: label('wpPower'),
        value: W(wpPower),
        hint: t('energy.kpi.electrical'),
      });
      add(wpToday !== null, {
        label: label('wpToday'),
        value: kwh(wpToday),
        hint: t('energy.kpi.sinceMidnight'),
      });
      add(!!slot('pressure'), { label: label('pressure'), value: fmt('pressure'), hint: '' });
    }
    return list;
  })();

  // ── Generators (PV view) ─────────────────────────────────────────────
  const generators = [
    ...config.strings
      .map((s, i) => ({
        key: `str${i}`,
        target: 'pv',
        name: t('energy.string.name').replace('{n}', String(i + 1)),
        w: readPowerW(entities, s.power),
        sub: [
          s.voltage && formatEntityState(entities[s.voltage], locale),
          s.current && formatEntityState(entities[s.current], locale),
        ]
          .filter(Boolean)
          .join(' · '),
      }))
      .filter((g) => g.w !== null),
    ...(has.bkw
      ? [
          {
            key: 'bkw',
            target: 'bkw',
            name: t('energy.component.bkw'),
            w: num('bkwPower'),
            sub: '',
          },
        ]
      : []),
  ];
  const generatorTotal = generators.reduce((sum, g) => sum + Math.max(0, g.w || 0), 0);

  const selectView = (next) => {
    setView(next);
    setSelected(DEFAULT_SELECTION[next]);
  };

  // ── Render ───────────────────────────────────────────────────────────
  const flowSources = flow.sources;
  const headline = t(`energy.flow.${flow.headline}`);
  const subline =
    flow.headline === 'mixed'
      ? `${flowSources.map((s) => `${t(`energy.source.${s.key}`)} ${W(s.w)}`).join(' · ')} · ${t('energy.flow.usedFor')}`
      : `${W(flow.total)} · ${t('energy.flow.usedFor')}`;
  const HeadIcon =
    flow.headline === 'only_battery' ? Battery : flow.headline === 'only_grid' ? UtilityPole : Sun;

  return (
    <div className="animate-in fade-in px-4 pb-10 duration-500">
      {editMode && (
        <EnergyConfigPanel
          config={config}
          onChange={saveConfig}
          entities={entities}
          adviceItems={advice.items}
          locale={locale}
          t={t}
        />
      )}

      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-light tracking-widest text-[var(--text-primary)] uppercase">
            {t(`energy.view.${activeView}.title`)}
          </h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            {t(`energy.view.${activeView}.sub`)}
          </p>
        </div>
        {views.length > 1 && (
          <div
            className="flex gap-1 rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg)] p-1"
            role="group"
            aria-label={t('energy.view.switch')}
          >
            {views.map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={key === activeView}
                onClick={() => selectView(key)}
                className={`min-h-[44px] rounded-full px-5 text-[13px] font-bold tracking-wide transition-colors ${
                  key === activeView
                    ? 'bg-[var(--text-primary)] text-[var(--bg-primary)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {t(`energy.view.${key}.tab`)}
              </button>
            ))}
          </div>
        )}
      </div>

      {!configured ? (
        <div
          className={`${CARD} flex min-h-[30vh] flex-col items-center justify-center p-8 text-center`}
        >
          <Zap className="mb-4 h-10 w-10 text-[var(--text-muted)] opacity-50" />
          <p className="max-w-md text-sm text-[var(--text-secondary)]">{t('energy.empty')}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-stretch gap-6">
            <div className={`${CARD} min-w-0 flex-[999_1_600px] p-3`}>
              <div
                className="relative w-full overflow-hidden rounded-2xl"
                style={{ aspectRatio: '16 / 9', background: 'var(--glass-bg)' }}
              >
                <WeatherEffects condition={weatherState} />
                <EnergyScene
                  view={activeView}
                  weatherIcon={weatherIconUrl(weatherState, isNight)}
                  show={{
                    pv: has.pv || has.bkw,
                    bkw: has.bkw,
                    batt: has.batt,
                    netz: has.netz,
                    wp: has.wp,
                  }}
                  flow={{
                    pv: (num('pvPower') || 0) >= FLOW_THRESHOLD_W,
                    bkw: (num('bkwPower') || 0) >= FLOW_THRESHOLD_W,
                    house: (flow.houseTotal || 0) >= FLOW_THRESHOLD_W,
                    batt: battState === 'charging' ? 1 : battState === 'discharging' ? -1 : 0,
                    grid:
                      flow.gridExport >= FLOW_THRESHOLD_W
                        ? 1
                        : flow.gridImport >= FLOW_THRESHOLD_W
                          ? -1
                          : 0,
                    heatRun: heat.running,
                    heating: heat.heating,
                    dhw: heat.dhw,
                  }}
                />
                <div className="hidden sm:block">
                  {spots.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      aria-pressed={s.id === selectedId}
                      onClick={() => setSelected(s.id)}
                      className="absolute flex min-h-[44px] flex-col items-start gap-1 rounded-2xl px-4 py-2.5 text-left backdrop-blur-md transition-shadow"
                      style={{
                        left: `${s.left}%`,
                        top: `${s.top}%`,
                        transform: 'translate(-50%, -100%)',
                        background: 'color-mix(in srgb, var(--modal-bg, #121412) 86%, transparent)',
                        border:
                          s.id === selectedId
                            ? `2px solid ${TONE[s.id]}`
                            : '1px solid var(--glass-border)',
                        boxShadow: '0 6px 20px rgba(0,0,0,0.3)',
                      }}
                    >
                      <span className="flex items-center gap-2 text-[11px] leading-tight font-bold tracking-[0.12em] text-[var(--text-secondary)] uppercase">
                        <span className="h-2 w-2 rounded-full" style={{ background: TONE[s.id] }} />
                        {badgeLabel(s.id)}
                      </span>
                      <span className="text-[19px] leading-tight font-light whitespace-nowrap text-[var(--text-primary)] tabular-nums">
                        {s.value}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:hidden">
                {spots.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    aria-pressed={s.id === selectedId}
                    onClick={() => setSelected(s.id)}
                    className="flex min-h-[44px] flex-col items-start gap-0.5 rounded-2xl bg-[var(--glass-bg)] px-3 py-2 text-left"
                    style={{
                      border:
                        s.id === selectedId
                          ? `2px solid ${TONE[s.id]}`
                          : '1px solid var(--glass-border)',
                    }}
                  >
                    <span className="text-[10px] font-bold tracking-[0.12em] text-[var(--text-muted)] uppercase">
                      {badgeLabel(s.id)}
                    </span>
                    <span className="text-base font-light text-[var(--text-primary)] tabular-nums">
                      {s.value}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {selectedId && (
              <div className={`${CARD} flex min-w-0 flex-[1_1_320px] flex-col gap-5 p-6`}>
                <div>
                  <p className={LABEL}>{t('energy.details')}</p>
                  <h3 className="mt-1 text-2xl font-light text-[var(--text-primary)]">
                    {t(`energy.component.${selectedId}`)}
                  </h3>
                </div>
                <div className="flex flex-col border-t border-[var(--glass-border)]">
                  {detailRows.map((row, index) => (
                    <div
                      key={`${row.label}-${index}`}
                      className="flex items-baseline justify-between gap-4 border-b border-[var(--glass-border)] py-3"
                    >
                      <span className="text-sm text-[var(--text-secondary)]">{row.label}</span>
                      <span className="text-right text-[15px] font-semibold text-[var(--text-primary)] tabular-nums">
                        {row.value}
                      </span>
                    </div>
                  ))}
                </div>
                {compact && (
                  <button
                    type="button"
                    onClick={() => {
                      setView(detailOwner);
                      setSelected(selectedId);
                    }}
                    className="min-h-[44px] rounded-full border border-[var(--accent-color)] bg-[var(--accent-bg)] px-4 text-xs font-bold tracking-widest text-[var(--accent-color)] uppercase"
                  >
                    {t('energy.detail.more')
                      .replace('{count}', String(detail.rows.length))
                      .replace('{view}', t(`energy.view.${detailOwner}.tab`))}
                  </button>
                )}
                {history.length > 1 && (
                  <div className="mt-auto rounded-2xl border border-dashed border-[var(--glass-border)] p-3">
                    <p className={`${LABEL} mb-2`}>{t('energy.history24h')}</p>
                    <SparkLine
                      data={history}
                      height={80}
                      currentIndex={history.length - 1}
                      ariaLabel={t('energy.history24h')}
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {activeView === 'gesamt' && (
            <section className={`${CARD} p-6`} aria-label={headline}>
              <div className="flex items-center gap-4">
                <div
                  className="flex h-[52px] w-[52px] flex-shrink-0 items-center justify-center rounded-full"
                  style={{ background: 'rgba(250,204,21,0.15)', color: '#facc15' }}
                >
                  <HeadIcon className="h-7 w-7" />
                </div>
                <div className="min-w-0">
                  <p className="text-xl text-[var(--text-primary)]">{headline}</p>
                  {flow.headline !== 'idle' && (
                    <p className="text-sm text-[var(--text-secondary)]">{subline}</p>
                  )}
                </div>
              </div>
              {flow.uses.length > 0 && (
                <div className="mt-5 grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
                  {flow.uses.map((use) => {
                    const style = USE_STYLE[use.key];
                    const note =
                      use.key === 'battery' && soc !== null
                        ? t('energy.use.batteryNoteSoc').replace('{soc}', formatNumber(soc, locale))
                        : t(`energy.use.${use.key}Note`);
                    return (
                      <div
                        key={use.key}
                        className="flex flex-col gap-3 rounded-2xl bg-[var(--glass-bg)] p-4"
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className="flex h-[42px] w-[42px] items-center justify-center rounded-xl"
                            style={{ background: style.tint, color: style.color }}
                          >
                            <style.Icon className="h-5 w-5" />
                          </div>
                          <span className="text-base text-[var(--text-primary)]">
                            {t(`energy.use.${use.key}`)}
                          </span>
                        </div>
                        <span className="text-3xl font-light whitespace-nowrap text-[var(--text-primary)] tabular-nums">
                          {W(use.w)}
                        </span>
                        <div className="h-2 overflow-hidden rounded-full bg-[var(--glass-bg-hover)]">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${use.share}%`, background: style.color }}
                          />
                        </div>
                        <span className="text-[13px] text-[var(--text-muted)]">
                          {note} · {use.share} %
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {activeView === 'gesamt' && advice.enabled && (
            <EnergyAdviceCard advice={advice} entities={entities} locale={locale} t={t} />
          )}

          {activeView === 'pv' && generators.length > 0 && (
            <section>
              <h3 className={`${LABEL} mb-3`}>{t('energy.generators')}</h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {generators.map((g) => {
                  const share =
                    generatorTotal > 0 ? Math.round((Math.max(0, g.w) / generatorTotal) * 100) : 0;
                  return (
                    <button
                      key={g.key}
                      type="button"
                      onClick={() => setSelected(g.target)}
                      className={`${CARD} flex flex-col gap-2 p-5 text-left`}
                    >
                      <span className={LABEL}>{g.name}</span>
                      <span className="text-3xl font-light text-[var(--text-primary)] tabular-nums">
                        {W(g.w)}
                      </span>
                      {g.sub && (
                        <span className="text-[13px] text-[var(--text-muted)]">{g.sub}</span>
                      )}
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--glass-bg)]">
                        <div
                          className="h-full rounded-full bg-[#facc15]"
                          style={{ width: `${share}%` }}
                        />
                      </div>
                      <span className="text-[13px] font-semibold text-[#eab308]">
                        {t('energy.generatorShare').replace('{pct}', String(share))}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {activeView === 'wp' && effId && (
            <section className={`${CARD} flex flex-wrap items-end gap-8 p-6`}>
              <div className="flex min-w-[220px] flex-1 flex-col gap-2">
                <span className={LABEL}>{label('wpEfficiency')}</span>
                <span className="text-4xl font-light text-[var(--text-primary)] tabular-nums">
                  {effText}
                </span>
                {effSince && (
                  <span className="text-[13px] text-[var(--text-muted)]">
                    {t('energy.eff.lastKnown').replace('{time}', effSince)}
                  </span>
                )}
              </div>
              {effMonths.length > 0 && (
                <div className="flex min-w-[280px] flex-[2] flex-col gap-2">
                  <span className={LABEL}>{t('energy.eff.monthly')}</span>
                  <div
                    className="grid items-end gap-2.5"
                    style={{
                      gridTemplateColumns: `repeat(${effMonths.length}, minmax(0, 1fr))`,
                      height: 150,
                    }}
                  >
                    {effMonths.map((m, index) => {
                      const max = Math.max(...effMonths.map((x) => x.value), 1);
                      return (
                        <div
                          key={m.start.toISOString()}
                          className="flex h-full flex-col items-center justify-end gap-1.5"
                        >
                          <span className="text-[13px] font-semibold text-[var(--text-primary)] tabular-nums">
                            {formatNumber(m.value, locale)}
                          </span>
                          <div
                            className="w-full max-w-[48px] rounded-t-lg rounded-b-sm"
                            style={{
                              height: `${Math.round((m.value / max) * 100)}px`,
                              background: index === effMonths.length - 1 ? '#34d399' : '#2f6b55',
                            }}
                          />
                          <span className="text-xs text-[var(--text-muted)]">
                            {m.start.toLocaleDateString(locale, { month: 'short' })}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>
          )}

          {kpis.length > 0 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {kpis.map((k) => (
                <div key={k.label} className={`${CARD} flex flex-col gap-2.5 p-5`}>
                  <span className={LABEL}>{k.label}</span>
                  <span className="overflow-hidden text-3xl leading-tight font-light text-ellipsis whitespace-nowrap text-[var(--text-primary)] tabular-nums">
                    {k.value}
                  </span>
                  {k.hint && <span className="text-[13px] text-[var(--text-muted)]">{k.hint}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default memo(EnergyPage);
