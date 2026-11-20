const modeKeys = {
  heat: 'heat',
  cool: 'cool',
  dry: 'dry',
  fan_only: 'fanOnly',
  heat_cool: 'heatCool',
  auto: 'auto',
};

/**
 * Status label and colour hints for a climate entity. Integrations that do
 * not report `hvac_action` fall back to the selected HVAC mode instead of
 * claiming the device is idle.
 * @param {{ state: string, attributes?: { hvac_action?: unknown } }} entity
 */
export function getClimateStatus(entity) {
  const reportedAction = entity.attributes?.hvac_action;
  const action =
    entity.state === 'off' ? 'off' : typeof reportedAction === 'string' ? reportedAction : '';
  const mode = modeKeys[entity.state];
  return {
    translationKey:
      entity.state === 'unavailable'
        ? 'status.unavailable'
        : action
          ? `climate.action.${action}`
          : mode
            ? `climate.hvac.${mode}`
            : 'common.unknown',
    isHeating: action ? action === 'heating' : entity.state === 'heat',
    isCooling: action ? action === 'cooling' : entity.state === 'cool',
  };
}
