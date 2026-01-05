import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { ConcertCard } from "@/components/ConcertCard";
import { LogViewer } from "@/components/LogViewer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Search, Music, Sparkles, Download, Moon, Sun, Loader2, History, Trash2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Link } from "wouter";
import { toast } from "sonner";
import { useTheme } from "@/contexts/ThemeContext";
import { GlobalScanIndicator } from "@/components/GlobalScanIndicator";

export default function Dashboard() {
  const { user, loading: authLoading } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedYear, setSelectedYear] = useState<number | undefined>();
  const [isScanning, setIsScanning] = useState(false);
  const [scanLimit, setScanLimit] = useState<number>(10);
  const [showLastScanDialog, setShowLastScanDialog] = useState(false);
  const [scanSummary, setScanSummary] = useState<{
    linked: number;
    newConcerts: number;
    unmatched: number;
    duration?: number;
    concerts: Array<{ concertId: number; artistName: string; venueName: string; photoCount: number; isNew: boolean }>;
  } | null>(null);
  const [showSummaryDialog, setShowSummaryDialog] = useState(false);

  const utils = trpc.useUtils();

  const { data: concerts, isLoading: concertsLoading } = trpc.concerts.list.useQuery(undefined, { enabled: !!user });
  const { data: unmatchedCount } = trpc.photos.getUnmatchedCount.useQuery(undefined, { enabled: !!user });
  const { data: noGpsCount } = trpc.photos.getNoGpsCount.useQuery(undefined, { enabled: !!user });
  const { data: ambiguousCount } = trpc.photos.getAmbiguousCount.useQuery(undefined, { enabled: !!user });
  const { data: lastScanResult } = trpc.photos.getLastScanResult.useQuery(undefined, { enabled: !!user });
  const { data: scanProgress } = trpc.photos.getScanProgress.useQuery(undefined, { enabled: isScanning, refetchInterval: 500 });
  const { data: scanStats } = trpc.photos.getScanStats.useQuery(undefined, { enabled: !!user });
  
  const scanPhotos = trpc.photos.scanFromDrive.useMutation({
    onMutate: () => setIsScanning(true),
    onSuccess: (stats) => {
      // Capture final elapsed time before clearing scan state
      const finalElapsedTime = scanProgress?.elapsedTime;
      setIsScanning(false);
      utils.concerts.list.invalidate();
      utils.photos.getUnmatchedCount.invalidate();
      utils.photos.getAmbiguousCount.invalidate();
      utils.photos.getScanStats.invalidate();
      utils.photos.getLastScanResult.invalidate();

      if (stats.processed === 0) {
        // No new photos found
        toast.info("No new photos to scan", {
          description: "All photos from Google Drive have already been processed. Click 'Last Scan' to see previous results.",
          duration: 5000,
        });
      } else {
        // Show summary dialog
        setScanSummary({
          linked: stats.linked,
          newConcerts: stats.newConcerts,
          unmatched: stats.unmatched,
          duration: finalElapsedTime,
          concerts: (stats as any).concertsSummary || [],
        });
        setShowSummaryDialog(true);
      }
    },
    onError: (err) => {
      setIsScanning(false);
      toast.error(err.message);
    }
  });
  
  const clearAll = trpc.photos.clearAll.useMutation({
    onSuccess: () => {
      toast.success("History cleared. Scanning selected batch...");
      utils.photos.getScanStats.invalidate();
      scanPhotos.mutate({ limit: scanLimit || undefined });
    }
  });

  const deleteAllData = trpc.concerts.deleteAllData.useMutation({
    onSuccess: (result) => {
      toast.success("Database reset complete", {
        description: `Deleted ${result.concerts} concerts, ${result.photos} photos, ${result.unmatchedPhotos} unmatched photos, ${result.processedFiles} processed files`,
        duration: 5000,
      });

      // Refresh all queries
      utils.concerts.list.invalidate();
      utils.photos.getUnmatchedCount.invalidate();
      utils.photos.getAmbiguousCount.invalidate();
      utils.photos.getScanStats.invalidate();
      utils.photos.getLastScanResult.invalidate();

      // Clear local state
      setScanSummary(null);
      setShowSummaryDialog(false);
    },
    onError: (err) => {
      toast.error("Failed to reset database", {
        description: err.message,
      });
    }
  });

  const handleDeleteAllData = () => {
    if (!concerts) return;

    const firstConfirm = window.confirm(
      `⚠️ WARNING: This will permanently delete ALL your concert data!\n\n` +
      `- ${concerts.length} concerts\n` +
      `- ${unmatchedCount || 0} unmatched photos\n` +
      `- All linked photos\n` +
      `- All processed file records\n\n` +
      `Are you sure you want to continue?`
    );

    if (!firstConfirm) return;

    const secondConfirm = window.confirm(
      `⚠️ FINAL WARNING: This action CANNOT be undone!\n\n` +
      `Type "DELETE" in your mind and click OK to proceed.`
    );

    if (secondConfirm) {
      deleteAllData.mutate();
    }
  };

  if (authLoading || concertsLoading) return <div className="p-8">Loading...</div>;

  const filteredConcerts = concerts?.filter(c => 
    (!searchQuery || c.artist?.name.toLowerCase().includes(searchQuery.toLowerCase())) &&
    (!selectedYear || new Date(c.concertDate).getFullYear() === selectedYear)
  );

  const years = Array.from(new Set(concerts?.map(c => new Date(c.concertDate).getFullYear()) || [])).sort((a, b) => b - a);

  return (
    <div className="container py-8 pb-24 max-w-7xl">
      <div className="flex flex-col gap-6 mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold">My Concerts</h1>
            <div className="flex flex-col gap-1 mt-2 text-sm text-muted-foreground">
              <p>{concerts?.length || 0} concerts attended</p>
              {scanStats && (
                <p>
                  <span className="font-medium">{scanStats.processedCount.toLocaleString()}</span> of{' '}
                  <span className="font-medium">{scanStats.totalFiles.toLocaleString()}</span> files scanned
                  {scanStats.remainingFiles > 0 && (
                    <span className="text-orange-600 ml-1">
                      ({scanStats.remainingFiles.toLocaleString()} remaining)
                    </span>
                  )}
                </p>
              )}
            </div>
          </div>
          <div className="flex gap-2 items-center flex-wrap">
            <Button variant="outline" size="icon" onClick={toggleTheme}>
              {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </Button>

            <LogViewer />

            <div className="flex items-center gap-2 bg-muted/50 p-1 rounded-md border">
              <select
                value={scanLimit}
                onChange={(e) => setScanLimit(Number(e.target.value))}
                className="bg-transparent text-sm p-1 outline-none"
              >
                {[1, 5, 10, 25, 50, 100, 250, 500, 750, 1000].map(v => <option key={v} value={v}>{v}</option>)}
                <option value={0}>All files</option>
              </select>
              <Button size="sm" onClick={() => scanPhotos.mutate({ limit: scanLimit || undefined })} disabled={isScanning}>
                {isScanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                Scan
              </Button>
            </div>

            <Button variant="outline" onClick={() => clearAll.mutate()} disabled={isScanning}>
              <Sparkles className="h-4 w-4 mr-2" /> Clear & Rescan
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => lastScanResult && setShowLastScanDialog(true)}
              disabled={!lastScanResult}
              title={!lastScanResult ? "No scan results yet. Run a scan first." : "View last scan results"}
            >
              <History className="h-4 w-4 mr-2" />
              Last Scan
            </Button>

            <Button
              variant="destructive"
              size="sm"
              onClick={handleDeleteAllData}
              disabled={deleteAllData.isPending || !concerts || concerts.length === 0}
              title={!concerts || concerts.length === 0 ? "No data to delete" : "Reset entire database"}
            >
              {deleteAllData.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Reset Database
            </Button>

            <Link href="/photos/review">
              <Button variant="secondary">Review ({unmatchedCount || 0})</Button>
            </Link>

            {ambiguousCount && ambiguousCount > 0 && (
              <Link href="/photos/ambiguous">
                <Button variant="outline" className="border-orange-500 text-orange-600 hover:bg-orange-50">
                  Ambiguous ({ambiguousCount})
                </Button>
              </Link>
            )}

            {noGpsCount && noGpsCount > 0 && (
              <Link href="/photos/review/no-gps">
                <Button variant="outline" className="border-orange-500 text-orange-600 hover:bg-orange-50">
                  No GPS ({noGpsCount})
                </Button>
              </Link>
            )}
          </div>
        </div>

        {isScanning && (
          <Card className="border-blue-500/20 bg-blue-500/5">
            <CardContent className="pt-6">
              <div className="space-y-3">
                {/* Header with progress percentage */}
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                    <span className="font-medium">
                      Scanning photo {scanProgress?.currentPhoto || 0} of {scanProgress?.totalPhotos || (scanLimit === 0 ? 'all' : scanLimit)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    {scanProgress?.elapsedTime !== undefined && (
                      <span className="text-sm text-muted-foreground font-mono">
                        {Math.floor(scanProgress.elapsedTime / 60000)}:{String(Math.floor((scanProgress.elapsedTime % 60000) / 1000)).padStart(2, '0')}
                      </span>
                    )}
                    <span className="text-sm font-semibold text-blue-600">
                      {scanProgress ? Math.round((scanProgress.currentPhoto / scanProgress.totalPhotos) * 100) : 0}%
                    </span>
                  </div>
                </div>

                {/* Progress bar */}
                <Progress value={scanProgress ? (scanProgress.currentPhoto / scanProgress.totalPhotos) * 100 : 0} />

                {/* Current file and status */}
                {scanProgress && (
                  <div className="space-y-2 text-sm">
                    {scanProgress.currentFileName && (
                      <div className="flex items-start gap-2">
                        <span className="text-muted-foreground min-w-[60px]">File:</span>
                        <span className="font-mono text-xs break-all">{scanProgress.currentFileName}</span>
                      </div>
                    )}

                    {scanProgress.currentStatus && (
                      <div className="flex items-start gap-2">
                        <span className="text-muted-foreground min-w-[60px]">Status:</span>
                        <span className={scanProgress.currentStatus.includes('Linked') ? 'text-green-600 font-medium' : ''}>{scanProgress.currentStatus}</span>
                      </div>
                    )}

                    {/* Location info */}
                    {(scanProgress.currentCity || scanProgress.currentState || scanProgress.currentCountry) && (
                      <div className="flex items-start gap-2">
                        <span className="text-muted-foreground min-w-[60px]">Location:</span>
                        <span>
                          {[scanProgress.currentCity, scanProgress.currentState, scanProgress.currentCountry]
                            .filter(Boolean)
                            .join(', ')}
                        </span>
                      </div>
                    )}

                    {/* Concert info (artist + venue) */}
                    {(scanProgress.currentArtist || scanProgress.currentVenue) && (
                      <div className="flex items-start gap-2">
                        <span className="text-muted-foreground min-w-[60px]">Concert:</span>
                        <div className="flex flex-col">
                          {scanProgress.currentArtist && (
                            <span className="font-medium">{scanProgress.currentArtist}</span>
                          )}
                          {scanProgress.currentVenue && (
                            <span className="text-muted-foreground">{scanProgress.currentVenue}</span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Stats summary */}
                    <div className="flex gap-4 pt-2 border-t text-xs">
                      <div className="flex items-center gap-1">
                        <span className="text-muted-foreground">Linked:</span>
                        <span className="font-semibold text-green-600">{scanProgress.linked || 0}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-muted-foreground">New:</span>
                        <span className="font-semibold text-blue-600">{scanProgress.newConcerts || 0}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-muted-foreground">Unmatched:</span>
                        <span className="font-semibold text-orange-600">{scanProgress.unmatched || 0}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {filteredConcerts?.map((concert) => (
          <ConcertCard
            key={concert.id}
            id={concert.id}
            artistName={concert.artist?.name || "Unknown Artist"}
            venueName={concert.venue?.name || "Unknown Venue"}
            city={concert.venue?.city || "Unknown City"}
            date={concert.concertDate}
            weatherCondition={concert.weatherCondition || undefined}
            temperature={concert.temperature || undefined}
            photoCount={concert.photoCount || 0}
            starredCount={concert.starredCount}
          />
        ))}
      </div>

      <Dialog open={showSummaryDialog} onOpenChange={setShowSummaryDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Scan Complete</DialogTitle>
            <DialogDescription>
              {scanSummary?.linked} photos linked, {scanSummary?.unmatched} unmatched
              {scanSummary?.duration !== undefined && (
                <span className="block mt-1 text-xs">
                  Total Time: {Math.floor(scanSummary.duration / 60000)}:{String(Math.floor((scanSummary.duration % 60000) / 1000)).padStart(2, '0')}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          {scanSummary?.concerts && scanSummary.concerts.length > 0 && (
            <div className="py-2">
              <h4 className="font-medium mb-2">Photos linked to:</h4>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {scanSummary.concerts.map((c) => (
                  <Link key={c.concertId} href={`/concert/${c.concertId}`} onClick={() => setShowSummaryDialog(false)}>
                    <div className="flex items-center justify-between p-2 rounded-md hover:bg-muted cursor-pointer">
                      <div>
                        <p className="font-medium">{c.artistName}</p>
                        <p className="text-sm text-muted-foreground">{c.venueName}</p>
                      </div>
                      <Badge variant={c.isNew ? "default" : "secondary"}>
                        {c.photoCount} photo{c.photoCount !== 1 ? 's' : ''}{c.isNew ? ' (new)' : ''}
                      </Badge>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            {scanSummary?.unmatched && scanSummary.unmatched > 0 ? (
              <Link href="/photos/review" className="flex-1">
                <Button variant="secondary" className="w-full" onClick={() => setShowSummaryDialog(false)}>
                  Review {scanSummary.unmatched} Unmatched
                </Button>
              </Link>
            ) : null}
            <Button onClick={() => setShowSummaryDialog(false)} variant={scanSummary?.unmatched ? "outline" : "default"} className={scanSummary?.unmatched ? "" : "w-full"}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Last Scan Result Dialog */}
      <Dialog open={showLastScanDialog} onOpenChange={setShowLastScanDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Last Scan Result</DialogTitle>
            <DialogDescription>
              {lastScanResult && (
                <>
                  {lastScanResult.scanType === 'drive' ? 'Google Drive Scan' : 'Re-scan'} completed on{' '}
                  {new Date(lastScanResult.completedAt).toLocaleString()}
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {lastScanResult && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Total Photos</p>
                  <p className="text-2xl font-bold">{lastScanResult.totalPhotos}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Duration</p>
                  <p className="text-2xl font-bold">{Math.round(lastScanResult.duration / 1000)}s</p>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {lastScanResult.scanType === 'drive' ? (
                  <>
                    <Card>
                      <CardContent className="pt-4 pb-3 text-center">
                        <p className="text-xs text-muted-foreground mb-1">Linked</p>
                        <p className="text-xl font-semibold text-green-600">{lastScanResult.linked}</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-4 pb-3 text-center">
                        <p className="text-xs text-muted-foreground mb-1">New Concerts</p>
                        <p className="text-xl font-semibold text-blue-600">{lastScanResult.newConcerts}</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-4 pb-3 text-center">
                        <p className="text-xs text-muted-foreground mb-1">Unmatched</p>
                        <p className="text-xl font-semibold text-orange-600">{lastScanResult.unmatched}</p>
                      </CardContent>
                    </Card>
                  </>
                ) : (
                  <>
                    <Card>
                      <CardContent className="pt-4 pb-3 text-center">
                        <p className="text-xs text-muted-foreground mb-1">Venues Found</p>
                        <p className="text-xl font-semibold text-blue-600">{lastScanResult.venuesDetected || 0}</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-4 pb-3 text-center">
                        <p className="text-xs text-muted-foreground mb-1">Matched</p>
                        <p className="text-xl font-semibold text-green-600">{lastScanResult.concertsMatched || 0}</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-4 pb-3 text-center">
                        <p className="text-xs text-muted-foreground mb-1">Processed</p>
                        <p className="text-xl font-semibold">{lastScanResult.processed}</p>
                      </CardContent>
                    </Card>
                  </>
                )}
              </div>

              {lastScanResult.processed === 0 && (
                <div className="text-center py-4 text-muted-foreground">
                  <p>No new photos were found to process.</p>
                  <p className="text-sm mt-1">All photos from Google Drive have already been scanned.</p>
                </div>
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
    </div>
  );
} // <--- This closing brace is the one that was missing!