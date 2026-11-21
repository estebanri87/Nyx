import { useHomeAssistant, usePages, useConfig } from '../../contexts';
import { getLocaleForLanguage } from '../../i18n';
import { normalizeEnergyConfig } from '../pages/energy/energyModel';
import { useEnergyAdvice } from '../pages/energy/useEnergyAdvice';
import { formatKw } from '../pages/energy/EnergyAdviceCard';
import StatusPill from './StatusPill';

export const ENERGY_ADVICE_PILL_TYPE = 'energy_advice';

/** Id of the first energy page with appliances set up for recommendations. */
export function findAdvicePageId(pageSettings) {
  const match = Object.entries(pageSettings || {}).find(
    ([, s]) => s?.type === 'energy' && Array.isArray(s.energy?.devices) && s.energy.devices.length
  );
  return match ? match[0] : null;
}

/** Status pill that appears while an appliance fits into the spare solar power. */
export default function EnergyAdvicePill({ pill, t, isMobile, onOpenPage }) {
  const { entities, conn } = useHomeAssistant();
  const { pageSettings } = usePages();
  const { language } = useConfig();
  const pageId = findAdvicePageId(pageSettings);
  const config = normalizeEnergyConfig(pageId ? pageSettings[pageId].energy : null);
  const advice = useEnergyAdvice(entities, conn, config);

  if (!pageId || advice.fitting.length === 0) return null;

  const locale = getLocaleForLanguage(language);
  const label =
    advice.fitting.length === 1
      ? t('energy.advice.pill.one').replace('{name}', advice.fitting[0].name)
      : t('energy.advice.pill.many').replace('{n}', String(advice.fitting.length));
  const sublabel = t('energy.advice.pill.sub').replace('{kw}', formatKw(advice.usableW, locale));

  return (
    <StatusPill
      pill={{ ...pill, label, sublabel, conditionEnabled: false }}
      entity={{ entity_id: 'nyx.energy_advice', state: 'on', attributes: {} }}
      t={t}
      isMobile={isMobile}
      onClick={pill.clickable !== false && onOpenPage ? () => onOpenPage(pageId) : undefined}
    />
  );
}
