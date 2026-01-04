import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { ArrowLeft, RotateCcw, ChevronLeft, ChevronRight } from "lucide-react";
import React from "react";

// Helper to extract file ID from Google Drive URL
const extractFileId = (url: string): string | null => {
  const match = url.match(/id=([^&]+)/);
  return match ? match[1] : null;
};

// Photo thumbnail component that fetches from proxy
function PhotoThumbnail({ fileId, alt }: { fileId: string; alt: string }) {
  const { data: imageData } = trpc.driveProxy.getImage.useQuery(
    { fileId },
    { enabled: !!fileId }
  );

  if (!imageData?.dataUrl) {
    return (
      <div className="w-full h-full flex items-center justify-center text-muted-foreground">
        Loading...
      </div>
    );
  }

  return (
    <img
      src={imageData.dataUrl}
      alt={alt}
      className="w-full h-full object-cover"
    />
  );
}

export default function SkippedPhotos() {
  const utils = trpc.useUtils();
  const [currentPage, setCurrentPage] = React.useState(1);
  const photosPerPage = 20;
  
  const { data: skippedPhotos, isLoading } = trpc.photos.getSkipped.useQuery();
  const unskipMutation = trpc.photos.unskipPhoto.useMutation({
    onSuccess: () => {
      utils.photos.getSkipped.invalidate();
      utils.photos.getUnmatched.invalidate();
      toast.success("Photo restored", {
        description: "The photo has been moved back to unmatched photos",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-8 pb-24">
        <div className="container mx-auto">
          <div className="mb-8">
            <Link href="/">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Dashboard
              </Button>
            </Link>
          </div>
          <h1 className="text-4xl font-bold mb-2">Skipped Photos</h1>
          <p className="text-muted-foreground mb-8">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-8 pb-24">
      <div className="container mx-auto">
        <div className="mb-8">
          <Link href="/">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Dashboard
            </Button>
          </Link>
        </div>

        <h1 className="text-4xl font-bold mb-2">Skipped Photos</h1>
        <p className="text-muted-foreground mb-8">
          {skippedPhotos?.length || 0} photos previously skipped
        </p>

        {!skippedPhotos || skippedPhotos.length === 0 ? (
          <Card className="p-12 text-center">
            <p className="text-muted-foreground">
              No skipped photos. Photos you skip during review will appear here.
            </p>
          </Card>
        ) : (
          <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {skippedPhotos
              .slice((currentPage - 1) * photosPerPage, currentPage * photosPerPage)
              .map((photo) => {
              const fileId = extractFileId(photo.sourceUrl);
              return (
              <Card key={photo.id} className="overflow-hidden">
                <div className="aspect-square relative bg-muted">
                  {fileId ? (
                    <PhotoThumbnail fileId={fileId} alt={photo.fileName} />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                      No preview
                    </div>
                  )}
                </div>
                <div className="p-4 space-y-3">
                  <div className="space-y-1">
                    <p className="font-medium text-sm truncate">{photo.fileName}</p>
                    {photo.takenAt && (
                      <p className="text-xs text-muted-foreground">
                        {new Date(photo.takenAt).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </p>
                    )}
                    {photo.venueName && (
                      <p className="text-xs text-muted-foreground truncate">
                        📍 {photo.venueName}
                      </p>
                    )}
                    {photo.city && (
                      <p className="text-xs text-muted-foreground">
                        {photo.city}, {photo.country}
                      </p>
                    )}
                  </div>
                  
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full"
                    onClick={() => unskipMutation.mutate({ photoId: photo.id })}
                    disabled={unskipMutation.isPending}
                  >
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Restore to Review
                  </Button>
                </div>
              </Card>
              );
            })}
          </div>
          
          {/* Pagination */}
          {skippedPhotos.length > photosPerPage && (
            <div className="flex items-center justify-center gap-4 mt-8">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="h-4 w-4 mr-2" />
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {currentPage} of {Math.ceil(skippedPhotos.length / photosPerPage)}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.min(Math.ceil(skippedPhotos.length / photosPerPage), p + 1))}
                disabled={currentPage === Math.ceil(skippedPhotos.length / photosPerPage)}
              >
                Next
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          )}
          </>
        )}
      </div>
    </div>
  );
}
