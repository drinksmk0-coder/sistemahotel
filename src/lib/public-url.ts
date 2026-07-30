const DEFAULT_PUBLIC_APP_URL = "https://sistemahotel-three.vercel.app";

function cleanOrigin(value: string) {
  return value.trim().replace(/\/+$/, "");
}

export function publicAppOrigin() {
  const configured = import.meta.env.VITE_PUBLIC_APP_URL as string | undefined;
  return cleanOrigin(configured || DEFAULT_PUBLIC_APP_URL);
}

export function publicAppUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${publicAppOrigin()}${normalizedPath}`;
}

export function normalizeGuestFacingUrl(value: string) {
  if (typeof window === "undefined") return value;
  const currentOrigin = cleanOrigin(window.location.origin);
  const publicOrigin = publicAppOrigin();
  if (!currentOrigin || currentOrigin === publicOrigin) return value;

  return value
    .replaceAll(currentOrigin, publicOrigin)
    .replaceAll(encodeURIComponent(currentOrigin), encodeURIComponent(publicOrigin));
}
