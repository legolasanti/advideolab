import { useEffect } from 'react';
import { captureAttributionFromUrl, trackMarketingEvent, type MarketingEventType } from '../lib/marketing';

export const useMarketingTracker = (eventType?: MarketingEventType) => {
  useEffect(() => {
    captureAttributionFromUrl();
    if (eventType) {
      trackMarketingEvent(eventType);
    }
  }, [eventType]);
};
