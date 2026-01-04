import { invokeLLM } from "./_core/llm";
import * as db from "./db";

interface ConcertSuggestion {
  artist: string;
  reasoning: string;
  confidence: "high" | "medium" | "low";
}

/**
 * Analyze user's concert history and generate AI-powered suggestions
 */
export async function generateConcertSuggestions(userId: number): Promise<ConcertSuggestion[]> {
  try {
    // Get user's concert history
    const concerts = await db.getUserConcerts(userId);
    
    if (concerts.length === 0) {
      return [];
    }
    
    // Enrich with artist and venue data
    const enrichedConcerts = await Promise.all(
      concerts.map(async (concert) => {
        const artist = await db.getArtistById(concert.artistId);
        const venue = await db.getVenueById(concert.venueId);
        return {
          artist: artist?.name || "Unknown",
          venue: venue?.name || "Unknown",
          city: venue?.city || "Unknown",
          date: concert.concertDate,
        };
      })
    );
    
    // Prepare concert history summary for LLM
    const concertHistory = enrichedConcerts
      .slice(0, 50) // Limit to recent 50 concerts
      .map(c => `${c.artist} at ${c.venue}, ${c.city} (${c.date.toLocaleDateString()})`)
      .join("\n");
    
    // Call LLM for analysis
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: "You are a music recommendation expert. Analyze the user's concert attendance history and suggest artists they might enjoy seeing live. Focus on artists with similar styles, genres, or who have toured with the artists they've seen. Provide 5-10 suggestions with reasoning.",
        },
        {
          role: "user",
          content: `Based on this concert history, suggest artists I should see live:\n\n${concertHistory}\n\nProvide suggestions in JSON format: [{"artist": "Artist Name", "reasoning": "Why you'd enjoy them", "confidence": "high|medium|low"}]`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "concert_suggestions",
          strict: true,
          schema: {
            type: "object",
            properties: {
              suggestions: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    artist: { type: "string" },
                    reasoning: { type: "string" },
                    confidence: { type: "string", enum: ["high", "medium", "low"] },
                  },
                  required: ["artist", "reasoning", "confidence"],
                  additionalProperties: false,
                },
              },
            },
            required: ["suggestions"],
            additionalProperties: false,
          },
        },
      },
    });
    
    const content = response.choices[0]?.message?.content;
    if (!content || typeof content !== 'string') {
      return [];
    }
    
    const parsed = JSON.parse(content);
    return parsed.suggestions || [];
  } catch (error) {
    console.error("Error generating concert suggestions:", error);
    return [];
  }
}

/**
 * Generate insights about user's concert attendance patterns
 */
export async function generateConcertInsights(userId: number): Promise<string> {
  try {
    const concerts = await db.getUserConcerts(userId);
    
    if (concerts.length === 0) {
      return "Start attending concerts to see your personalized insights!";
    }
    
    // Gather statistics
    const enrichedConcerts = await Promise.all(
      concerts.map(async (concert) => {
        const artist = await db.getArtistById(concert.artistId);
        const venue = await db.getVenueById(concert.venueId);
        return {
          artist: artist?.name || "Unknown",
          venue: venue?.name || "Unknown",
          city: venue?.city || "Unknown",
          year: concert.concertDate.getFullYear(),
        };
      })
    );
    
    // Count by artist
    const artistCounts = enrichedConcerts.reduce((acc, c) => {
      acc[c.artist] = (acc[c.artist] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    // Count by venue
    const venueCounts = enrichedConcerts.reduce((acc, c) => {
      acc[c.venue] = (acc[c.venue] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    // Count by year
    const yearCounts = enrichedConcerts.reduce((acc, c) => {
      acc[c.year] = (acc[c.year] || 0) + 1;
      return acc;
    }, {} as Record<number, number>);
    
    const topArtists = Object.entries(artistCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([artist, count]) => `${artist} (${count} times)`)
      .join(", ");
    
    const topVenues = Object.entries(venueCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([venue, count]) => `${venue} (${count} times)`)
      .join(", ");
    
    const summary = `You've attended ${concerts.length} concerts. Top artists: ${topArtists}. Favorite venues: ${topVenues}.`;
    
    // Call LLM for roast-style insights
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: "You are a brutally honest music critic who roasts people's concert choices. Be snarky, sarcastic, and funny. Make fun of their music taste, venue choices, how many times they've seen the same artist, and any patterns you notice. Keep it playful but savage. 2-3 sentences max.",
        },
        {
          role: "user",
          content: `Roast this person's concert history: ${summary}`,
        },
      ],
    });
    
    const content = response.choices[0]?.message?.content;
    return (typeof content === 'string' ? content : summary) || summary;
  } catch (error) {
    console.error("Error generating insights:", error);
    return "Unable to generate insights at this time.";
  }
}
