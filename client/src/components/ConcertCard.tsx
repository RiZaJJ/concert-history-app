import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, MapPin, Thermometer, Star, Image } from "lucide-react";
import { Link } from "wouter";

interface ConcertCardProps {
  id: number;
  artistName: string;
  venueName: string;
  city: string;
  date: Date;
  weatherCondition?: string;
  temperature?: number;
  photoCount: number;
  starredCount: number;
}

export function ConcertCard({
  id,
  artistName,
  venueName,
  city,
  date,
  weatherCondition,
  temperature,
  photoCount,
  starredCount,
}: ConcertCardProps) {
  const formattedDate = new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <Link href={`/concert/${id}`}>
      <Card className="hover:shadow-lg transition-shadow cursor-pointer border-border/50 bg-card">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h3 className="text-xl font-semibold text-card-foreground truncate">
                {artistName}
              </h3>
              <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="truncate">{venueName}, {city}</span>
              </p>
            </div>
            {starredCount > 0 && (
              <Badge variant="secondary" className="flex items-center gap-1 flex-shrink-0">
                <Star className="h-3 w-3 fill-current" />
                {starredCount}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4" />
              <span>{formattedDate}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Image className="h-4 w-4" />
              <span>{photoCount} photo{photoCount !== 1 ? 's' : ''}</span>
            </div>
            {weatherCondition && (
              <div className="flex items-center gap-1.5">
                <Thermometer className="h-4 w-4" />
                <span>
                  {temperature}°F • {weatherCondition}
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
