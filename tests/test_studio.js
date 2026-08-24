'use strict';

const assert = require('node:assert/strict');
const {
  parseTimestamp,
  parseTimedText,
  pairCues,
  coalesceSentencePairs,
  youtubeId,
  formatTime,
} = require('../static/studio.js');

assert.equal(parseTimestamp('00:01:02,500'), 62.5);
assert.equal(parseTimestamp('01:02.250'), 62.25);
assert.equal(parseTimestamp('00:61:00,000'), null);
assert.equal(formatTime(62.9), '1:02');

const srt = `1
00:00:01,000 --> 00:00:03,000
Guten <b>Morgen</b>.

2
00:00:03,200 --> 00:00:05,500
Wie geht es dir?`;
const de = parseTimedText(srt);
assert.deepEqual(de, [
  { start: 1, end: 3, text: 'Guten Morgen.' },
  { start: 3.2, end: 5.5, text: 'Wie geht es dir?' },
]);

const vtt = `WEBVTT

intro
00:00:01.000 --> 00:00:03.000 align:start position:0%
早上好。

00:00:03.200 --> 00:00:05.500
你好吗？`;
assert.deepEqual(pairCues(de, vtt).map(cue => cue.zh), ['早上好。', '你好吗？']);
assert.deepEqual(pairCues(de, '早上好。\n你好吗？').map(cue => cue.zh), ['早上好。', '你好吗？']);
assert.throws(() => pairCues(de, '只有一行'), /逐条对应/);

const splitZh = `WEBVTT

00:00:01.000 --> 00:00:02.000
早上

00:00:02.000 --> 00:00:03.000
好。

00:00:03.200 --> 00:00:05.500
你好吗？`;
assert.deepEqual(pairCues(de, splitZh).map(cue => cue.zh), ['早上好。', '你好吗？']);

assert.deepEqual(coalesceSentencePairs([
  { start: 0, end: 1, de: 'Jetzt hat Russland', zh: '现在俄罗斯' },
  { start: 1, end: 2.5, de: 'wieder angegriffen.', zh: '再次发动了袭击。' },
  { start: 3, end: 4, de: 'Das ist neu.', zh: '这是新的。' },
]), [
  { start: 0, end: 2.5, de: 'Jetzt hat Russland wieder angegriffen.', zh: '现在俄罗斯再次发动了袭击。' },
  { start: 3, end: 4, de: 'Das ist neu.', zh: '这是新的。' },
]);

assert.equal(youtubeId('https://youtu.be/abc123'), 'abc123');
assert.equal(youtubeId('https://www.youtube.com/watch?v=xyz789'), 'xyz789');
assert.equal(youtubeId('https://example.com/watch?v=nope'), '');

console.log('studio parser tests: OK');
