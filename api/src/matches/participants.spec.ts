import { counterpart, decisionOf, isMutual, isParticipant, otherUserId } from './participants.js';

const match = { userAId: 'ann', userBId: 'bob', userA: { name: 'Ann' }, userB: { name: 'Bob' } };
const liked = (userId: string) => ({ userId, liked: true });
const passed = (userId: string) => ({ userId, liked: false });

describe('match participants', () => {
  it('finds the other person from either side', () => {
    expect(otherUserId(match, 'ann')).toBe('bob');
    expect(otherUserId(match, 'bob')).toBe('ann');
    expect(counterpart(match, 'ann')).toEqual({ name: 'Bob' });
    expect(counterpart(match, 'bob')).toEqual({ name: 'Ann' });
  });

  it('knows who is in the match', () => {
    expect(isParticipant(match, 'bob')).toBe(true);
    expect(isParticipant(match, 'eve')).toBe(false);
  });

  it("reads a person's decision, or none yet", () => {
    expect(decisionOf([liked('ann'), passed('bob')], 'ann')).toBe('LIKE');
    expect(decisionOf([liked('ann'), passed('bob')], 'bob')).toBe('PASS');
    expect(decisionOf([liked('ann')], 'bob')).toBeNull();
  });

  it('calls a match mutual only when both people liked it', () => {
    expect(isMutual({ ...match, decisions: [liked('ann'), liked('bob')] })).toBe(true);
    expect(isMutual({ ...match, decisions: [liked('ann'), passed('bob')] })).toBe(false);
    expect(isMutual({ ...match, decisions: [liked('ann')] })).toBe(false);
  });
});
