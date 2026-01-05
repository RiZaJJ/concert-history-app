import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import * as db from "./db";
import {
  fetchCurrentWeather,
  listPhotosFromDrive,
  getPhotoMetadata,
  getGoogleAuth
} from "./integrations";
import { findSetlistWithAllCombinations } from "./setlistMatcher";
import { triggerPhotoScan, extractEXIFData } from "./photoIngestion";
import { getScanProgress, initScanProgress, updateScanProgress, completeScanProgress, saveLastScanResult, getLastScanResult } from "./scanProgress";
import { dateToNoonUTC } from "./dateUtils";
import { getLogs, getLogStats, clearLogs, logApiCall, type LogType } from "./logger";
import { generateConcertSuggestions, generateConcertInsights } from "./aiSuggestions";
import { nanoid } from "nanoid";

import { google } from "googleapis";
import { TRPCError } from "@trpc/server";

export const appRouter = router({
  system: systemRouter,
  
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
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

  concerts: router({
    list: protectedProcedure
      .query(async ({ ctx }) => {
        // OPTIMIZED: Single query with JOINs instead of N+1 queries
        // Before: 1 + (N * 4) queries
        // After: 1 query
        const start = Date.now();
        const concerts = await db.getUserConcertsWithDetails(ctx.user.id);
        const duration = Date.now() - start;
        console.log(`[Performance] concerts.list query took ${duration}ms for ${concerts.length} concerts`);
        return concerts;
      }),
    
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const concert = await db.getConcertById(input.id);
        if (!concert || concert.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Concert not found" });
        }
        
        const [artist, venue, photos, setlist] = await Promise.all([
          db.getArtistById(concert.artistId),
          db.getVenueById(concert.venueId),
          db.getConcertPhotos(concert.id),
          db.getConcertSetlist(concert.id)
        ]);
        
        const enrichedSetlist = await Promise.all(
          setlist.map(async (entry) => ({
            ...entry,
            song: await db.getSongById(entry.songId),
          }))
        );
        
        return { ...concert, artist, venue, photos, setlist: enrichedSetlist };
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
        return await Promise.all(
          concerts.map(async (concert) => {
            const [artist, venue, starredCount] = await Promise.all([
              db.getArtistById(concert.artistId),
              db.getVenueById(concert.venueId),
              db.getStarredPhotosCount(concert.id)
            ]);
            return { ...concert, artist, venue, starredCount };
          })
        );
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
        // Find or create artist
        let artist;
        if (input.artistName) {
          artist = await db.findArtistByName(input.artistName);
          if (!artist) {
            artist = await db.createArtist({ name: input.artistName });
          }
        } else {
          artist = await db.createArtist({ name: "Unknown Artist" });
        }

        // Find or create venue
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
          venue = await db.createVenue({
            name: "Unknown Venue",
            city: "Unknown",
            country: input.country || "US",
          });
        }

        // Check for existing concert
        const existing = await db.findConcert(ctx.user.id, venue.id, input.concertDate);
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
        refreshSetlist: z.boolean().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const concert = await db.getConcertById(input.concertId);
        if (!concert || concert.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Concert not found" });
        }

        const existingArtist = await db.getArtistById(concert.artistId);
        const existingVenue = await db.getVenueById(concert.venueId);

        let artistName = input.artistName || existingArtist?.name || 'Unknown Artist';
        let venueName = input.venueName || existingVenue?.name || 'Unknown Venue';
        let concertDate = input.concertDate || concert.concertDate;
        let city = input.city;
        let state = input.state;
        let country = input.country;
        let latitude = input.latitude;
        let longitude = input.longitude;

        // If refreshSetlist, try to lookup from setlist.fm
        if (input.refreshSetlist) {
          try {
            const setlistData = await findSetlistWithAllCombinations({
              artistName: input.artistName || undefined,
              venueName: input.venueName || undefined,
              concertDate: input.concertDate || concert.concertDate,
              latitude: input.latitude || existingVenue?.latitude || undefined,
              longitude: input.longitude || existingVenue?.longitude || undefined,
              city: input.city || existingVenue?.city || undefined,
            });

            if (setlistData && setlistData.artist && setlistData.venue) {
              artistName = setlistData.artist.name;
              venueName = setlistData.venue.name;
              city = setlistData.venue.city?.name || city;
              state = setlistData.venue.city?.state || state;
              country = setlistData.venue.city?.country?.code || country;
              // NOTE: Do NOT use setlist.fm GPS coordinates - they're often inaccurate
              // Keep existing lat/lon from user input or existing venue only

              // Find or create artist from setlist.fm
              let artist = await db.findArtistByName(artistName);
              if (!artist) {
                artist = await db.createArtist({ name: artistName });
              }

              // Delete old setlist and create new
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
                          artistId: artist.id,
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
            }
          } catch (error) {
            console.warn("Failed to refresh setlist:", error);
          }
        }

        // Find or create artist
        let artist = await db.findArtistByName(artistName);
        if (!artist) {
          artist = await db.createArtist({ name: artistName });
        }

        // Find or create venue
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

        // Update concert
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
        const concert = await db.getConcertById(input.concertId);
        if (!concert || concert.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Concert not found" });
        }

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

        await db.updateConcertVenue(input.concertId, venue.id);
        return { success: true, venue };
      }),

    delete: protectedProcedure
      .input(z.object({ concertId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const concert = await db.getConcertById(input.concertId);
        if (!concert || concert.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Concert not found" });
        }

        await db.deleteConcert(input.concertId);
        return { success: true };
      }),

    markIncorrect: protectedProcedure
      .input(z.object({ concertId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const concert = await db.getConcertById(input.concertId);
        if (!concert || concert.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Concert not found" });
        }

        // Get all photos for this concert
        const photos = await db.getPhotoByConcertId(input.concertId);

        // Move each photo back to unmatched_photos
        for (const photo of photos) {
          await db.createUnmatchedPhoto({
            userId: ctx.user.id,
            driveFileId: photo.driveFileId || `photo_${photo.id}`,
            fileName: `photo_${photo.id}.jpg`, // We don't have the original filename
            takenAt: photo.takenAt || new Date(),
            latitude: photo.latitude?.toString(),
            longitude: photo.longitude?.toString(),
            city: concert.venue?.city,
            state: concert.venue?.state,
            venueName: concert.venue?.name,
          });

          // Delete the photo from photos table
          await db.deletePhoto(photo.id);
        }

        // Delete the concert
        await db.deleteConcert(input.concertId);

        return { success: true, photosUnmarked: photos.length };
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

        // Clear ALL in-memory caches
        const { clearScanProgress, clearLastScanResult } = await import('./scanProgress');
        clearScanProgress(ctx.user.id);
        clearLastScanResult(ctx.user.id);

        return { success: true, ...stats };
      }),
  }),

  photos: router({
    getByConcert: protectedProcedure
      .input(z.object({ concertId: z.number() }))
      .query(async ({ input }) => {
        return await db.getConcertPhotos(input.concertId);
      }),

    getUnmatched: protectedProcedure.query(async ({ ctx }) => {
      return await db.getUnmatchedPhotos(ctx.user.id);
    }),

    getUnmatchedCount: protectedProcedure.query(async ({ ctx }) => {
      // Corrected: Using ctx.user.id instead of undefined userId
      return await db.getUnmatchedCount(ctx.user.id);
    }),

    getNoGpsPhotos: protectedProcedure.query(async ({ ctx }) => {
      return await db.getNoGpsPhotos(ctx.user.id);
    }),

    getNoGpsCount: protectedProcedure.query(async ({ ctx }) => {
      return await db.getNoGpsPhotosCount(ctx.user.id);
    }),

    matchUnmatched: protectedProcedure
      .input(z.object({ unmatchedPhotoId: z.number(), concertId: z.number() }))
      .mutation(async ({ input }) => {
        return await db.moveUnmatchedToConcert(input.unmatchedPhotoId, input.concertId);
      }),
      
    clearAll: protectedProcedure.mutation(async ({ ctx }) => {
      return await db.clearUnmatchedAndProcessed(ctx.user.id);
    }),

    getSkipped: protectedProcedure.query(async ({ ctx }) => {
      return await db.getSkippedPhotos(ctx.user.id);
    }),

   scanFromDrive: protectedProcedure
  .input(z.object({ limit: z.number().optional() }))
  .mutation(async ({ ctx, input }) => {
    return await triggerPhotoScan(ctx.user.id, input.limit);
  }),

    getScanProgress: protectedProcedure.query(async ({ ctx }) => {
      return getScanProgress(ctx.user.id);
    }),

    getLastScanResult: protectedProcedure.query(async ({ ctx }) => {
      return getLastScanResult(ctx.user.id);
    }),

    getScanStats: protectedProcedure.query(async ({ ctx }) => {
      const processedCount = await db.getProcessedFilesCount(ctx.user.id);

      // Get total files from cache (updated during scans)
      const cache = await db.getScanCache(ctx.user.id);
      const totalFiles = cache?.totalDriveFiles || 0;
      const remainingFiles = Math.max(0, totalFiles - processedCount);

      return {
        totalFiles,
        processedCount,
        remainingFiles,
      };
    }),

    unskipPhoto: protectedProcedure
      .input(z.object({ photoId: z.number() }))
      .mutation(async ({ input }) => {
        return await db.updatePhoto(input.photoId, { reviewed: "pending" });
      }),

    skipPhoto: protectedProcedure
      .input(z.object({ photoId: z.number() }))
      .mutation(async ({ input }) => {
        return await db.updatePhoto(input.photoId, { reviewed: "skipped" });
      }),

    skipAllFromEvent: protectedProcedure
      .input(z.object({ photoId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        // Get the photo to find its date
        const photo = await db.getUnmatchedPhotoById(input.photoId);
        if (!photo) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Photo not found" });
        }
        // Skip all photos from the same date (within 18 hours)
        const skippedCount = await db.skipPhotosFromSameEvent(ctx.user.id, photo.takenAt);
        return { skippedCount };
      }),

    createConcertFromPhoto: protectedProcedure
      .input(z.object({
        photoId: z.number(),
        artistName: z.string().optional(),
        venueName: z.string().optional(),
        city: z.string(),
        state: z.string().optional(),
        country: z.string(),
        concertDate: z.date().optional(),
        latitude: z.string().optional(),
        longitude: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { photoId, artistName, venueName, city, state, country, concertDate, latitude, longitude } = input;

        // Get the unmatched photo
        const photo = await db.getUnmatchedPhotoById(photoId);
        if (!photo) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Photo not found" });
        }

        // Use photo date if concert date not provided
        const finalDate = concertDate || photo.takenAt || new Date();
        const noonDate = dateToNoonUTC(finalDate);

        // Create or find artist
        let artist = null;
        if (artistName) {
          artist = await db.findArtistByName(artistName);
          if (!artist) {
            artist = await db.createArtist({ name: artistName });
          }
        }
        if (!artist) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Artist name is required" });
        }

        // Create or find venue
        let venue = await db.findVenueByNameAndCity(venueName || "Unknown Venue", city);
        if (!venue) {
          venue = await db.createVenue({
            name: venueName || "Unknown Venue",
            city,
            state: state || null,
            country,
            latitude: latitude || null,
            longitude: longitude || null,
          });
        }

        // Check if concert already exists
        let concert = await db.findConcert(ctx.user.id, venue.id, noonDate);
        if (!concert) {
          concert = await db.createConcert({
            userId: ctx.user.id,
            artistId: artist.id,
            venueId: venue.id,
            concertDate: noonDate,
          });
        }

        // Move the unmatched photo to the concert
        await db.moveUnmatchedToConcert(photoId, concert.id);

        // Find other photos from same date/location for bulk linking suggestion
        const photoDate = photo.takenAt || photo.fileCreatedAt;
        const similarPhotos = photoDate && photo.latitude && photo.longitude
          ? await db.findSimilarUnmatchedPhotos(
              photoDate,
              photo.latitude,
              photo.longitude,
              ctx.user.id
            )
          : [];

        return {
          concertId: concert.id,
          artistName: artist.name,
          venueName: venue.name,
          similarPhotosCount: similarPhotos.length,
          photoDate: photoDate || undefined,
          photoLocation: photo.venueName || photo.city || undefined
        };
      }),

    toggleStar: protectedProcedure
      .input(z.object({
        photoId: z.number(),
        isStarred: z.boolean(),
      }))
      .mutation(async ({ input, ctx }) => {
        const photo = await db.getPhotoById(input.photoId);
        if (!photo || photo.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Photo not found" });
        }

        let s3Url = photo.s3Url;
        let s3Key = photo.s3Key;

        // If starring and not already in S3, generate key
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

    linkToExisting: protectedProcedure
      .input(z.object({
        photoId: z.number(),
        concertId: z.number(),
      }))
      .mutation(async ({ input, ctx }) => {
        const unmatchedPhoto = await db.getUnmatchedPhotoById(input.photoId);
        if (!unmatchedPhoto || unmatchedPhoto.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Photo not found" });
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
        const similarPhotos = await db.findSimilarUnmatchedPhotos(
          input.photoDate,
          input.latitude,
          input.longitude,
          ctx.user.id
        );

        let linkedCount = 0;
        for (const photo of similarPhotos) {
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

          await db.updateUnmatchedPhotoStatus(photo.id, "linked", input.concertId);
          linkedCount++;
        }

        return { success: true, linkedCount };
      }),

    overrideVenue: protectedProcedure
      .input(z.object({
        photoId: z.number(),
        venueName: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        const unmatchedPhoto = await db.getUnmatchedPhotoById(input.photoId);
        if (!unmatchedPhoto || unmatchedPhoto.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Photo not found" });
        }

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
        artistName: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const unmatchedPhoto = await db.getUnmatchedPhotoById(input.photoId);
        if (!unmatchedPhoto || unmatchedPhoto.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Photo not found" });
        }

        const venueName = input.venueName || unmatchedPhoto.venueName;
        let city = unmatchedPhoto.city;

        // Skip city field if "county" appears in the city name - use venue + date only
        if (city && city.toLowerCase().includes('county')) {
          console.log(`[searchConcertsForPhoto] City contains "county" (${city}) - skipping city filter, searching with venue + date only`);
          city = undefined;
        }

        const takenAt = unmatchedPhoto.takenAt ? new Date(unmatchedPhoto.takenAt) : null;
        const latitude = unmatchedPhoto.latitude;
        const longitude = unmatchedPhoto.longitude;

        console.log(`[searchConcertsForPhoto] === SEARCH ATTEMPT ===`);
        console.log(`  Photo: ${unmatchedPhoto.fileName}`);
        console.log(`  Artist: "${input.artistName || 'N/A'}"`);
        console.log(`  Venue: "${venueName || 'N/A'}"`);
        console.log(`  City: "${city || 'N/A (skipped)'}"`);
        console.log(`  Date: ${takenAt ? takenAt.toISOString().split('T')[0] : 'N/A'}`);
        console.log(`  GPS: ${latitude && longitude ? `${latitude}, ${longitude}` : 'N/A'}`);

        // Convert UTC timestamp to Pacific Time before searching
        let localDate = takenAt;
        if (takenAt) {
          // Subtract 8 hours to convert from UTC to PST (Seattle timezone)
          localDate = new Date(takenAt.getTime() - (8 * 60 * 60 * 1000));
          console.log(`[searchConcertsForPhoto] UTC date: ${takenAt.toISOString()}, Local date (PST): ${localDate.toISOString().split('T')[0]}`);
        }

        // If artist name provided, search by artist + date first
        let setlistData;
        if (input.artistName) {
          console.log(`[searchConcertsForPhoto] Searching by artist "${input.artistName}" + date (ignoring GPS to allow manual override)`);
          const { fetchSetlistByArtistAndDate } = await import("./integrations");

          // DON'T pass GPS coordinates when user explicitly searches by artist
          // The whole point is to bypass bad/missing GPS data
          setlistData = await fetchSetlistByArtistAndDate(
            input.artistName,
            localDate || new Date(),
            undefined, // Don't filter by GPS latitude
            undefined  // Don't filter by GPS longitude
          );

          if (setlistData) {
            console.log(`[searchConcertsForPhoto] Found setlist: ${setlistData.artist.name} at ${setlistData.venue?.name}`);

            // For artist search, return suggestion instead of auto-creating
            return {
              found: true,
              concertCreated: false,
              suggestions: [{
                artist: setlistData.artist.name,
                venue: setlistData.venue?.name || 'Unknown Venue',
                city: setlistData.venue?.city?.name || unmatchedPhoto.city,
                date: unmatchedPhoto.takenAt,
              }],
            };
          } else {
            console.log(`[searchConcertsForPhoto] No setlist found for artist "${input.artistName}"`);
            return {
              found: false,
              concertCreated: false,
              suggestions: [],
            };
          }
        }

        // Fallback to venue-based search
        // FIRST: Try primary venue name
        setlistData = await findSetlistWithAllCombinations({
          venueName: venueName || undefined,
          concertDate: localDate || undefined,
          city: city || undefined,
          latitude: latitude || undefined,
          longitude: longitude || undefined,
        });

        // SECOND: If no match and venue exists in DB with alt_name, try alt_name
        if (!setlistData && venueName && city) {
          const venueInDb = await db.findVenueByNameAndCity(venueName, city);
          if (venueInDb?.altName) {
            console.log(`[searchConcertsForPhoto] No match with "${venueName}", trying alt_name: "${venueInDb.altName}"`);
            setlistData = await findSetlistWithAllCombinations({
              venueName: venueInDb.altName,
              concertDate: localDate || undefined,
              city: city || undefined,
              latitude: latitude || undefined,
              longitude: longitude || undefined,
            });
            if (setlistData) {
              console.log(`[searchConcertsForPhoto] ✓ Found match using alt_name "${venueInDb.altName}"!`);
            }
          }
        }

        // THIRD: If still no match, try simplified name (remove "at the...", "@ the...", etc.)
        if (!setlistData && venueName) {
          const simplifiedName = venueName
            .replace(/\s+(at|@)\s+(the\s+)?[\w\s]+$/i, '') // Remove "at the Market", "@ The Venetian", etc.
            .trim();

          if (simplifiedName !== venueName && simplifiedName.length > 0) {
            console.log(`[searchConcertsForPhoto] No match with "${venueName}", trying simplified: "${simplifiedName}"`);
            setlistData = await findSetlistWithAllCombinations({
              venueName: simplifiedName,
              concertDate: localDate || undefined,
              city: city || undefined,
              latitude: latitude || undefined,
              longitude: longitude || undefined,
            });
            if (setlistData) {
              console.log(`[searchConcertsForPhoto] ✓ Found match using simplified name "${simplifiedName}"!`);
            }
          }
        }

        // FOURTH: Try adding common venue suffixes (handles "Gorge" → "The Gorge Amphitheatre", "Nectar" → "Nectar Lounge")
        if (!setlistData && venueName) {
          const commonSuffixes = ['Amphitheatre', 'Amphitheater', 'Lounge', 'Theater', 'Theatre', 'Hall', 'Ballroom', 'Arena', 'Stadium', 'Center', 'Venue'];

          for (const suffix of commonSuffixes) {
            // Try with "The" prefix and suffix
            const withTheAndSuffix = `The ${venueName} ${suffix}`;
            console.log(`[searchConcertsForPhoto] Trying with prefix+suffix: "${withTheAndSuffix}"`);
            setlistData = await findSetlistWithAllCombinations({
              venueName: withTheAndSuffix,
              concertDate: localDate || undefined,
              city: city || undefined,
              latitude: latitude || undefined,
              longitude: longitude || undefined,
            });
            if (setlistData) {
              console.log(`[searchConcertsForPhoto] ✓ Found match with "${withTheAndSuffix}"!`);
              break;
            }

            // Try with just suffix (no "The")
            const withSuffix = `${venueName} ${suffix}`;
            console.log(`[searchConcertsForPhoto] Trying with suffix: "${withSuffix}"`);
            setlistData = await findSetlistWithAllCombinations({
              venueName: withSuffix,
              concertDate: localDate || undefined,
              city: city || undefined,
              latitude: latitude || undefined,
              longitude: longitude || undefined,
            });
            if (setlistData) {
              console.log(`[searchConcertsForPhoto] ✓ Found match with "${withSuffix}"!`);
              break;
            }
          }
        }

        // FIFTH: Try without city filter (handles cases where city name doesn't match setlist.fm)
        if (!setlistData && venueName && city) {
          console.log(`[searchConcertsForPhoto] Trying without city filter (venue+date only)...`);
          setlistData = await findSetlistWithAllCombinations({
            venueName: venueName,
            concertDate: localDate || undefined,
            city: undefined, // Remove city filter
            latitude: latitude || undefined,
            longitude: longitude || undefined,
          });
          if (setlistData) {
            console.log(`[searchConcertsForPhoto] ✓ Found match without city filter!`);
          }
        }

        // SIXTH: Use OSM to find actual venue name near GPS coordinates
        if (!setlistData && latitude && longitude) {
          console.log(`[searchConcertsForPhoto] Trying OSM venue detection...`);
          try {
            const { findOSMVenues } = await import("./osmVenueDetection");
            const osmVenues = await findOSMVenues(latitude, longitude, 1200);

            if (osmVenues.length > 0) {
              console.log(`[searchConcertsForPhoto] Found ${osmVenues.length} OSM venues near GPS`);

              // Try each OSM venue name
              for (const osmVenue of osmVenues) {
                console.log(`[searchConcertsForPhoto] Trying OSM venue: "${osmVenue.name}"`);
                setlistData = await findSetlistWithAllCombinations({
                  venueName: osmVenue.name,
                  concertDate: localDate || undefined,
                  city: city || undefined,
                  latitude: latitude || undefined,
                  longitude: longitude || undefined,
                });
                if (setlistData) {
                  console.log(`[searchConcertsForPhoto] ✓ Found match using OSM venue "${osmVenue.name}"!`);
                  break;
                }

                // Also try alt_name if exists
                if (osmVenue.altName) {
                  console.log(`[searchConcertsForPhoto] Trying OSM alt_name: "${osmVenue.altName}"`);
                  setlistData = await findSetlistWithAllCombinations({
                    venueName: osmVenue.altName,
                    concertDate: localDate || undefined,
                    city: city || undefined,
                    latitude: latitude || undefined,
                    longitude: longitude || undefined,
                  });
                  if (setlistData) {
                    console.log(`[searchConcertsForPhoto] ✓ Found match using OSM alt_name "${osmVenue.altName}"!`);
                    break;
                  }
                }
              }
            }
          } catch (error) {
            console.warn(`[searchConcertsForPhoto] OSM venue detection failed:`, error);
          }
        }

        if (!setlistData || !setlistData.artist) {
          console.log(`[searchConcertsForPhoto] ✗ NO MATCH FOUND after all fallback strategies`);
          console.log(`  Tried:`);
          console.log(`    1. Original venue name: "${venueName}"`);
          console.log(`    2. Alt name (if exists in DB)`);
          console.log(`    3. Simplified name (removed suffixes)`);
          console.log(`    4. Common venue suffixes (Amphitheatre, Lounge, etc.)`);
          console.log(`    5. Without city filter`);
          console.log(`    6. OSM-detected venue names`);
          console.log(`  Possible reasons:`);
          console.log(`    - Concert not in Setlist.fm database`);
          console.log(`    - Venue name significantly different from Setlist.fm`);
          console.log(`    - Wrong date selected`);
          return { found: false, suggestions: [], concertCreated: false };
        }

        console.log(`[searchConcertsForPhoto] Found setlist: ${setlistData.artist.name} at ${setlistData.venue?.name}`);

        // Auto-create concert and link photo (similar to autoDetectConcert in photoIngestion.ts)
        try {
          const artistName = setlistData.artist.name;
          const venueName = setlistData.venue?.name;
          const cityName = setlistData.venue?.city?.name || unmatchedPhoto.city;
          const countryCode = setlistData.venue?.city?.country?.code || unmatchedPhoto.country;

          if (!artistName || !venueName || !cityName) {
            console.log(`[searchConcertsForPhoto] Missing required data: artist=${artistName}, venue=${venueName}, city=${cityName}`);
            return { found: false, suggestions: [], concertCreated: false };
          }

          // Parse concert date from setlist
          let concertDate = unmatchedPhoto.takenAt ? new Date(unmatchedPhoto.takenAt) : new Date();
          if (setlistData.eventDate) {
            const [day, month, year] = setlistData.eventDate.split('-').map(Number);
            concertDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
          }

          // Find or create artist
          let artist = await db.findArtistByName(artistName);
          if (!artist) {
            artist = await db.createArtist({ name: artistName, mbid: setlistData.artist?.mbid });
          }

          // Find or create venue
          let venue = await db.findVenueByNameAndCity(venueName, cityName);
          if (!venue) {
            venue = await db.createVenue({
              name: venueName,
              city: cityName,
              country: countryCode || "Unknown",
              latitude: unmatchedPhoto.latitude || undefined,
              longitude: unmatchedPhoto.longitude || undefined,
            });
          }

          // Check if concert already exists
          let concert = await db.findConcert(ctx.user.id, venue.id, concertDate);

          if (!concert) {
            // Concert doesn't exist, create it
            let weatherData = null;
            if (unmatchedPhoto.latitude && unmatchedPhoto.longitude) {
              try {
                weatherData = await fetchCurrentWeather(unmatchedPhoto.latitude, unmatchedPhoto.longitude);
              } catch (e) {}
            }

            concert = await db.createConcert({
              userId: ctx.user.id,
              artistId: artist.id,
              venueId: venue.id,
              concertDate,
              weatherCondition: weatherData?.weather?.[0]?.description,
              temperature: weatherData?.main?.temp,
              setlistFmId: setlistData.id || null,
              setlistFmUrl: setlistData.url || null,
            });
            console.log(`[searchConcertsForPhoto] Created new concert ID: ${concert.id}`);

            // Add setlist if available
            if (setlistData.sets?.set && Array.isArray(setlistData.sets.set)) {
              let setNumber = 1;
              for (const set of setlistData.sets.set) {
                if (set.song && Array.isArray(set.song)) {
                  let position = 1;
                  for (const songData of set.song) {
                    const song = await db.createSong({ title: songData.name, artistId: artist.id });
                    await db.createSetlistEntry({
                      concertId: concert.id,
                      songId: song.id,
                      setNumber,
                      position,
                      notes: songData.info || songData.tape ? `${songData.info || ''} ${songData.tape || ''}`.trim() : undefined,
                    });
                    position++;
                  }
                }
                setNumber++;
              }
            }
          } else {
            console.log(`[searchConcertsForPhoto] Concert already exists ID: ${concert.id}`);
          }

          // Link photo to concert
          const directDownloadUrl = unmatchedPhoto.sourceUrl;
          await db.createPhoto({
            concertId: concert.id,
            userId: ctx.user.id,
            sourceUrl: directDownloadUrl,
            takenAt: unmatchedPhoto.takenAt ? new Date(unmatchedPhoto.takenAt) : null,
            latitude: unmatchedPhoto.latitude,
            longitude: unmatchedPhoto.longitude,
            filename: unmatchedPhoto.fileName,
            mimeType: unmatchedPhoto.mimeType,
            isStarred: false,
          });

          // Remove from unmatched photos
          await db.deleteUnmatchedPhoto(unmatchedPhoto.id);

          console.log(`[searchConcertsForPhoto] Photo linked to concert ${concert.id}`);

          return {
            found: true,
            concertCreated: true,
            concertId: concert.id,
            suggestions: [{
              artist: artistName,
              venue: venueName,
              city: cityName,
              date: concertDate,
            }],
          };
        } catch (error: any) {
          console.error(`[searchConcertsForPhoto] Error creating concert:`, error.message);
          return {
            found: true,
            concertCreated: false,
            suggestions: [{
              artist: setlistData.artist.name,
              venue: setlistData.venue?.name,
              city: setlistData.venue?.city?.name,
              date: unmatchedPhoto.takenAt,
            }],
          };
        }
      }),

    getNearbyVenues: protectedProcedure
      .input(z.object({
        latitude: z.string(),
        longitude: z.string(),
      }))
      .query(async ({ input }) => {
        try {
          // STEP 1: Check database cache first
          console.log(`[getNearbyVenues] Checking database cache for venues near ${input.latitude}, ${input.longitude}`);
          const dbVenues = await db.findVenuesNearCoordinates(input.latitude, input.longitude, 0.746); // 1200 meters (~3/4 mile)

          const allVenues: any[] = [];

          if (dbVenues.length > 0) {
            console.log(`[getNearbyVenues] ✓ Found ${dbVenues.length} cached venues within 1200m`);
            dbVenues.forEach(v => {
              allVenues.push({
                name: v.name,
                types: ['cached_venue'],
                score: 100 - Math.round(v.distance * 1000),
                distance: Math.round(v.distance * 1609.34),
                city: v.city,
                state: v.state,
                country: v.country,
                latitude: v.latitude || '',
                longitude: v.longitude || '',
              });
            });
          }

          // STEP 2: If we have cached venues, return them
          if (allVenues.length > 0) {
            // Sort by distance
            allVenues.sort((a, b) => a.distance - b.distance);

            console.log('[getNearbyVenues] Returning cached venues:');
            allVenues.forEach((v, i) => console.log(`  ${i + 1}. ${v.name} (${v.distance}m) [${v.types.join(', ')}]`));

            return allVenues;
          }

          // STEP 3: No cached venues found, query OSM
          const { reverseGeocode } = await import("./integrations");
          console.log('[getNearbyVenues] No venues found yet, querying OSM as fallback...');
          const { findOSMVenues } = await import("./osmVenueDetection");

          const osmVenues = await findOSMVenues(input.latitude, input.longitude, 1200); // 1200 meters

          if (osmVenues.length === 0) {
            console.log('[getNearbyVenues] No OSM venues found either');
            return [];
          }

          // STEP 4: Validate OSM venues against setlist.fm (filter out venues with no concerts)
          console.log(`[getNearbyVenues] Validating ${osmVenues.length} OSM venues against setlist.fm...`);
          const validatedVenues = [];

          for (const osmVenue of osmVenues) {
            try {
              // Query setlist.fm to see if this venue has ANY concerts
              await new Promise(resolve => setTimeout(resolve, 500)); // Rate limit

              const axios = (await import('axios')).default;
              const apiKey = process.env.SETLISTFM_API_KEY;

              const response = await axios.get('https://api.setlist.fm/rest/1.0/search/venues', {
                headers: { 'x-api-key': apiKey || '', 'Accept': 'application/json' },
                params: { name: osmVenue.name, p: 1 },
                timeout: 10000,
              });

              const venues = response.data.venue || [];
              const exactMatch = venues.find((v: any) =>
                v.name.toLowerCase() === osmVenue.name.toLowerCase()
              );

              if (exactMatch) {
                console.log(`[getNearbyVenues] ✓ "${osmVenue.name}" exists in setlist.fm`);
                validatedVenues.push(osmVenue);
              } else {
                console.log(`[getNearbyVenues] ✗ "${osmVenue.name}" NOT in setlist.fm - filtering out`);
              }
            } catch (error) {
              // On error, keep the venue (don't filter out due to API issues)
              console.warn(`[getNearbyVenues] Could not validate "${osmVenue.name}":`, error);
              validatedVenues.push(osmVenue);
            }
          }

          console.log(`[getNearbyVenues] ${validatedVenues.length}/${osmVenues.length} venues validated`);

          if (validatedVenues.length === 0) {
            console.log('[getNearbyVenues] No validated venues found');
            return [];
          }

          // STEP 5: Cache validated OSM venues to database for future lookups
          console.log(`[getNearbyVenues] Caching ${validatedVenues.length} validated venues to database...`);

          // Get city/state/country from reverse geocoding
          let geocodeData: any = null;
          try {
            geocodeData = await reverseGeocode(input.latitude, input.longitude);
          } catch (error) {
            console.warn('[getNearbyVenues] Reverse geocode failed, using defaults');
          }

          const cachedVenues = [];
          for (const osmVenue of validatedVenues) {
            try {
              const cached = await db.cacheOSMVenue({
                name: osmVenue.name,
                altName: osmVenue.altName,
                latitude: osmVenue.lat.toString(),
                longitude: osmVenue.lon.toString(),
                city: geocodeData?.city || 'Unknown',
                state: geocodeData?.state,
                country: geocodeData?.country || 'Unknown',
              });
              cachedVenues.push({ ...cached, osmMatchedTag: osmVenue.matchedTag, osmDistance: osmVenue.distance });
            } catch (error) {
              console.error(`[getNearbyVenues] Failed to cache venue "${osmVenue.name}":`, error);
            }
          }

          console.log(`[getNearbyVenues] Successfully cached ${cachedVenues.length}/${validatedVenues.length} venues`);

          // STEP 6: Return the cached venues
          return cachedVenues.map(v => ({
            name: v.name,
            types: [v.osmMatchedTag || 'venue'],
            score: 100 - (v.osmDistance || 0),
            city: v.city,
            state: v.state,
            country: v.country,
            latitude: v.latitude || '',
            longitude: v.longitude || '',
          }));

        } catch (error) {
          console.error('[getNearbyVenues] Error:', error);
          return [];
        }
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

    rescanUnmatchedPhotos: protectedProcedure
      .input(z.object({
        batchSize: z.number().min(10).max(500),
      }))
      .mutation(async ({ input, ctx }) => {
        const { batchSize } = input;
        const userId = ctx.user.id;

        console.log(`[Rescan] Starting rescan of ${batchSize} unmatched photos for user ${userId}...`);

        // Get batch of unmatched photos (ordered by date/location for grouping)
        const photos = await db.getUnmatchedPhotos(userId);
        const photosToRescan = photos.slice(0, batchSize);

        if (photosToRescan.length === 0) {
          return {
            success: true,
            rescannedCount: 0,
            venuesDetected: 0,
            concertsMatched: 0,
            message: 'No unmatched photos to rescan'
          };
        }

        console.log(`[Rescan] Found ${photosToRescan.length} photos to rescan`);

        // Initialize progress tracking
        initScanProgress(userId, photosToRescan.length);

        // Start rescan in background (don't await)
        const rescanStartTime = Date.now();
        const rescanProcess = async () => {

        let venuesDetected = 0;
        let concertsMatched = 0;
        let photoIndex = 0;

        // Process each photo with improved algorithm
        for (const photo of photosToRescan) {
          photoIndex++;

          // Update progress - starting photo
          updateScanProgress(ctx.user.id, {
            currentPhoto: photoIndex,
            currentFileName: photo.fileName,
            currentCity: photo.city || undefined,
            currentState: photo.state || undefined,
            currentCountry: photo.country || undefined,
            currentStatus: 'Re-scanning venue...',
            processed: photoIndex - 1,
            linked: concertsMatched,
            unmatched: venuesDetected
          });

          try {
            // Clear old venue detection data
            await db.updateUnmatchedPhoto(photo.id, {
              venueName: null,
              venueDetectionMethod: null,
              venueConfidence: null
            });

            // Re-run venue detection if photo has GPS
            if (photo.latitude && photo.longitude) {
              const { findBestOSMVenue } = await import("./osmVenueDetection");

              const bestVenue = await findBestOSMVenue(
                photo.latitude,
                photo.longitude,
                photo.city || undefined  // Pass city for setlist.fm validation
              );

              if (bestVenue) {
                // Update with new validated venue
                await db.updateUnmatchedPhoto(photo.id, {
                  venueName: bestVenue.name,
                  venueDetectionMethod: bestVenue.method,
                  venueConfidence: bestVenue.confidence
                });
                venuesDetected++;
                console.log(`[Rescan] ✓ Detected venue for ${photo.fileName}: ${bestVenue.name}`);

                // Update progress - venue detected
                updateScanProgress(ctx.user.id, {
                  currentVenue: bestVenue.name,
                  currentStatus: `Found venue: ${bestVenue.name}`,
                  unmatched: venuesDetected
                });

                // Cache the validated venue
                try {
                  await db.cacheOSMVenue({
                    name: bestVenue.name,
                    latitude: photo.latitude,
                    longitude: photo.longitude,
                    city: photo.city || 'Unknown',
                    state: photo.state,
                    country: photo.country || 'Unknown',
                  });
                } catch (cacheError) {
                  console.warn(`[Rescan] Failed to cache venue:`, cacheError);
                }
              } else {
                console.log(`[Rescan] ✗ No validated venue found for ${photo.fileName}`);
              }

              // Try to auto-match to existing concert
              if (photo.takenAt && photo.latitude && photo.longitude) {
                // Update progress - matching to concert
                updateScanProgress(ctx.user.id, {
                  currentStatus: 'Matching to concert...',
                });

                const userConcerts = await db.getUserConcerts(ctx.user.id);
                const venues = new Map<number, any>();

                // Load venue data
                for (const concert of userConcerts) {
                  if (!venues.has(concert.venueId)) {
                    const venue = await db.getVenueById(concert.venueId);
                    if (venue) venues.set(concert.venueId, venue);
                  }
                }

                // Find matching concert
                for (const concert of userConcerts) {
                  const venue = venues.get(concert.venueId);
                  if (!venue || !venue.latitude || !venue.longitude) continue;

                  const { calculateDistance } = await import('./gpsUtils');
                  const distance = calculateDistance(
                    parseFloat(photo.latitude),
                    parseFloat(photo.longitude),
                    parseFloat(venue.latitude),
                    parseFloat(venue.longitude)
                  );

                  // Match if within 0.373 miles (600m) and same date
                  if (distance <= 0.373) {
                    const photoDate = new Date(photo.takenAt);
                    const concertDate = new Date(concert.concertDate);

                    // Allow 18 hour window for date matching (concerts can run past midnight)
                    const hoursDiff = Math.abs(concertDate.getTime() - photoDate.getTime()) / (1000 * 60 * 60);
                    if (hoursDiff <= 18) {
                      // Auto-link to concert
                      await db.updateUnmatchedPhotoStatus(photo.id, "linked", concert.id);
                      concertsMatched++;
                      console.log(`[Rescan] ✓ Auto-matched ${photo.fileName} to concert #${concert.id}`);

                      // Update progress - concert matched
                      const artist = await db.getArtistById(concert.artistId);
                      updateScanProgress(ctx.user.id, {
                        currentArtist: artist?.name,
                        currentStatus: `Matched to concert!`,
                        linked: concertsMatched
                      });

                      break;
                    }
                  }
                }
              }
            }
          } catch (error) {
            console.error(`[Rescan] Error processing photo ${photo.fileName}:`, error);
            // Continue with next photo
          }
        }

          console.log(`[Rescan] Complete! Rescanned: ${photosToRescan.length}, Venues: ${venuesDetected}, Concerts: ${concertsMatched}`);

          // Save last scan result
          saveLastScanResult(userId, {
            scanType: 'rescan',
            completedAt: new Date(),
            totalPhotos: photosToRescan.length,
            processed: photoIndex,
            linked: concertsMatched,
            skipped: 0,
            newConcerts: 0,
            unmatched: venuesDetected,
            venuesDetected,
            concertsMatched,
            duration: Date.now() - rescanStartTime,
          });

          // Mark scan as complete
          completeScanProgress(userId);
        };

        // Start the background process (don't await - let it run async)
        rescanProcess().catch(err => {
          console.error('[Rescan] Background process error:', err);
          completeScanProgress(userId);
        });

        // Return immediately
        return {
          success: true,
          started: true,
          totalPhotos: photosToRescan.length,
          message: `Started rescanning ${photosToRescan.length} photos in background`
        };
      }),

    getPhotoJsonMetadata: protectedProcedure
      .input(z.object({ fileName: z.string() }))
      .query(async ({ input }) => {
        const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
        if (!folderId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "GOOGLE_DRIVE_FOLDER_ID not configured" });
        }

        const { getFileContent } = await import("./integrations");
        const allFiles = await listPhotosFromDrive(folderId);

        // Find the JSON metadata file for this photo
        const jsonFileName = `${input.fileName}.supplemental-metadata.json`;
        const jsonFile = allFiles.find(f => f.name === jsonFileName);

        if (!jsonFile) {
          return { error: `No JSON metadata file found for ${input.fileName}` };
        }

        try {
          const jsonContent = await getFileContent(jsonFile.id!);
          const jsonData = JSON.parse(jsonContent);
          return {
            fileName: input.fileName,
            jsonFileName: jsonFile.name,
            hasGeoData: !!jsonData.geoData,
            geoData: jsonData.geoData || null,
            photoTakenTime: jsonData.photoTakenTime || null,
            fullJson: jsonData
          };
        } catch (error: any) {
          return { error: `Failed to parse JSON: ${error.message}` };
        }
      }),

    checkSampleExif: protectedProcedure
      .query(async () => {
        const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
        if (!folderId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "GOOGLE_DRIVE_FOLDER_ID not configured" });
        }

        try {
          const files = await listPhotosFromDrive(folderId);
          if (files.length === 0) {
            return { message: "No photos found in folder" };
          }

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
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Failed to check EXIF: ${error.message}` });
        }
      }),
  }),

  logs: router({
    get: protectedProcedure
      .input(z.object({
        limit: z.number().optional().default(100),
        types: z.array(z.enum(['API_CALL', 'DB_READ', 'DB_WRITE', 'EXTERNAL_API', 'ERROR'])).optional()
      }))
      .query(({ input }) => {
        const allLogs = getLogs(undefined, undefined); // Get ALL logs first
        const typeCounts = {
          API_CALL: allLogs.filter(l => l.type === 'API_CALL').length,
          DB_READ: allLogs.filter(l => l.type === 'DB_READ').length,
          DB_WRITE: allLogs.filter(l => l.type === 'DB_WRITE').length,
          EXTERNAL_API: allLogs.filter(l => l.type === 'EXTERNAL_API').length,
          ERROR: allLogs.filter(l => l.type === 'ERROR').length,
        };
        console.log(`[logs.get] Total logs in memory: ${allLogs.length}`, typeCounts);

        const categories = Array.from(new Set(allLogs.map(l => l.category)));
        console.log(`[logs.get] Categories:`, categories);

        const filtered = getLogs(input.limit, input.types as LogType[] | undefined);
        const filteredTypeCounts = {
          API_CALL: filtered.filter(l => l.type === 'API_CALL').length,
          DB_READ: filtered.filter(l => l.type === 'DB_READ').length,
          DB_WRITE: filtered.filter(l => l.type === 'DB_WRITE').length,
          EXTERNAL_API: filtered.filter(l => l.type === 'EXTERNAL_API').length,
          ERROR: filtered.filter(l => l.type === 'ERROR').length,
        };
        console.log(`[logs.get] After filtering (limit=${input.limit}, types=${input.types}): ${filtered.length} logs`, filteredTypeCounts);
        return filtered;
      }),

    stats: protectedProcedure.query(() => {
      return getLogStats();
    }),

    clear: protectedProcedure.mutation(() => {
      clearLogs();
      return { success: true };
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
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Failed to fetch image: ${error.message}` });
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