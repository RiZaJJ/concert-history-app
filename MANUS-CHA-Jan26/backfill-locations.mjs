import { drizzle } from "drizzle-orm/mysql2";
import { unmatchedPhotos } from "./drizzle/schema.ts";
import { eq, isNull } from "drizzle-orm";
import axios from "axios";
import "dotenv/config";

const db = drizzle(process.env.DATABASE_URL);

async function reverseGeocode(latitude, longitude) {
  try {
    const response = await axios.get("http://api.openweathermap.org/geo/1.0/reverse", {
      params: {
        lat: latitude,
        lon: longitude,
        limit: 1,
        appid: process.env.OPENWEATHER_API_KEY,
      },
    });

    const location = response.data[0];
    if (!location) {
      return null;
    }

    return {
      city: location.name,
      state: location.state || null,
      country: location.country,
    };
  } catch (error) {
    console.error("Reverse geocoding error:", error.message);
    return null;
  }
}

async function backfillLocations() {
  console.log("Fetching unmatched photos without location data...");
  
  const photos = await db
    .select()
    .from(unmatchedPhotos)
    .where(isNull(unmatchedPhotos.city));

  console.log(`Found ${photos.length} photos to update`);

  for (const photo of photos) {
    if (photo.latitude && photo.longitude) {
      console.log(`Processing ${photo.fileName}...`);
      
      const location = await reverseGeocode(photo.latitude, photo.longitude);
      
      if (location) {
        await db
          .update(unmatchedPhotos)
          .set({
            city: location.city,
            state: location.state,
            country: location.country,
          })
          .where(eq(unmatchedPhotos.id, photo.id));
        
        console.log(`✓ Updated: ${location.city}, ${location.state || ''}, ${location.country}`);
      } else {
        console.log(`✗ Could not geocode location`);
      }
      
      // Rate limit: wait 1 second between requests
      await new Promise(resolve => setTimeout(resolve, 1000));
    } else {
      console.log(`⊘ Skipping ${photo.fileName} (no GPS data)`);
    }
  }

  console.log("Backfill complete!");
}

backfillLocations().catch(console.error);
