import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../contexts', () => ({
  useConfig: () => ({ unitsMode: 'metric' }),
  useHomeAssistantMeta: () => ({ haConfig: null }),
}));

import EditCardModal from '../modals/EditCardModal';

const entities = {
  'cover.living': {
    entity_id: 'cover.living',
    state: 'open',
    attributes: { friendly_name: 'Living' },
  },
  'cover.office': {
    entity_id: 'cover.office',
    state: 'open',
    attributes: { friendly_name: 'Office' },
  },
  'light.hall': { entity_id: 'light.hall', state: 'on', attributes: { friendly_name: 'Hall' } },
};

const renderModal = (props) =>
  render(
    <EditCardModal
      isOpen
      onClose={vi.fn()}
      t={(key) => key}
      entities={entities}
      customNames={{}}
      saveCustomName={vi.fn()}
      customIcons={{}}
      saveCustomIcon={vi.fn()}
      saveCardSetting={vi.fn()}
      pagesConfig={{ home: [] }}
      pageSettings={{}}
      {...props}
    />
  );

describe('EditCardModal entity and duplicate', () => {
  it('lets a cover card switch to another cover', () => {
    const onChangeEntity = vi.fn();
    renderModal({
      entityId: 'cover_card_1',
      isEditCover: true,
      editSettingsKey: 'home::cover_card_1',
      editSettings: { coverId: 'cover.living' },
      onChangeEntity,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Living' }));
    fireEvent.click(screen.getByRole('button', { name: /^Office/ }));

    expect(onChangeEntity).toHaveBeenCalledWith(
      expect.objectContaining({ settingKey: 'coverId' }),
      'cover.office'
    );
  });

  it('does not clear a required entity', () => {
    const onChangeEntity = vi.fn();
    renderModal({
      entityId: 'cover_card_1',
      editSettingsKey: 'home::cover_card_1',
      editSettings: { coverId: 'cover.living' },
      onChangeEntity,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Living' }));
    fireEvent.click(screen.getByRole('button', { name: 'dropdown.noneSelected' }));

    expect(onChangeEntity).not.toHaveBeenCalled();
  });

  it('offers Duplicate only when the dashboard passes it', () => {
    const onDuplicate = vi.fn();
    const { unmount } = renderModal({
      entityId: 'cover_card_1',
      editSettingsKey: 'home::cover_card_1',
      editSettings: {},
      onDuplicate,
    });
    fireEvent.click(screen.getByRole('button', { name: 'tooltip.duplicateCard' }));
    expect(onDuplicate).toHaveBeenCalledTimes(1);
    unmount();

    renderModal({ entityId: 'light.hall', editSettingsKey: 'home::light.hall', editSettings: {} });
    expect(screen.queryByRole('button', { name: 'tooltip.duplicateCard' })).toBeNull();
  });
});
