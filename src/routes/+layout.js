// Enable prerendering only in static build mode
export const prerender = !!import.meta.env.VITE_STATIC_MODE;
export const trailingSlash = 'always';
