import { Subscription, SubscriptionPlan } from '@/application/types';
import { getConfigValue } from '@/utils/runtime-config';

const OFFICIAL_HOSTNAMES = new Set(['localhost']);
const PRO_ACCESS_PLANS = new Set([SubscriptionPlan.Pro, SubscriptionPlan.Team]);

function getBaseUrlHostname(): string | null {
  const baseUrl = getConfigValue('SYNAPSENOTE_BASE_URL', '').trim();

  if (!baseUrl) return null;

  try {
    return new URL(baseUrl).hostname;
  } catch (primaryError) {
    // Allow hostnames without a protocol.
    try {
      return new URL(`https://${baseUrl}`).hostname;
    } catch (secondaryError) {
      console.warn('Invalid SYNAPSENOTE_BASE_URL provided:', secondaryError);
      return null;
    }
  }
}

function isOfficialHostname(hostname: string | undefined | null): boolean {
  if (!hostname) return false;
  return OFFICIAL_HOSTNAMES.has(hostname);
}

function resolveHostname(): string | null {
  const baseUrlHostname = getBaseUrlHostname();

  if (baseUrlHostname) {
    return baseUrlHostname;
  }

  if (typeof window === 'undefined') {
    return null;
  }

  return window.location.hostname;
}

/** Check if the current environment should use hosted-plan behavior. */
export function isSynapseHosted(): boolean {
  // Allow tests to override and simulate self-hosted environment
  if (typeof window !== 'undefined' && window.localStorage?.getItem('__test_force_self_hosted') === 'true') {
    return false;
  }

  return isOfficialHostname(resolveHostname());
}

export function hasProAccessFromPlans(plans?: SubscriptionPlan[] | null): boolean {
  if (!plans || plans.length === 0) return false;
  return plans.some((plan) => PRO_ACCESS_PLANS.has(plan));
}

export function getProAccessPlanFromSubscriptions(subscriptions?: Subscription[] | null): SubscriptionPlan {
  if (!subscriptions || subscriptions.length === 0) return SubscriptionPlan.Free;
  return subscriptions.some((subscription) => PRO_ACCESS_PLANS.has(subscription.plan))
    ? SubscriptionPlan.Pro
    : SubscriptionPlan.Free;
}
