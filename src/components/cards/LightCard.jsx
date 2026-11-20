import { useRef, useEffect, useCallback, useState, memo } from 'react';
import { getIconComponent } from '../../icons';
import { Lightbulb } from '../../icons';
import M3Slider from '../ui/M3Slider';
import { Check, RefreshCw } from '../../icons';
import { resolveLightScenes } from '../../utils/lightScenes';

const SLIDER_DEBOUNCE_MS = 200;
const SCENE_DONE_MS = 1500;

/** Up to three scenes as quick picks under the slider of the large card. */
function LightSceneChips({ sceneIds, entities, editMode, callService, label }) {
  const [status, setStatus] = useState({});
  const mountedRef = useRef(true);
  const timersRef = useRef({});

  useEffect(() => {
    mountedRef.current = true;
    const timers = timersRef.current;
    return () => {
      mountedRef.current = false;
      Object.values(timers).forEach(clearTimeout);
    };
  }, []);

  const setSceneStatus = (sceneId, next) => {
    if (!mountedRef.current) return;
    setStatus((prev) => {
      const updated = { ...prev };
      if (next) updated[sceneId] = next;
      else delete updated[sceneId];
      return updated;
    });
  };

  const activate = (event, sceneId) => {
    event.stopPropagation();
    if (editMode || status[sceneId] === 'pending') return;
    clearTimeout(timersRef.current[sceneId]);
    setSceneStatus(sceneId, 'pending');
    const done = () => {
      setSceneStatus(sceneId, 'done');
      timersRef.current[sceneId] = setTimeout(() => setSceneStatus(sceneId, null), SCENE_DONE_MS);
    };
    // callService shows the toast when the call fails or the scene is unavailable.
    const failed = () => setSceneStatus(sceneId, null);
    try {
      Promise.resolve(callService('scene', 'turn_on', { entity_id: sceneId })).then(done, failed);
    } catch {
      failed();
    }
  };

  return (
    <div role="group" aria-label={label} className="relative z-30 mt-1.5 flex min-w-0 gap-1.5">
      {sceneIds.map((sceneId) => {
        const scene = entities[sceneId];
        const sceneName = String(scene?.attributes?.friendly_name || sceneId);
        const isPending = status[sceneId] === 'pending';
        const isDone = status[sceneId] === 'done';
        const isSceneUnavailable = scene?.state === 'unavailable';
        return (
          <button
            key={sceneId}
            type="button"
            title={sceneName}
            aria-busy={isPending}
            disabled={editMode || isPending || isSceneUnavailable}
            onClick={(event) => activate(event, sceneId)}
            // Enter and Space belong to the chip; the card would open the light popup instead.
            onKeyDown={(event) => event.stopPropagation()}
            className={`flex h-7 min-w-0 cursor-pointer items-center gap-1 rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg)] px-2.5 text-[11px] leading-none font-semibold text-[var(--text-secondary)] transition-[transform,background-color,color] duration-200 enabled:hover:bg-[var(--glass-bg-hover)] enabled:hover:text-[var(--text-primary)] enabled:active:scale-95 disabled:cursor-default ${isSceneUnavailable ? 'opacity-50' : ''}`}
          >
            {isPending ? (
              <RefreshCw aria-hidden="true" className="h-3 w-3 shrink-0 animate-spin" />
            ) : isDone ? (
              <Check aria-hidden="true" className="h-3 w-3 shrink-0" />
            ) : null}
            <span className="truncate">{sceneName}</span>
          </button>
        );
      })}
    </div>
  );
}

