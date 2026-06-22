import isFQDN from 'validator/lib/isFQDN';
import isIP from 'validator/lib/isIP';
import isURL from 'validator/lib/isURL';

export const downloadPage = 'https://synapse.lawdigest.kr/app';

export const openSynapseNoteUrl = 'https://synapse.lawdigest.kr/app';

export const iosDownloadLink = 'https://synapse.lawdigest.kr/app';
export const androidDownloadLink = 'https://synapse.lawdigest.kr/app';

export const desktopDownloadLink = 'https://synapse.lawdigest.kr/app';

export function isValidUrl(input: string) {
  return isURL(input, { require_protocol: true, require_host: false });
}

export function isSingleURLText(input: string) {
  const trimmed = input.trim();

  if (!trimmed) return false;
  if (trimmed.split(/\r\n|\r|\n/).filter(Boolean).length !== 1) return false;

  return Boolean(processUrl(trimmed));
}

// Process the URL to make sure it's a valid URL
// If it's not a valid URL(eg: 'synapse.lawdigest.kr' or '192.168.1.2'), we'll add 'https://' to the URL
export function processUrl(input: string) {
  let processedUrl = input;

  if (isValidUrl(input)) {
    return processedUrl;
  }

  if (input.startsWith('http')) {
    return processedUrl;
  }

  if (input.startsWith('localhost')) {
    return `http://${input}`;
  }

  const domain = input.split('/')[0];

  if (isIP(domain) || isFQDN(domain)) {
    processedUrl = `https://${input}`;
    if (isValidUrl(processedUrl)) {
      return processedUrl;
    }
  }

  return;
}

export async function openUrl(url: string, target: string = '_current') {

  const newUrl = processUrl(url);

  if (!newUrl) return;

  window.open(newUrl, target);
}
