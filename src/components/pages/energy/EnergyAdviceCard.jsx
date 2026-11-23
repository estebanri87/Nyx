import { memo } from 'react';
import { ArrowLeftRight, Calendar, Check, Clock, Play, Plug, WashingMachine } from '../../../icons';
import { formatNumber } from './energyModel';
import { FORECAST_TODAY, FORECAST_TOMORROW, forecastKwh } from './energyPlan';

const CARD = 'rounded-3xl border border-[var(--glass-border)] bg-[var(--card-bg)]';
const LABEL = 'text-[11px] font-bold tracking-[0.14em] text-[var(--text-muted)] uppercase';

export const STATUS = {
  fits: { Icon: Check, color: '#34d399', tint: 'rgba(52,211,153,0.16)', text: '#6ee7b7' },
  alternative: {
    Icon: ArrowLeftRight,
    color: '#34d399',
    tint: 'rgba(52,211,153,0.1)',
    text: '#a7f3d0',
  },
  running: { Icon: Play, color: '#60a5fa', tint: 'rgba(96,165,250,0.16)', text: '#93c5fd' },
  short: { Icon: Clock, color: '#f59e0b', tint: 'rgba(245,158,11,0.14)', text: '#fcd34d' },
  learning: { Icon: Clock, color: '#94a3b8', tint: 'rgba(148,163,184,0.14)', text: '#cbd5e1' },
  waiting: { Icon: Clock, color: '#94a3b8', tint: 'rgba(148,163,184,0.14)', text: '#cbd5e1' },
};

/** kW with one decimal, e.g. "2,1 kW". */
export const formatKw = (w, locale) => `${formatNumber((w || 0) / 1000, locale)} kW`;

