import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import Dashboard from "@/pages/Dashboard";
import AddConcert from "@/pages/AddConcert";
import ConcertDetail from "./pages/ConcertDetail";
import PhotoReview from "./pages/PhotoReview";
import SkippedPhotos from "./pages/SkippedPhotos";
import AmbiguousPhotos from "./pages/AmbiguousPhotos";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/concert/new" component={AddConcert} />
      <Route path="/concert/:id" component={ConcertDetail} />
      <Route path="/photos/review" component={PhotoReview} />
      <Route path="/photos/skipped" component={SkippedPhotos} />
      <Route path="/photos/ambiguous" component={AmbiguousPhotos} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="light"
        switchable
      >
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
