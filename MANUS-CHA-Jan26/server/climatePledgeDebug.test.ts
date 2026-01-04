import { describe, it } from 'vitest';
import { makeRequest } from './_core/map';

describe('Climate Pledge Arena Detection', () => {
  it('should find Climate Pledge Arena near photo coordinates', async () => {
    const lat = 47.6228;
    const lng = -122.3548;
    
    console.log(`\nSearching for venues near coordinates: ${lat}, ${lng}`);
    console.log('(This is the location of the SZA concert photo)\n');

    // Test 1: Search with larger radius
    const response1 = await makeRequest('/maps/api/place/nearbysearch/json', {
      location: `${lat},${lng}`,
      radius: '500', // 500 meters
      keyword: 'arena OR stadium OR venue OR concert',
    });

    console.log('=== Search 1: 500m radius with venue keywords ===');
    if (response1.results && response1.results.length > 0) {
      console.log(`Found ${response1.results.length} results:`);
      response1.results.slice(0, 10).forEach((place: any, idx: number) => {
        console.log(`${idx + 1}. ${place.name}`);
        console.log(`   Types: ${place.types?.join(', ')}`);
        console.log(`   Distance: ~${Math.round(getDistance(lat, lng, place.geometry.location.lat, place.geometry.location.lng))}m`);
      });
    } else {
      console.log('No results found');
    }

    // Test 2: Search without keywords (just nearest places)
    const response2 = await makeRequest('/maps/api/place/nearbysearch/json', {
      location: `${lat},${lng}`,
      rankby: 'distance',
      type: 'stadium',
    });

    console.log('\n=== Search 2: Nearest stadiums ===');
    if (response2.results && response2.results.length > 0) {
      console.log(`Found ${response2.results.length} results:`);
      response2.results.slice(0, 10).forEach((place: any, idx: number) => {
        console.log(`${idx + 1}. ${place.name}`);
        console.log(`   Types: ${place.types?.join(', ')}`);
      });
    } else {
      console.log('No results found');
    }

    // Test 3: Search for Climate Pledge Arena specifically
    const response3 = await makeRequest('/maps/api/place/nearbysearch/json', {
      location: `${lat},${lng}`,
      radius: '1000',
      keyword: 'Climate Pledge Arena',
    });

    console.log('\n=== Search 3: Searching for "Climate Pledge Arena" within 1km ===');
    if (response3.results && response3.results.length > 0) {
      console.log(`Found ${response3.results.length} results:`);
      response3.results.forEach((place: any, idx: number) => {
        console.log(`${idx + 1}. ${place.name}`);
        console.log(`   Address: ${place.vicinity}`);
        console.log(`   Types: ${place.types?.join(', ')}`);
        console.log(`   Distance: ~${Math.round(getDistance(lat, lng, place.geometry.location.lat, place.geometry.location.lng))}m`);
      });
    } else {
      console.log('❌ Climate Pledge Arena NOT FOUND within 1km!');
    }
  });
});

// Haversine formula to calculate distance between two coordinates
function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}
