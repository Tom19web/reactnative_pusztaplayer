const moodMap: Record<string, string> = {
  // Alap
  action: 'Akciódús',
  comedy: 'Vidám',
  drama: 'Elgondolkodtató',
  thriller: 'Lebilincselő',
  suspense: 'Lebilincselő',
  romance: 'Szerelmes',
  romantic: 'Szerelmes',
  horror: 'Félelmetes',
  adventure: 'Kalandvágyó',
  scifi: 'Fantasztikus',
  'science fiction': 'Fantasztikus',
  fantasy: 'Mesebeli',
  crime: 'Kíváncsivá tesz',
  mystery: 'Rejtélyes',
  war: 'Megrázó',
  military: 'Megrázó',
  western: 'Kietlen',
  documentary: 'Tanulságos',
  docuseries: 'Tanulságos',
  animation: 'Játékos',
  cartoon: 'Játékos',
  anime: 'Játékos',
  family: 'Otthonos',
  kids: 'Otthonos',
  children: 'Otthonos',
  musical: 'Lendületes',
  music: 'Lendületes',
  sport: 'Győzedelmes',
  sports: 'Győzedelmes',
  biography: 'Inspiráló',
  biopic: 'Inspiráló',
  history: 'Időutazós',
  historical: 'Időutazós',
  reality: 'Felszabadult',
  'reality-tv': 'Felszabadult',
  talk: 'Közvetlen',
  'talk-show': 'Közvetlen',
  'game show': 'Versenyszellemű',
  nature: 'Áhítatos',
  short: 'Harapható',

  // Speciális / kombinált
  classic: 'Nosztalgikus',
  adult: 'Provokatív',
  erotic: 'Provokatív',
  lgbtq: 'Provokatív',
  chill: 'Lazító',
  ambient: 'Lazító',
  meditation: 'Lazító',

  // Bővített érzelmek
  noir: 'Baljós',
  dystopian: 'Baljós',
  postapocalyptic: 'Baljós',
  epic: 'Lenyűgöző',
  'film-noir': 'Baljós',
};

export function genreToMood(genre: string): string {
  const g = genre.trim().toLowerCase();
  return moodMap[g] || genre.trim();
}

export function genresToMoods(genreStr: string): string[] {
  if (!genreStr) return [];
  const genres = genreStr.split(',').map(g => g.trim()).filter(Boolean);
  const moods = genres.map(g => genreToMood(g));
  return [...new Set(moods)];
}

export function getAllMoods(items: { genre: string }[]): string[] {
  const moodSet = new Set<string>();
  for (const item of items) {
    const moods = genresToMoods(item.genre);
    moods.forEach(m => moodSet.add(m));
  }
  return ['Mind', ...Array.from(moodSet).sort()];
}

export function matchesMood(itemGenre: string, mood: string): boolean {
  if (mood === 'Mind') return true;
  return genresToMoods(itemGenre).includes(mood);
}
