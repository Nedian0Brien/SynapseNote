/** Pure recovery policy shared by the NodeView conversion effect and telemetry. */
export function deriveJsxConversionPolicy({
  componentName,
  descriptorDisplayName,
  descriptorName,
  renderError,
}: {
  componentName: string;
  descriptorDisplayName?: string;
  descriptorName: string;
  renderError: Error | null;
}) {
  const telemetryComponent = descriptorName === '*' ? 'wildcard' : descriptorName;
  const needsConversion = descriptorName === '*' || renderError !== null;
  const reason = !needsConversion
    ? null
    : descriptorName === '*'
      ? `Unregistered component: ${componentName}`
      : `Render error in <${descriptorDisplayName ?? descriptorName}>: ${renderError?.message ?? 'unknown'}`;
  return { needsConversion, reason, telemetryComponent };
}
