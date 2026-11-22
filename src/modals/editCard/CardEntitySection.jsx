import { SearchableSelect } from './CarMappingsSection';

// Sensor cards can choose from every sensor; the list asks for a search beyond this.
const MAX_OPTIONS = 200;

/**
 * Pickers for the entities a card shows, so a card can point at another device without being
 * added again. Required entities cannot be cleared.
 */
export default function CardEntitySection({
  fields,
  cardId,
  editSettings,
  entities,
  byDomain,
  onChange,
  t,
}) {
  return (
    <div className="space-y-4">
      {fields.map((field) => {
        const value = field.settingKey ? editSettings?.[field.settingKey] || null : cardId;
        const options = field.domains.flatMap((domain) => byDomain(domain));
        return (
          <SearchableSelect
            key={field.settingKey || 'entity'}
            label={t(field.labelKey)}
            value={value}
            options={options}
            entities={entities}
            maxOptions={MAX_OPTIONS}
            onChange={(next) => {
              if (next === value || (!next && field.required)) return;
              onChange(field, next);
            }}
            t={t}
          />
        );
      })}
    </div>
  );
}
