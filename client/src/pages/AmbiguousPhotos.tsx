import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, CheckSquare, Square } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { format } from "date-fns";

export default function AmbiguousPhotos() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<Set<number>>(new Set());

  const utils = trpc.useUtils();

  // Fetch ambiguous photos
  const { data: ambiguousPhotos, isLoading } = trpc.photos.getAmbiguousPhotos.useQuery(
    undefined,
    { enabled: !!user }
  );

  // Fetch all concerts for display
  const { data: allConcerts } = trpc.concerts.list.useQuery(undefined, { enabled: !!user });

  // Mutation for assigning photos
  const assignPhoto = trpc.photos.assignAmbiguousPhoto.useMutation({
    onSuccess: () => {
      utils.photos.getAmbiguousPhotos.invalidate();
      utils.photos.getAmbiguousCount.invalidate();
      utils.concerts.list.invalidate();
      toast.success("Photos assigned successfully");
    },
    onError: (error) => {
      toast.error(`Failed to assign photo: ${error.message}`);
    },
  });

  const getPhotoUrl = (photo: any) => {
    if (photo.sourceUrl && photo.sourceUrl.includes('drive.google.com')) {
      const idMatch = photo.sourceUrl.match(/[?&]id=([^&]+)/);
      if (idMatch) {
        return `/api/drive-image/${idMatch[1]}`;
      }
    }
    return photo.sourceUrl;
  };

  const togglePhotoSelection = (photoId: number) => {
    const newSelection = new Set(selectedPhotoIds);
    if (newSelection.has(photoId)) {
      newSelection.delete(photoId);
    } else {
      newSelection.add(photoId);
    }
    setSelectedPhotoIds(newSelection);
  };

  const toggleSelectAll = () => {
    if (selectedPhotoIds.size === ambiguousPhotos?.length) {
      setSelectedPhotoIds(new Set());
    } else {
      setSelectedPhotoIds(new Set(ambiguousPhotos?.map(p => p.id)));
    }
  };

  const assignSelectedToConcert = async (concertId: number) => {
    if (selectedPhotoIds.size === 0) {
      toast.error("Please select at least one photo");
      return;
    }

    const selectedArray = Array.from(selectedPhotoIds);

    try {
      // Assign each selected photo
      await Promise.all(
        selectedArray.map(photoId =>
          assignPhoto.mutateAsync({ photoId, concertId })
        )
      );

      // Clear selection after successful assignment
      setSelectedPhotoIds(new Set());

      toast.success(`Assigned ${selectedArray.length} photo(s) to concert`);
    } catch (error) {
      // Error already handled by mutation
    }
  };

  // Group photos by possible concert IDs
  const photoGroups = ambiguousPhotos?.reduce((groups, photo) => {
    const key = photo.possibleConcertIds || "unknown";
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(photo);
    return groups;
  }, {} as Record<string, typeof ambiguousPhotos>);

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center gap-2 mb-6">
          <Button variant="ghost" onClick={() => setLocation("/")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        </div>
        <p>Loading ambiguous photos...</p>
      </div>
    );
  }

  if (!ambiguousPhotos || ambiguousPhotos.length === 0) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center gap-2 mb-6">
          <Button variant="ghost" onClick={() => setLocation("/")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        </div>
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">
              No ambiguous photos found. All photos with multiple concert options have been resolved!
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => setLocation("/")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Ambiguous Photos</h1>
            <p className="text-muted-foreground">
              Photos from dates with multiple concerts - select which concert each photo belongs to
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{ambiguousPhotos.length} photos</Badge>
          <Badge variant="outline">{selectedPhotoIds.size} selected</Badge>
        </div>
      </div>

      {/* Select All Button */}
      <div className="mb-4">
        <Button
          variant="outline"
          onClick={toggleSelectAll}
          className="gap-2"
        >
          {selectedPhotoIds.size === ambiguousPhotos?.length ? (
            <>
              <CheckSquare className="h-4 w-4" />
              Deselect All
            </>
          ) : (
            <>
              <Square className="h-4 w-4" />
              Select All
            </>
          )}
        </Button>
      </div>

      {/* Photo Groups */}
      {Object.entries(photoGroups || {}).map(([concertIds, photos]) => {
        const possibleConcertIdArray = JSON.parse(concertIds);
        const possibleConcerts = allConcerts?.filter(c =>
          possibleConcertIdArray.includes(c.id)
        );

        return (
          <Card key={concertIds} className="mb-6">
            <CardHeader>
              <CardTitle className="text-lg">
                {photos[0].venueName || "Unknown Venue"} • {" "}
                {photos[0].takenAt ? format(new Date(photos[0].takenAt), "MMM d, yyyy") : "Unknown date"}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {photos.length} photo(s) • Multiple concerts detected at this venue/date
              </p>
            </CardHeader>
            <CardContent>
              {/* Concert Options */}
              <div className="mb-4 p-4 bg-muted/50 rounded-lg">
                <p className="text-sm font-medium mb-3">Assign selected photos to:</p>
                <div className="flex flex-wrap gap-2">
                  {possibleConcerts?.map((concert) => (
                    <Button
                      key={concert.id}
                      variant="outline"
                      size="sm"
                      onClick={() => assignSelectedToConcert(concert.id)}
                      disabled={selectedPhotoIds.size === 0 || assignPhoto.isLoading}
                    >
                      {concert.artist?.name || "Unknown Artist"}
                      <Badge variant="secondary" className="ml-2">
                        {concert.photoCount || 0} photos
                      </Badge>
                    </Button>
                  ))}
                </div>
              </div>

              {/* Photo Grid */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                {photos.map((photo) => (
                  <div
                    key={photo.id}
                    className={`relative group cursor-pointer rounded-lg overflow-hidden border-2 transition-all ${
                      selectedPhotoIds.has(photo.id)
                        ? "border-blue-500 ring-2 ring-blue-500/20"
                        : "border-transparent hover:border-gray-300"
                    }`}
                    onClick={() => togglePhotoSelection(photo.id)}
                  >
                    {/* Checkbox */}
                    <div className="absolute top-2 left-2 z-10">
                      <div className="bg-white rounded-md p-1 shadow-lg">
                        <Checkbox
                          checked={selectedPhotoIds.has(photo.id)}
                          onCheckedChange={() => togglePhotoSelection(photo.id)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                    </div>

                    {/* Photo */}
                    <img
                      src={getPhotoUrl(photo)}
                      alt={photo.fileName}
                      className="w-full h-40 object-cover"
                    />

                    {/* Overlay with time */}
                    <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-xs p-2">
                      {photo.takenAt ? format(new Date(photo.takenAt), "h:mm a") : "No time"}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
