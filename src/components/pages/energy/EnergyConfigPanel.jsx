import { memo, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Plus, X } from '../../../icons';
import { SearchableSelect } from '../../../modals/editCard/CarMappingsSection';
import { ADVICE_DEFAULTS } from './energyAdvice';
import { ENERGY_SLOT_GROUPS, formatNumber } from './energyModel';

const SECTION = 'rounded-3xl border border-[var(--glass-border)] bg-[var(--card-bg)]';
const SMALL_BUTTON =
  'flex items-center gap-1.5 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-3 py-2 text-[11px] font-bold tracking-widest text-[var(--text-secondary)] uppercase transition-colors hover:bg-[var(--glass-bg-hover)] hover:text-[var(--text-primary)]';
const ICON_BUTTON =
  'flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-[var(--glass-bg)] text-[var(--text-muted)] transition-colors hover:bg-[var(--glass-bg-hover)] hover:text-[var(--text-primary)]';

function Toggle({ label, hint, value, onChange }) {
  return (
    <div className="popup-surface flex items-center justify-between gap-4 rounded-2xl px-4 py-3">
      <div className="min-w-0">
        <p className="text-xs font-bold tracking-widest text-[var(--text-muted)] uppercase">
          {label}
        </p>
        {hint && <p className="mt-1 text-[11px] text-[var(--text-muted)]">{hint}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-label={label}
        onClick={() => onChange(!value)}
        className={`relative h-6 w-12 flex-shrink-0 rounded-full transition-colors ${value ? 'bg-[var(--accent-color)]' : 'bg-[var(--glass-bg-hover)]'}`}
      >
        <span
          className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-all ${value ? 'left-7' : 'left-1'}`}
        />
      </button>
    </div>
  );
}

function EnergyConfigPanel({ config, onChange, entities, adviceItems = [], locale, t }) {
  const [openGroup, setOpenGroup] = useState('pv');

  const entityOptions = useMemo(
    () =>
      Object.keys(entities || {})
        .filter((id) =>
          /^(sensor|binary_sensor|select|number|switch|input_number|input_select|water_heater|climate|weather)\./.test(
            id
          )
        )
        .sort((a, b) =>
          (entities[a]?.attributes?.friendly_name || a).localeCompare(
            entities[b]?.attributes?.friendly_name || b
          )
        ),
    [entities]
  );

  const update = (patch) => onChange({ ...config, ...patch });
  const setSlot = (key, id) => update({ slots: { ...config.slots, [key]: id || undefined } });
  const setExtras = (group, list) => update({ extras: { ...config.extras, [group]: list } });
  const setStrings = (list) => update({ strings: list });
  const setAliases = (list) => update({ aliases: list });
  const setDevices = (list) => update({ devices: list });
  const setAdvice = (key, value) => update({ advice: { ...config.advice, [key]: value } });
  const adviceValue = (key) => config.advice[key] ?? ADVICE_DEFAULTS[key];
  const learned = (id) => adviceItems.find((i) => i.id === id) || {};
  // Why there is no demand yet: still loading, failed, no power sensor or no running hours.
  const demandText = (id) => {
    const { demandW, demandState, demandError } = learned(id);
    const unit = entities[id]?.attributes?.unit_of_measurement;
    if (unit && !['W', 'kW', 'mW', 'MW'].includes(unit))
      return t('energy.config.notPower').replace('{unit}', unit);
    if (demandW)
      return t('energy.config.learned').replace(
        '{kw}',
        `${formatNumber(demandW / 1000, locale)} kW`
      );
    if (demandState === 'failed')
      return demandError
        ? `${t('energy.config.failed')}: ${demandError}`
        : t('energy.config.failed');
    if (demandState === 'done') return t('energy.config.noData');
    return t('energy.config.learning');
  };
  const moveDevice = (index, delta) => {
    const next = [...config.devices];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item);
    setDevices(next);
  };
  const setName = (id, name) => update({ names: { ...config.names, [id]: name || undefined } });

  const select = (label, value, onSelect) => (
    <SearchableSelect
      label={label}
      value={value || null}
      options={entityOptions}
      onChange={onSelect}
      placeholder={t('dropdown.noneSelected')}
      entities={entities}
      t={t}
      maxOptions={150}
    />
  );

  return (
    <section className={`${SECTION} mb-6 p-5 md:p-6`} aria-labelledby="energy-config-title">
      <h3
        id="energy-config-title"
        className="text-lg font-light tracking-widest text-[var(--text-primary)] uppercase"
      >
        {t('energy.config.title')}
      </h3>
      <p className="mt-1 mb-5 text-sm text-[var(--text-secondary)]">{t('energy.config.hint')}</p>

      <div className="space-y-3">
        {ENERGY_SLOT_GROUPS.map((group) => {
          const isOpen = openGroup === group.id;
          const extras = config.extras[group.id] || [];
          return (
            <div key={group.id} className="popup-surface rounded-2xl">
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => setOpenGroup(isOpen ? null : group.id)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
              >
                <span className="text-sm font-semibold text-[var(--text-primary)]">
                  {t(`energy.component.${group.id}`)}
                </span>
                <span className="flex items-center gap-3">
                  <span className="text-[11px] text-[var(--text-muted)]">
                    {group.slots.filter((s) => config.slots[s]).length}/{group.slots.length}
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 text-[var(--text-muted)] transition-transform ${isOpen ? 'rotate-180' : ''}`}
                  />
                </span>
              </button>

              {isOpen && (
                <div className="space-y-4 px-4 pb-4">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {group.slots.map((slot) => (
                      <div key={slot}>
                        {select(t(`energy.slot.${slot}`), config.slots[slot], (id) =>
                          setSlot(slot, id)
                        )}
                      </div>
                    ))}
                  </div>

                  {group.id === 'pv' && (
                    <div className="space-y-3">
                      <p className="text-xs font-bold tracking-widest text-[var(--text-muted)] uppercase">
                        {t('energy.config.strings')}
                      </p>
                      {config.strings.map((str, index) => (
                        <div
                          key={index}
                          className="rounded-2xl border border-[var(--glass-border)] p-3"
                        >
                          <div className="mb-2 flex items-center justify-between">
                            <span className="text-sm text-[var(--text-secondary)]">
                              {t('energy.string.name').replace('{n}', String(index + 1))}
                            </span>
                            <button
                              type="button"
                              className={ICON_BUTTON}
                              aria-label={t('common.delete')}
                              onClick={() =>
                                setStrings(config.strings.filter((_, i) => i !== index))
                              }
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                            {['power', 'voltage', 'current'].map((field) => (
                              <div key={field}>
                                {select(t(`energy.string.${field}`), str[field], (id) =>
                                  setStrings(
                                    config.strings.map((s, i) =>
                                      i === index ? { ...s, [field]: id || undefined } : s
                                    )
                                  )
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                      <button
                        type="button"
                        className={SMALL_BUTTON}
                        onClick={() => setStrings([...config.strings, {}])}
                      >
                        <Plus className="h-3.5 w-3.5" /> {t('energy.config.addString')}
                      </button>
                    </div>
                  )}

                  <div className="space-y-2">
                    <p className="text-xs font-bold tracking-widest text-[var(--text-muted)] uppercase">
                      {t('energy.config.extras')}
                    </p>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      {t('energy.config.extrasHint')}
                    </p>
                    {extras.map((id) => (
                      <div
                        key={id}
                        className="flex items-center justify-between gap-3 rounded-xl bg-[var(--glass-bg)] px-3 py-2"
                      >
                        <input
                          type="text"
                          aria-label={t('energy.config.extraName')}
                          title={id}
                          placeholder={entities[id]?.attributes?.friendly_name || id}
                          value={config.names[id] || ''}
                          onChange={(e) => setName(id, e.target.value)}
                          className="popup-surface min-w-0 flex-1 rounded-xl px-3 py-2 text-sm text-[var(--text-primary)] outline-none"
                        />
                        <button
                          type="button"
                          className={ICON_BUTTON}
                          aria-label={t('common.delete')}
                          onClick={() =>
                            setExtras(
                              group.id,
                              extras.filter((e) => e !== id)
                            )
                          }
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                    {select(t('energy.config.addExtra'), null, (id) => {
                      if (id && !extras.includes(id)) setExtras(group.id, [...extras, id]);
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
        <Toggle
          label={t('energy.config.bkwBehindMeter')}
          hint={t('energy.config.bkwBehindMeterHint')}
          value={config.bkwBehindMeter !== false}
          onChange={(v) => update({ bkwBehindMeter: v })}
        />
        <Toggle
          label={t('energy.config.invertBattery')}
          hint={t('energy.config.invertBatteryHint')}
          value={!!config.invertBattery}
          onChange={(v) => update({ invertBattery: v })}
        />
        <Toggle
          label={t('energy.config.invertGrid')}
          hint={t('energy.config.invertGridHint')}
          value={!!config.invertGrid}
          onChange={(v) => update({ invertGrid: v })}
        />
      </div>

      <div className="mt-5 space-y-3">
        <p className="text-xs font-bold tracking-widest text-[var(--text-muted)] uppercase">
          {t('energy.config.devices')}
        </p>
        <p className="text-[11px] text-[var(--text-muted)]">{t('energy.config.devicesHint')}</p>
        {config.devices.map((device, index) => {
          return (
            <div
              key={device.entity}
              className="flex flex-wrap items-center gap-2 rounded-xl bg-[var(--glass-bg)] px-3 py-2"
            >
              <input
                type="text"
                aria-label={t('energy.config.deviceName')}
                title={device.entity}
                placeholder={entities[device.entity]?.attributes?.friendly_name || device.entity}
                value={device.name || ''}
                onChange={(e) =>
                  setDevices(
                    config.devices.map((d, i) =>
                      i === index ? { ...d, name: e.target.value || undefined } : d
                    )
                  )
                }
                className="popup-surface min-w-0 flex-1 rounded-xl px-3 py-2 text-sm text-[var(--text-primary)] outline-none"
              />
              <span className="flex min-w-0 flex-col text-right text-[11px] text-[var(--text-muted)] tabular-nums">
                <span className="max-w-[420px] truncate" title={demandText(device.entity)}>
                  {demandText(device.entity)}
                </span>
                <span className="truncate opacity-70">{device.entity}</span>
              </span>
              <button
                type="button"
                className={ICON_BUTTON}
                aria-label={t('energy.config.moveUp')}
                disabled={index === 0}
                onClick={() => moveDevice(index, -1)}
              >
                <ChevronUp className="h-4 w-4" />
              </button>
              <button
                type="button"
                className={ICON_BUTTON}
                aria-label={t('energy.config.moveDown')}
                disabled={index === config.devices.length - 1}
                onClick={() => moveDevice(index, 1)}
              >
                <ChevronDown className="h-4 w-4" />
              </button>
              <button
                type="button"
                className={ICON_BUTTON}
                aria-label={t('common.delete')}
                onClick={() => setDevices(config.devices.filter((_, i) => i !== index))}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
        {select(t('energy.config.addDevice'), null, (id) => {
          if (id && !config.devices.some((d) => d.entity === id))
            setDevices([...config.devices, { entity: id }]);
        })}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {['battThreshold', 'stableMinutes', 'runW'].map((key) => (
            <label key={key} className="popup-surface flex flex-col gap-1.5 rounded-2xl px-4 py-3">
              <span className="text-xs font-bold tracking-widest text-[var(--text-muted)] uppercase">
                {t(`energy.config.${key}`)}
              </span>
              <input
                type="number"
                min="0"
                value={adviceValue(key)}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  if (Number.isFinite(value) && value >= 0) setAdvice(key, value);
                }}
                className="bg-transparent text-lg text-[var(--text-primary)] outline-none"
              />
            </label>
          ))}
        </div>
      </div>

      <div className="mt-5 space-y-3">
        <p className="text-xs font-bold tracking-widest text-[var(--text-muted)] uppercase">
          {t('energy.config.aliases')}
        </p>
        <p className="text-[11px] text-[var(--text-muted)]">{t('energy.config.aliasesHint')}</p>
        {config.aliases.map((alias, index) => (
          <div key={index} className="flex items-center gap-2">
            {['from', 'to'].map((field) => (
              <input
                key={field}
                type="text"
                aria-label={t(`energy.config.alias.${field}`)}
                placeholder={t(`energy.config.alias.${field}`)}
                value={alias[field] || ''}
                onChange={(e) =>
                  setAliases(
                    config.aliases.map((a, i) =>
                      i === index ? { ...a, [field]: e.target.value } : a
                    )
                  )
                }
                className="popup-surface min-w-0 flex-1 rounded-xl px-3 py-2 text-sm text-[var(--text-primary)] outline-none"
              />
            ))}
            <button
              type="button"
              className={ICON_BUTTON}
              aria-label={t('common.delete')}
              onClick={() => setAliases(config.aliases.filter((_, i) => i !== index))}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
        <button
          type="button"
          className={SMALL_BUTTON}
          onClick={() => setAliases([...config.aliases, { from: '', to: '' }])}
        >
          <Plus className="h-3.5 w-3.5" /> {t('energy.config.addAlias')}
        </button>
      </div>
    </section>
  );
}

export default memo(EnergyConfigPanel);
