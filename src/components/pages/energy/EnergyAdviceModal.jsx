import { useEffect, useState } from 'react';
import { ArrowRight, Calendar, Plug, Sun, WashingMachine, X } from '../../../icons';
import AccessibleModalShell from '../../ui/AccessibleModalShell';
import { getHistory } from '../../../services/haClient';
import { surplusSeries } from './energyAdvice';
import { PLAN_COLOR, STATUS, formatDuration, formatKw, formatPlan } from './EnergyAdviceCard';
import { computeEnergyFlow, formatNumber, readPowerW } from './energyModel';
import {
  FORECAST_TODAY,
  FORECAST_TODAY_TOTAL,
  FORECAST_TOMORROW,
  dayStart,
  forecastKwh,
} from './energyPlan';
import { toPoints } from './useEnergyAdvice';

const HISTORY_MS = 3 * 60 * 60 * 1000;
const BUCKET_MS = 5 * 60 * 1000;
const LINE_COLORS = ['#fcd34d', '#93c5fd', '#cbd5e1', '#f9a8d4', '#c4b5fd'];
const SURFACE = 'popup-surface rounded-2xl p-5';
const LABEL = 'text-[11px] tracking-widest text-[var(--text-secondary)] uppercase';

/** W history of a power sensor, converted from kW when needed. */
async function powerHistory(conn, entities, entityId, start, end) {
  if (!entityId) return [];
  const rows = await getHistory(conn, { entityId, start, end, minimal_response: true });
  const unit = String(entities?.[entityId]?.attributes?.unit_of_measurement || '').toLowerCase();
  const factor = unit === 'kw' ? 1000 : 1;
  return toPoints(rows).map((p) => ({ t: p.t, v: p.v * factor }));
}

/**
 * Measured surplus up to now, then the expected surplus until the sun is
 * gone today, with a dashed line per appliance demand and the best window.
 */
