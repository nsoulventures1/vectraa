export type GrowthEvent =
  | 'image_selected'
  | 'analysis_completed'
  | 'conversion_started'
  | 'conversion_completed'
  | 'conversion_failed'
  | 'svg_downloaded'
  | 'site_shared';

declare global {
  interface Window {
    dataLayer?: Array<Record<string, unknown>>;
    gtag?: (...args: unknown[]) => void;
  }
}

export function trackGrowthEvent(event: GrowthEvent, detail: Record<string, string | number | boolean | undefined> = {}) {
  const payload = { event: `vectraa_${event}`, ...detail };
  window.dataLayer?.push(payload);
  window.gtag?.('event', `vectraa_${event}`, detail);
  window.dispatchEvent(new CustomEvent('vectraa:growth', { detail: payload }));
}
