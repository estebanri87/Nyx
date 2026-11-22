import { describe, expect, it } from 'vitest';
import {
  canDuplicateCard,
  duplicateCard,
  getCardEntityFields,
  pageOfSettingsKey,
  replaceCardEntity,
} from '../utils/cardEdits';

const pagesConfig = {
  pages: ['home'],
  home: ['cover_card_1', 'light.kitchen', 'spacer_card_1'],
  header: ['person.anna'],
};

describe('pageOfSettingsKey', () => {
  it('reads the page in front of the card id', () => {
    expect(pageOfSettingsKey('home::light.kitchen')).toBe('home');
    expect(pageOfSettingsKey('light.kitchen')).toBeNull();
    expect(pageOfSettingsKey(null)).toBeNull();
  });
});

describe('canDuplicateCard', () => {
  it('offers Duplicate for cards whose entity is in their settings', () => {
    expect(canDuplicateCard('cover_card_1', 'home', pagesConfig)).toBe(true);
  });

  it('does not offer it for cards named after their entity, spacers or the header', () => {
    expect(canDuplicateCard('light.kitchen', 'home', pagesConfig)).toBe(false);
    expect(canDuplicateCard('spacer_card_1', 'home', pagesConfig)).toBe(false);
    expect(canDuplicateCard('person.anna', 'header', pagesConfig)).toBe(false);
    expect(canDuplicateCard('cover_card_1', 'missing', pagesConfig)).toBe(false);
  });
});

describe('duplicateCard', () => {
  it('puts the copy right after the card, with its own copy of the settings', () => {
    const settings = { 'home::cover_card_1': { coverId: 'cover.a', presets: [25, 50] } };
    const result = duplicateCard({
      cardId: 'cover_card_1',
      pageId: 'home',
      pagesConfig,
      cardSettings: settings,
    });

    expect(result.newCardId).toMatch(/^cover_card_1__dup_[a-z0-9]+$/);
    expect(result.pagesConfig.home).toEqual([
      'cover_card_1',
      result.newCardId,
      'light.kitchen',
      'spacer_card_1',
    ]);
    const copy = result.cardSettings[`home::${result.newCardId}`];
    expect(copy).toEqual(settings['home::cover_card_1']);
    expect(copy.presets).not.toBe(settings['home::cover_card_1'].presets);
    expect(pagesConfig.home).toHaveLength(3);
  });

  it('names a copy of a copy after the original', () => {
    const result = duplicateCard({
      cardId: 'cover_card_1__dup_abc',
      pageId: 'home',
      pagesConfig: { home: ['cover_card_1__dup_abc'] },
      cardSettings: {},
    });
    expect(result.newCardId).toMatch(/^cover_card_1__dup_[a-z0-9]+$/);
    expect(result.newCardId).not.toContain('abc');
  });

  it('returns null for cards that cannot be duplicated', () => {
    expect(
      duplicateCard({ cardId: 'light.kitchen', pageId: 'home', pagesConfig, cardSettings: {} })
    ).toBeNull();
  });
});

describe('getCardEntityFields', () => {
  it('names the setting the renderer reads', () => {
    expect(getCardEntityFields('cover_card_1')).toEqual([
      expect.objectContaining({ settingKey: 'coverId', domains: ['cover'], required: true }),
    ]);
    expect(getCardEntityFields('androidtv_card_1').map((f) => f.settingKey)).toEqual([
      'mediaPlayerId',
      'remoteId',
    ]);
  });

  it('offers the same domain for cards named after their entity', () => {
    expect(getCardEntityFields('light.kitchen')).toEqual([
      expect.objectContaining({ settingKey: null, domains: ['light'] }),
    ]);
  });

  it('offers nothing for people and cards without one entity', () => {
    expect(getCardEntityFields('person.anna')).toEqual([]);
    expect(getCardEntityFields('calendar_card_1')).toEqual([]);
    expect(getCardEntityFields('spacer_card_1')).toEqual([]);
  });
});

describe('replaceCardEntity', () => {
  const base = {
    cardId: 'light.kitchen',
    pageId: 'home',
    pagesConfig,
    cardSettings: {
      'home::light.kitchen': { size: 'small' },
      'other::light.kitchen': { size: 'large' },
    },
    customNames: { 'light.kitchen': 'Kitchen' },
    customIcons: {},
  };

  it('gives the card the new id in the same place and keeps its settings and name', () => {
    const result = replaceCardEntity({ ...base, newEntityId: 'light.hall' });

    expect(result.pagesConfig.home).toEqual(['cover_card_1', 'light.hall', 'spacer_card_1']);
    expect(result.cardSettings['home::light.hall']).toEqual({ size: 'small' });
    expect(result.cardSettings['home::light.kitchen']).toBeUndefined();
    expect(result.cardSettings['other::light.kitchen']).toEqual({ size: 'large' });
    expect(result.customNames).toEqual({ 'light.kitchen': 'Kitchen', 'light.hall': 'Kitchen' });
  });

  it('keeps a name the new entity already has', () => {
    const result = replaceCardEntity({
      ...base,
      newEntityId: 'light.hall',
      customNames: { 'light.kitchen': 'Kitchen', 'light.hall': 'Hall' },
    });
    expect(result.customNames['light.hall']).toBe('Hall');
  });

  it('refuses an entity the page already shows', () => {
    expect(
      replaceCardEntity({
        ...base,
        pagesConfig: { home: ['light.kitchen', 'light.hall'] },
        newEntityId: 'light.hall',
      })
    ).toBeNull();
  });
});
