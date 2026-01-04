import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";

interface VenueDropdownProps {
  latitude: string;
  longitude: string;
  currentVenue?: string;
  onVenueChange: (venue: {
    name: string;
    city: string;
    state?: string;
    country: string;
    latitude?: string;
    longitude?: string;
  }) => void;
}

export function VenueDropdown({ latitude, longitude, currentVenue, onVenueChange }: VenueDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  
  const { data: nearbyVenues, isLoading } = trpc.photos.getNearbyVenues.useQuery(
    { latitude, longitude },
    { enabled: isOpen }
  );

  return (
    <Select
      onOpenChange={setIsOpen}
      onValueChange={(value) => {
        const venue = nearbyVenues?.find((v: any) => v.name === value);
        if (venue) {
          onVenueChange({
            name: venue.name,
            city: venue.city || "",
            state: venue.state,
            country: venue.country || "",
            latitude: venue.latitude,
            longitude: venue.longitude,
          });
        }
      }}
    >
      <SelectTrigger className="w-full">
        <SelectValue placeholder={currentVenue || "Change venue..."} />
      </SelectTrigger>
      <SelectContent>
        {isLoading && (
          <div className="flex items-center justify-center p-4">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        )}
        {nearbyVenues && nearbyVenues.length > 0 ? (
          nearbyVenues.map((venue: any) => (
            <SelectItem key={venue.name} value={venue.name}>
              {venue.name}
              {venue.distance && ` (${venue.distance}m)`}
            </SelectItem>
          ))
        ) : (
          !isLoading && (
            <div className="p-4 text-sm text-muted-foreground">
              No venues found nearby
            </div>
          )
        )}
      </SelectContent>
    </Select>
  );
}
