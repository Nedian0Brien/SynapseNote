import { expect } from '@jest/globals';
import { toZonedTime } from 'date-fns-tz';
import {
  DateFormatType,
  MetadataDefaults,
  MetadataKey,
  MetadataUtils,
  UserMetadataBuilder,
} from '../user-metadata';

// Mock date-fns-tz
jest.mock('date-fns-tz', () => ({
  toZonedTime: jest.fn((date) => date),
}));

describe('User Metadata', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('MetadataKey enum', () => {
    it('should have correct values', () => {
      expect(MetadataKey.Timezone).toBe('timezone');
      expect(MetadataKey.Language).toBe('language');
      expect(MetadataKey.DateFormat).toBe('date_format');
      expect(MetadataKey.IconUrl).toBe('icon_url');
    });
  });

  describe('DateFormatType enum', () => {
    it('should have correct date format patterns', () => {
      expect(DateFormatType.US).toBe('MM/DD/YYYY');
      expect(DateFormatType.EU).toBe('DD/MM/YYYY');
      expect(DateFormatType.ISO).toBe('YYYY-MM-DD');
    });
  });

  describe('MetadataDefaults', () => {
    it('should have default values for all metadata keys', () => {
      expect(MetadataDefaults[MetadataKey.Timezone]).toBe('UTC');
      expect(MetadataDefaults[MetadataKey.Language]).toBe('en');
      expect(MetadataDefaults[MetadataKey.DateFormat]).toBe(DateFormatType.US);
      expect(MetadataDefaults[MetadataKey.IconUrl]).toBe('');
    });
  });

  describe('UserMetadataBuilder', () => {
    let builder: UserMetadataBuilder;

    beforeEach(() => {
      builder = new UserMetadataBuilder();
    });

    it('should set timezone', () => {
      const result = builder.setTimezone('America/New_York').build();
      expect(result[MetadataKey.Timezone]).toBe('America/New_York');
    });

    it('should set language', () => {
      const result = builder.setLanguage('es').build();
      expect(result[MetadataKey.Language]).toBe('es');
    });

    it('should set date format', () => {
      const result = builder.setDateFormat(DateFormatType.EU).build();
      expect(result[MetadataKey.DateFormat]).toBe('DD/MM/YYYY');
    });

    it('should set icon URL', () => {
      const result = builder.setIconUrl('https://example.com/icon.png').build();
      expect(result[MetadataKey.IconUrl]).toBe('https://example.com/icon.png');
    });

    it('should set custom metadata', () => {
      const result = builder.setCustom('theme', 'dark').build();
      expect(result.theme).toBe('dark');
    });

    it('should chain multiple setters', () => {
      const result = builder
        .setTimezone('Europe/London')
        .setLanguage('en-GB')
        .setDateFormat(DateFormatType.EU)
        .setCustom('theme', 'light')
        .build();

      expect(result).toEqual({
        [MetadataKey.Timezone]: 'Europe/London',
        [MetadataKey.Language]: 'en-GB',
        [MetadataKey.DateFormat]: DateFormatType.EU,
        theme: 'light',
      });
    });

    it('should override previous values', () => {
      const result = builder
        .setTimezone('America/New_York')
        .setTimezone('Europe/Paris')
        .build();

      expect(result[MetadataKey.Timezone]).toBe('Europe/Paris');
    });
  });

  describe('MetadataUtils', () => {
    describe('detectDateFormat', () => {
      it('should detect US format for US locale', () => {
        expect(MetadataUtils.detectDateFormat('en-US')).toBe(DateFormatType.US);
        expect(MetadataUtils.detectDateFormat('en-CA')).toBe(DateFormatType.US);
        expect(MetadataUtils.detectDateFormat('en-PH')).toBe(DateFormatType.US);
      });

      it('should detect EU format for European locales', () => {
        expect(MetadataUtils.detectDateFormat('en-GB')).toBe(DateFormatType.EU);
        expect(MetadataUtils.detectDateFormat('fr-FR')).toBe(DateFormatType.EU);
        expect(MetadataUtils.detectDateFormat('de-DE')).toBe(DateFormatType.EU);
      });

      it('should detect ISO format for specific regions', () => {
        expect(MetadataUtils.detectDateFormat('sv-SE')).toBe(DateFormatType.ISO);
        expect(MetadataUtils.detectDateFormat('fi-FI')).toBe(DateFormatType.ISO);
        expect(MetadataUtils.detectDateFormat('ko-KR')).toBe(DateFormatType.ISO);
      });

      it('should use browser locale as default', () => {
        const originalLanguage = navigator.language;
        Object.defineProperty(navigator, 'language', {
          value: 'en-US',
          configurable: true,
        });

        expect(MetadataUtils.detectDateFormat()).toBe(DateFormatType.US);

        Object.defineProperty(navigator, 'language', {
          value: originalLanguage,
          configurable: true,
        });
      });

      it('should handle locale without region', () => {
        expect(MetadataUtils.detectDateFormat('en')).toBe(DateFormatType.EU);
        expect(MetadataUtils.detectDateFormat('fr')).toBe(DateFormatType.EU);
      });
    });

    describe('getLanguagePreference', () => {
      it('should return primary language code', () => {
        const originalLanguage = navigator.language;

        Object.defineProperty(navigator, 'language', {
          value: 'en-US',
          configurable: true,
        });
        expect(MetadataUtils.getLanguagePreference()).toBe('en');

        Object.defineProperty(navigator, 'language', {
          value: 'fr-FR',
          configurable: true,
        });
        expect(MetadataUtils.getLanguagePreference()).toBe('fr');

        Object.defineProperty(navigator, 'language', {
          value: 'zh-CN',
          configurable: true,
        });
        expect(MetadataUtils.getLanguagePreference()).toBe('zh');

        Object.defineProperty(navigator, 'language', {
          value: originalLanguage,
          configurable: true,
        });
      });

      it('should handle language without region', () => {
        Object.defineProperty(navigator, 'language', {
          value: 'en',
          configurable: true,
        });
        expect(MetadataUtils.getLanguagePreference()).toBe('en');
      });
    });

    describe('fromTimezoneInfo', () => {
      const originalLanguage = navigator.language;

      beforeEach(() => {
        Object.defineProperty(navigator, 'language', {
          value: 'en-US',
          configurable: true,
        });
      });

      afterEach(() => {
        Object.defineProperty(navigator, 'language', {
          value: originalLanguage,
          configurable: true,
        });
      });

      it('should create metadata from timezone info', () => {
        const result = MetadataUtils.fromTimezoneInfo({
          timezone: 'America/New_York',
          locale: 'en-US',
        });

        expect(result).toEqual({
          [MetadataKey.Timezone]: 'America/New_York',
        });
      });

      it('should handle different locales', () => {
        const result = MetadataUtils.fromTimezoneInfo({
          timezone: 'Europe/Paris',
          locale: 'fr-FR',
        });

        expect(result[MetadataKey.Timezone]).toBe('Europe/Paris');
      });
    });

    describe('merge', () => {
      it('should merge multiple metadata objects', () => {
        const obj1 = { [MetadataKey.Timezone]: 'UTC' };
        const obj2 = { [MetadataKey.Language]: 'en' };
        const obj3 = { custom: 'value' };

        const result = MetadataUtils.merge(obj1, obj2, obj3);

        expect(result).toEqual({
          [MetadataKey.Timezone]: 'UTC',
          [MetadataKey.Language]: 'en',
          custom: 'value',
        });
      });

      it('should override with later values', () => {
        const obj1 = { [MetadataKey.Timezone]: 'UTC' };
        const obj2 = { [MetadataKey.Timezone]: 'America/New_York' };

        const result = MetadataUtils.merge(obj1, obj2);

        expect(result[MetadataKey.Timezone]).toBe('America/New_York');
      });

      it('should handle empty objects', () => {
        const result = MetadataUtils.merge({}, {}, {});
        expect(result).toEqual({});
      });
    });

    describe('validate', () => {
      it('should validate correct metadata', () => {
        const metadata = {
          [MetadataKey.Timezone]: 'America/New_York',
          [MetadataKey.Language]: 'en',
          [MetadataKey.IconUrl]: 'https://example.com/icon.png',
        };

        const result = MetadataUtils.validate(metadata);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should detect invalid timezone', () => {
        const mockedToZonedTime = toZonedTime as jest.Mock;
        mockedToZonedTime.mockImplementationOnce(() => {
          throw new Error('Invalid timezone');
        });

        const metadata = {
          [MetadataKey.Timezone]: 'Invalid/Timezone',
        };

        const result = MetadataUtils.validate(metadata);

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Invalid IANA timezone for chrono-tz: Invalid/Timezone');
      });

      it('should detect invalid language code', () => {
        const metadata = {
          [MetadataKey.Language]: 'invalid-lang-code',
        };

        const result = MetadataUtils.validate(metadata);

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Invalid language code: invalid-lang-code');
      });

      it('should detect invalid icon URL', () => {
        const metadata = {
          [MetadataKey.IconUrl]: 'not-a-url',
        };

        const result = MetadataUtils.validate(metadata);

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Invalid icon URL: not-a-url');
      });

      it('should validate language code with region', () => {
        const metadata = {
          [MetadataKey.Language]: 'en-US',
        };

        const result = MetadataUtils.validate(metadata);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should handle empty metadata', () => {
        const result = MetadataUtils.validate({});
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should collect multiple errors', () => {
        const mockedToZonedTime = toZonedTime as jest.Mock;
        mockedToZonedTime.mockImplementationOnce(() => {
          throw new Error('Invalid timezone');
        });

        const metadata = {
          [MetadataKey.Timezone]: 'Bad/Timezone',
          [MetadataKey.Language]: '123',
          [MetadataKey.IconUrl]: 'invalid-url',
        };

        const result = MetadataUtils.validate(metadata);

        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThanOrEqual(2);
      });
    });
  });
});