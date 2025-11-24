import { useEffect } from 'react';

const TAWK_SRC = 'https://embed.tawk.to/6924d1fabdebcf1965bcc88c/1jart8f11';

export default function TawkChatWidget() {
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    if (document.getElementById('tawk-script')) return;
    window.Tawk_API = window.Tawk_API || {};
    window.Tawk_LoadStart = new Date();
    const hideBubble = () => {
      try {
        if (window.Tawk_API && typeof window.Tawk_API.hideWidget === 'function') {
          window.Tawk_API.hideWidget();
        }
      } catch {
        /* noop */
      }
    };
    const previousOnLoad = window.Tawk_API.onLoad;
    window.Tawk_API.onLoad = function (...args) {
      hideBubble();
      if (typeof previousOnLoad === 'function') {
        previousOnLoad.apply(this, args);
      }
    };
    const s1 = document.createElement('script');
    const s0 = document.getElementsByTagName('script')[0];
    s1.async = true;
    s1.src = TAWK_SRC;
    s1.charset = 'UTF-8';
    s1.id = 'tawk-script';
    s1.setAttribute('crossorigin', '*');
    if (s0 && s0.parentNode) {
      s0.parentNode.insertBefore(s1, s0);
    } else {
      document.body.appendChild(s1);
    }
  }, []);

  return null;
}
