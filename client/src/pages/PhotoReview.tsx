import { useState, useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { formatDateForInput, formatDateForInputLocal } from "@/lib/dateUtils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ArrowLeft, Check, X, MapPin, Calendar, Image as ImageIcon, RefreshCw, AlertCircle, History, Music, Loader2 } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";
import { format } from "date-fns";
import { GlobalScanIndicator } from "@/components/GlobalScanIndicator";

export default function PhotoReview() {
  const { user, loading: authLoading } = useAuth();
  const [selectedConcertId, setSelectedConcertId] = useState<string>("");
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [venueDropdownOpen, setVenueDropdownOpen] = useState(false);
  const [venueInputValue, setVenueInputValue] = useState("");
  const [venuePopoverOpen, setVenuePopoverOpen] = useState(false);
  const [artistSearchValue, setArtistSearchValue] = useState("");
  const [searchError, setSearchError] = useState<string | null>(null);
  const [rescanBatchSize, setRescanBatchSize] = useState<number>(50);
  const [rescanInProgress, setRescanInProgress] = useState(false);
  const [showLastScanDialog, setShowLastScanDialog] = useState(false);

  // Fetch unmatched photos
  const { data: unmatchedPhotos, isLoading: photosLoading, refetch } = trpc.photos.getUnmatched.useQuery(
    undefined,
    { enabled: !!user }
  );

  // Poll for rescan progress
  const { data: rescanProgress } = trpc.photos.getScanProgress.useQuery(
    undefined,
    { enabled: rescanInProgress, refetchInterval: 500 }
  );

  // Get last scan result
  const { data: lastScanResult } = trpc.photos.getLastScanResult.useQuery(
    undefined,
    { enabled: !!user }
  );

  // Stop polling when rescan is complete
  useEffect(() => {
    if (rescanProgress && !rescanProgress.isScanning && rescanInProgress) {
      setRescanInProgress(false);
      // Refetch unmatched photos after scan completes
      refetch();
      toast.success('Rescan complete!', {
        description: `Processed ${rescanProgress.processed} photos, detected ${rescanProgress.unmatched} venues, matched ${rescanProgress.linked} concerts`,
      });
    }
  }, [rescanProgress, rescanInProgress, refetch]);

  const currentPhoto = unmatchedPhotos?.[currentPhotoIndex];

  // Reset venue dropdown state and search error when photo changes
  useEffect(() => {
    setVenueDropdownOpen(false);
    setSearchError(null);
  }, [currentPhotoIndex]);
  
  // Extract file ID from Google Drive URL
  const extractFileId = (url: string): string | null => {
    const match = url.match(/[?&]id=([^&]+)/);
    return match ? match[1] : null;
  };
  
  // Get proxied image data
  const fileId = currentPhoto ? extractFileId(currentPhoto.sourceUrl) : null;
  const { data: imageData } = trpc.driveProxy.getImage.useQuery(
    { fileId: fileId! },
    { enabled: !!fileId }
  );

  // Fetch user's concerts for linking
  const { data: concerts } = trpc.concerts.list.useQuery(
    undefined,
    { enabled: !!user }
  );

  const utils = trpc.useUtils();

  const [bulkLinkDialog, setBulkLinkDialog] = useState<{
    open: boolean;
    similarCount: number;
    photoDate: Date | null;
    photoLocation: string | null;
    latitude: string | null;
    longitude: string | null;
    concertId: number;
  }>({ open: false, similarCount: 0, photoDate: null, photoLocation: null, latitude: null, longitude: null, concertId: 0 });

  // Link photo mutation
  const linkPhoto = trpc.photos.linkToExisting.useMutation({
    onSuccess: (data) => {
      toast.success("Photo linked to concert!");
      
      // Show bulk link dialog if there are similar photos
      if (data.similarPhotosCount > 0 && data.photoDate && currentPhoto?.latitude && currentPhoto?.longitude) {
        setBulkLinkDialog({
          open: true,
          similarCount: data.similarPhotosCount,
          photoDate: data.photoDate,
          photoLocation: data.photoLocation || null,
          latitude: currentPhoto.latitude,
          longitude: currentPhoto.longitude,
          concertId: parseInt(selectedConcertId),
        });
      } else {
        // No similar photos, just refetch
        refetch();
        utils.concerts.list.invalidate();
      }
    },
    onError: (error) => {
      toast.error(`Failed to link photo: ${error.message}`);
    },
  });

  // Skip photo mutation
  const skipPhoto = trpc.photos.skipPhoto.useMutation({
    onSuccess: () => {
      toast.success("Photo skipped");
      refetch();
    },
    onError: (error) => {
      toast.error(`Failed to skip photo: ${error.message}`);
    },
  });

  // Skip all from event mutation
  const skipAllFromEvent = trpc.photos.skipAllFromEvent.useMutation({
    onSuccess: (data) => {
      toast.success(`Skipped ${data.skippedCount} photo${data.skippedCount !== 1 ? 's' : ''} from this event`);
      refetch();
    },
    onError: (error) => {
      toast.error(`Failed to skip photos: ${error.message}`);
    },
  });

  // Rescan unmatched photos mutation
  const rescanPhotos = trpc.photos.rescanUnmatchedPhotos.useMutation({
    onSuccess: (data) => {
      // Don't set rescanInProgress to false - keep polling until scan completes
      toast.success(data.message || `Rescan started for ${data.totalPhotos} photos`, {
        description: 'Progress will update below',
      });
    },
    onError: (error) => {
      setRescanInProgress(false);
      toast.error(`Rescan failed: ${error.message}`);
    },
  });

  // Bulk link mutation
  const bulkLinkPhotos = trpc.photos.bulkLinkSimilar.useMutation({
    onSuccess: (data) => {
      toast.success(`Linked ${data.linkedCount} photos to concert!`);
      setBulkLinkDialog({ ...bulkLinkDialog, open: false });
      refetch();
      utils.concerts.list.invalidate();
    },
    onError: (error) => {
      toast.error(`Failed to bulk link photos: ${error.message}`);
    },
  });

  // Venue override mutation
  const overrideVenue = trpc.photos.overrideVenue.useMutation({
    onSuccess: () => {
      toast.success("Venue updated!");
      refetch();
    },
    onError: (error) => {
      toast.error(`Failed to update venue: ${error.message}`);
    },
  });
  
  // Search concerts mutation
  const searchConcerts = trpc.photos.searchConcertsForPhoto.useMutation({
    onSuccess: (data) => {
      setSearchError(null); // Clear previous errors
      if (data.found && data.concertCreated && data.suggestions.length > 0) {
        const suggestion = data.suggestions[0];
        toast.success(`Concert created and photo linked: ${suggestion.artist} at ${suggestion.venue}!`);
        // Refresh both unmatched photos and concerts list
        refetch();
        utils.concerts.list.invalidate();
      } else if (data.found && data.suggestions.length > 0) {
        const suggestion = data.suggestions[0];
        toast.success(`Found concert: ${suggestion.artist} at ${suggestion.venue}!`);
        refetch();
      } else {
        const errorMsg = `No matching concerts found for ${currentPhoto?.venueName || 'this venue'} on ${currentPhoto?.takenAt ? format(new Date(currentPhoto.takenAt), 'PP') : 'this date'}`;
        setSearchError(errorMsg);
        toast.info(errorMsg);
      }
    },
    onError: (error) => {
      const errorMsg = `Search failed: ${error.message}`;
      setSearchError(errorMsg);
      toast.error(errorMsg);
    },
  });
  
  // Handle venue change from dropdown
  const handleVenueChange = (venueName: string) => {
    if (!currentPhoto) return;
    
    // Update venue
    overrideVenue.mutate({
      photoId: currentPhoto.id,
      venueName,
    });
    
    // Trigger concert search with new venue
    searchConcerts.mutate({
      photoId: currentPhoto.id,
      venueName,
    });
  };

  // Get nearby venues for override dropdown (only when dropdown is opened)
  const { data: nearbyVenues } = trpc.photos.getNearbyVenues.useQuery(
    { 
      latitude: currentPhoto?.latitude || "",
      longitude: currentPhoto?.longitude || ""
    },
    { 
      enabled: venueDropdownOpen && !!currentPhoto?.latitude && !!currentPhoto?.longitude,
      staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    }
  );

  // Create concert from photo dialog state
  const [createConcertDialog, setCreateConcertDialog] = useState(false);
  const [concertForm, setConcertForm] = useState({
    artistName: "",
    venueName: "",
    concertDate: "",
  });

  // Create concert from photo mutation
  const createConcertFromPhoto = trpc.photos.createConcertFromPhoto.useMutation({
    onSuccess: (data) => {
      toast.success("Concert created and photo linked!");
      setCreateConcertDialog(false);

      // Show bulk link dialog if there are similar photos
      if (data.similarPhotosCount > 0 && data.photoDate && currentPhoto?.latitude && currentPhoto?.longitude) {
        setBulkLinkDialog({
          open: true,
          similarCount: data.similarPhotosCount,
          photoDate: data.photoDate,
          photoLocation: data.photoLocation || null,
          latitude: currentPhoto.latitude,
          longitude: currentPhoto.longitude,
          concertId: data.concertId,
        });
      } else {
        // No similar photos, just refetch
        refetch();
        utils.concerts.list.invalidate();
      }
    },
    onError: (error) => {
      toast.error(`Failed to create concert: ${error.message}`);
    },
  });

  // Open create concert dialog with pre-filled data
  const handleOpenCreateConcert = () => {
    if (!currentPhoto) return;
    
    setConcertForm({
      artistName: "",
      venueName: currentPhoto.venueName || "",
      concertDate: currentPhoto.takenAt 
        ? formatDateForInputLocal(currentPhoto.takenAt)
        : currentPhoto.fileCreatedAt
        ? formatDateForInputLocal(currentPhoto.fileCreatedAt)
        : "",
    });
    setCreateConcertDialog(true);
  };

  // Submit create concert form
  const handleCreateConcert = () => {
    if (!currentPhoto) return;
    
    // Count how many fields are filled
    const filledFields = [
      concertForm.artistName,
      concertForm.venueName,
      concertForm.concertDate
    ].filter(Boolean).length;
    
    if (filledFields < 2) {
      toast.error("Please fill in at least 2 of 3 fields (artist, venue, or date)");
      return;
    }

    createConcertFromPhoto.mutate({
      photoId: currentPhoto.id,
      artistName: concertForm.artistName || undefined,
      venueName: concertForm.venueName || undefined,
      city: currentPhoto.city || "Unknown",
      state: currentPhoto.state || undefined,
      country: currentPhoto.country || "Unknown",
      concertDate: concertForm.concertDate ? new Date(concertForm.concertDate) : undefined,
      latitude: currentPhoto.latitude || undefined,
      longitude: currentPhoto.longitude || undefined,
    });
  };

  // Handle artist search
  const handleArtistSearch = async () => {
    if (!currentPhoto || !artistSearchValue) return;

    setSearchError(null);

    try {
      const result = await searchConcerts.mutateAsync({
        photoId: currentPhoto.id,
        artistName: artistSearchValue,
      });

      if (result.found && result.suggestions && result.suggestions.length > 0) {
        const suggestion = result.suggestions[0];

        toast.success(`Found concert!`, {
          description: `${suggestion.artist} at ${suggestion.venue}${suggestion.date ? ` on ${format(new Date(suggestion.date), 'MMM d, yyyy')}` : ''}`,
        });

        // Pre-fill the create concert dialog
        setConcertForm({
          artistName: suggestion.artist,
          venueName: suggestion.venue,
          concertDate: suggestion.date ? format(new Date(suggestion.date), 'yyyy-MM-dd') : '',
        });
        setCreateConcertDialog(true);
      } else {
        toast.info(`No concerts found`, {
          description: `No setlists found for ${artistSearchValue} on this date. You can manually create the concert.`,
        });
      }
    } catch (error: any) {
      setSearchError(error.message);
      toast.error('Search failed', {
        description: error.message,
      });
    }
  };

  const loading = authLoading || photosLoading;

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-8 pb-24">
        <div className="max-w-4xl mx-auto space-y-6">
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4 pb-24">
        <Card>
          <CardHeader>
            <CardTitle>Authentication Required</CardTitle>
            <CardDescription>Please log in to review photos</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (!unmatchedPhotos || unmatchedPhotos.length === 0) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-8 pb-24">
        <div className="max-w-4xl mx-auto">
          <Link href="/">
            <Button variant="ghost" className="mb-6">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Button>
          </Link>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ImageIcon className="h-6 w-6" />
                Photo Review
              </CardTitle>
              <CardDescription>
                No unmatched photos to review! All your photos have been linked to concerts.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <>
    <div className="min-h-screen bg-background p-4 md:p-8 pb-24">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <Link href="/">
              <Button variant="ghost" className="mb-2">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Dashboard
              </Button>
            </Link>
            <h1 className="text-3xl font-bold text-foreground">Review Unmatched Photos</h1>
            <p className="text-muted-foreground mt-1">
              {unmatchedPhotos.length} photo{unmatchedPhotos.length !== 1 ? "s" : ""} waiting for review
            </p>
          </div>
          {lastScanResult && lastScanResult.scanType === 'rescan' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowLastScanDialog(true)}
            >
              <History className="h-4 w-4 mr-2" />
              Last Re-scan Results
            </Button>
          )}
        </div>

        {/* Re-scan Tool */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5" />
              Re-scan Unmatched Photos
            </CardTitle>
            <CardDescription>
              Re-scan photos with improved venue detection algorithm (validates against setlist.fm, prioritizes distance). This does NOT re-scan Google Drive - only processes photos already in your database.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-end gap-4">
              <div className="flex-1 max-w-xs">
                <Label htmlFor="batch-size">Batch Size</Label>
                <Select
                  value={rescanBatchSize.toString()}
                  onValueChange={(value) => setRescanBatchSize(parseInt(value))}
                  disabled={rescanInProgress}
                >
                  <SelectTrigger id="batch-size" className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10 photos</SelectItem>
                    <SelectItem value="25">25 photos</SelectItem>
                    <SelectItem value="50">50 photos</SelectItem>
                    <SelectItem value="100">100 photos</SelectItem>
                    <SelectItem value="250">250 photos</SelectItem>
                    <SelectItem value="500">500 photos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={() => {
                  setRescanInProgress(true);
                  rescanPhotos.mutate({ batchSize: rescanBatchSize });
                }}
                disabled={rescanInProgress || unmatchedPhotos.length === 0}
              >
                {rescanInProgress ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Rescanning...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Re-scan Photos
                  </>
                )}
              </Button>
            </div>

            {/* Progress Bar */}
            {rescanInProgress && rescanProgress && (
              <div className="space-y-3 pt-2 border-t">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">
                    Processing: {rescanProgress.currentPhoto} of {rescanProgress.totalPhotos}
                  </span>
                  <span className="text-muted-foreground">
                    {Math.round((rescanProgress.currentPhoto / rescanProgress.totalPhotos) * 100)}%
                  </span>
                </div>
                <Progress
                  value={(rescanProgress.currentPhoto / rescanProgress.totalPhotos) * 100}
                  className="h-2"
                />

                {/* Current File Info */}
                <div className="space-y-1 text-xs text-muted-foreground">
                  {rescanProgress.currentFileName && (
                    <div className="flex items-center gap-2">
                      <ImageIcon className="h-3 w-3" />
                      <span className="font-mono">{rescanProgress.currentFileName}</span>
                    </div>
                  )}
                  {rescanProgress.currentStatus && (
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{rescanProgress.currentStatus}</span>
                    </div>
                  )}
                  {(rescanProgress.currentCity || rescanProgress.currentVenue) && (
                    <div className="flex items-center gap-2">
                      <MapPin className="h-3 w-3" />
                      <span>
                        {[rescanProgress.currentVenue, rescanProgress.currentCity, rescanProgress.currentState]
                          .filter(Boolean)
                          .join(", ")}
                      </span>
                    </div>
                  )}
                  {rescanProgress.currentArtist && (
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">Artist: {rescanProgress.currentArtist}</span>
                    </div>
                  )}
                </div>

                {/* Stats */}
                <div className="flex gap-4 text-xs pt-2">
                  <div className="flex items-center gap-1">
                    <Badge variant="secondary" className="text-xs">
                      {rescanProgress.unmatched || 0} venues detected
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1">
                    <Badge variant="default" className="text-xs">
                      {rescanProgress.linked || 0} concerts matched
                    </Badge>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Current Photo Card */}
        {currentPhoto && (
          <Card>
            <CardHeader>
              <CardTitle>{currentPhoto.fileName}</CardTitle>
              <CardDescription>
                Review this photo and link it to a concert or skip it
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Photo Display */}
              <div className="relative aspect-video bg-muted rounded-lg overflow-hidden">
                {imageData?.dataUrl ? (
                  <img
                    src={imageData.dataUrl}
                    alt={currentPhoto.fileName}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center text-muted-foreground">
                      <ImageIcon className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p>Loading image...</p>
                    </div>
                  </div>
                )}
                {currentPhoto.fileName.toLowerCase().endsWith('.dng') && (
                  <div className="absolute top-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                    DNG Preview
                  </div>
                )}
              </div>

              {/* EXIF Data */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <h3 className="font-semibold text-sm text-muted-foreground">Photo Information</h3>
                  
                  {currentPhoto.takenAt && (
                    <div className="flex items-center gap-2 text-sm">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">EXIF Date:</span>
                      <span>{format(new Date(currentPhoto.takenAt), "PPP p")}</span>
                    </div>
                  )}
                  
                  {currentPhoto.fileCreatedAt && !currentPhoto.takenAt && (
                    <div className="flex items-center gap-2 text-sm">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">File Created:</span>
                      <span>{format(new Date(currentPhoto.fileCreatedAt), "PPP p")}</span>
                      <Badge variant="secondary">Fallback</Badge>
                    </div>
                  )}

                  {currentPhoto.latitude && currentPhoto.longitude && (
                    <div className="flex items-center gap-2 text-sm">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">GPS:</span>
                      <span className="font-mono text-xs">
                        {parseFloat(currentPhoto.latitude).toFixed(4)}, {parseFloat(currentPhoto.longitude).toFixed(4)}
                      </span>
                      {(parseFloat(currentPhoto.latitude) === 0 && parseFloat(currentPhoto.longitude) === 0) && (
                        <Badge variant="destructive" className="text-xs">No GPS data in EXIF or JSON</Badge>
                      )}
                    </div>
                  )}
                  
                  {(currentPhoto.city || currentPhoto.state || currentPhoto.country) && (
                    <div className="flex items-center gap-2 text-sm">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">Location:</span>
                      <span>
                        {[currentPhoto.city, currentPhoto.state, currentPhoto.country]
                          .filter(Boolean)
                          .join(", ")}
                      </span>
                    </div>
                  )}

                  {/* Artist Search Section */}
                  <div className="space-y-2 pt-4 border-t">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Music className="h-4 w-4 text-muted-foreground" />
                      <span>Search by Artist</span>
                    </div>
                    <div className="flex gap-2 ml-6">
                      <Input
                        placeholder="Type artist name (e.g., Phish, Dead & Company)..."
                        value={artistSearchValue}
                        onChange={(e) => setArtistSearchValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && artistSearchValue) {
                            handleArtistSearch();
                          }
                        }}
                        className="text-sm"
                      />
                      <Button
                        size="sm"
                        onClick={handleArtistSearch}
                        disabled={!artistSearchValue || searchConcerts.isPending}
                      >
                        {searchConcerts.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          "Search"
                        )}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground ml-6">
                      {currentPhoto.takenAt
                        ? `Searches setlist.fm for concerts on ${format(new Date(currentPhoto.takenAt), 'MMM d, yyyy')}`
                        : 'Add a date to this photo to enable artist search'}
                    </p>
                  </div>

                  {(currentPhoto.latitude && currentPhoto.longitude) && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm">
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">Venue:</span>
                        {currentPhoto.venueName ? (
                          <>
                            <span>{currentPhoto.venueName}</span>
                            {currentPhoto.venueConfidence && (
                              <Badge 
                                variant={currentPhoto.venueConfidence === 'high' ? 'default' : currentPhoto.venueConfidence === 'medium' ? 'secondary' : 'outline'}
                                className="text-xs"
                              >
                                {currentPhoto.venueConfidence === 'high' && '✓ High'}
                                {currentPhoto.venueConfidence === 'medium' && '~ Medium'}
                                {currentPhoto.venueConfidence === 'low' && '? Low'}
                              </Badge>
                            )}
                          </>
                        ) : (
                          <span className="text-muted-foreground">Not detected</span>
                        )}
                      </div>
                      {currentPhoto.venueDetectionMethod && (
                        <div className="text-xs text-muted-foreground ml-6">
                          {currentPhoto.venueDetectionMethod === 'type_match' && 'Matched by venue type'}
                          {currentPhoto.venueDetectionMethod === 'name_match' && 'Matched by venue name'}
                          {currentPhoto.venueDetectionMethod === 'tourist_attraction' && 'Tourist attraction'}
                          {currentPhoto.venueDetectionMethod === 'closest_place' && 'Closest place'}
                          {currentPhoto.venueDetectionMethod === 'manual_override' && 'Manually set'}
                        </div>
                      )}
                      <div className="ml-6 mt-1 space-y-2">
                        {/* Manual venue input */}
                        <div className="flex gap-2">
                          <Input
                            placeholder="Or type venue name manually..."
                            value={venueInputValue}
                            onChange={(e) => setVenueInputValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && venueInputValue) {
                                handleVenueChange(venueInputValue);
                                setVenueInputValue("");
                              }
                            }}
                            className="text-xs h-8"
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              if (venueInputValue) {
                                handleVenueChange(venueInputValue);
                                setVenueInputValue("");
                              }
                            }}
                            disabled={!venueInputValue || overrideVenue.isPending}
                            className="h-8"
                          >
                            {overrideVenue.isPending ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              "Use"
                            )}
                          </Button>
                        </div>

                        {/* Nearby venues dropdown */}
                        <Select
                          onOpenChange={setVenueDropdownOpen}
                          onValueChange={(value) => {
                            if (value) {
                              handleVenueChange(value);
                            }
                          }}
                          disabled={overrideVenue.isPending || searchConcerts.isPending}
                        >
                          <SelectTrigger className="h-8 text-xs w-full">
                            <SelectValue placeholder="Or select from nearby venues..." />
                          </SelectTrigger>
                          <SelectContent>
                            {nearbyVenues && nearbyVenues.length > 0 ? (
                              nearbyVenues.map((venue: { name: string; types: string[]; distance?: number }, idx: number) => (
                                <SelectItem key={idx} value={venue.name}>
                                  <div className="flex items-center justify-between w-full gap-2">
                                    <span>{venue.name}</span>
                                    {venue.distance !== undefined && (
                                      <span className="text-xs text-muted-foreground">{venue.distance}m</span>
                                    )}
                                  </div>
                                </SelectItem>
                              ))
                            ) : (
                              <div className="p-2 text-xs text-muted-foreground">
                                {venueDropdownOpen ? "Loading venues..." : "Open to load venues"}
                              </div>
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}

                  {!currentPhoto.latitude && !currentPhoto.longitude && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <MapPin className="h-4 w-4" />
                      <span>No GPS data available</span>
                    </div>
                  )}

                  {/* Retry Match Button and Error Display */}
                  {currentPhoto.venueName && currentPhoto.takenAt && (
                    <div className="space-y-2 pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          searchConcerts.mutate({
                            photoId: currentPhoto.id,
                            venueName: currentPhoto.venueName || undefined,
                          });
                        }}
                        disabled={searchConcerts.isPending}
                        className="w-full"
                      >
                        <RefreshCw className={`h-4 w-4 mr-2 ${searchConcerts.isPending ? 'animate-spin' : ''}`} />
                        {searchConcerts.isPending ? 'Searching Setlist.fm...' : 'Retry Setlist.fm Match'}
                      </Button>

                      {searchError && (
                        <Alert variant="destructive" className="text-xs">
                          <AlertCircle className="h-4 w-4" />
                          <AlertDescription>{searchError}</AlertDescription>
                        </Alert>
                      )}
                    </div>
                  )}
                </div>

                {/* Link to Concert */}
                <div className="space-y-2">
                  <h3 className="font-semibold text-sm text-muted-foreground">Link to Concert</h3>
                  
                  <Select value={selectedConcertId} onValueChange={setSelectedConcertId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a concert..." />
                    </SelectTrigger>
                    <SelectContent>
                      {concerts?.map((concert) => (
                        <SelectItem key={concert.id} value={concert.id.toString()}>
                          {concert.artist?.name} - {concert.venue?.name} ({format(new Date(concert.concertDate), "PP")})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <div className="flex gap-2 pt-2">
                    <Button
                      onClick={() => {
                        if (!selectedConcertId) {
                          toast.error("Please select a concert first");
                          return;
                        }
                        linkPhoto.mutate({
                          photoId: currentPhoto.id,
                          concertId: parseInt(selectedConcertId),
                        });
                      }}
                      disabled={!selectedConcertId || linkPhoto.isPending}
                      className="flex-1"
                    >
                      <Check className="h-4 w-4 mr-2" />
                      Link to Concert
                    </Button>

                    <Button
                      variant="outline"
                      onClick={() => skipPhoto.mutate({ photoId: currentPhoto.id })}
                      disabled={skipPhoto.isPending}
                    >
                      <X className="h-4 w-4 mr-2" />
                      Skip
                    </Button>
                  </div>

                  {currentPhoto.takenAt && currentPhoto.latitude && currentPhoto.longitude && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => skipAllFromEvent.mutate({ photoId: currentPhoto.id })}
                      disabled={skipAllFromEvent.isPending}
                      className="w-full mt-2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-4 w-4 mr-2" />
                      Skip All from This Event
                    </Button>
                  )}

                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleOpenCreateConcert}
                    className="w-full mt-2"
                  >
                    Create Concert from Photo
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>

    {/* Bulk Link Confirmation Dialog */}
    {bulkLinkDialog.open && (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Link Similar Photos?</CardTitle>
            <CardDescription>
              Found {bulkLinkDialog.similarCount} more photo{bulkLinkDialog.similarCount > 1 ? 's' : ''} from the same date and location{bulkLinkDialog.photoLocation && ` (${bulkLinkDialog.photoLocation})`}.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Would you like to link all {bulkLinkDialog.similarCount} photo{bulkLinkDialog.similarCount > 1 ? 's' : ''} to this concert?
            </p>
            <div className="flex gap-2">
              <Button
                onClick={() => {
                  if (bulkLinkDialog.photoDate && bulkLinkDialog.latitude && bulkLinkDialog.longitude) {
                    bulkLinkPhotos.mutate({
                      photoDate: bulkLinkDialog.photoDate,
                      latitude: bulkLinkDialog.latitude,
                      longitude: bulkLinkDialog.longitude,
                      concertId: bulkLinkDialog.concertId,
                    });
                  }
                }}
                disabled={bulkLinkPhotos.isPending}
                className="flex-1"
              >
                Yes, Link All
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setBulkLinkDialog({ ...bulkLinkDialog, open: false });
                  refetch();
                  utils.concerts.list.invalidate();
                }}
                disabled={bulkLinkPhotos.isPending}
                className="flex-1"
              >
                No, Just This One
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )}

    {/* Create Concert Dialog */}
    <Dialog open={createConcertDialog} onOpenChange={setCreateConcertDialog}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Concert from Photo</DialogTitle>
          <DialogDescription>
            Create a new concert using this photo's information
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="artistName">Artist Name *</Label>
            <Input
              id="artistName"
              value={concertForm.artistName}
              onChange={(e) => setConcertForm({ ...concertForm, artistName: e.target.value })}
              placeholder="Enter artist name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="venueName">Venue Name *</Label>
            <Input
              id="venueName"
              value={concertForm.venueName}
              onChange={(e) => setConcertForm({ ...concertForm, venueName: e.target.value })}
              placeholder="Enter venue name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="concertDate">Concert Date *</Label>
            <Input
              id="concertDate"
              type="date"
              value={concertForm.concertDate}
              onChange={(e) => setConcertForm({ ...concertForm, concertDate: e.target.value })}
            />
          </div>
          {currentPhoto && (
            <div className="text-xs text-muted-foreground space-y-1">
              <p>Location: {[currentPhoto.city, currentPhoto.state, currentPhoto.country].filter(Boolean).join(", ") || "Unknown"}</p>
              {currentPhoto.latitude && currentPhoto.longitude && (
                <p>GPS: {parseFloat(currentPhoto.latitude).toFixed(4)}, {parseFloat(currentPhoto.longitude).toFixed(4)}</p>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setCreateConcertDialog(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreateConcert} disabled={createConcertFromPhoto.isPending}>
            Create Concert
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Last Rescan Result Dialog */}
    <Dialog open={showLastScanDialog} onOpenChange={setShowLastScanDialog}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Last Re-scan Results</DialogTitle>
          <DialogDescription>
            {lastScanResult && (
              <>
                Re-scan completed on {new Date(lastScanResult.completedAt).toLocaleString()}
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {lastScanResult && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Photos Rescanned</p>
                <p className="text-2xl font-bold">{lastScanResult.totalPhotos}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Duration</p>
                <p className="text-2xl font-bold">{Math.round(lastScanResult.duration / 1000)}s</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <Card>
                <CardContent className="pt-4 pb-3 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Venues Detected</p>
                  <p className="text-xl font-semibold text-blue-600">{lastScanResult.venuesDetected || 0}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-3 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Auto-Matched</p>
                  <p className="text-xl font-semibold text-green-600">{lastScanResult.concertsMatched || 0}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-3 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Still Unmatched</p>
                  <p className="text-xl font-semibold text-orange-600">
                    {lastScanResult.totalPhotos - (lastScanResult.concertsMatched || 0)}
                  </p>
                </CardContent>
              </Card>
            </div>

            {(lastScanResult.venuesDetected || 0) > 0 && (lastScanResult.concertsMatched || 0) === 0 && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <p className="font-medium mb-1">Venues were detected but no concerts were auto-matched.</p>
                  <p className="text-sm">This means the photos now have venue information, but they don't match existing concerts in your library. You can:</p>
                  <ul className="text-sm mt-2 ml-4 list-disc space-y-1">
                    <li>Manually link them to existing concerts</li>
                    <li>Create new concerts from these photos</li>
                    <li>The venues are now cached and will appear in dropdowns</li>
                  </ul>
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        <Button onClick={() => setShowLastScanDialog(false)} className="w-full">
          Close
        </Button>
      </DialogContent>
    </Dialog>

    {/* Global scan indicator */}
    <GlobalScanIndicator />
  </>
  );
}
