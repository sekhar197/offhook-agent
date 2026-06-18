import { describe, expect, it } from 'vitest';
import { telephonyClient, isTelephonyProvider, TELEPHONY_PROVIDERS } from './provider.js';

describe('telephony provider factory', () => {
  it('returns the right client per provider', () => {
    const twilio = telephonyClient('twilio', { env: { TWILIO_ACCOUNT_SID: 'AC', TWILIO_AUTH_TOKEN: 't' } as NodeJS.ProcessEnv });
    expect(twilio.provider).toBe('twilio');
    const telnyx = telephonyClient('telnyx', { env: { TELNYX_API_KEY: 'k' } as NodeJS.ProcessEnv });
    expect(telnyx.provider).toBe('telnyx');
  });

  it('validates provider names', () => {
    expect(isTelephonyProvider('twilio')).toBe(true);
    expect(isTelephonyProvider('telnyx')).toBe(true);
    expect(isTelephonyProvider('vonage')).toBe(false);
    expect(isTelephonyProvider(undefined)).toBe(false);
    expect(TELEPHONY_PROVIDERS).toEqual(['twilio', 'telnyx']);
  });
});
