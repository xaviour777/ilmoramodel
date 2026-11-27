// Map helpers for transport: an OpenStreetMap view (no key needed) and a Google Maps link.
export const mapSrc = (lat: number, lng: number, z = 0.012) =>
  `https://www.openstreetmap.org/export/embed.html?bbox=${lng - z}%2C${lat - z / 1.6}%2C${lng + z}%2C${lat + z / 1.6}&layer=mapnik&marker=${lat}%2C${lng}`;
export const mapLink = (lat: number, lng: number) => `https://www.google.com/maps?q=${lat},${lng}`;
