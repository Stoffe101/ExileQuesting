import { describe, expect, it } from 'vitest';
import { parseClientLogLine } from './log-parser';

describe('Client.txt character identity scope', () => {
  it('marks named level-up lines as ambiguous observations rather than proof of self', () => {
    const event = parseClientLogLine('2026/09/04 19:00:00 123 [INFO Client 1234] PartyFriend (Witch) is now level 42');
    expect(event).toMatchObject({ type: 'character-level', characterName: 'PartyFriend', characterClass: 'Witch', characterLevel: 42, identityScope: 'named' });
  });

  it('marks explicit You level-up lines as self', () => {
    const event = parseClientLogLine('2026/09/04 19:00:00 123 [INFO Client 1234] You are now level 4');
    expect(event).toMatchObject({ type: 'character-level', characterLevel: 4, identityScope: 'self' });
  });
});
