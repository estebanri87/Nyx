import { lazy, useState } from 'react';
import { useHomeAssistant, usePages, useConfig } from '../../contexts';
import { getLocaleForLanguage } from '../../i18n';
import { normalizeEnergyConfig } from '../pages/energy/energyModel';
import { useEnergyAdvice } from '../pages/energy/useEnergyAdvice';
import { formatKw } from '../pages/energy/EnergyAdviceCard';
import StatusPill from './StatusPill';
import ModalSuspense from '../ui/ModalSuspense';

const EnergyAdviceModal = lazy(() => import('../pages/energy/EnergyAdviceModal'));

export const ENERGY_ADVICE_PILL_TYPE = 'energy_advice';

/** Id of the first energy page with appliances set up for recommendations. */
export function findAdvicePageId(pageSettings) {
  const match = Object.entries(pageSettings || {}).find(
    ([, s]) => s?.type === 'energy' && Array.isArray(s.energy?.devices) && s.energy.devices.length
  );
  return match ? match[0] : null;
}

/**
 * Status pill that appears while an appliance fits into the spare solar power.
 * Tapping it opens a pop-up with the details; from there the energy page.
 */
export default function EnergyAdvicePill({ pill, t, isMobile, onOpenPage }) {
  const { entities, conn } = useHomeAssistant();
  const { pageSettings } = usePages();
  const { language } = useConfig();
  const pageId = findAdvicePageId(pageSettings);
  const config = normalizeEnergyConfig(pageId ? pageSettings[pageId].energy : null);
  const advice = useEnergyAdvice(entities, conn, config);
  const [open, setOpen] = useState(false);

  const { fitting, alternatives } = advice;
  const locale = getLocaleForLanguage(language);

  // One appliance with alternatives that only fit instead of it: "A or B".
  const either = fitting.length === 1 && alternatives.length > 0;
  let label = t('energy.advice.pill.many').replace('{n}', String(fitting.length));
  let sub = 'energy.advice.pill.sub';
  if (fitting.length === 0) {
    label = t('energy.advice.none');
  } else if (either && alternatives.length === 1) {
    label = t('energy.advice.pill.either')
      .replace('{a}', fitting[0].name)
      .replace('{b}', alternatives[0].name);
    sub = 'energy.advice.pill.subEither';
  } else if (either) {
    label = t('energy.advice.pill.eitherMany')
      .replace('{a}', fitting[0].name)
      .replace('{n}', String(alternatives.length));
    sub = 'energy.advice.pill.subEitherMany';
  } else if (fitting.length === 1) {
    label = t('energy.advice.pill.one').replace('{name}', fitting[0].name);
  }
  const sublabel = t(sub).replace('{kw}', formatKw(advice.usableW, locale));

  // Stays open even when the suggestion goes away meanwhile.
  const modal = open && pageId && (
    <ModalSuspense>
      <EnergyAdviceModal
        show
        onClose={() => setOpen(false)}
        advice={advice}
        config={config}
        entities={entities}
        conn={conn}
        locale={locale}
        label={label}
        t={t}
        onOpenPage={
          onOpenPage
            ? () => {
                setOpen(false);
                onOpenPage(pageId);
              }
            : undefined
        }
      />
    </ModalSuspense>
  );
  if (!pageId || fitting.length === 0) return modal || null;

  return (
    <>
      <StatusPill
        pill={{ ...pill, label, sublabel, conditionEnabled: false }}
        entity={{ entity_id: 'nyx.energy_advice', state: 'on', attributes: {} }}
        t={t}
        isMobile={isMobile}
        onClick={pill.clickable !== false ? () => setOpen(true) : undefined}
      />
      {modal}
    </>
  );
}
