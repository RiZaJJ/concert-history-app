import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  FileText,
  Database,
  Globe,
  AlertCircle,
  RefreshCw,
  Trash2,
  Clock,
  Activity,
  ChevronDown,
  ChevronRight,
  Filter,
} from "lucide-react";

type LogType = "API_CALL" | "DB_READ" | "DB_WRITE" | "EXTERNAL_API" | "ERROR";

interface LogEntry {
  id: string;
  timestamp: string | Date;
  type: LogType;
  category: string;
  action: string;
  details: string;
  duration?: number;
  userId?: number;
  success: boolean;
  error?: string;
  requestData?: any;
  responseData?: any;
}

function getTypeIcon(type: LogType) {
  switch (type) {
    case "API_CALL":
      return <Globe className="h-4 w-4" />;
    case "DB_READ":
      return <Database className="h-4 w-4 text-blue-500" />;
    case "DB_WRITE":
      return <Database className="h-4 w-4 text-green-500" />;
    case "EXTERNAL_API":
      return <Globe className="h-4 w-4 text-purple-500" />;
    case "ERROR":
      return <AlertCircle className="h-4 w-4 text-red-500" />;
    default:
      return <FileText className="h-4 w-4" />;
  }
}

function getTypeLabel(type: LogType): string {
  switch (type) {
    case "API_CALL":
      return "API";
    case "DB_READ":
      return "Read";
    case "DB_WRITE":
      return "Write";
    case "EXTERNAL_API":
      return "External";
    case "ERROR":
      return "Error";
    default:
      return type;
  }
}

function getTypeBadgeVariant(
  type: LogType
): "default" | "secondary" | "destructive" | "outline" {
  switch (type) {
    case "DB_WRITE":
      return "default";
    case "ERROR":
      return "destructive";
    case "DB_READ":
      return "secondary";
    default:
      return "outline";
  }
}

