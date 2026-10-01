import { describe, expect, it } from 'vitest';
import { getErrorDisplay, parseTranslationError, translationErrors } from '../translationErrors';

describe('parseTranslationError', () => {
  it('uses an explicit error code from the API payload', () => {
    expect(parseTranslationError({ response: { data: { code: 'QUOTA_EXCEEDED' } } }).code).toBe('QUOTA_EXCEEDED');
    expect(parseTranslationError({ code: 'API_KEY_MISSING' }).code).toBe('API_KEY_MISSING');
  });

  it('ignores codes that are not own keys of the table', () => {
    expect(parseTranslationError({ code: 'toString' }).code).toBe('UNKNOWN');
    expect(parseTranslationError({ code: 'constructor' }).code).toBe('UNKNOWN');
  });

  it('maps HTTP status codes', () => {
    expect(parseTranslationError({ response: { status: 401 } }).code).toBe('API_KEY_INVALID');
    expect(parseTranslationError({ response: { status: 403 } }).code).toBe('API_KEY_INVALID');
    expect(parseTranslationError({ response: { status: 429 } }).code).toBe('RATE_LIMITED');
    expect(parseTranslationError({ response: { status: 502 } }).code).toBe('SERVER_ERROR');
    expect(parseTranslationError({ response: { status: 504 } }).code).toBe('TIMEOUT');
  });

  it('recognises axios transport failures', () => {
    // axios uses "Network Error" (capital N) and code ERR_NETWORK
    expect(parseTranslationError({ message: 'Network Error' }).code).toBe('NETWORK_ERROR');
    expect(parseTranslationError({ code: 'ERR_NETWORK', message: 'x' }).code).toBe('NETWORK_ERROR');
    expect(parseTranslationError({ code: 'ECONNABORTED', message: 'timeout of 30000ms exceeded' }).code).toBe('TIMEOUT');
  });

  it('matches message patterns case-insensitively', () => {
    expect(parseTranslationError({ message: 'Quota exceeded for model' }).code).toBe('QUOTA_EXCEEDED');
    expect(parseTranslationError({ message: 'Invalid API key provided' }).code).toBe('API_KEY_INVALID');
  });

  it('does not treat unrelated words containing "key" as key errors', () => {
    expect(parseTranslationError({ message: 'monkey business' }).code).toBe('UNKNOWN');
  });

  it('does not throw on non-string payloads', () => {
    expect(() => parseTranslationError({ response: { data: { error: { detail: 'x' } } } })).not.toThrow();
    expect(parseTranslationError(undefined).code).toBe('UNKNOWN');
    expect(parseTranslationError(null).code).toBe('UNKNOWN');
  });

  it('every table entry is keyed by its own code', () => {
    for (const [key, value] of Object.entries(translationErrors)) {
      expect(value.code).toBe(key);
    }
  });
});

describe('getErrorDisplay', () => {
  it('returns the display fields only', () => {
    expect(getErrorDisplay({ response: { status: 429 } })).toEqual({
      title: translationErrors.RATE_LIMITED.title,
      message: translationErrors.RATE_LIMITED.message,
      suggestion: translationErrors.RATE_LIMITED.suggestion,
      retryable: true,
    });
  });
});