/** @param {any} props */
const LightCard = ({
  cardId,
  dragProps,
  controls,
  cardStyle,
  entities,
  editMode,
  cardSettings,
  settingsKey,
  customNames,
  customIcons,
  getA,
  callService,
  onOpen,
  isMobile,
  optimisticLightBrightness,
  setOptimisticLightBrightness,
  t,
}) => {
  const entity = entities[cardId];
  const DefaultIcon = Lightbulb;
  const lightIconName = customIcons[cardId] || entity?.attributes?.icon;
  const LightIcon = lightIconName ? getIconComponent(lightIconName) || DefaultIcon : DefaultIcon;
  const state = entity?.state;
  const isUnavailable = state === 'unavailable' || state === 'unknown' || !state;
  const isOn = state === 'on';
  const br = getA(cardId, 'brightness') || 0;
  const subEntities = getA(cardId, 'entity_id', []);
  const activeCount = subEntities.filter((id) => entities[id]?.state === 'on').length;
  const totalCount = subEntities.length;
  const name = customNames[cardId] || getA(cardId, 'friendly_name');

  // Determine if light supports dimming
  const supportedColorModes = entity?.attributes?.supported_color_modes;
  const isDimmable = supportedColorModes
    ? !supportedColorModes.includes('onoff') || supportedColorModes.length > 1
    : (entity?.attributes?.supported_features & 1) === 1;

  const sizeSetting = cardSettings[settingsKey]?.size || cardSettings[cardId]?.size;
  const isSmall = sizeSetting === 'small';
  const isDenseMobile = isMobile && !isSmall;
  // Scenes only fit on the large card; there they make the value and slider more compact.
  const sceneIds = isSmall
    ? []
    : resolveLightScenes((cardSettings[settingsKey] || cardSettings[cardId])?.lightScenes).filter(
        (sceneId) => entities[sceneId]
      );
  const hasScenes = sceneIds.length > 0;

  // Small cards show the brightness beside the slider; it follows the finger while dragging.
  const brightnessPct = Math.round(((optimisticLightBrightness[cardId] ?? br) / 255) * 100);
  const inlineValueIsNumber = !isUnavailable && isOn && isDimmable;
  const inlineValue = isUnavailable
    ? '--'
    : inlineValueIsNumber
      ? `${brightnessPct}%`
      : isOn
        ? t('common.on')
        : t('common.off');
  const inlineValueClass = `shrink-0 leading-none whitespace-nowrap ${isDimmable ? 'min-w-10 text-right' : 'text-left'} ${inlineValueIsNumber ? 'text-sm font-semibold text-[var(--text-primary)] tabular-nums' : 'text-[11px] font-bold tracking-widest text-[var(--text-secondary)] uppercase'}`;

  // Debounced brightness service call
  const debounceRef = useRef(null);
  useEffect(() => () => clearTimeout(debounceRef.current), []);

  const handleBrightnessChange = useCallback(
    (e) => {
      const val = parseInt(e.target.value);
      setOptimisticLightBrightness((prev) => ({ ...prev, [cardId]: val }));
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        callService('light', 'turn_on', { entity_id: cardId, brightness: val });
      }, SLIDER_DEBOUNCE_MS);
    },
    [cardId, callService, setOptimisticLightBrightness]
  );

  const handleToggleLight = useCallback(
    (event) => {
      event.stopPropagation();
      if (isUnavailable) return;
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
      callService('light', 'toggle', { entity_id: cardId });
    },
    [cardId, callService, isUnavailable]
  );

  if (isSmall) {
    return (
      <div
        key={cardId}
        {...dragProps}
        data-haptic={editMode ? undefined : 'card'}
        onClick={(e) => {
          e.stopPropagation();
          if (!editMode) onOpen();
        }}
        onKeyDown={(e) => {
          if (editMode) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            onOpen();
          }
        }}
        role={editMode ? undefined : 'button'}
        tabIndex={editMode ? -1 : 0}
        className={`touch-feedback group relative flex h-full items-center gap-4 overflow-hidden rounded-3xl border p-4 pl-5 font-sans transition-all duration-500 ${!editMode ? 'cursor-pointer active:scale-[0.98]' : 'cursor-move'} ${isUnavailable ? 'opacity-70' : ''}`}
        style={cardStyle}
      >
        {controls}

        <button
          onClick={handleToggleLight}
          className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl transition-all duration-500 ${isOn ? 'bg-amber-500/20 text-amber-400' : 'bg-[var(--glass-bg)] text-[var(--text-muted)] hover:bg-[var(--glass-bg-hover)]'}`}
          disabled={isUnavailable}
          aria-label={`${name || t('common.light')}: ${isOn ? t('common.off') : t('common.on')}`}
        >
          <LightIcon
            className={`h-6 w-6 stroke-[1.5px] ${isOn ? 'fill-amber-400/20' : ''} transition-transform duration-300 group-hover:scale-110`}
          />
        </button>

        <div className="flex h-full min-w-0 flex-1 flex-col justify-center gap-3 pt-1">
          <div className="flex items-baseline justify-between pr-1">
            <p className="truncate text-xs leading-none font-bold tracking-wide text-[var(--text-secondary)] uppercase opacity-60">
              {String(name || t('common.light'))}
            </p>
            {isUnavailable && (
              <span
                className="text-lg leading-none font-medium text-[var(--status-error-fg)]"
                aria-label={t('status.unavailable')}
                title={t('status.unavailable')}
              >
                ⚠
              </span>
            )}
          </div>
          <div className="flex h-6 w-full min-w-0 items-center gap-3">
            {isDimmable && (
              <div className="min-w-0 flex-1">
                <M3Slider
                  variant="thinLg"
                  min={0}
                  max={255}
                  step={1}
                  value={optimisticLightBrightness[cardId] ?? br}
                  disabled={isUnavailable}
                  onChange={handleBrightnessChange}
                  colorClass="bg-amber-500"
                  ariaLabel={t('light.brightness')}
                />
              </div>
            )}
            <span className={inlineValueClass} data-light-value>
              {inlineValue}
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      key={cardId}
      {...dragProps}
      data-haptic={editMode ? undefined : 'card'}
      onClick={(e) => {
        e.stopPropagation();
        if (!editMode) onOpen();
      }}
      onKeyDown={(e) => {
        if (editMode) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          onOpen();
        }
      }}
      role={editMode ? undefined : 'button'}
      tabIndex={editMode ? -1 : 0}
      className={`touch-feedback group relative flex h-full flex-col justify-between overflow-hidden rounded-3xl border font-sans transition-all duration-500 ${isDenseMobile ? 'p-5' : 'p-7'} ${!editMode ? 'cursor-pointer active:scale-98' : 'cursor-move'} ${isUnavailable ? 'opacity-70' : ''}`}
      style={cardStyle}
    >
      {controls}
      <div className="flex items-start justify-between">
        <button
          onClick={handleToggleLight}
          className={`transition-all duration-500 ${isOn ? 'bg-amber-500/20 text-amber-400' : 'bg-[var(--glass-bg)] text-[var(--text-muted)]'} ${isDenseMobile ? 'rounded-xl p-2.5' : 'rounded-2xl p-3'}`}
          disabled={isUnavailable}
          aria-label={`${name || t('common.light')}: ${isOn ? t('common.off') : t('common.on')}`}
        >
          <LightIcon
            className={`${isDenseMobile ? 'h-4 w-4' : 'h-5 w-5'} stroke-[1.5px] ${isOn ? 'fill-amber-400/20' : ''} transition-transform duration-300 group-hover:scale-110 group-hover:rotate-6`}
          />
        </button>
        <div
          className={`flex items-center rounded-full border transition-all ${isUnavailable ? 'border-[var(--status-error-border)] bg-[var(--status-error-bg)] text-[var(--status-error-fg)]' : isOn ? 'border-amber-500/20 bg-amber-500/10 text-amber-500' : 'border-[var(--glass-border)] bg-[var(--glass-bg)] text-[var(--text-secondary)]'} ${isDenseMobile ? 'gap-1 px-2.5 py-1' : 'gap-1.5 px-3 py-1'}`}
        >
          <span
            className={`${isDenseMobile ? 'text-[10px]' : 'text-xs'} font-bold tracking-widest uppercase`}
          >
            {isUnavailable
              ? t('status.unavailable')
              : totalCount > 0
                ? activeCount > 0
                  ? `${activeCount}/${totalCount}`
                  : t('common.off')
                : isOn
                  ? t('common.on')
                  : t('common.off')}
          </span>
        </div>
      </div>
      <div className={`${isDenseMobile ? 'mt-1' : 'mt-2'} font-sans`}>
        {(!isDenseMobile || hasScenes) && (
          <p className="mb-0.5 truncate text-[10px] leading-none font-bold tracking-[0.2em] text-[var(--text-secondary)] uppercase opacity-60">
            {String(name || t('common.light'))}
          </p>
        )}
        <div
          className={`flex items-baseline gap-1 leading-none ${isDenseMobile ? 'mt-0.5' : 'mt-1'}`}
        >
          {isDimmable ? (
            <>
              <span
                className={`${isDenseMobile || hasScenes ? 'text-3xl' : 'text-4xl'} leading-none font-thin text-[var(--text-primary)]`}
              >
                {isUnavailable
                  ? '--'
                  : isOn
                    ? Math.round(((optimisticLightBrightness[cardId] ?? br) / 255) * 100)
                    : '0'}
              </span>
              <span
                className={`${isDenseMobile ? 'text-lg' : hasScenes ? 'ml-1 text-lg' : 'ml-1 text-xl'} font-light text-[var(--text-muted)]`}
              >
                %
              </span>
            </>
          ) : (
            /* Layout: maintain 4xl height but show nothing unless UNAVAILABLE */
            <span
              className={`${isDenseMobile || hasScenes ? 'text-3xl' : 'text-4xl'} leading-none font-thin text-transparent select-none`}
            >
              {isUnavailable ? <span className="text-[var(--text-primary)]">--</span> : '0'}
            </span>
          )}
        </div>
        {isDenseMobile && !hasScenes && (
          <p className="mt-3 mb-1 text-[10px] leading-none font-bold tracking-[0.2em] text-[var(--text-secondary)] uppercase opacity-60">
            {String(name || t('common.light'))}
          </p>
        )}
        {/* Helper to keep layout consistent. For non-dimmable, we keep the empty space where slider would be. */}
        {(isDimmable || !hasScenes) && (
          <div
            className={`flex w-full items-center ${hasScenes ? 'mt-1' : `${isDenseMobile ? 'mt-2' : 'mt-3'} ${isDimmable ? '' : isDenseMobile ? 'h-8' : 'h-12'}`}`}
          >
            {isDimmable && (
              <div className="min-w-0 flex-1">
                <M3Slider
                  variant={isDenseMobile || hasScenes ? 'thinLg' : 'default'}
                  min={0}
                  max={255}
                  step={1}
                  value={optimisticLightBrightness[cardId] ?? br}
                  disabled={isUnavailable}
                  onChange={handleBrightnessChange}
                  colorClass="bg-amber-500"
                  ariaLabel={t('light.brightness')}
                />
              </div>
            )}
          </div>
        )}
        {hasScenes && (
          <LightSceneChips
            sceneIds={sceneIds}
            entities={entities}
            editMode={editMode}
            callService={callService}
            label={t('light.scenes')}
          />
        )}
      </div>
    </div>
  );
};

export default memo(LightCard);