function formatTime(timestamp: string | Date): string {
  const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

function LogEntryRow({ log }: { log: LogEntry }) {
  const [expanded, setExpanded] = useState(false);
  const hasFullData = log.requestData !== undefined || log.responseData !== undefined;

  return (
    <div
      className={`p-3 border-b border-border/50 hover:bg-muted/30 transition-colors ${
        !log.success ? "bg-red-500/5" : ""
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">{getTypeIcon(log.type)}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={getTypeBadgeVariant(log.type)} className="text-xs">
              {getTypeLabel(log.type)}
            </Badge>
            <span className="font-medium text-sm">
              {log.category}.{log.action}
            </span>
            {log.duration && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {log.duration}ms
              </span>
            )}
            <span
              className={`text-xs ${log.success ? "text-green-600" : "text-red-600"}`}
            >
              {log.success ? "✓" : "✗"}
            </span>
            {hasFullData && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="text-xs text-blue-500 hover:text-blue-600 flex items-center gap-1"
              >
                {expanded ? (
                  <>
                    <ChevronDown className="h-3 w-3" />
                    Hide details
                  </>
                ) : (
                  <>
                    <ChevronRight className="h-3 w-3" />
                    Show full data
                  </>
                )}
              </button>
            )}
          </div>
          {log.details && (
            <p className="text-xs text-muted-foreground mt-1 break-all">
              {log.details}
            </p>
          )}
          {log.error && (
            <p className="text-xs text-red-500 mt-1 break-all">
              Error: {log.error}
            </p>
          )}

          {/* Expanded full data view */}
          {expanded && hasFullData && (
            <div className="mt-3 space-y-2 text-xs">
              {log.requestData !== undefined && (
                <div>
                  <div className="font-semibold text-muted-foreground mb-1">Request:</div>
                  <pre className="bg-muted p-2 rounded overflow-x-auto max-h-64 overflow-y-auto">
                    {JSON.stringify(log.requestData, null, 2)}
                  </pre>
                </div>
              )}
              {log.responseData !== undefined && (
                <div>
                  <div className="font-semibold text-muted-foreground mb-1">Response:</div>
                  <pre className="bg-muted p-2 rounded overflow-x-auto max-h-64 overflow-y-auto">
                    {JSON.stringify(log.responseData, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="text-xs text-muted-foreground flex-shrink-0">
          {formatTime(log.timestamp)}
        </div>
      </div>
    </div>
  );
}


export function LogViewer() {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("all");
  const [hiddenApiCalls, setHiddenApiCalls] = useState<Set<string>>(new Set()); // Don't hide any categories by default

  const {
    data: logs,
    isLoading,
    refetch,
  } = trpc.logs.get.useQuery(
    { limit: 1000 }, // Increased to show more logs
    { enabled: open, refetchInterval: open ? 2000 : false }
  );

  const { data: stats } = trpc.logs.stats.useQuery(undefined, {
    enabled: open,
    refetchInterval: open ? 2000 : false,
  });

  const clearMutation = trpc.logs.clear.useMutation({
    onSuccess: () => refetch(),
  });

  // Extract unique categories from logs (filtered by current tab)
  const uniqueCategories = useMemo(() => {
    if (!logs) return [];
    const typedLogs = logs as unknown as LogEntry[];

    // Filter logs based on current tab first
    let relevantLogs = typedLogs;
    if (activeTab === "database") {
      relevantLogs = typedLogs.filter(
        (l) => l.type === "DB_READ" || l.type === "DB_WRITE"
      );
    } else if (activeTab === "api") {
      relevantLogs = typedLogs.filter(
        (l) => l.type === "API_CALL" || l.type === "EXTERNAL_API"
      );
    } else if (activeTab === "errors") {
      relevantLogs = typedLogs.filter((l) => l.type === "ERROR" || !l.success);
    }

    const categories = new Set(relevantLogs.map((l) => l.category));
    return Array.from(categories).sort();
  }, [logs, activeTab]);

  const toggleApiCall = (category: string) => {
    setHiddenApiCalls((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const filterLogs = (type: string): LogEntry[] => {
    if (!logs) return [];
    const typedLogs = logs as unknown as LogEntry[];

    // First apply type filter
    let filtered = typedLogs;
    if (type === "database") {
      filtered = typedLogs.filter(
        (l) => l.type === "DB_READ" || l.type === "DB_WRITE"
      );
    } else if (type === "api") {
      filtered = typedLogs.filter(
        (l) => l.type === "API_CALL" || l.type === "EXTERNAL_API"
      );
    } else if (type === "errors") {
      filtered = typedLogs.filter((l) => l.type === "ERROR" || !l.success);
    }

    // Then apply category filter (but ALWAYS show errors regardless of category filter)
    if (hiddenApiCalls.size > 0) {
      filtered = filtered.filter((l) => !hiddenApiCalls.has(l.category) || l.type === "ERROR" || !l.success);
    }

    return filtered;
  };

  const filteredLogs = filterLogs(activeTab);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <FileText className="h-4 w-4" />
          View Logs
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Activity Log
          </DialogTitle>
        </DialogHeader>

        {/* Stats Row - Compact */}
        {stats && (
          <div className="flex items-center gap-6 px-4 py-2 bg-muted/30 rounded-md text-sm">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="font-semibold">{stats.total}</span>
              <span className="text-muted-foreground">Total</span>
            </div>
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-blue-500" />
              <span className="font-semibold">{stats.byType?.DB_READ || 0}</span>
              <span className="text-muted-foreground">Reads</span>
            </div>
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-green-500" />
              <span className="font-semibold">{stats.byType?.DB_WRITE || 0}</span>
              <span className="text-muted-foreground">Writes</span>
            </div>
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-red-500" />
              <span className="font-semibold">{stats.errorCount}</span>
              <span className="text-muted-foreground">Errors</span>
            </div>
          </div>
        )}

        {/* Tabs and Actions */}
        <div className="flex items-center justify-between">
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="flex-1"
          >
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="database">Database</TabsTrigger>
              <TabsTrigger value="api">API</TabsTrigger>
              <TabsTrigger value="errors">Errors</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1"
                >
                  <Filter className="h-4 w-4" />
                  Filter
                  {hiddenApiCalls.size > 0 && (
                    <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                      {hiddenApiCalls.size}
                    </Badge>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80" align="end">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-sm">Filter by Category</h4>
                    {hiddenApiCalls.size > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setHiddenApiCalls(new Set())}
                        className="h-7 text-xs"
                      >
                        Show all
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Hide/show entire categories of logs
                  </p>
                  <ScrollArea className="max-h-96">
                    <div className="space-y-2">
                      {uniqueCategories.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-4 text-center">
                          No logs yet
                        </p>
                      ) : (
                        uniqueCategories.map((category) => (
                          <div key={category} className="flex items-center space-x-2 py-1">
                            <Checkbox
                              id={category}
                              checked={!hiddenApiCalls.has(category)}
                              onCheckedChange={() => toggleApiCall(category)}
                            />
                            <label
                              htmlFor={category}
                              className="text-sm cursor-pointer flex-1"
                            >
                              {category}
                            </label>
                          </div>
                        ))
                      )}
                    </div>
                  </ScrollArea>
                </div>
              </PopoverContent>
            </Popover>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isLoading}
            >
              <RefreshCw
                className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
              />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => clearMutation.mutate()}
              disabled={clearMutation.isPending}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Log List */}
        <ScrollArea className="border rounded-md bg-background h-[450px]">
          {isLoading ? (
            <div className="flex items-center justify-center h-40">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
              <FileText className="h-8 w-8 mb-2" />
              <p>No logs yet</p>
              <p className="text-xs">
                Perform some actions to see activity here
              </p>
            </div>
          ) : (
            <div>
              {filteredLogs.map((log) => (
                <LogEntryRow key={log.id} log={log} />
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Footer - Compact */}
        <div className="text-xs text-muted-foreground text-center">
          Auto-refresh: 2s • Showing {filteredLogs.length} logs
        </div>
      </DialogContent>
    </Dialog>
  );
}
