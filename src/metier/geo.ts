import type { GeoPoint, Parametres } from '../types';

/** Position transmise par le navigateur (la distance et la zone ne sont jamais reçues du client) */
export interface PositionRecue {
  lat: number;
  lng: number;
  precision: number;
}

/** Distance en mètres entre deux coordonnées (formule de Haversine) */
export function distanceMetres(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Distance au site et appartenance à la zone, calculées par le serveur */
export function versGeoPoint({ lat, lng, precision }: PositionRecue, site: Parametres['site']): GeoPoint {
  const distance = Math.round(distanceMetres(lat, lng, site.lat, site.lng));
  return {
    lat,
    lng,
    precision: Math.round(precision),
    distance,
    // La précision GPS est prise en compte pour ne pas pénaliser un signal imprécis
    dansZone: distance <= site.rayon + Math.min(precision, 100),
  };
}
