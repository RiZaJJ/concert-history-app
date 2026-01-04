import { useState, useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { formatDateForInput, formatDateForInputLocal } from "@/lib/dateUtils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Check, X, MapPin, Calendar, Image as ImageIcon } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";
import { format } from "date-fns";

export default function PhotoReview() {
  const { user, loading: authLoading } = useAuth();
  const [selectedConcertId, setSelectedConcertId] = useState<string>("");
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [venueDropdownOpen, setVenueDropdownOpen] = useState(false);

  // Fetch unmatched photos
  const { data: unmatchedPhotos, isLoading: photosLoading, refetch } = trpc.photos.getUnmatched.useQuery(
    undefined,
    { enabled: !!user }
  );
  
  const currentPhoto = unmatchedPhotos?.[currentPhotoIndex];
  
  // Reset venue dropdown state when photo changes
  useEffect(() => {
    setVenueDropdownOpen(false);
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
      if (data.found && data.suggestions.length > 0) {
        const suggestion = data.suggestions[0];
        toast.success(`Found concert: ${suggestion.artist} at ${suggestion.venue}!`);
        // Refresh concert suggestions with new venue
        refetch();
      } else {
        toast.info("No matching concerts found for this venue and date");
      }
    },
    onError: (error) => {
      toast.error(`Search failed: ${error.message}`);
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
    onSuccess: () => {
      toast.success("Concert created and photo linked!");
      setCreateConcertDialog(false);
      refetch();
      utils.concerts.list.invalidate();
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

  const loading = authLoading || photosLoading;

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-8">
        <div className="max-w-4xl mx-auto space-y-6">
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
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
      <div className="min-h-screen bg-background p-4 md:p-8">
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
    <div className="min-h-screen bg-background p-4 md:p-8">
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
        </div>

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
                      <div className="ml-6 mt-1">
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
                            <SelectValue placeholder="Select venue..." />
                          </SelectTrigger>
                          <SelectContent>
                            {nearbyVenues && nearbyVenues.length > 0 ? (
                              nearbyVenues.map((venue: { name: string; types: string[] }, idx: number) => (
                                <SelectItem key={idx} value={venue.name}>
                                  {venue.name}
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
  </>
  );
}
