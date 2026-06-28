export function getPlatform () {
  const mobileUserAgent = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  const mobileViewport = window.innerWidth <= 768;

  return {
    isMobile: mobileUserAgent || mobileViewport,
  };
}
