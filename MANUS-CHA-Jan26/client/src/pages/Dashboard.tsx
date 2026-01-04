import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { ConcertCard } from "@/components/ConcertCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Search, Music, Sparkles, Download, Moon, Sun, Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Link } from "wouter";
import { toast } from "sonner";
import { useTheme } from "@/contexts/ThemeContext";

export default function Dashboard() {
  const { user, loading: authLoading } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedYear, setSelectedYear] = useState<number | undefined>();
  const [isScanning, setIsScanning] = useState(false);

  // Fetch concerts
  const { data: concerts, isLoading: concertsLoading } = trpc.concerts.list.useQuery(
    undefined,
    { enabled: !!user }
  );

  // Fetch AI insights
  const { data: insights } = trpc.ai.insights.useQuery(
    undefined,
    { enabled: !!user && (concerts?.length ?? 0) > 0 }
  );

  // Fetch AI suggestions
  const { data: suggestions } = trpc.ai.suggestions.useQuery(
    undefined,
    { enabled: !!user && (concerts?.length ?? 0) > 0 }
  );
  
  // Fetch unmatched photos count
  const { data: unmatchedPhotos, refetch: refetchUnmatched } = trpc.photos.getUnmatched.useQuery(
    undefined,
    { enabled: !!user, refetchOnMount: true, refetchOnWindowFocus: false }
  );
  
  // Fetch skipped photos count
  const { data: skippedPhotos } = trpc.photos.getSkipped.useQuery(
    undefined,
    { enabled: !!user }
  );

  const utils = trpc.useUtils();
  
  // Poll for scan progress
  const { data: scanProgress } = trpc.photos.getScanProgress.useQuery(
    undefined,
    { 
      enabled: isScanning,
      refetchInterval: 500, // Poll every 500ms while scanning
    }
  );
  
  // Photo scan mutation
  const scanPhotos = trpc.photos.scanFromDrive.useMutation({
    onMutate: () => {
      setIsScanning(true);
      // Invalidate progress query to clear stale data from previous scan
      utils.photos.getScanProgress.invalidate();
    },
    onSuccess: (stats) => {
      setIsScanning(false);
      let message = `Photo scan complete! Linked ${stats.linked} photos`;
      if (stats.newConcerts > 0) {
        message += `, created ${stats.newConcerts} new concerts`;
      }
      if (stats.unmatched > 0) {
        message += `. ${stats.unmatched} photos need review.`;
      } else {
        message += `.`;
      }
      toast.success(message, { duration: 5000 });
      // Refresh concerts list and unmatched photos
      utils.concerts.list.invalidate();
      utils.photos.getUnmatched.invalidate();
      utils.photos.getSkipped.invalidate();
      // Force refetch to ensure count updates
      setTimeout(() => {
        refetchUnmatched();
      }, 500);
    },
    onError: (error) => {
      setIsScanning(false);
      toast.error(`Photo scan failed: ${error.message}`);
    },
  });
  
  // Clear and rescan mutation
  const clearAndRescan = trpc.photos.clearAll.useMutation({
    onSuccess: (data) => {
      toast.success(`Cleared ${data.count} unmatched photos. Rescanning...`);
      // Trigger rescan after clearing
      scanPhotos.mutate();
    },
    onError: (error) => {
      toast.error(`Clear failed: ${error.message}`);
    },
  });
  
  // Delete test concerts mutation
  const deleteTestConcerts = trpc.concerts.deleteTestConcerts.useMutation({
    onSuccess: (data) => {
      toast.success(`Deleted ${data.count} test concerts`);
      utils.concerts.list.invalidate();
    },
    onError: (error) => {
      toast.error(`Delete failed: ${error.message}`);
    },
  });
  
  // Delete all data mutation
  const deleteAllData = trpc.concerts.deleteAllData.useMutation({
    onSuccess: (data) => {
      toast.success(`Database wiped! Deleted ${data.concerts} concerts, ${data.photos} photos, ${data.unmatchedPhotos} unmatched photos`);
      utils.concerts.list.invalidate();
      utils.photos.getUnmatched.invalidate();
      utils.photos.getSkipped.invalidate();
    },
    onError: (error) => {
      toast.error(`Delete failed: ${error.message}`);
    },
  });

  const loading = authLoading || concertsLoading;

  // Filter concerts based on search
  const filteredConcerts = concerts?.filter((concert) => {
    const matchesSearch = !searchQuery || 
      concert.artist?.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      concert.venue?.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      concert.venue?.city.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesYear = !selectedYear || 
      new Date(concert.concertDate).getFullYear() === selectedYear;
    
    return matchesSearch && matchesYear;
  });

  // Get unique years for filter
  const years = Array.from(
    new Set(concerts?.map(c => new Date(c.concertDate).getFullYear()) || [])
  ).sort((a, b) => b - a);

  if (loading) {
    return (
      <div className="container py-8 max-w-7xl">
        <Skeleton className="h-12 w-64 mb-8" />
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="container py-8 max-w-7xl">
      {/* Header */}
      <div className="flex flex-col gap-6 mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold text-foreground">My Concerts</h1>
            <p className="text-muted-foreground mt-2">
              {concerts?.length || 0} concerts attended
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button
              variant="outline"
              size="icon"
              onClick={toggleTheme}
              title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            >
              {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </Button>
            <Button
              variant="outline"
              onClick={() => scanPhotos.mutate()}
              disabled={isScanning || clearAndRescan.isPending}
            >
              {isScanning ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              {isScanning ? "Scanning..." : "Scan Photos"}
            </Button>
            {concerts && concerts.some(c => c.artist?.name?.includes('Test')) && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  if (confirm('Delete all test concerts? This cannot be undone.')) {
                    deleteTestConcerts.mutate();
                  }
                }}
                disabled={deleteTestConcerts.isPending}
              >
                {deleteTestConcerts.isPending ? "Deleting..." : "Delete Test Concerts"}
              </Button>
            )}
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                if (confirm('⚠️ DELETE ENTIRE DATABASE? This will permanently delete ALL concerts, photos, and data. This cannot be undone!')) {
                  if (confirm('Are you absolutely sure? Type YES in your mind and click OK to proceed.')) {
                    deleteAllData.mutate();
                  }
                }
              }}
              disabled={deleteAllData.isPending}
            >
              {deleteAllData.isPending ? "Deleting..." : "Delete Database"}
            </Button>
            {unmatchedPhotos && unmatchedPhotos.length > 0 && (
              <>
                <Button
                  variant="outline"
                  onClick={() => clearAndRescan.mutate()}
                  disabled={scanPhotos.isPending || clearAndRescan.isPending}
                >
                  {clearAndRescan.isPending ? "Clearing..." : "Clear & Rescan"}
                </Button>
                <Link href="/photos/review">
                  <Button variant="secondary">
                    Review {unmatchedPhotos.length} Unmatched Photo{unmatchedPhotos.length !== 1 ? "s" : ""}
                  </Button>
                </Link>
              </>
            )}
            {skippedPhotos && skippedPhotos.length > 0 && (
              <Link href="/photos/skipped">
                <Button variant="outline">
                  View {skippedPhotos.length} Skipped Photo{skippedPhotos.length !== 1 ? "s" : ""}
                </Button>
              </Link>
            )}
            <Link href="/concert/new">
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Concert
              </Button>
            </Link>
          </div>
        </div>

        {/* Scan Progress */}
        {isScanning && (
          <Card className="border-blue-500/20 bg-blue-500/5">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
                Scanning Photos
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {scanProgress ? (
                <>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      Processing {scanProgress.currentPhoto} of {scanProgress.totalPhotos} photos
                    </span>
                    <span className="font-medium">
                      {Math.round((scanProgress.currentPhoto / scanProgress.totalPhotos) * 100)}%
                    </span>
                  </div>
                  <Progress 
                    value={(scanProgress.currentPhoto / scanProgress.totalPhotos) * 100} 
                    className="h-2"
                  />
                  {scanProgress.currentFileName && (
                    <p className="text-xs text-muted-foreground truncate">
                      Current: {scanProgress.currentFileName}
                    </p>
                  )}
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    <span>Linked: {scanProgress.linked}</span>
                    <span>New concerts: {scanProgress.newConcerts}</span>
                    <span>Unmatched: {scanProgress.unmatched}</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      Initializing scan...
                    </span>
                  </div>
                  <Progress value={0} className="h-2" />
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* AI Insights */}
        {insights && (
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Sparkles className="h-5 w-5 text-primary" />
                Your Concert Insights
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{insights}</p>
            </CardContent>
          </Card>
        )}

        {/* Search and Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by artist, venue, or city..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex gap-2">
            <Button
              variant={selectedYear === undefined ? "default" : "outline"}
              onClick={() => setSelectedYear(undefined)}
              size="sm"
            >
              All Years
            </Button>
            {years.slice(0, 5).map((year) => (
              <Button
                key={year}
                variant={selectedYear === year ? "default" : "outline"}
                onClick={() => setSelectedYear(year)}
                size="sm"
              >
                {year}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Concert Grid */}
      {filteredConcerts && filteredConcerts.length > 0 ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredConcerts.map((concert) => (
            <ConcertCard
              key={concert.id}
              id={concert.id}
              artistName={concert.artist?.name || "Unknown Artist"}
              venueName={concert.venue?.name || "Unknown Venue"}
              city={concert.venue?.city || "Unknown City"}
              date={concert.concertDate}
              weatherCondition={concert.weatherCondition || undefined}
              temperature={concert.temperature || undefined}
              starredCount={concert.starredCount}
            />
          ))}
        </div>
      ) : (
        <Card className="border-dashed">
          <CardHeader className="text-center py-12">
            <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-muted flex items-center justify-center">
              <Music className="h-6 w-6 text-muted-foreground" />
            </div>
            <CardTitle>No concerts found</CardTitle>
            <CardDescription>
              {searchQuery || selectedYear
                ? "Try adjusting your filters"
                : "Start tracking your concert memories by adding your first concert"}
            </CardDescription>
            {!searchQuery && !selectedYear && (
              <div className="mt-6">
                <Link href="/concert/new">
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Your First Concert
                  </Button>
                </Link>
              </div>
            )}
          </CardHeader>
        </Card>
      )}

      {/* AI Suggestions */}
      {suggestions && suggestions.length > 0 && (
        <div className="mt-12">
          <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            Artists You Might Enjoy
          </h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {suggestions.map((suggestion, idx) => (
              <Card key={idx} className="border-border/50">
                <CardHeader>
              <CardTitle className="text-lg">{suggestion.artist}</CardTitle>
              <div>
                <Badge
                    variant={
                      suggestion.confidence === "high"
                        ? "default"
                        : suggestion.confidence === "medium"
                        ? "secondary"
                        : "outline"
                    }
                    className="w-fit"
                  >
                    {suggestion.confidence} confidence
                  </Badge>
              </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{suggestion.reasoning}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
