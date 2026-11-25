import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EXECUTION_CONFIRMATION,
  birthdayEpochFromProfile,
  changedPatch,
  extractProfilePatch,
  mergeProfileSources,
  normalizeGender,
  normalizeLocation,
  parseArgs,
  targetQuery,
} from '../scripts/sync-es7-profile-demographics.mjs';

test('normalizes Vietnamese and English genders', () => {
  assert.equal(normalizeGender('nam'), 'male');
  assert.equal(normalizeGender('Nữ'), 'female');
  assert.equal(normalizeGender('female'), 'female');
  assert.equal(normalizeGender('unknown'), undefined);
});

test('birthday uses birthyear first and February 2 UTC', () => {
  assert.equal(birthdayEpochFromProfile({ birthyear: '1998', birthdayDate: '05/01/1997' }), Date.UTC(1998, 1, 2));
  assert.equal(birthdayEpochFromProfile({ birthday: '26 tháng 8, 1997' }), Date.UTC(1997, 1, 2));
  assert.equal(birthdayEpochFromProfile({ birthday: '26 tháng 8' }), undefined);
});

test('extracts valid fields and ignores empty placeholders', () => {
  assert.deepEqual(extractProfilePatch({ sex: 'nữ', birthyear: 2000, location: 79 }), {
    gender: 'female', birthday: Date.UTC(2000, 1, 2), location: 79,
  });
  assert.equal(normalizeLocation(0), undefined);
  assert.equal(normalizeLocation('48'), 48);
});

test('ES8 wins per field and ES7 fills missing values', () => {
  assert.deepEqual(
    mergeProfileSources({ sex: 'nữ', location: 79 }, { sex: 'nam', birthyear: 1990, location: 1 }),
    { gender: 'female', birthday: Date.UTC(1990, 1, 2), location: 79 },
  );
});

test('only changed target fields are returned', () => {
  const birthday = Date.UTC(1990, 1, 2);
  assert.deepEqual(changedPatch(
    { gender: 'male', birthday: new Date(birthday).toISOString(), location: 1 },
    { gender: 'male', birthday, location: 79 },
  ), { location: 79 });
});

test('write mode requires explicit confirmation and limit is dry-run only', () => {
  assert.equal(parseArgs([]).execute, false);
  assert.throws(() => parseArgs(['--execute']), /require/);
  assert.throws(() => parseArgs(['--execute', `--confirm=${EXECUTION_CONFIRMATION}`, '--limit=10']), /dry-run/);
  assert.equal(parseArgs(['--execute', `--confirm=${EXECUTION_CONFIRMATION}`]).execute, true);
});

test('query scopes by insertedDate, Facebook type and profile id', () => {
  assert.deepEqual(targetQuery('a', 'b'), { bool: { filter: [
    { range: { insertedDate: { gte: 'a', lte: 'b' } } },
    { prefix: { type: 'fb' } },
    { exists: { field: 'profile.id' } },
  ] } });
});
