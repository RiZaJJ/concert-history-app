import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { formatDateForInput, parseDateStringToNoonUTC } from "@/lib/dateUtils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { 
  ArrowLeft, 
  Calendar, 
  MapPin, 
  Thermometer, 
  Music, 
  Star,
  Image as ImageIcon,
  CheckSquare,
  Square,
  Edit,
  Info
} from "lucide-react";
import { toast } from "sonner";
import { VenueDropdown } from "@/components/VenueDropdown";

export default function ConcertDetail() {
  const [, params] = useRoute("/concert/:id");
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [selectedPhotoMetadata, setSelectedPhotoMetadata] = useState<any | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<Set<number>>(new Set());
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showMergeDialog, setShowMergeDialog] = useState(false);
  const [selectedTargetConcertId, setSelectedTargetConcertId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({
    artistName: "",
    venueName: "",
    city: "",
    state: "",
    country: "",
    concertDate: "",
    refreshSetlist: false,
  });
  
  // Helper to get photo URL (use proxy for Google Drive photos)
  const getPhotoUrl = (photo: any) => {
    // If photo is starred and uploaded to S3, use S3 URL
    if (photo.s3Url) {
      return photo.s3Url;
    }
    // For Google Drive photos, use proxy endpoint
    if (photo.sourceUrl && photo.sourceUrl.includes('drive.google.com')) {
      // Extract file ID from Google Drive URL - handle both formats:
      // 1. https://drive.google.com/uc?export=view&id=FILE_ID
      // 2. https://drive.google.com/file/d/FILE_ID/view
      let fileId = null;
      
      // Try format 1: ?id=FILE_ID
      const idMatch = photo.sourceUrl.match(/[?&]id=([^&]+)/);
      if (idMatch) {
        fileId = idMatch[1];
      } else {
        // Try format 2: /file/d/FILE_ID/
        const fileMatch = photo.sourceUrl.match(/\/file\/d\/([^\/]+)/);
        if (fileMatch) {
          fileId = fileMatch[1];
        }
      }
      
      if (fileId) {
        return `/api/drive-image/${fileId}`;
      }
    }
    // Fallback to source URL
    return photo.sourceUrl;
  };

  const concertId = params?.id ? parseInt(params.id) : null;

  // Fetch concert details
  const { data: concert, isLoading } = trpc.concerts.getById.useQuery(
    { id: concertId! },
    { enabled: !!concertId && !!user }
  );

  // Fetch photos
  const { data: photos } = trpc.photos.getByConcert.useQuery(
    { concertId: concertId! },
    { enabled: !!concertId && !!user }
  );

  // Toggle star mutation
  const utils = trpc.useUtils();
  const toggleStar = trpc.photos.toggleStar.useMutation({
    onSuccess: () => {
      utils.photos.getByConcert.invalidate({ concertId: concertId! });
      utils.concerts.getById.invalidate({ id: concertId! });
      utils.concerts.list.invalidate();
      toast.success("Photo updated");
    },
    onError: (error) => {
      toast.error(`Failed to update photo: ${error.message}`);
    },
  });
  
  const updateConcertVenue = trpc.concerts.updateVenue.useMutation({
    onSuccess: () => {
      toast.success("Venue updated for all concert photos");
      utils.concerts.getById.invalidate({ id: concert!.id });
      setSelectedPhotoMetadata(null);
    },
    onError: (error) => {
      toast.error("Failed to update venue: " + error.message);
    },
  });
  
  const deleteConcert = trpc.concerts.delete.useMutation({
    onSuccess: () => {
      toast.success("Concert deleted");
      setLocation("/");
    },
    onError: (error) => {
      toast.error(`Failed to delete concert: ${error.message}`);
    },
  });
  
  const mergeConcerts = trpc.concerts.merge.useMutation({
    onSuccess: (result) => {
      toast.success(`Merged successfully! Moved ${result.movedPhotos} photos${result.copiedSetlist ? ' and copied setlist' : ''}.`);
      setLocation("/");
    },
    onError: (error) => {
      toast.error(`Failed to merge concerts: ${error.message}`);
    },
  });
  
  // Get all concerts for merge dropdown
  const { data: allConcerts } = trpc.concerts.list.useQuery();
  
  const bulkHide = trpc.photos.bulkHide.useMutation({
    onSuccess: (data) => {
      utils.photos.getByConcert.invalidate({ concertId: concertId! });
      utils.concerts.getById.invalidate({ id: concertId! });
      toast.success(`${data.count} photo(s) hidden`);
      setSelectMode(false);
      setSelectedPhotoIds(new Set());
    },
    onError: (error) => {
      toast.error(`Failed to hide photos: ${error.message}`);
    },
  });
  
  const bulkDelete = trpc.photos.bulkDelete.useMutation({
    onSuccess: (data) => {
      utils.photos.getByConcert.invalidate({ concertId: concertId! });
      utils.concerts.getById.invalidate({ id: concertId! });
      toast.success(`${data.count} photo(s) deleted`);
      setSelectMode(false);
      setSelectedPhotoIds(new Set());
    },
    onError: (error) => {
      toast.error(`Failed to delete photos: ${error.message}`);
    },
  });
  
  const updateConcert = trpc.concerts.update.useMutation({
    onSuccess: () => {
      utils.concerts.getById.invalidate({ id: concertId! });
      utils.concerts.list.invalidate();
      toast.success("Concert updated");
      setShowEditDialog(false);
    },
    onError: (error) => {
      toast.error(`Failed to update concert: ${error.message}`);
    },
  });
  
  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!concertId) return;
    
    // Validate: require at least 2 of 3 fields (artist, venue, date)
    const hasArtist = editForm.artistName.trim().length > 0;
    const hasVenue = editForm.venueName.trim().length > 0;
    const hasDate = editForm.concertDate.trim().length > 0;
    const filledCount = [hasArtist, hasVenue, hasDate].filter(Boolean).length;
    
    if (filledCount < 2) {
      toast.error("Please provide at least 2 of the 3 fields: Artist, Venue, or Date");
      return;
    }
    
    const updateData = {
      concertId,
      artistName: editForm.artistName.trim() || undefined,
      venueName: editForm.venueName.trim() || undefined,
      city: editForm.city,
      state: editForm.state || undefined,
      country: editForm.country,
      concertDate: editForm.concertDate ? parseDateStringToNoonUTC(editForm.concertDate) : undefined,
      refreshSetlist: editForm.refreshSetlist,
    };
    
    console.log('[Edit Concert] Submitting:', updateData);
    
    updateConcert.mutate(updateData);
  };

  if (isLoading) {
    return (
      <div className="container py-8 max-w-5xl">
        <Skeleton className="h-10 w-32 mb-6" />
        <Skeleton className="h-64 mb-6" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!concert) {
    return (
      <div className="container py-8 max-w-5xl">
        <Button variant="ghost" onClick={() => setLocation("/")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Dashboard
        </Button>
        <Card className="mt-6">
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Concert not found</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const formattedDate = new Date(concert.concertDate).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="container py-8 max-w-5xl">
      <Button
        variant="ghost"
        onClick={() => setLocation("/")}
        className="mb-6"
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to Dashboard
      </Button>

      {/* Concert Header */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex flex-col gap-4 flex-1">
            <div>
              <h1 className="text-4xl font-bold text-card-foreground mb-2">
                {concert.artist?.name || "Unknown Artist"}
              </h1>
              <div className="flex flex-wrap items-center gap-4 text-muted-foreground">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  <span>
                    {concert.venue?.name}, {concert.venue?.city}
                    {concert.venue?.state && `, ${concert.venue.state}`}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  <span>{formattedDate}</span>
                </div>
              </div>
            </div>

            {/* Weather Info */}
            {concert.weatherCondition && (
              <div className="flex items-center gap-2 text-sm">
                <Thermometer className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">
                  {concert.temperature}°F • {concert.weatherCondition}
                </span>
              </div>
            )}
            </div>
            
            {/* Edit, Merge, and Delete Buttons */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditForm({
                    artistName: concert.artist?.name || "",
                    venueName: concert.venue?.name || "",
                    city: concert.venue?.city || "",
                    state: concert.venue?.state || "",
                    country: concert.venue?.country || "",
                    concertDate: formatDateForInput(concert.concertDate),
                    refreshSetlist: false,
                  });
                  setShowEditDialog(true);
                }}
              >
                <Edit className="h-4 w-4 mr-2" />
                Edit
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowMergeDialog(true)}
              >
                Merge
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  if (confirm(`Are you sure you want to delete this concert? This will also delete all ${photos?.length || 0} photos.`)) {
                    deleteConcert.mutate({ concertId: concert.id });
                  }
                }}
              >
                Delete Concert
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Setlist */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Music className="h-5 w-5" />
              Setlist
            </CardTitle>
          </CardHeader>
          <CardContent>
            {concert.setlist && concert.setlist.length > 0 ? (
              <div className="space-y-4">
                {Array.from(new Set(concert.setlist.map(s => s.setNumber))).map(setNum => (
                  <div key={setNum}>
                    <h3 className="font-semibold text-sm text-muted-foreground mb-2">
                      {setNum === 1 ? "Main Set" : setNum === 2 ? "Set 2" : `Encore ${setNum - 2}`}
                    </h3>
                    <ol className="space-y-1.5 list-decimal list-inside">
                      {concert.setlist
                        ?.filter(s => s.setNumber === setNum)
                        .sort((a, b) => a.position - b.position)
                        .map((entry, idx) => (
                          <li key={idx} className="text-sm">
                            {entry.song?.title || "Unknown Song"}
                            {entry.notes && (
                              <span className="text-muted-foreground text-xs ml-2">
                                ({entry.notes})
                              </span>
                            )}
                          </li>
                        ))}
                    </ol>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No setlist available for this concert.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Photos */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <ImageIcon className="h-5 w-5" />
                Photos ({photos?.length || 0})
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSelectMode(!selectMode);
                  setSelectedPhotoIds(new Set());
                }}
              >
                {selectMode ? "Cancel" : "Select"}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {photos && photos.length > 0 ? (
              <div className="grid grid-cols-2 gap-3">
                {photos.map((photo) => (
                  <div
                    key={photo.id}
                    className="relative group aspect-square rounded-lg overflow-hidden bg-muted cursor-pointer"
                    onClick={() => {
                      if (selectMode) {
                        const newSelected = new Set(selectedPhotoIds);
                        if (newSelected.has(photo.id)) {
                          newSelected.delete(photo.id);
                        } else {
                          newSelected.add(photo.id);
                        }
                        setSelectedPhotoIds(newSelected);
                      } else {
                        setSelectedPhotoMetadata(photo);
                      }
                    }}
                  >
                    <img
                      src={getPhotoUrl(photo)}
                      alt={photo.filename || "Concert photo"}
                      className="w-full h-full object-cover transition-transform group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                    {selectMode ? (
                      <div className="absolute top-2 right-2 h-8 w-8 bg-background rounded-md flex items-center justify-center border-2">
                        {selectedPhotoIds.has(photo.id) ? (
                          <CheckSquare className="h-5 w-5 text-primary" />
                        ) : (
                          <Square className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                    ) : (
                      <Button
                        size="icon"
                        variant={photo.isStarred ? "default" : "secondary"}
                        className="absolute top-2 right-2 h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleStar.mutate({
                            photoId: photo.id,
                            isStarred: !photo.isStarred,
                          });
                        }}
                      >
                        <Star
                          className={`h-4 w-4 ${photo.isStarred ? "fill-current" : ""}`}
                        />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <ImageIcon className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">
                  No photos for this concert yet.
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Scan your Google Drive to automatically link photos.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bulk Actions Bar */}
      {selectMode && selectedPhotoIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-background border rounded-lg shadow-lg p-4 flex items-center gap-4 z-50">
          <span className="text-sm font-medium">
            {selectedPhotoIds.size} photo(s) selected
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (confirm(`Hide ${selectedPhotoIds.size} photo(s)? They will be removed from view but not deleted.`)) {
                  bulkHide.mutate({ photoIds: Array.from(selectedPhotoIds) });
                }
              }}
              disabled={bulkHide.isPending}
            >
              {bulkHide.isPending ? "Hiding..." : "Hide Selected"}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                if (confirm(`Permanently delete ${selectedPhotoIds.size} photo(s)? This cannot be undone.`)) {
                  bulkDelete.mutate({ photoIds: Array.from(selectedPhotoIds) });
                }
              }}
              disabled={bulkDelete.isPending}
            >
              {bulkDelete.isPending ? "Deleting..." : "Delete Selected"}
            </Button>
          </div>
        </div>
      )}

      {/* Photo Metadata Dialog */}
      <Dialog open={!!selectedPhotoMetadata} onOpenChange={() => setSelectedPhotoMetadata(null)}>
        <DialogContent className="max-w-2xl">
          <DialogTitle>Photo Information</DialogTitle>
          {selectedPhotoMetadata && (
            <div className="space-y-4">
              <img
                src={getPhotoUrl(selectedPhotoMetadata)}
                alt="Concert photo"
                className="w-full h-auto rounded-lg"
              />
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-sm font-medium text-muted-foreground">Filename</div>
                    <div className="text-sm">{selectedPhotoMetadata.filename || 'N/A'}</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-muted-foreground">Date Taken</div>
                    <div className="text-sm">
                      {selectedPhotoMetadata.takenAt 
                        ? new Date(selectedPhotoMetadata.takenAt).toLocaleString()
                        : 'N/A'}
                    </div>
                  </div>
                </div>
                
                {(selectedPhotoMetadata.latitude && selectedPhotoMetadata.longitude) && (
                  <div>
                    <div className="text-sm font-medium text-muted-foreground mb-1">GPS Coordinates</div>
                    <div className="text-sm">
                      {parseFloat(selectedPhotoMetadata.latitude).toFixed(4)}, {parseFloat(selectedPhotoMetadata.longitude).toFixed(4)}
                    </div>
                  </div>
                )}
                
                {selectedPhotoMetadata.detectedVenue && (
                  <div>
                    <div className="text-sm font-medium text-muted-foreground mb-1">Detected Venue</div>
                    <div className="text-sm">{selectedPhotoMetadata.detectedVenue}</div>
                  </div>
                )}
                
                {/* Venue Override Dropdown */}
                {selectedPhotoMetadata.latitude && selectedPhotoMetadata.longitude && (
                  <div>
                    <div className="text-sm font-medium text-muted-foreground mb-2">Change Venue (affects all concert photos)</div>
                    <VenueDropdown 
                      latitude={selectedPhotoMetadata.latitude}
                      longitude={selectedPhotoMetadata.longitude}
                      currentVenue={concert?.venue?.name}
                      onVenueChange={(venue) => {
                        updateConcertVenue.mutate({
                          concertId: concert!.id,
                          venueName: venue.name,
                          city: venue.city,
                          state: venue.state,
                          country: venue.country,
                          latitude: venue.latitude,
                          longitude: venue.longitude,
                        });
                      }}
                    />
                  </div>
                )}
                
                {selectedPhotoMetadata.detectedCity && (
                  <div>
                    <div className="text-sm font-medium text-muted-foreground mb-1">Detected Location</div>
                    <div className="text-sm">
                      {selectedPhotoMetadata.detectedCity}
                      {selectedPhotoMetadata.detectedState && `, ${selectedPhotoMetadata.detectedState}`}
                      {selectedPhotoMetadata.detectedCountry && `, ${selectedPhotoMetadata.detectedCountry}`}
                    </div>
                  </div>
                )}
                
                <div className="grid grid-cols-2 gap-3">
                  {selectedPhotoMetadata.sourceUrl && (
                    <div>
                      <div className="text-sm font-medium text-muted-foreground">Source</div>
                      <div className="text-sm">Google Drive</div>
                    </div>
                  )}
                  {selectedPhotoMetadata.isStarred && (
                    <div>
                      <div className="text-sm font-medium text-muted-foreground">Status</div>
                      <div className="text-sm flex items-center gap-1">
                        <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                        Starred
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      
      {/* Edit Concert Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-md">
          <DialogTitle>Edit Concert</DialogTitle>
          <p className="text-sm text-muted-foreground mb-4">Provide at least 2 of the 3 main fields (Artist, Venue, or Date). Leave fields blank to keep current values.</p>
          <form onSubmit={handleEditSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium">Artist Name</label>
              <input
                type="text"
                value={editForm.artistName}
                onChange={(e) => setEditForm({ ...editForm, artistName: e.target.value })}
                className="w-full mt-1 px-3 py-2 border rounded-md"
                placeholder={editForm.refreshSetlist ? "Leave blank to lookup from setlist.fm" : "Leave blank to keep current"}
              />
            </div>
            
            <div>
              <label className="text-sm font-medium">Venue Name</label>
              <input
                type="text"
                value={editForm.venueName}
                onChange={(e) => setEditForm({ ...editForm, venueName: e.target.value })}
                className="w-full mt-1 px-3 py-2 border rounded-md"
                placeholder={editForm.refreshSetlist ? "Leave blank to lookup from setlist.fm" : "Leave blank to keep current"}
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">City</label>
                <input
                  type="text"
                  value={editForm.city}
                  onChange={(e) => setEditForm({ ...editForm, city: e.target.value })}
                  className="w-full mt-1 px-3 py-2 border rounded-md"
                  required
                />
              </div>
              
              <div>
                <label className="text-sm font-medium">State</label>
                <input
                  type="text"
                  value={editForm.state}
                  onChange={(e) => setEditForm({ ...editForm, state: e.target.value })}
                  className="w-full mt-1 px-3 py-2 border rounded-md"
                />
              </div>
            </div>
            
            <div>
              <label className="text-sm font-medium">Country</label>
              <input
                type="text"
                value={editForm.country}
                onChange={(e) => setEditForm({ ...editForm, country: e.target.value })}
                className="w-full mt-1 px-3 py-2 border rounded-md"
                required
              />
            </div>
            
            <div>
              <label className="text-sm font-medium">Concert Date</label>
              <input
                type="date"
                value={editForm.concertDate}
                onChange={(e) => setEditForm({ ...editForm, concertDate: e.target.value })}
                className="w-full mt-1 px-3 py-2 border rounded-md"
                placeholder={editForm.refreshSetlist ? "Leave blank to lookup from setlist.fm" : "Leave blank to keep current"}
              />
            </div>
            
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="refreshSetlist"
                checked={editForm.refreshSetlist}
                onChange={(e) => setEditForm({ ...editForm, refreshSetlist: e.target.checked })}
                className="h-4 w-4"
              />
              <label htmlFor="refreshSetlist" className="text-sm">
                Refresh setlist from setlist.fm (recommended if artist or date changed)
              </label>
            </div>
            
            <div className="flex gap-2 justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowEditDialog(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={updateConcert.isPending}>
                {updateConcert.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      
      {/* Merge Concert Dialog */}
      <Dialog open={showMergeDialog} onOpenChange={setShowMergeDialog}>
        <DialogContent className="max-w-md">
          <DialogTitle>Merge Concert</DialogTitle>
          <p className="text-sm text-muted-foreground mb-4">
            Merge this concert into another concert. All photos from this concert will be moved to the target concert, and this concert will be deleted.
          </p>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Target Concert</label>
              <select
                value={selectedTargetConcertId || ""}
                onChange={(e) => setSelectedTargetConcertId(Number(e.target.value))}
                className="w-full mt-1 px-3 py-2 border rounded-md"
              >
                <option value="">Select a concert...</option>
                {allConcerts?.filter(c => c.id !== concert?.id).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.artist?.name || "Unknown Artist"} - {c.venue?.name || "Unknown Venue"} ({new Date(c.concertDate).toLocaleDateString()})
                  </option>
                ))}
              </select>
            </div>
            
            <div className="bg-muted p-3 rounded-md text-sm">
              <p className="font-medium mb-1">What will happen:</p>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                <li>All {photos?.length || 0} photos will be moved to the target concert</li>
                <li>If target has no setlist, this concert's setlist will be copied</li>
                <li>This concert will be deleted</li>
              </ul>
            </div>
            
            <div className="flex gap-2 justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowMergeDialog(false);
                  setSelectedTargetConcertId(null);
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (!selectedTargetConcertId) {
                    toast.error("Please select a target concert");
                    return;
                  }
                  if (confirm(`Merge this concert into the selected concert? This cannot be undone.`)) {
                    mergeConcerts.mutate({
                      sourceConcertId: concert!.id,
                      targetConcertId: selectedTargetConcertId
                    });
                  }
                }}
                disabled={!selectedTargetConcertId || mergeConcerts.isPending}
              >
                {mergeConcerts.isPending ? "Merging..." : "Merge Concert"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
