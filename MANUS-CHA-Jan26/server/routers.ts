import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import * as db from "./db";
import { fetchSetlistByDateAndVenue, fetchSetlistByArtistAndDate, fetchCurrentWeather, listPhotosFromDrive, getPhotoMetadata } from "./integrations";
import { storagePut } from "./storage";
import { findSetlistWithAllCombinations } from "./setlistMatcher";
import { nanoid } from "nanoid";
import { triggerPhotoScan, extractEXIFData } from "./photoIngestion";
import { getScanProgress } from "./scanProgress";
import { dateToNoonUTC } from "./dateUtils";
import { generateConcertSuggestions, generateConcertInsights } from "./aiSuggestions";
import { getGoogleAuth } from "./integrations";
import { google } from "googleapis";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  // Artist operations
  artists: router({
    search: protectedProcedure
      .input(z.object({ query: z.string() }))
      .query(async ({ input }) => {
        return await db.searchArtists(input.query);
      }),
    
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return await db.getArtistById(input.id);
      }),
  }),

  // Venue operations
  venues: router({
    search: protectedProcedure
      .input(z.object({ query: z.string() }))
      .query(async ({ input }) => {
        return await db.searchVenues(input.query);
      }),
    
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return await db.getVenueById(input.id);
      }),
  }),

  // Concert operations
  concerts: router({
    list: protectedProcedure
      .query(async ({ ctx }) => {
        const concerts = await db.getUserConcerts(ctx.user.id);
        
        // Enrich with artist, venue, and photo count
        const enriched = await Promise.all(
          concerts.map(async (concert) => {
            const artist = await db.getArtistById(concert.artistId);
            const venue = await db.getVenueById(concert.venueId);
            const starredCount = await db.getStarredPhotosCount(concert.id);
            
            return {
              ...concert,
              artist,
              venue,
              starredCount,
            };
          })
        );
        
        return enriched;
      }),
    
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const concert = await db.getConcertById(input.id);
        if (!concert || concert.userId !== ctx.user.id) {
          throw new Error("Concert not found");
        }
        
        const artist = await db.getArtistById(concert.artistId);
        const venue = await db.getVenueById(concert.venueId);
        const photos = await db.getConcertPhotos(concert.id);
        const setlist = await db.getConcertSetlist(concert.id);
        
        // Enrich setlist with song details
        const enrichedSetlist = await Promise.all(
          setlist.map(async (entry) => {
            const song = await db.getSongById(entry.songId);
            return {
              ...entry,
              song,
            };
          })
        );
        
        return {
          ...concert,
          artist,
          venue,
          photos,
          setlist: enrichedSetlist,
        };
      }),
    
    search: protectedProcedure
      .input(z.object({
        artistName: z.string().optional(),
        venueName: z.string().optional(),
        city: z.string().optional(),
        year: z.number().optional(),
      }))
      .query(async ({ input, ctx }) => {
        const concerts = await db.searchConcerts(ctx.user.id, input);
        
        // Enrich with artist, venue, and photo count
        const enriched = await Promise.all(
          concerts.map(async (concert) => {
            const artist = await db.getArtistById(concert.artistId);
            const venue = await db.getVenueById(concert.venueId);
            const starredCount = await db.getStarredPhotosCount(concert.id);
            
            return {
              ...concert,
              artist,
              venue,
              starredCount,
            };
          })
        );
        
        return enriched;
      }),
    
    create: protectedProcedure
      .input(z.object({
        artistName: z.string().optional(),
        venueName: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        country: z.string().optional(),
        concertDate: z.date(),
        latitude: z.string().optional(),
        longitude: z.string().optional(),
      }).refine(
        (data) => {
          const filled = [data.artistName, data.venueName, data.concertDate].filter(Boolean).length;
          return filled >= 2;
        },
        { message: "At least 2 of artist, venue, or date must be provided" }
      ))
      .mutation(async ({ input, ctx }) => {
        // Find or create artist (if provided)
        let artist;
        if (input.artistName) {
          artist = await db.getArtistByName(input.artistName);
          if (!artist) {
            artist = await db.createArtist({
              name: input.artistName,
            });
          }
        } else {
          // Create placeholder artist if not provided
          artist = await db.createArtist({
            name: "Unknown Artist",
          });
        }
        
        // Find or create venue (if provided)
        let venue;
        if (input.venueName && input.city) {
          venue = await db.findVenueByNameAndCity(input.venueName, input.city);
          if (!venue) {
            venue = await db.createVenue({
              name: input.venueName,
              city: input.city,
              state: input.state,
              country: input.country || "US",
              latitude: input.latitude,
              longitude: input.longitude,
            });
          }
        } else {
          // Create placeholder venue if not provided
          venue = await db.createVenue({
            name: "Unknown Venue",
            city: "Unknown",
            country: input.country || "US",
          });
        }
        
        // Check for existing concert (deduplication)
        const existing = await db.findExistingConcert(
          ctx.user.id,
          venue.id,
          input.concertDate
        );
        
        if (existing) {
          return { concert: existing, isNew: false };
        }
        
        // Fetch weather if coordinates available
        let weatherData = null;
        if (input.latitude && input.longitude) {
          try {
            weatherData = await fetchCurrentWeather(input.latitude, input.longitude);
          } catch (error) {
            console.warn("Failed to fetch weather:", error);
          }
        }
        
        // Create concert
        const concert = await db.createConcert({
          userId: ctx.user.id,
          artistId: artist.id,
          venueId: venue.id,
          concertDate: dateToNoonUTC(input.concertDate),
          weatherCondition: weatherData?.description || null,
          temperature: weatherData?.temperature || null,
          weatherIcon: null,
        });
        
        return { concert, isNew: true };
      }),
    
    update: protectedProcedure
      .input(z.object({
        concertId: z.number(),
        artistName: z.string().optional(),
        venueName: z.string().optional(),
        city: z.string(),
        state: z.string().optional(),
        country: z.string(),
        concertDate: z.date().optional(),
        latitude: z.string().optional(),
        longitude: z.string().optional(),
        refreshSetlist: z.boolean().optional(), // If true, fetch fresh setlist from setlist.fm
      }))
      .mutation(async ({ input, ctx }) => {
        const concert = await db.getConcertById(input.concertId);
        if (!concert || concert.userId !== ctx.user.id) {
          throw new Error("Concert not found");
        }
        
        // Get existing concert data for fallback
        const existingArtist = await db.getArtistById(concert.artistId);
        const existingVenue = await db.getVenueById(concert.venueId);
        
        let artistName: string;
        let venueName: string;
        let concertDate: Date;
        let city = input.city;
        let state = input.state;
        let country = input.country;
        let latitude = input.latitude;
        let longitude = input.longitude;
        
        // If refreshSetlist is true, lookup from setlist.fm FIRST
        // Blank fields mean "look this up" not "keep existing"
        if (input.refreshSetlist) {
          try {
            console.log('[Concert Update] Refreshing from setlist.fm with:', {
              artist: input.artistName || '(blank - lookup)',
              venue: input.venueName || '(blank - lookup)',
              date: input.concertDate || concert.concertDate,
            });
            
            // Pass blank fields as undefined to trigger lookup
            const setlistData = await findSetlistWithAllCombinations({
              artistName: input.artistName || undefined,
              venueName: input.venueName || undefined,
              concertDate: input.concertDate || concert.concertDate,
              latitude: input.latitude || existingVenue?.latitude || undefined,
              longitude: input.longitude || existingVenue?.longitude || undefined,
              city: input.city || existingVenue?.city || undefined,
            });
            
            if (setlistData && setlistData.artist && setlistData.venue) {
              // Use setlist.fm data
              artistName = setlistData.artist.name;
              venueName = setlistData.venue.name;
              concertDate = input.concertDate || concert.concertDate;
              city = setlistData.venue.city?.name || city;
              state = setlistData.venue.city?.state || state;
              country = setlistData.venue.city?.country?.code || country;
              latitude = setlistData.venue.city?.coords?.lat?.toString() || latitude;
              longitude = setlistData.venue.city?.coords?.long?.toString() || longitude;
              
              console.log('[Concert Update] Found on setlist.fm:', {
                artist: artistName,
                venue: venueName,
              });
              
              // Find or create the NEW artist from setlist.fm
              let artist = await db.getArtistByName(artistName);
              if (!artist) {
                artist = await db.createArtist({ name: artistName });
              }
              
              // Delete old setlist and create new one
              await db.deleteSetlistByConcert(input.concertId);
              
              if (setlistData.sets?.set) {
                for (let setIndex = 0; setIndex < setlistData.sets.set.length; setIndex++) {
                  const set = setlistData.sets.set[setIndex];
                  if (set.song) {
                    for (let songIndex = 0; songIndex < set.song.length; songIndex++) {
                      const songData = set.song[songIndex];
                      let song = await db.getSongByTitle(songData.name);
                      if (!song) {
                        song = await db.createSong({
                          title: songData.name,
                          artistId: artist.id, // Use NEW artist ID
                        });
                      }
                      
                      await db.createSetlistEntry({
                        concertId: input.concertId,
                        songId: song.id,
                        setNumber: setIndex + 1,
                        position: songIndex + 1,
                        notes: songData.info || null,
                      });
                    }
                  }
                }
              }
            } else {
              // Setlist lookup failed, use input or existing values
              console.log('[Concert Update] Setlist lookup failed, using input/existing values');
              artistName = input.artistName || existingArtist?.name || 'Unknown Artist';
              venueName = input.venueName || existingVenue?.name || 'Unknown Venue';
              concertDate = input.concertDate || concert.concertDate;
            }
          } catch (error) {
            console.warn("Failed to refresh setlist:", error);
            // Fallback to input or existing values
            artistName = input.artistName || existingArtist?.name || 'Unknown Artist';
            venueName = input.venueName || existingVenue?.name || 'Unknown Venue';
            concertDate = input.concertDate || concert.concertDate;
          }
        } else {
          // No refresh requested, use input or existing values
          artistName = input.artistName || existingArtist?.name || 'Unknown Artist';
          venueName = input.venueName || existingVenue?.name || 'Unknown Venue';
          concertDate = input.concertDate || concert.concertDate;
        }
        
        // Find or create artist (might be new from setlist.fm)
        let artist = await db.getArtistByName(artistName);
        if (!artist) {
          artist = await db.createArtist({ name: artistName });
        }
        
        // Find or create venue with the (possibly updated) venue data
        let venue = await db.findVenueByNameAndCity(venueName, city);
        if (!venue) {
          venue = await db.createVenue({
            name: venueName,
            city,
            state,
            country,
            latitude,
            longitude,
          });
        }
        
        // Update concert with new data
        await db.updateConcert(input.concertId, {
          artistId: artist.id,
          venueId: venue.id,
          concertDate: input.concertDate ? dateToNoonUTC(input.concertDate) : undefined,
        });
        
        return { success: true };
      }),
    
    updateVenue: protectedProcedure
      .input(z.object({
        concertId: z.number(),
        venueName: z.string(),
        city: z.string(),
        state: z.string().optional(),
        country: z.string(),
        latitude: z.string().optional(),
        longitude: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        // Find or create venue
        let venue = await db.findVenueByNameAndCity(input.venueName, input.city);
        if (!venue) {
          venue = await db.createVenue({
            name: input.venueName,
            city: input.city,
            state: input.state,
            country: input.country,
            latitude: input.latitude,
            longitude: input.longitude,
          });
        }
        
        // Update concert venue
        await db.updateConcertVenue(input.concertId, venue.id);
        
        return { success: true, venue };
      }),
    
    delete: protectedProcedure
      .input(z.object({ concertId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const concert = await db.getConcertById(input.concertId);
        if (!concert || concert.userId !== ctx.user.id) {
          throw new Error("Concert not found");
        }
        
        await db.deleteConcert(input.concertId);
        return { success: true };
      }),
    
    merge: protectedProcedure
      .input(z.object({
        sourceConcertId: z.number(),
        targetConcertId: z.number()
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await db.mergeConcerts(
          input.sourceConcertId,
          input.targetConcertId,
          ctx.user.id
        );
        return result;
      }),
    
    deleteTestConcerts: protectedProcedure
      .mutation(async ({ ctx }) => {
        const count = await db.deleteTestConcerts(ctx.user.id);
        return { success: true, count };
      }),
    
    deleteAllData: protectedProcedure
      .mutation(async ({ ctx }) => {
        const stats = await db.deleteAllData(ctx.user.id);
        return { success: true, ...stats };
      }),
  }),

  // Photo operations
  photos: router({
    getByConcert: protectedProcedure
      .input(z.object({ concertId: z.number() }))
      .query(async ({ input, ctx }) => {
        const concert = await db.getConcertById(input.concertId);
        if (!concert || concert.userId !== ctx.user.id) {
          throw new Error("Concert not found");
        }
        
        return await db.getConcertPhotos(input.concertId);
      }),
    
    toggleStar: protectedProcedure
      .input(z.object({
        photoId: z.number(),
        isStarred: z.boolean(),
      }))
      .mutation(async ({ input, ctx }) => {
        const photo = await db.getPhotoById(input.photoId);
        if (!photo || photo.userId !== ctx.user.id) {
          throw new Error("Photo not found");
        }
        
        let s3Url = photo.s3Url;
        let s3Key = photo.s3Key;
        
        // If starring and not already in S3, upload it
        if (input.isStarred && !photo.s3Url) {
          const fileKey = `${ctx.user.id}/photos/${nanoid()}.jpg`;
          s3Key = fileKey;
        }
        
        await db.updatePhotoStarred(input.photoId, input.isStarred, s3Url || undefined, s3Key || undefined);
        
        return { success: true };
      }),
    
    bulkHide: protectedProcedure
      .input(z.object({
        photoIds: z.array(z.number()),
      }))
      .mutation(async ({ input, ctx }) => {
        await db.bulkHidePhotos(input.photoIds, ctx.user.id);
        return { success: true, count: input.photoIds.length };
      }),
    
    bulkDelete: protectedProcedure
      .input(z.object({
        photoIds: z.array(z.number()),
      }))
      .mutation(async ({ input, ctx }) => {
        await db.bulkDeletePhotos(input.photoIds, ctx.user.id);
        return { success: true, count: input.photoIds.length };
      }),
    
    scanFromDrive: protectedProcedure
      .mutation(async ({ ctx }) => {
        try {
          const stats = await triggerPhotoScan(ctx.user.id);
          return stats;
        } catch (error: any) {
          throw new Error(`Photo scan failed: ${error.message}`);
        }
      }),
    
    getScanProgress: protectedProcedure
      .query(async ({ ctx }) => {
        const progress = getScanProgress(ctx.user.id);
        return progress;
      }),
    
    getUnmatched: protectedProcedure
      .query(async ({ ctx }) => {
        return await db.getUnmatchedPhotos(ctx.user.id, 50);
      }),
    
    getSkipped: protectedProcedure
      .query(async ({ ctx }) => {
        return await db.getSkippedPhotos(ctx.user.id);
      }),
    
    unskipPhoto: protectedProcedure
      .input(z.object({ photoId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const photo = await db.getUnmatchedPhotoById(input.photoId);
        if (!photo || photo.userId !== ctx.user.id) {
          throw new Error("Photo not found");
        }
        
        await db.updateUnmatchedPhotoStatus(input.photoId, "pending");
        return { success: true };
      }),
    
    linkToExisting: protectedProcedure
      .input(z.object({
        photoId: z.number(),
        concertId: z.number(),
      }))
      .mutation(async ({ input, ctx }) => {
        const unmatchedPhoto = await db.getUnmatchedPhotoById(input.photoId);
        if (!unmatchedPhoto || unmatchedPhoto.userId !== ctx.user.id) {
          throw new Error("Photo not found");
        }
        
        // Create regular photo record
        await db.createPhoto({
          concertId: input.concertId,
          userId: ctx.user.id,
          sourceUrl: unmatchedPhoto.sourceUrl,
          filename: unmatchedPhoto.fileName,
          mimeType: unmatchedPhoto.mimeType,
          takenAt: unmatchedPhoto.takenAt || unmatchedPhoto.fileCreatedAt,
          latitude: unmatchedPhoto.latitude,
          longitude: unmatchedPhoto.longitude,
        });
        
        // Mark as linked
        await db.updateUnmatchedPhotoStatus(input.photoId, "linked", input.concertId);
        
        // Find other photos from same date/location for bulk linking suggestion
        const photoDate = unmatchedPhoto.takenAt || unmatchedPhoto.fileCreatedAt;
        const similarPhotos = photoDate && unmatchedPhoto.latitude && unmatchedPhoto.longitude
          ? await db.findSimilarUnmatchedPhotos(
              photoDate,
              unmatchedPhoto.latitude,
              unmatchedPhoto.longitude,
              ctx.user.id
            )
          : [];
        
        return { 
          success: true,
          similarPhotosCount: similarPhotos.length,
          photoDate: photoDate || undefined,
          photoLocation: unmatchedPhoto.venueName || unmatchedPhoto.city || undefined
        };
      }),
    
    bulkLinkSimilar: protectedProcedure
      .input(z.object({
        photoDate: z.date(),
        latitude: z.string(),
        longitude: z.string(),
        concertId: z.number(),
      }))
      .mutation(async ({ input, ctx }) => {
        // Find all similar photos
        const similarPhotos = await db.findSimilarUnmatchedPhotos(
          input.photoDate,
          input.latitude,
          input.longitude,
          ctx.user.id
        );
        
        let linkedCount = 0;
        for (const photo of similarPhotos) {
          // Create regular photo record
          await db.createPhoto({
            concertId: input.concertId,
            userId: ctx.user.id,
            sourceUrl: photo.sourceUrl,
            filename: photo.fileName,
            mimeType: photo.mimeType,
            takenAt: photo.takenAt || photo.fileCreatedAt,
            latitude: photo.latitude,
            longitude: photo.longitude,
          });
          
          // Mark as linked
          await db.updateUnmatchedPhotoStatus(photo.id, "linked", input.concertId);
          linkedCount++;
        }
        
        return { success: true, linkedCount };
      }),
    
    skipPhoto: protectedProcedure
      .input(z.object({
        photoId: z.number(),
      }))
      .mutation(async ({ input, ctx }) => {
        const unmatchedPhoto = await db.getUnmatchedPhotoById(input.photoId);
        if (!unmatchedPhoto || unmatchedPhoto.userId !== ctx.user.id) {
          throw new Error("Photo not found");
        }
        
        await db.updateUnmatchedPhotoStatus(input.photoId, "skipped");
        return { success: true };
      }),
    
    overrideVenue: protectedProcedure
      .input(z.object({
        photoId: z.number(),
        venueName: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        const unmatchedPhoto = await db.getUnmatchedPhotoById(input.photoId);
        if (!unmatchedPhoto || unmatchedPhoto.userId !== ctx.user.id) {
          throw new Error("Photo not found");
        }
        
        // Update venue name with manual override
        await db.updateUnmatchedPhotoVenue(
          input.photoId,
          input.venueName,
          'manual_override',
          'high'
        );
        
        return { success: true };
      }),
    
    searchConcertsForPhoto: protectedProcedure
      .input(z.object({
        photoId: z.number(),
        venueName: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const unmatchedPhoto = await db.getUnmatchedPhotoById(input.photoId);
        if (!unmatchedPhoto || unmatchedPhoto.userId !== ctx.user.id) {
          throw new Error("Photo not found");
        }
        
        // Try to find matching concerts using enhanced setlist matching
        const setlistData = await findSetlistWithAllCombinations({
          venueName: input.venueName || unmatchedPhoto.venueName || undefined,
          concertDate: unmatchedPhoto.takenAt ? new Date(unmatchedPhoto.takenAt) : undefined,
          city: unmatchedPhoto.city || undefined,
          latitude: unmatchedPhoto.latitude || undefined,
          longitude: unmatchedPhoto.longitude || undefined,
        });
        
        if (!setlistData || !setlistData.artist) {
          return { found: false, suggestions: [] };
        }
        
        // Return matching concert suggestions
        return {
          found: true,
          suggestions: [{
            artist: setlistData.artist.name,
            venue: setlistData.venue?.name,
            city: setlistData.venue?.city?.name,
            date: unmatchedPhoto.takenAt,
          }],
        };
      }),
    
    getNearbyVenues: protectedProcedure
      .input(z.object({
        latitude: z.string(),
        longitude: z.string(),
      }))
      .query(async ({ input }) => {
        try {
          console.log(`[getNearbyVenues] Fetching OSM venues for ${input.latitude}, ${input.longitude}`);
          const { findOSMVenues } = await import("./osmVenueDetection");
          
          const venues = await findOSMVenues(input.latitude, input.longitude, 100);
          
          if (venues.length === 0) {
            console.log('[getNearbyVenues] No OSM venues found');
            return [];
          }
          
          console.log(`[getNearbyVenues] Found ${venues.length} OSM venues`);
          
          // Return venues with required fields for VenueDropdown
          return venues.map(v => ({
            name: v.name,
            types: [v.matchedTag],
            score: 100 - v.distance, // Higher score for closer venues
            city: '', // OSM doesn't provide city in this query
            state: undefined,
            country: '',
            latitude: v.lat.toString(),
            longitude: v.lon.toString(),
          }));
        } catch (error) {
          console.error('[getNearbyVenues] Error:', error);
          return [];
        }
      }),
    
    createConcertFromPhoto: protectedProcedure
      .input(z.object({
        photoId: z.number(),
        artistName: z.string().optional(),
        venueName: z.string().optional(),
        city: z.string(),
        country: z.string(),
        state: z.string().optional(),
        concertDate: z.date().optional(),
        latitude: z.string().optional(),
        longitude: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const photo = await db.getUnmatchedPhotoById(input.photoId);
        if (!photo || photo.userId !== ctx.user.id) {
          throw new Error("Photo not found");
        }
        
        // Count filled fields
        const filledFields = [input.artistName, input.venueName, input.concertDate].filter(Boolean).length;
        if (filledFields < 2) {
          throw new Error("At least 2 of 3 fields (artist, venue, date) are required");
        }

        let artistName = input.artistName;
        let venueName = input.venueName;
        let concertDate = input.concertDate;
        let city = input.city;
        let state = input.state;
        let country = input.country;
        let latitude = input.latitude || photo.latitude || undefined;
        let longitude = input.longitude || photo.longitude || undefined;
        
        // If any field is missing, try to lookup from setlist.fm
        if (!artistName || !venueName || !concertDate) {
          console.log('[Create Concert] Looking up missing fields from setlist.fm');
          
          const setlistData = await findSetlistWithAllCombinations({
            artistName: artistName || undefined,
            venueName: venueName || undefined,
            concertDate: concertDate || undefined,
            latitude,
            longitude,
          });
          
          if (setlistData && setlistData.artist && setlistData.venue) {
            artistName = artistName || setlistData.artist.name;
            venueName = venueName || setlistData.venue.name;
            concertDate = concertDate || new Date(); // Use photo date as fallback
            city = setlistData.venue.city?.name || city;
            state = setlistData.venue.city?.state || state;
            country = setlistData.venue.city?.country?.code || country;
            latitude = setlistData.venue.city?.coords?.lat?.toString() || latitude;
            longitude = setlistData.venue.city?.coords?.long?.toString() || longitude;
            
            console.log('[Create Concert] Found on setlist.fm:', {
              artist: artistName,
              venue: venueName,
            });
          } else {
            throw new Error("Could not find concert information on setlist.fm. Please provide all 3 fields manually.");
          }
        }
        
        if (!artistName || !venueName || !concertDate) {
          throw new Error("Missing required fields after setlist.fm lookup");
        }

        // Create or get artist
        let artist = await db.getArtistByName(artistName);
        if (!artist) {
          await db.createArtist({ name: artistName });
          artist = await db.getArtistByName(artistName);
        }
        if (!artist) throw new Error("Failed to create artist");

        // Create or get venue
        let venue = await db.findVenueByNameAndCity(venueName, city);
        if (!venue) {
          await db.createVenue({
            name: venueName,
            city,
            state: state || null,
            country,
            latitude: latitude || null,
            longitude: longitude || null,
          });
          venue = await db.findVenueByNameAndCity(venueName, city);
        }
        if (!venue) throw new Error("Failed to create venue");

        // Create concert
        const concert = await db.createConcert({
          userId: ctx.user.id,
          artistId: artist.id,
          venueId: venue.id,
          concertDate: dateToNoonUTC(concertDate),
        });

        // Link photo to concert
        await db.createPhoto({
          concertId: concert.id,
          userId: ctx.user.id,
          sourceUrl: photo.sourceUrl,
          filename: photo.fileName,
          mimeType: photo.mimeType,
          takenAt: photo.takenAt || photo.fileCreatedAt,
          latitude: photo.latitude,
          longitude: photo.longitude,
        });

        // Mark photo as linked
        await db.updateUnmatchedPhotoStatus(input.photoId, "linked", concert.id);

        return { success: true, concertId: concert.id };
      }),
    
    createAlias: protectedProcedure
      .input(z.object({
        alias: z.string(),
        venueName: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        await db.createVenueAlias(ctx.user.id, input.alias, input.venueName);
        return { success: true };
      }),
    
    getAliases: protectedProcedure
      .query(async ({ ctx }) => {
        return await db.getVenueAliases(ctx.user.id);
      }),
    
    deleteAlias: protectedProcedure
      .input(z.object({
        aliasId: z.number(),
      }))
      .mutation(async ({ input }) => {
        await db.deleteVenueAlias(input.aliasId);
        return { success: true };
      }),
    
    skipAllFromEvent: protectedProcedure
      .input(z.object({
        photoId: z.number(),
      }))
      .mutation(async ({ input, ctx }) => {
        const unmatchedPhoto = await db.getUnmatchedPhotoById(input.photoId);
        if (!unmatchedPhoto || unmatchedPhoto.userId !== ctx.user.id) {
          throw new Error("Photo not found");
        }
        
        if (!unmatchedPhoto.takenAt || !unmatchedPhoto.latitude || !unmatchedPhoto.longitude) {
          throw new Error("Photo missing date or location data");
        }
        
        const skippedCount = await db.skipPhotosByDateAndLocation(
          ctx.user.id,
          unmatchedPhoto.takenAt,
          unmatchedPhoto.latitude,
          unmatchedPhoto.longitude
        );
        
        return { success: true, skippedCount };
      }),
    
    clearAll: protectedProcedure
      .mutation(async ({ ctx }) => {
        // Get all unmatched photos for the current user
        const photos = await db.getUnmatchedPhotos(ctx.user.id, 1000);
        
        // Delete each one
        for (const photo of photos) {
          await db.deleteUnmatchedPhoto(photo.id);
        }
        
        return { success: true, count: photos.length };
      }),
    
    checkSampleExif: protectedProcedure
      .query(async () => {
        const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
        if (!folderId) {
          throw new Error("GOOGLE_DRIVE_FOLDER_ID not configured");
        }
        
        try {
          const files = await listPhotosFromDrive(folderId);
          if (files.length === 0) {
            return { message: "No photos found in folder" };
          }
          
          // Check first 5 photos
          const samples = files.slice(0, 5);
          const results = [];
          
          for (const file of samples) {
            try {
              const metadata = await getPhotoMetadata(file.id!);
              const exif = extractEXIFData(metadata);
              results.push({
                filename: file.name,
                hasTimestamp: !!exif.takenAt,
                timestamp: exif.takenAt?.toISOString(),
                hasGPS: !!(exif.latitude && exif.longitude),
                latitude: exif.latitude,
                longitude: exif.longitude,
              });
            } catch (error: any) {
              results.push({
                filename: file.name,
                error: error.message,
              });
            }
          }
          
          return { totalPhotos: files.length, samples: results };
        } catch (error: any) {
          throw new Error(`Failed to check EXIF: ${error.message}`);
        }
      }),
  }),

  // Google Drive image proxy
  driveProxy: router({
    getImage: publicProcedure
      .input(z.object({ fileId: z.string() }))
      .query(async ({ input }) => {
        try {
          const auth = await getGoogleAuth();
          const drive = google.drive({ version: 'v3', auth });
          
          // Get file metadata to check mime type
          const metadata = await drive.files.get({
            fileId: input.fileId,
            fields: 'mimeType',
          });
          
          // Get file content as base64
          const response = await drive.files.get(
            {
              fileId: input.fileId,
              alt: 'media',
            },
            { responseType: 'arraybuffer' }
          );
          
          // Convert to base64 data URL
          const buffer = Buffer.from(response.data as ArrayBuffer);
          const base64 = buffer.toString('base64');
          const mimeType = metadata.data.mimeType || 'image/jpeg';
          const dataUrl = `data:${mimeType};base64,${base64}`;
          
          return { dataUrl };
        } catch (error: any) {
          throw new Error(`Failed to fetch image: ${error.message}`);
        }
      }),
  }),

  // AI-powered features
  ai: router({
    suggestions: protectedProcedure
      .query(async ({ ctx }) => {
        return await generateConcertSuggestions(ctx.user.id);
      }),
    
    insights: protectedProcedure
      .query(async ({ ctx }) => {
        return await generateConcertInsights(ctx.user.id);
      }),
  }),
});

export type AppRouter = typeof appRouter;
