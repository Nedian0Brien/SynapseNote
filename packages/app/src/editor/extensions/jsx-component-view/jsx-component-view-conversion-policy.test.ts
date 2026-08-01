import { describe, expect, test } from 'bun:test';
import { deriveJsxConversionPolicy } from './jsx-component-view-conversion-policy';

describe('deriveJsxConversionPolicy', () => {
  test('normalizes an unknown descriptor to wildcard telemetry and preserves its source reason', () => {
    expect(
      deriveJsxConversionPolicy({
        componentName: 'Vendor.Widget',
        descriptorName: '*',
        renderError: null,
      }),
    ).toEqual({
      needsConversion: true,
      reason: 'Unregistered component: Vendor.Widget',
      telemetryComponent: 'wildcard',
    });
  });

  test('keeps a registered descriptor healthy until a render error and uses its display label in recovery copy', () => {
    expect(
      deriveJsxConversionPolicy({
        componentName: 'Callout',
        descriptorName: 'Callout',
        renderError: null,
      }),
    ).toEqual({ needsConversion: false, reason: null, telemetryComponent: 'Callout' });
    expect(
      deriveJsxConversionPolicy({
        componentName: 'Callout',
        descriptorDisplayName: 'Callout block',
        descriptorName: 'Callout',
        renderError: new Error('bad type'),
      }),
    ).toEqual({
      needsConversion: true,
      reason: 'Render error in <Callout block>: bad type',
      telemetryComponent: 'Callout',
    });
  });
});
