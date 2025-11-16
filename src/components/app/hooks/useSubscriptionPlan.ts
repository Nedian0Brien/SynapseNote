import { Subscription, SubscriptionPlan } from '@/application/types';
import { isOfficialHost } from '@/utils/subscription';
import { useCallback, useEffect, useState } from 'react';

/**
 * Hook to manage subscription plan loading and Pro feature detection
 * Only loads subscription for official hosts (self-hosted instances have Pro features enabled by default)
 *
 * @param getSubscriptions - Function to fetch subscriptions (can be undefined)
 * @returns Object containing activeSubscriptionPlan and isPro flag
 */
export function useSubscriptionPlan(
    getSubscriptions?: () => Promise<Subscription[] | undefined>
): {
    activeSubscriptionPlan: SubscriptionPlan | null;
    isPro: boolean;
} {
    const [activeSubscriptionPlan, setActiveSubscriptionPlan] = useState<SubscriptionPlan | null>(null);
    // Pro features are enabled by default on self-hosted instances
    const isPro = activeSubscriptionPlan === SubscriptionPlan.Pro || !isOfficialHost();

    const loadSubscription = useCallback(async () => {
        try {
            if (!getSubscriptions) {
                setActiveSubscriptionPlan(SubscriptionPlan.Free);
                return;
            }

            const subscriptions = await getSubscriptions();

            if (!subscriptions || subscriptions.length === 0) {
                setActiveSubscriptionPlan(SubscriptionPlan.Free);
                return;
            }

            const subscription = subscriptions[0];

            setActiveSubscriptionPlan(subscription?.plan || SubscriptionPlan.Free);
        } catch (e: any) {
            // Silently handle expected errors (API not initialized, no response data, etc.)
            // These are normal scenarios when the service isn't available or there's no subscription data
            const isExpectedError =
                e?.code === -1 &&
                (e?.message === 'No response data received' ||
                    e?.message === 'No response received from server' ||
                    e?.message === 'API service not initialized');

            if (!isExpectedError) {
                console.error(e);
            }

            setActiveSubscriptionPlan(SubscriptionPlan.Free);
        }
    }, [getSubscriptions]);

    useEffect(() => {
        // Only load subscription for official host (self-hosted instances have Pro features enabled by default)
        if (isOfficialHost()) {
            void loadSubscription();
        }
    }, [loadSubscription]);

    return {
        activeSubscriptionPlan,
        isPro,
    };
}

