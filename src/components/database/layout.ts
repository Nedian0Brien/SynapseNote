import { UIVariant } from '@/application/types';
import { getPlatform } from '@/utils/platform';

export interface DatabaseViewportLayoutInput {
  embeddedHeight?: number;
  isDocumentBlock?: boolean;
  isMobile?: boolean;
  variant?: UIVariant;
}

export function shouldUseFixedDatabaseViewport({
  embeddedHeight,
  isDocumentBlock,
  isMobile,
  variant,
}: DatabaseViewportLayoutInput) {
  const mobile = isMobile ?? getPlatform().isMobile;

  return embeddedHeight !== undefined || (!mobile && !isDocumentBlock && variant !== UIVariant.Publish);
}
