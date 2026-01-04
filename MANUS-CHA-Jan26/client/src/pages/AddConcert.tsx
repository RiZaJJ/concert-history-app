import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export default function AddConcert() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [formData, setFormData] = useState({
    artistName: "",
    venueName: "",
    city: "",
    state: "",
    country: "USA",
    concertDate: "",
    latitude: "",
    longitude: "",
  });

  const utils = trpc.useUtils();
  const createConcert = trpc.concerts.create.useMutation({
    onSuccess: (data) => {
      if (data.isNew) {
        toast.success("Concert added successfully!");
      } else {
        toast.info("This concert already exists in your collection.");
      }
      utils.concerts.list.invalidate();
      setLocation("/");
    },
    onError: (error) => {
      toast.error(`Failed to add concert: ${error.message}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Count how many of the three key fields are filled
    const filledFields = [
      formData.artistName,
      formData.venueName,
      formData.concertDate
    ].filter(Boolean).length;
    
    if (filledFields < 2) {
      toast.error("Please fill in at least 2 of: Artist, Venue, or Date");
      return;
    }
    
    // City is required if venue is provided
    if (formData.venueName && !formData.city) {
      toast.error("City is required when venue is provided");
      return;
    }

    createConcert.mutate({
      artistName: formData.artistName || undefined,
      venueName: formData.venueName || undefined,
      city: formData.city || undefined,
      state: formData.state || undefined,
      country: formData.country || undefined,
      concertDate: new Date(formData.concertDate),
      latitude: formData.latitude || undefined,
      longitude: formData.longitude || undefined,
    });
  };

  if (!user) {
    return null;
  }

  return (
    <div className="container py-8 max-w-2xl">
      <Button
        variant="ghost"
        onClick={() => setLocation("/")}
        className="mb-6"
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to Dashboard
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>Add Concert</CardTitle>
          <CardDescription>
            Fill in at least 2 of: Artist, Venue, or Date. Weather data will be fetched automatically if location coordinates are provided.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="artistName">Artist Name</Label>
              <Input
                id="artistName"
                placeholder="e.g., The Rolling Stones"
                value={formData.artistName}
                onChange={(e) => setFormData({ ...formData, artistName: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="venueName">Venue Name</Label>
              <Input
                id="venueName"
                placeholder="e.g., Madison Square Garden"
                value={formData.venueName}
                onChange={(e) => setFormData({ ...formData, venueName: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="city">City {formData.venueName && '*'}</Label>
                <Input
                  id="city"
                  placeholder="e.g., New York"
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="state">State/Province</Label>
                <Input
                  id="state"
                  placeholder="e.g., NY"
                  value={formData.state}
                  onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="country">Country *</Label>
              <Input
                id="country"
                placeholder="e.g., USA"
                value={formData.country}
                onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="concertDate">Concert Date *</Label>
              <Input
                id="concertDate"
                type="date"
                value={formData.concertDate}
                onChange={(e) => setFormData({ ...formData, concertDate: e.target.value })}
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="latitude">Latitude (optional)</Label>
                <Input
                  id="latitude"
                  placeholder="e.g., 40.7505"
                  value={formData.latitude}
                  onChange={(e) => setFormData({ ...formData, latitude: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="longitude">Longitude (optional)</Label>
                <Input
                  id="longitude"
                  placeholder="e.g., -73.9934"
                  value={formData.longitude}
                  onChange={(e) => setFormData({ ...formData, longitude: e.target.value })}
                />
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setLocation("/")}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createConcert.isPending}
                className="flex-1"
              >
                {createConcert.isPending ? "Adding..." : "Add Concert"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
