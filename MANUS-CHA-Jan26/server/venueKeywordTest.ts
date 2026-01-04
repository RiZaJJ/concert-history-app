// Test the keyword matching logic
const venueNameKeywords = [
  'stadium',
  'arena',
  'venue',
  'theater',
  'theatre',
  'auditorium',
  'amphitheater',
  'amphitheatre',
  'concert',
  'music',
  'opera',
  'showbox',
  'gorge',
  'pavilion',
  'ballroom',
  'event',
  'live',
  'complex',
  'centre',
  'center'
];

function testVenueName(name: string): boolean {
  const lowerName = name.toLowerCase();
  const nameWords = lowerName.split(/\s+/);
  
  return venueNameKeywords.some(keyword => {
    return nameWords.some((word: string) => 
      word === keyword || 
      word.includes(keyword) && (word.endsWith('hall') || word.endsWith('center') || word.endsWith('centre'))
    ) || lowerName.includes(keyword + ' ');
  });
}

// Test cases
const testCases = [
  { name: "The Showbox", expected: true },
  { name: "Madison Square Garden", expected: false }, // "Garden" not in keywords
  { name: "The Gorge Amphitheatre", expected: true },
  { name: "Munchies and More", expected: false },
  { name: "Music Hall", expected: true },
  { name: "Musicland Store", expected: false },
  { name: "Event Center", expected: true },
  { name: "Live Music Venue", expected: true },
  { name: "Seattle Center", expected: true },
  { name: "Community Centre", expected: true },
];

console.log("Venue Name Keyword Matching Tests:\n");
testCases.forEach(({ name, expected }) => {
  const result = testVenueName(name);
  const status = result === expected ? "✓" : "✗";
  console.log(`${status} "${name}": ${result} (expected: ${expected})`);
});
