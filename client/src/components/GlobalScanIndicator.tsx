import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { RefreshCw, ImageIcon, MapPin } from "lucide-react";
import { Progress } from "@/components/ui/progress";

export function GlobalScanIndicator() {
  const [isVisible, setIsVisible] = useState(false);

  // Poll for scan progress
  const { data: scanProgress } = trpc.photos.getScanProgress.useQuery(
    undefined,
    { refetchInterval: 500 }
  );

  // Show indicator when scan is active
  useEffect(() => {
    if (scanProgress?.isScanning) {
      setIsVisible(true);
    } else if (isVisible && !scanProgress?.isScanning) {
      // Keep visible for 2 seconds after completion
      const timer = setTimeout(() => setIsVisible(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [scanProgress?.isScanning, isVisible]);

  if (!isVisible || !scanProgress?.isScanning) {
    return null;
  }

  const progress = scanProgress.totalPhotos > 0
    ? (scanProgress.currentPhoto / scanProgress.totalPhotos) * 100
    : 0;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-96">
      <Card className="border-primary shadow-lg">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4 animate-spin text-primary" />
              <span className="font-semibold text-sm">Background Scan Running</span>
            </div>
            <span className="text-xs text-muted-foreground">
              {scanProgress.currentPhoto} / {scanProgress.totalPhotos}
            </span>
          </div>

          <Progress value={progress} className="h-2" />

          {scanProgress.currentFileName && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <ImageIcon className="h-3 w-3" />
              <span className="font-mono truncate">{scanProgress.currentFileName}</span>
            </div>
          )}

          {scanProgress.currentStatus && (
            <div className="text-xs font-medium text-foreground">
              {scanProgress.currentStatus}
            </div>
          )}

          {(scanProgress.currentCity || scanProgress.currentVenue) && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3" />
              <span className="truncate">
                {[scanProgress.currentVenue, scanProgress.currentCity, scanProgress.currentState]
                  .filter(Boolean)
                  .join(", ")}
              </span>
            </div>
          )}

          <div className="flex gap-3 text-xs">
            <span className="text-muted-foreground">
              Processed: <span className="font-medium text-foreground">{scanProgress.processed || 0}</span>
            </span>
            <span className="text-muted-foreground">
              Linked: <span className="font-medium text-foreground">{scanProgress.linked || 0}</span>
            </span>
            <span className="text-muted-foreground">
              Unmatched: <span className="font-medium text-foreground">{scanProgress.unmatched || 0}</span>
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
