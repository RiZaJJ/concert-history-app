/**
 * Human-friendly logging system for Concert History App
 * Tracks all API calls and database operations
 */

export type LogType = 'API_CALL' | 'DB_READ' | 'DB_WRITE' | 'EXTERNAL_API' | 'ERROR';

export interface LogEntry {
  id: string;
  timestamp: Date;
  type: LogType;
  category: string;
  action: string;
  details: string;
  duration?: number;
  userId?: number;
  success: boolean;
  error?: string;
  // Full request/response data (not truncated)
  requestData?: any;
  responseData?: any;
}

// In-memory log storage (circular buffer)
const MAX_LOGS = 5000; // Increased for full logging during app usage
const logs: LogEntry[] = [];
let logIdCounter = 0;

function generateId(): string {
  return `log_${Date.now()}_${++logIdCounter}`;
}

function formatTimestamp(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });
}

function getTypeEmoji(type: LogType): string {
  switch (type) {
    case 'API_CALL': return '🌐';
    case 'DB_READ': return '📖';
    case 'DB_WRITE': return '✏️';
    case 'EXTERNAL_API': return '🔗';
    case 'ERROR': return '❌';
    default: return '📝';
  }
}

function getTypeLabel(type: LogType): string {
  switch (type) {
    case 'API_CALL': return 'API Call';
    case 'DB_READ': return 'DB Read';
    case 'DB_WRITE': return 'DB Write';
    case 'EXTERNAL_API': return 'External API';
    case 'ERROR': return 'Error';
    default: return 'Log';
  }
}

/**
 * Add a log entry
 */
export function addLog(entry: Omit<LogEntry, 'id' | 'timestamp'>): LogEntry {
  const logEntry: LogEntry = {
    id: generateId(),
    timestamp: new Date(),
    ...entry
  };

  logs.push(logEntry);

  // Keep only the last MAX_LOGS entries
  if (logs.length > MAX_LOGS) {
    logs.shift();
  }

  // Also log to console for debugging
  const emoji = getTypeEmoji(logEntry.type);
  const status = logEntry.success ? '✓' : '✗';
  const duration = logEntry.duration ? ` (${logEntry.duration}ms)` : '';
  console.log(
    `${emoji} [${formatTimestamp(logEntry.timestamp)}] ${logEntry.category}.${logEntry.action}${duration} ${status}`
  );
  if (logEntry.details) {
    console.log(`   └─ ${logEntry.details}`);
  }
  if (logEntry.error) {
    console.log(`   └─ Error: ${logEntry.error}`);
  }

  return logEntry;
}

/**
 * Truncate large objects for storage
 */
function truncateForStorage(data: unknown, maxSize: number = 10000): unknown {
  if (data === null || data === undefined) return data;

  try {
    const str = JSON.stringify(data);
    if (str.length <= maxSize) {
      return data;
    }

    // If too large, return a truncated string representation
    return {
      _truncated: true,
      _originalSize: str.length,
      _preview: str.slice(0, maxSize) + '... (truncated)'
    };
  } catch (e) {
    return { _error: 'Could not serialize data' };
  }
}

/**
 * Log an API call
 */
export function logApiCall(
  procedure: string,
  input: unknown,
  userId?: number
): { complete: (result?: unknown, error?: Error) => void; startTime: number } {
  const startTime = Date.now();
  const inputStr = input ? JSON.stringify(input).slice(0, 200) : 'none';

  return {
    startTime,
    complete: (result?: unknown, error?: Error) => {
      const duration = Date.now() - startTime;
      const resultStr = result ? JSON.stringify(result).slice(0, 100) : '';

      addLog({
        type: error ? 'ERROR' : 'API_CALL',
        category: 'tRPC',
        action: procedure,
        details: error
          ? `Input: ${inputStr}`
          : `Input: ${inputStr}${resultStr ? ` → Result: ${resultStr}...` : ''}`,
        duration,
        userId,
        success: !error,
        error: error?.message,
        // Store truncated data for inspection (max 10KB per field)
        requestData: truncateForStorage(input, 10000),
        responseData: error ? undefined : truncateForStorage(result, 10000)
      });
    }
  };
}

/**
 * Log a database read operation
 */
export function logDbRead(
  table: string,
  operation: string,
  query: string,
  resultCount?: number,
  userId?: number
): void {
  addLog({
    type: 'DB_READ',
    category: table,
    action: operation,
    details: `${query}${resultCount !== undefined ? ` → ${resultCount} row(s)` : ''}`,
    userId,
    success: true
  });
}

/**
 * Log a database write operation
 */
export function logDbWrite(
  table: string,
  operation: 'INSERT' | 'UPDATE' | 'DELETE',
  details: string,
  success: boolean = true,
  userId?: number,
  error?: string
): void {
  addLog({
    type: success ? 'DB_WRITE' : 'ERROR',
    category: table,
    action: operation,
    details,
    userId,
    success,
    error
  });
}

/**
 * Log an external API call
 */
export function logExternalApi(
  service: string,
  endpoint: string,
  success: boolean,
  details: string,
  duration?: number,
  error?: string
): void {
  addLog({
    type: success ? 'EXTERNAL_API' : 'ERROR',
    category: service,
    action: endpoint,
    details,
    duration,
    success,
    error
  });
}

/**
 * Get all logs (newest first)
 */
export function getLogs(limit?: number, types?: LogType[]): LogEntry[] {
  let result = [...logs].reverse();

  if (types && types.length > 0) {
    result = result.filter(log => types.includes(log.type));
  }

  if (limit) {
    result = result.slice(0, limit);
  }

  return result;
}

/**
 * Get logs formatted for human reading
 */
export function getFormattedLogs(limit?: number, types?: LogType[]): string[] {
  return getLogs(limit, types).map(log => {
    const emoji = getTypeEmoji(log.type);
    const time = formatTimestamp(log.timestamp);
    const status = log.success ? '✓' : '✗';
    const duration = log.duration ? ` (${log.duration}ms)` : '';
    const typeLabel = getTypeLabel(log.type);

    let line = `${emoji} [${time}] [${typeLabel}] ${log.category}.${log.action}${duration} ${status}`;
    if (log.details) {
      line += `\n   └─ ${log.details}`;
    }
    if (log.error) {
      line += `\n   └─ Error: ${log.error}`;
    }
    return line;
  });
}

/**
 * Clear all logs
 */
export function clearLogs(): void {
  logs.length = 0;
  addLog({
    type: 'API_CALL',
    category: 'Logger',
    action: 'clearLogs',
    details: 'All logs cleared',
    success: true
  });
}

/**
 * Get log statistics
 */
export function getLogStats(): {
  total: number;
  byType: Record<LogType, number>;
  errorCount: number;
  avgDuration: number;
} {
  const stats = {
    total: logs.length,
    byType: {
      API_CALL: 0,
      DB_READ: 0,
      DB_WRITE: 0,
      EXTERNAL_API: 0,
      ERROR: 0
    } as Record<LogType, number>,
    errorCount: 0,
    avgDuration: 0
  };

  let totalDuration = 0;
  let durationCount = 0;

  for (const log of logs) {
    stats.byType[log.type]++;
    if (!log.success) {
      stats.errorCount++;
    }
    if (log.duration) {
      totalDuration += log.duration;
      durationCount++;
    }
  }

  stats.avgDuration = durationCount > 0 ? Math.round(totalDuration / durationCount) : 0;

  return stats;
}
