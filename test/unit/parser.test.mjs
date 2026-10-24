import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { mapCameoCode, calculateImportance, cleanText } from '../../apis/utils/parser.mjs';

describe('CAMEO Code Mapping', () => {
  describe('mapCameoCode', () => {
    it('should map known event codes to human-readable types', () => {
      assert.strictEqual(mapCameoCode('01'), 'Make statement');
      assert.strictEqual(mapCameoCode('04'), 'Consult');
      assert.strictEqual(mapCameoCode('13'), 'Threaten');
      assert.strictEqual(mapCameoCode('18'), 'Assault');
      assert.strictEqual(mapCameoCode('19'), 'Fight');
    });

    it('should handle three-digit event codes', () => {
      assert.strictEqual(mapCameoCode('010'), 'Make statement');
      assert.strictEqual(mapCameoCode('040'), 'Consult');
      assert.strictEqual(mapCameoCode('130'), 'Threaten');
      assert.strictEqual(mapCameoCode('181'), 'Physically assault');
      assert.strictEqual(mapCameoCode('191'), 'Engage in armed conflict');
    });

    it('should return "Unknown" for unknown event codes', () => {
      assert.strictEqual(mapCameoCode(''), 'Unknown');
      assert.strictEqual(mapCameoCode('99'), 'Unknown');
      assert.strictEqual(mapCameoCode('xyz'), 'Unknown');
      assert.strictEqual(mapCameoCode(null), 'Unknown');
      assert.strictEqual(mapCameoCode(undefined), 'Unknown');
    });
  });

  describe('calculateImportance', () => {
    it('should calculate importance based on mentions', () => {
      const event1 = { mentions: 10, tone: 0, event_code: '01' };
      const event2 = { mentions: 100, tone: 0, event_code: '01' };

      const importance1 = calculateImportance(event1);
      const importance2 = calculateImportance(event2);

      assert.ok(importance1 > 0);
      assert.ok(importance2 > importance1);
      assert.ok(importance2 <= 10); // Should be capped at 10
    });

    it('should calculate importance based on tone', () => {
      const positiveEvent = { mentions: 50, tone: 4.5, event_code: '01' };
      const negativeEvent = { mentions: 50, tone: -4.5, event_code: '01' };

      const importancePositive = calculateImportance(positiveEvent);
      const importanceNegative = calculateImportance(negativeEvent);

      assert.ok(importancePositive > 0);
      assert.ok(importanceNegative > 0);
      assert.ok(importanceNegative > importancePositive); // Negative tone should have higher importance
    });

    it('should calculate importance based on event type', () => {
      const peacefulEvent = { mentions: 50, tone: 0, event_code: '01' };
      const threateningEvent = { mentions: 50, tone: 0, event_code: '13' };
      const violentEvent = { mentions: 50, tone: 0, event_code: '19' };

      const peacefulImportance = calculateImportance(peacefulEvent);
      const threateningImportance = calculateImportance(threateningEvent);
      const violentImportance = calculateImportance(violentEvent);

      assert.ok(violentImportance > threateningImportance);
      assert.ok(threateningImportance > peacefulImportance);
    });

    it('should handle events with missing properties', () => {
      const minimalEvent = {};
      const importance = calculateImportance(minimalEvent);

      assert.ok(importance >= 0);
      assert.ok(importance <= 10);
    });
  });

  describe('cleanText', () => {
    it('should clean and normalize text', () => {
      assert.strictEqual(cleanText('  Hello   World  '), 'Hello World');
      assert.strictEqual(cleanText('   '), '');
      assert.strictEqual(cleanText(null), '');
      assert.strictEqual(cleanText(undefined), '');
    });

    it('should strip unwanted characters', () => {
      assert.strictEqual(cleanText('Hello!@#$World'), 'HelloWorld');
      assert.strictEqual(cleanText('Test: 123'), 'Test: 123');
      assert.strictEqual(cleanText('Test\\nline'), 'Testline');
    });
  });
});
