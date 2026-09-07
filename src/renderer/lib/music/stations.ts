// What the four terminal stations are, beyond the name the backend sends: the
// station's own title, what it sounds like, and who carries it. Shared by the
// Music page and the dock, so the two describe a station the same way.

export interface StationNote {
  title: string;
  note: string;
  source: string;
}

export const STATION_NOTES: Record<string, StationNote> = {
  Lofi: { title: 'Groove Salad', note: 'a warm bath of downtempo', source: 'SomaFM · 128 kbps' },
  Jazz: {
    title: 'Sonic Universe',
    note: 'jazz that wanders off the map',
    source: 'SomaFM · 128 kbps',
  },
  Classical: {
    title: 'France Musique',
    note: 'the concert hall, from Paris',
    source: 'Radio France · 128 kbps',
  },
  Ambient: { title: 'Drone Zone', note: 'served best chilled', source: 'SomaFM · 128 kbps' },
};

export function stationNote(name: string | undefined): StationNote | undefined {
  return name ? STATION_NOTES[name] : undefined;
}
