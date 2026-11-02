import test from 'node:test';
import assert from 'node:assert/strict';
import { sharedLinkRedirect } from './share-domain-redirect.js';

test('old Drive links keep all parameters and fragments on the new domain', () => {
  assert.equal(sharedLinkRedirect('https://moodboard.petfashion.tw/?driveFile=example&sharedEdit=1&requestEdit=1&resourceKey=abc#view'),
    'https://infinite.petfashion.tw/?driveFile=example&sharedEdit=1&requestEdit=1&resourceKey=abc#view');
  assert.equal(sharedLinkRedirect('https://moodboard.petfashion.tw/?lockedShare=abc'), 'https://infinite.petfashion.tw/?lockedShare=abc');
});

test('old local workspace and all other origins are left alone', () => {
  assert.equal(sharedLinkRedirect('https://moodboard.petfashion.tw/'), null);
  assert.equal(sharedLinkRedirect('https://infinite.petfashion.tw/?driveFile=example'), null);
  assert.equal(sharedLinkRedirect('https://moodboard.petfashion.tw.evil.example/?driveFile=example'), null);
  assert.equal(sharedLinkRedirect('https://moodboard.petfashion.tw/?driveFile='), null);
});
