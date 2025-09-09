import { useCallback, useEffect } from 'react';

import { getScrollParent } from '@/components/global-comment/utils';

export const useScrollDetection = (containerRef: React.RefObject<HTMLDivElement>, buttonRef: React.RefObject<HTMLButtonElement>) => {
  
  const getScrollElement = useCallback(() => {
    if (!containerRef.current) return null;
    return containerRef.current.closest('.appflowy-scroll-container') || getScrollParent(containerRef.current);
  }, [containerRef]);


  useEffect(() => {
    const scrollElement = getScrollElement();

    if (scrollElement) {
      const handleScroll = () => {
        buttonRef.current?.style.setProperty('opacity', '0');
        buttonRef.current?.style.setProperty('pointer-events', 'none');

        setTimeout(() => {
          buttonRef.current?.style.setProperty('opacity', '1');
          buttonRef.current?.style.setProperty('pointer-events', 'auto');
        }, 1000);
      };

      scrollElement.addEventListener('scroll', handleScroll);

      return () => {
        scrollElement.removeEventListener('scroll', handleScroll);
      };
    }
  }, [getScrollElement, buttonRef]);
  

  
};