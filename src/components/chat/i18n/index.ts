// @ts-nocheck
import { useTranslation as useI18n } from 'react-i18next';

// Custom hook that automatically prefixes translation keys with 'chat.'
export const useTranslation = () => {
  const result = useI18n();
  const originalT = result.t;
  
  const t = (key: string, options?: any) => {
    const prefixedKey = key.startsWith('chat.') ? key : `chat.${key}`;
    return originalT(prefixedKey, options);
  };
  
  return { ...result, t };
};

export function changeLanguage(lang: string) {
  // Access global i18n directly
  if (typeof window !== 'undefined' && (window as any).i18n) {
    return (window as any).i18n.changeLanguage(lang);
  }
  console.warn('i18n instance not available');
  return Promise.resolve();
}

export function addResourceBundle(lang: string, ns: string, resources: Record<string, string>) {
  // This function is no longer needed since translations are in main file
  console.warn('addResourceBundle is deprecated - translations are now in main translation files');
};