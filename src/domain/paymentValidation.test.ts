import { describe, expect, it } from 'vitest';

import { isPaymentKind, isValidIsoDate, isValidPaymentAmount } from './paymentValidation';

describe('payment validation', () => {
  it('accepts only positive whole-ruble amounts supported by Postgres integer', () => {
    expect(isValidPaymentAmount(1)).toBe(true);
    expect(isValidPaymentAmount(2_147_483_647)).toBe(true);
    expect(isValidPaymentAmount(0)).toBe(false);
    expect(isValidPaymentAmount(-1)).toBe(false);
    expect(isValidPaymentAmount(10.5)).toBe(false);
    expect(isValidPaymentAmount(2_147_483_648)).toBe(false);
  });

  it('accepts real ISO calendar dates and rejects impossible ones', () => {
    expect(isValidIsoDate('2024-02-29')).toBe(true);
    expect(isValidIsoDate('2026-02-28')).toBe(true);
    expect(isValidIsoDate('2026-02-29')).toBe(false);
    expect(isValidIsoDate('2026-02-31')).toBe(false);
    expect(isValidIsoDate('31.02.2026')).toBe(false);
  });

  it('accepts only supported payment kinds', () => {
    expect(isPaymentKind('payment')).toBe(true);
    expect(isPaymentKind('deduction')).toBe(true);
    expect(isPaymentKind('unexpected')).toBe(false);
    expect(isPaymentKind(undefined)).toBe(false);
  });
});