function SurplusChart({ past, future, lines, window: best, labels, locale }) {
  const now = Date.now();
  const start = past.length ? past[0].t : now - HISTORY_MS;
  // Today's forecast ends with the last step that still expects surplus.
  const lastSun = [...future].reverse().find((s) => s.w > 0 && s.t < dayStart(now, 1));
  const end = Math.max(now + 60 * 60 * 1000, lastSun ? lastSun.t + BUCKET_MS * 3 : now);
  const ahead = future.filter((s) => s.t >= now && s.t <= end);
  const values = [...past, ...ahead].map((s) => s.w).filter(Number.isFinite);
  const top = Math.max(100, ...values, ...lines.map((l) => l.w)) * 1.1;
  const x = (t) => ((t - start) / (end - start)) * 600;
  const y = (w) => 175 - (w / top) * 165;
  const path = (points) =>
    points
      .filter((s) => Number.isFinite(s.w))
      .map((s, i) => `${i ? 'L' : 'M'}${x(s.t).toFixed(1)},${y(s.w).toFixed(1)}`)
      .join(' ');
  const pastPoints = past.filter((s) => Number.isFinite(s.w));
  const lastPast = pastPoints[pastPoints.length - 1];
  const futurePoints = lastPast ? [{ t: now, w: lastPast.w }, ...ahead] : ahead;
  const area = (points, id) =>
    points.length > 1 && (
      <path
        d={`${path(points)} L${x(points[points.length - 1].t).toFixed(1)},180 L${x(points[0].t).toFixed(1)},180 Z`}
        fill={`url(#${id})`}
      />
    );
  const time = (t) =>
    new Date(t).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  const bestFrom = best ? Math.max(best.start, start) : null;
  const bestTo = best ? Math.min(best.end, end) : null;

  return (
    <>
      <svg viewBox="0 0 600 200" width="100%" aria-hidden="true">
        <defs>
          <linearGradient id="nyx-advice-past" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#34d399" stopOpacity="0.35" />
            <stop offset="1" stopColor="#34d399" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="nyx-advice-future" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#34d399" stopOpacity="0.14" />
            <stop offset="1" stopColor="#34d399" stopOpacity="0" />
          </linearGradient>
        </defs>
        {best && bestTo > bestFrom && (
          <>
            <rect
              x={x(bestFrom)}
              y="0"
              width={x(bestTo) - x(bestFrom)}
              height="180"
              fill="rgba(52,211,153,0.07)"
            />
            <text
              x={(x(bestFrom) + x(bestTo)) / 2}
              y="196"
              fill="#6ee7b7"
              fontSize="11"
              textAnchor="middle"
            >
              {labels.best}
            </text>
          </>
        )}
        {area(pastPoints, 'nyx-advice-past')}
        {pastPoints.length > 1 && (
          <path
            d={path(pastPoints)}
            fill="none"
            stroke="#34d399"
            strokeWidth="3"
            strokeLinejoin="round"
          />
        )}
        {area(futurePoints, 'nyx-advice-future')}
        {futurePoints.length > 1 && (
          <path
            d={path(futurePoints)}
            fill="none"
            stroke="#34d399"
            strokeWidth="2.5"
            strokeDasharray="7 6"
            strokeLinejoin="round"
            opacity="0.85"
          />
        )}
        {ahead.length > 0 && (
          <>
            <line
              x1={x(now)}
              x2={x(now)}
              y1="0"
              y2="180"
              stroke="var(--text-muted)"
              strokeWidth="1.5"
            />
            <text x={x(now) + 6} y="14" fill="var(--text-secondary)" fontSize="12">
              {labels.now}
            </text>
          </>
        )}
        {lines.map((line) => (
          <g key={line.id}>
            <line
              x1="0"
              x2="600"
              y1={y(line.w)}
              y2={y(line.w)}
              stroke={line.color}
              strokeWidth="1.5"
              strokeDasharray="6 6"
            />
            <text x="6" y={y(line.w) - 6} fill={line.color} fontSize="12">
              {line.label}
            </text>
          </g>
        ))}
      </svg>
      <div className="flex justify-between text-[11px] text-[var(--text-muted)] tabular-nums">
        <span>{time(start)}</span>
        <span>{ahead.length ? time(end) : labels.now}</span>
      </div>
      {ahead.length > 0 && (
        <div className="flex flex-wrap gap-3.5 text-xs text-[var(--text-secondary)]">
          <span className="flex items-center gap-1.5">
            <svg width="22" height="6" aria-hidden="true">
              <line x1="0" y1="3" x2="22" y2="3" stroke="#34d399" strokeWidth="3" />
            </svg>
            {labels.measured}
          </span>
          <span className="flex items-center gap-1.5">
            <svg width="22" height="6" aria-hidden="true">
              <line
                x1="0"
                y1="3"
                x2="22"
                y2="3"
                stroke="#34d399"
                strokeWidth="2.5"
                strokeDasharray="5 4"
              />
            </svg>
            {labels.forecast}
          </span>
        </div>
      )}
    </>
  );
}