/** Run time, e.g. "45 min", "2 h" or "1:30 h". */
export const formatDuration = (min) => {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}:${String(m).padStart(2, '0')} h` : `${h} h`;
};

/** Colour of a planning line by its kind. */
export const PLAN_COLOR = { now: '#a7f3d0', today: '#93c5fd', tomorrow: '#93c5fd', none: null };

/** Planning line of an appliance, e.g. "Besser morgen 10:30–12:30", or null. */
export function formatPlan(plan, t, locale) {
  if (!plan) return null;
  const time = (ms) =>
    new Date(ms).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  let key = `energy.advice.plan.${plan.kind}`;
  if (plan.after) {
    key =
      plan.kind === 'none'
        ? 'energy.advice.plan.afterNone'
        : plan.kind === 'tomorrow'
          ? 'energy.advice.plan.afterTomorrow'
          : 'energy.advice.plan.afterToday';
  } else if (plan.kind === 'tomorrow' && plan.todayMin >= 15) {
    key = 'energy.advice.plan.tomorrowShort';
  }
  return t(key)
    .replace('{start}', plan.start ? time(plan.start) : '')
    .replace('{end}', plan.end ? time(plan.end) : '')
    .replace('{min}', String(plan.todayMin ?? ''))
    .replace('{name}', plan.after || '');
}

/** "heute noch 4,3 kWh, morgen 17,6 kWh erwartet" from Forecast.Solar, or null. */
export function forecastLine(entities, t, locale) {
  const today = forecastKwh(entities, FORECAST_TODAY);
  if (today === null) return null;
  const tomorrow = forecastKwh(entities, FORECAST_TOMORROW);
  const kwh = (v) => `${formatNumber(v, locale)} kWh`;
  return t('energy.advice.forecastLine')
    .replace('{today}', kwh(today))
    .replace('{tomorrow}', tomorrow === null ? '–' : kwh(tomorrow));
}

/** "Jetzt sinnvoll": spare solar power and which appliances fit into it. */
function EnergyAdviceCard({ advice, entities, locale, t }) {
  const kw = (w) => formatKw(w, locale);
  const has = advice.usableW >= 100;
  const [before, after] = t('energy.advice.surplus').split('{kw}');
  const barTotal = advice.exportW + advice.chargeW;
  const split = advice.battCounts
    ? t('energy.advice.split')
        .replace('{export}', kw(advice.exportW))
        .replace('{charge}', kw(advice.chargeW))
        .replace('{soc}', formatNumber(advice.soc, locale))
    : t('energy.advice.splitExport')
        .replace('{export}', kw(advice.exportW))
        .replace('{soc}', formatNumber(advice.advice.battThreshold, locale));

  return (
    <section id="energy-advice" className={`${CARD} p-6`} aria-labelledby="energy-advice-title">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h3 id="energy-advice-title" className={LABEL}>
            {t('energy.advice.title')}
          </h3>
          <p className="text-2xl font-light text-[var(--text-primary)]">
            {has ? (
              <>
                {before}
                <span className="text-[#34d399]">{kw(advice.usableW)}</span>
                {after}
              </>
            ) : (
              t('energy.advice.none')
            )}
          </p>
          <p className="text-sm text-[var(--text-secondary)]">
            {[split, forecastLine(entities, t, locale)].filter(Boolean).join(' · ')}
          </p>
        </div>
        {barTotal > 0 && (
          <div className="flex min-w-[220px] flex-[0_1_320px] flex-col gap-1.5">
            <div className="flex justify-between text-xs text-[var(--text-muted)]">
              <span>{t('energy.advice.bar')}</span>
              <span className="tabular-nums">
                {t('energy.advice.window').replace(
                  '{min}',
                  formatNumber(advice.advice.stableMinutes, locale)
                )}
              </span>
            </div>
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
            <div className="flex gap-3.5 text-xs text-[var(--text-secondary)]">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#94a3b8]" />
                {t('energy.component.netz')}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#60a5fa]" />
                {t('energy.component.batt')}
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
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
          const plan = formatPlan(item.plan, t, locale);
          return (
            <div
              key={item.id}
              className="flex flex-col gap-3.5 rounded-2xl p-[18px]"
              style={{
                background: highlight ? 'rgba(52,211,153,0.06)' : 'var(--glass-bg)',
                border: `1px ${soft ? 'dashed' : 'solid'} ${
                  highlight || soft ? 'rgba(52,211,153,0.3)' : 'var(--glass-border)'
                }`,
              }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-[14px]"
                  style={{ background: style.tint, color: style.color }}
                >
                  <DeviceIcon className="h-6 w-6" />
                </div>
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-[17px] font-semibold text-[var(--text-primary)]">
                    {item.name}
                  </span>
                  <span className="text-[13px] text-[var(--text-muted)]">
                    {[
                      need,
                      item.durationMin
                        ? t('energy.advice.runs').replace('{d}', formatDuration(item.durationMin))
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </div>
              </div>
              <span
                className="flex items-center gap-1.5 self-start rounded-full px-3 py-1 text-xs font-bold"
                style={{ background: style.tint, color: style.text }}
              >
                <style.Icon className="h-3.5 w-3.5" />
                {t(`energy.advice.status.${item.status}`).replace('{name}', other)}
              </span>
              <p className="text-[13px] text-[var(--text-secondary)]">
                {t(`energy.advice.hint.${item.status}`)
                  .replace('{kw}', kw(item.missingW))
                  .replace('{name}', other)}
              </p>
              {plan && (
                <p
                  className="mt-auto flex items-center gap-2 border-t border-[var(--glass-border)] pt-3 text-[13px]"
                  style={{ color: PLAN_COLOR[item.plan.kind] || 'var(--text-secondary)' }}
                >
                  <Calendar className="h-4 w-4 flex-shrink-0" />
                  {plan}
                </p>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-4 text-[13px] text-[var(--text-muted)]">
        {t(
          advice.advice.battThreshold > 0
            ? 'energy.advice.footnote'
            : 'energy.advice.footnoteAlways'
        )
          .replace('{soc}', formatNumber(advice.advice.battThreshold, locale))
          .replace('{min}', formatNumber(advice.advice.stableMinutes, locale))}
      </p>
    </section>
  );
}

export default memo(EnergyAdviceCard);
