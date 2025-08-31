// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { useTranslation as useI18n } from 'react-i18next';

// Custom hook that automatically prefixes translation keys with 'chat.'
export const useTranslation = () => {
  const result = useI18n();
  const originalT = result.t;
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = (key: string, options?: any) => {
    const prefixedKey = key.startsWith('chat.') ? key : `chat.${key}`;

    return originalT(prefixedKey, options);
  };
  
  return { ...result, t };
};

export function changeLanguage(lang: string) {
  // Access global i18n directly
  if (typeof window !== 'undefined' && 'i18n' in window) {
    const i18n = (window as unknown as { i18n: { changeLanguage: (lang: string) => Promise<void> } }).i18n;

    return i18n.changeLanguage(lang);
  }

  console.warn('i18n instance not available');
  return Promise.resolve();
}

export function addResourceBundle(_lang: string, _ns: string, _resources: Record<string, string>) {
  // This function is no longer needed since translations are in main file
  console.warn('addResourceBundle is deprecated - translations are now in main translation files');
}