/** Pop-up of the recommendation pill: surplus, its history and every appliance. */
export default function EnergyAdviceModal({
  show,
  onClose,
  advice,
  config,
  entities,
  conn,
  locale,
  label,
  t,
  onOpenPage,
}) {
  const [series, setSeries] = useState(null);
  const slots = config?.slots || {};
  const kw = (w) => formatKw(w, locale);
  const kwh = (v) => `${formatNumber(v, locale)} kWh`;

  useEffect(() => {
    if (!show || !conn || !slots.gridPower) return undefined;
    let cancelled = false;
    const end = new Date();
    const start = new Date(end.getTime() - HISTORY_MS);
    Promise.all([
      powerHistory(conn, entities, slots.gridPower, start, end),
      powerHistory(conn, entities, slots.battPower, start, end),
    ])
      .then(([grid, batt]) => {
        if (cancelled) return;
        const opts = {
          battThreshold: advice.advice.battThreshold,
          soc: advice.soc,
          invertGrid: !!config?.invertGrid,
          invertBattery: !!config?.invertBattery,
        };
        setSeries(surplusSeries(grid, batt, opts, start.getTime(), end.getTime(), BUCKET_MS));
      })
      .catch(() => !cancelled && setSeries([]));
    return () => {
      cancelled = true;
    };
    // Read once per opening; the live values are shown above the chart.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, conn, slots.gridPower, slots.battPower]);

  const power = (key) => readPowerW(entities, slots[key]);
  const flow = computeEnergyFlow({
    pv: power('pvPower'),
    bkw: power('bkwPower'),
    house: power('houseConsumption'),
    battery: power('battPower'),
    grid: power('gridPower'),
    bkwBehindMeter: config?.bkwBehindMeter !== false,
    invertBattery: config?.invertBattery,
    invertGrid: config?.invertGrid,
  });
  const soc = advice.soc;
  const batteryText =
    soc === null
      ? null
      : t(
          flow.battCharge > 0
            ? 'energy.advice.popup.battCharging'
            : flow.battDischarge > 0
              ? 'energy.advice.popup.battDischarging'
              : 'energy.advice.popup.battIdle'
        ).replace('{soc}', formatNumber(soc, locale));
  const gridSigned = power('gridPower');
  const gridW = gridSigned === null ? null : config?.invertGrid ? -gridSigned : gridSigned;
  const nowRows = [
    [t('energy.advice.popup.pv'), slots.pvPower || slots.bkwPower ? kw(flow.pvTotal) : null],
    [t('energy.advice.popup.house'), flow.houseTotal === null ? null : kw(flow.houseTotal)],
    [t('energy.advice.popup.battery'), batteryText],
    [
      t('energy.advice.popup.grid'),
      gridW === null
        ? null
        : t(
            gridW >= 0 ? 'energy.advice.popup.gridExport' : 'energy.advice.popup.gridImport'
          ).replace('{kw}', kw(Math.abs(gridW))),
    ],
  ].filter(([, value]) => value !== null);

  const today = forecastKwh(entities, FORECAST_TODAY);
  const todayTotal = forecastKwh(entities, FORECAST_TODAY_TOTAL);
  const tomorrow = forecastKwh(entities, FORECAST_TOMORROW);
  const barMax = Math.max(today || 0, tomorrow || 0, 0.1);
  // Compare whole days, so the remaining hours of today do not decide it.
  const outlook =
    todayTotal && tomorrow !== null
      ? tomorrow >= todayTotal * 1.5
        ? t('energy.advice.popup.sunnier')
        : tomorrow <= todayTotal * 0.67
          ? t('energy.advice.popup.duller')
          : null
      : null;

  const lines = advice.items
    .filter((item) => item.demandW && item.status !== 'running')
    .map((item, i) => ({
      id: item.id,
      w: item.demandW,
      color: LINE_COLORS[i % LINE_COLORS.length],
      label: `${item.name} ${kw(item.demandW)}`,
    }));
  // The first appliance with a window today marks the best time in the chart.
  const best = advice.items.find(
    (i) => i.plan && (i.plan.kind === 'now' || i.plan.kind === 'today')
  )?.plan;

  const split = advice.battCounts
    ? t('energy.advice.split')
        .replace('{export}', kw(advice.exportW))
        .replace('{charge}', kw(advice.chargeW))
        .replace('{soc}', formatNumber(advice.soc, locale))
    : t('energy.advice.splitExport')
        .replace('{export}', kw(advice.exportW))
        .replace('{soc}', formatNumber(advice.advice.battThreshold, locale));
  const barTotal = advice.exportW + advice.chargeW;
  const titleId = 'energy-advice-modal-title';
  const forecast = advice.forecastSeries || [];

  return (
    <AccessibleModalShell
      open={show}
      onClose={onClose}
      titleId={titleId}
      overlayClassName="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6"
      overlayStyle={{ backdropFilter: 'blur(20px)', backgroundColor: 'rgba(0,0,0,0.3)' }}
      panelClassName="popup-anim relative max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-3xl border p-5 font-sans shadow-2xl backdrop-blur-xl md:rounded-[3rem] md:p-8"
      panelStyle={{
        background: 'linear-gradient(135deg, var(--card-bg) 0%, var(--modal-bg) 100%)',
        borderColor: 'var(--glass-border)',
        color: 'var(--text-primary)',
      }}
    >
      {() => (
        <>
          <button
            onClick={onClose}
            className="modal-close absolute top-5 right-5 z-10 md:top-8 md:right-8"
            aria-label={t('common.close')}
          >
            <X className="h-4 w-4" />
          </button>

          <div className="mb-6 flex items-center gap-4 pr-12">
            <div
              className="rounded-2xl p-4"
              style={{ backgroundColor: 'rgba(52,211,153,0.12)', color: '#34d399' }}
            >
              <Sun className="h-8 w-8" strokeWidth={1.5} />
            </div>
            <div className="min-w-0">
              <h3
                id={titleId}
                className="text-2xl leading-none font-light tracking-tight text-[var(--text-primary)] uppercase italic"
              >
                {t('energy.advice.title')}
              </h3>
              {label && (
                <div className="mt-2 inline-flex max-w-full items-center rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg)] px-3 py-1 text-[var(--text-secondary)]">
                  <span className="truncate text-[10px] font-bold tracking-widest uppercase italic">
                    {label}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-3">
            <div className="flex flex-col gap-4 md:col-span-2">
              <div className={`${SURFACE} flex flex-col gap-3`}>
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className={LABEL}>{t('energy.advice.popup.spare')}</p>
                    <p className="mt-1 text-4xl leading-none font-light">
                      <span className="text-[#34d399]">
                        {formatNumber(advice.usableW / 1000, locale)}
                      </span>{' '}
                      <span className="text-lg text-[var(--text-secondary)]">kW</span>
                    </p>
                  </div>
                  <p className="text-xs text-[var(--text-muted)] tabular-nums">
                    {t('energy.advice.window').replace(
                      '{min}',
                      formatNumber(advice.advice.stableMinutes, locale)
                    )}
                  </p>
                </div>
                {barTotal > 0 && (
                  <div className="flex h-2.5 overflow-hidden rounded-full bg-[var(--glass-bg)]">
                    <div
                      className="bg-[#94a3b8]"
                      style={{ width: `${(advice.exportW / barTotal) * 100}%` }}
                    />
                    <div
                      className="bg-[#60a5fa]"
                      style={{
                        width: `${(advice.chargeW / barTotal) * 100}%`,
                        opacity: advice.battCounts ? 1 : 0.35,
                      }}
                    />
                  </div>
                )}
                <p className="text-sm text-[var(--text-secondary)]">
                  {split}
                  {advice.battCounts && advice.chargeW > 0
                    ? ` ${t('energy.advice.popup.batteryNote')}`
                    : ''}
                </p>
              </div>

              <div className={`${SURFACE} hidden flex-col gap-3 md:flex`}>
                <div className={`flex justify-between gap-3 ${LABEL}`}>
                  <span>
                    {t(
                      forecast.length
                        ? 'energy.advice.popup.historyForecast'
                        : 'energy.advice.popup.history'
                    )}
                  </span>
                  {lines.length > 0 && <span>{t('energy.advice.popup.demand')}</span>}
                </div>
                {series === null ? (
                  <div className="h-[200px] animate-pulse rounded-xl bg-[var(--glass-bg)]" />
                ) : series.some((s) => Number.isFinite(s.w)) || forecast.length ? (
                  <SurplusChart
                    past={series}
                    future={forecast}
                    lines={lines}
                    window={best}
                    locale={locale}
                    labels={{
                      now: t('energy.advice.popup.nowLabel'),
                      best: t('energy.advice.popup.bestWindow'),
                      measured: t('energy.advice.popup.legendMeasured'),
                      forecast: t('energy.advice.popup.legendForecast'),
                    }}
                  />
                ) : (
                  <p className="text-sm text-[var(--text-muted)]">
                    {t('energy.advice.popup.historyEmpty')}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-2.5">
                <p className={LABEL}>{t('energy.advice.popup.devices')}</p>
                {advice.items.map((item) => {
                  const style = STATUS[item.status];
                  const highlight = item.status === 'fits';
                  const soft = item.status === 'alternative';
                  const other = item.waitingFor || (item.insteadOf || []).join(' + ');
                  const DeviceIcon = /wasch|wash/i.test(item.name) ? WashingMachine : Plug;
                  const need =
                    item.status === 'running'
                      ? t('energy.advice.now').replace('{kw}', kw(item.powerW))
                      : item.demandW
                        ? t('energy.advice.needs').replace('{kw}', kw(item.demandW))
                        : t('energy.advice.needsUnknown');
                  const runs = item.durationMin
                    ? t('energy.advice.runs').replace('{d}', formatDuration(item.durationMin))
                    : null;
                  const since = item.suggestedSince
                    ? t('energy.advice.popup.since').replace(
                        '{min}',
                        String(Math.max(1, Math.round((Date.now() - item.suggestedSince) / 60000)))
                      )
                    : null;
                  const plan = formatPlan(item.plan, t, locale);
                  return (
                    <div
                      key={item.id}
                      className="grid grid-cols-[44px_minmax(0,1fr)] items-center gap-x-3.5 gap-y-2 rounded-2xl px-4 py-3.5 sm:grid-cols-[44px_minmax(0,1fr)_auto]"
                      style={{
                        background: highlight ? 'rgba(52,211,153,0.06)' : 'var(--glass-bg)',
                        border: `1px ${soft ? 'dashed' : 'solid'} ${
                          highlight || soft ? 'rgba(52,211,153,0.3)' : 'var(--glass-border)'
                        }`,
                      }}
                    >
                      <div
                        className="flex h-11 w-11 items-center justify-center rounded-[14px]"
                        style={{ background: style.tint, color: style.color }}
                      >
                        <DeviceIcon className="h-5 w-5" />
                      </div>
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate text-base font-semibold">{item.name}</span>
                        <span className="text-[13px] text-[var(--text-muted)]">
                          {[need, runs, since].filter(Boolean).join(' · ')}
                        </span>
                      </div>
                      <span
                        className="col-start-2 flex items-center gap-1.5 justify-self-start rounded-full px-3 py-1 text-xs font-bold sm:col-start-3"
                        style={{ background: style.tint, color: style.text }}
                      >
                        <style.Icon className="h-3.5 w-3.5" />
                        {t(`energy.advice.status.${item.status}`).replace('{name}', other)}
                      </span>
                      {plan && (
                        <span
                          className="col-start-2 flex items-center gap-2 text-[13px] sm:col-end-4"
                          style={{ color: PLAN_COLOR[item.plan.kind] || 'var(--text-secondary)' }}
                        >
                          <Calendar className="h-4 w-4 flex-shrink-0" />
                          {plan}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-col gap-4">
              {nowRows.length > 0 && (
                <div className={`${SURFACE} hidden md:block`}>
                  <p className={`${LABEL} mb-2`}>{t('energy.advice.popup.now')}</p>
                  {nowRows.map(([name, value]) => (
                    <div
                      key={name}
                      className="flex justify-between border-t border-[var(--glass-border)] py-2 text-[13px]"
                    >
                      <span className="text-[var(--text-secondary)]">{name}</span>
                      <span className="font-bold tabular-nums">{value}</span>
                    </div>
                  ))}
                </div>
              )}
              {today !== null && (
                <div className={`${SURFACE} flex flex-col gap-3`}>
                  <p className={LABEL}>{t('energy.advice.popup.forecastTitle')}</p>
                  {[
                    [t('energy.advice.popup.restToday'), today, '#34d399'],
                    [t('energy.advice.popup.tomorrow'), tomorrow, '#60a5fa'],
                  ]
                    .filter(([, value]) => value !== null)
                    .map(([name, value, color]) => (
                      <div key={name} className="flex flex-col gap-1.5">
                        <div className="flex justify-between text-[13px]">
                          <span className="text-[var(--text-secondary)]">{name}</span>
                          <span className="font-bold tabular-nums">{kwh(value)}</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-[var(--glass-bg)]">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${(value / barMax) * 100}%`, background: color }}
                          />
                        </div>
                      </div>
                    ))}
                  {outlook && <p className="text-[13px] text-[var(--text-secondary)]">{outlook}</p>}
                </div>
              )}
              {onOpenPage && (
                <button
                  type="button"
                  onClick={onOpenPage}
                  className="flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-4 text-sm font-bold text-[var(--text-primary)]"
                >
                  {t('energy.advice.popup.openPage')}
                  <ArrowRight className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </AccessibleModalShell>
  );
}
