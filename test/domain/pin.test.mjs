import assert from 'node:assert/strict';
import test from 'node:test';

import { PIN_LENGTH, formatPin, isValidPin, normalizePin, randomPin } from '../../src/domain/pin.mjs';

test('randomPin yields 6 digits and never starts with zero', () => {
  for (let i = 0; i < 200; i += 1) {
    const pin = randomPin();
    assert.match(pin, /^[1-9]\d{5}$/);
    assert.equal(pin.length, PIN_LENGTH);
  }
});

test('normalizePin keeps only digits from loose user input', () => {
  assert.equal(normalizePin('483 217'), '483217');
  assert.equal(normalizePin('483-217'), '483217');
  assert.equal(normalizePin('48a3b217'), '483217');
  assert.equal(normalizePin(''), '');
});

test('isValidPin accepts exactly six digits', () => {
  assert.equal(isValidPin('483217'), true);
  assert.equal(isValidPin('000001'), true);
  assert.equal(isValidPin('12345'), false);
  assert.equal(isValidPin('1234567'), false);
  assert.equal(isValidPin('483 217'), false);
  assert.equal(isValidPin('abc123'), false);
  assert.equal(isValidPin(''), false);
});

test('formatPin groups digits for display', () => {
  assert.equal(formatPin('483217'), '483 217');
  assert.equal(formatPin('123456'), '123 456');
  assert.equal(formatPin('12345'), '12345');
});
