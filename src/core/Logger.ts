// Structured logging system
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  component: string;
  message: string;
  data?: any;
  error?: Error;
}

interface LoggerOptions {
  level: LogLevel;
  component: string;
  enableConsole: boolean;
  enableStorage: boolean;
  maxStoredEntries: number;
}

export class Logger {
  private readonly options: LoggerOptions;
  private readonly entries: LogEntry[] = [];

  constructor(options: Partial<LoggerOptions> = {}) {
    this.options = {
      level: options.level ?? LogLevel.INFO,
      component: options.component ?? "Unknown",
      enableConsole: options.enableConsole ?? true,
      enableStorage: options.enableStorage ?? false,
      maxStoredEntries: options.maxStoredEntries ?? 1000,
    };
  }

  debug(message: string, data?: any): void {
    this.log(LogLevel.DEBUG, message, data);
  }

  info(message: string, data?: any): void {
    this.log(LogLevel.INFO, message, data);
  }

  warn(message: string, data?: any): void {
    this.log(LogLevel.WARN, message, data);
  }

  error(message: string, error?: Error | any, data?: any): void {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    this.log(LogLevel.ERROR, message, data, errorObj);
  }

  private log(
    level: LogLevel,
    message: string,
    data?: any,
    error?: Error,
  ): void {
    if (level < this.options.level) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      component: this.options.component,
      message,
      data,
      error,
    };

    if (this.options.enableStorage) {
      this.storeEntry(entry);
    }

    if (this.options.enableConsole) {
      this.logToConsole(entry);
    }
  }

  private storeEntry(entry: LogEntry): void {
    this.entries.push(entry);

    // Trim entries if we exceed the limit
    if (this.entries.length > this.options.maxStoredEntries) {
      this.entries.splice(
        0,
        this.entries.length - this.options.maxStoredEntries,
      );
    }
  }

  private logToConsole(entry: LogEntry): void {
    const prefix = `[${entry.component}]`;
    const timestamp = entry.timestamp.toISOString();

    switch (entry.level) {
      case LogLevel.DEBUG:
        console.debug(`${timestamp} ${prefix}`, entry.message, entry.data);
        break;
      case LogLevel.INFO:
        console.log(`${timestamp} ${prefix}`, entry.message, entry.data);
        break;
      case LogLevel.WARN:
        console.warn(`${timestamp} ${prefix}`, entry.message, entry.data);
        break;
      case LogLevel.ERROR:
        console.error(`${timestamp} ${prefix}`, entry.message, entry.data);
        if (entry.error) {
          console.error(entry.error.stack);
        }
        break;
    }
  }

  // Get stored log entries for debugging
  getEntries(level?: LogLevel): LogEntry[] {
    if (level === undefined) {
      return [...this.entries];
    }
    return this.entries.filter((entry) => entry.level >= level);
  }

  // Clear stored entries
  clear(): void {
    this.entries.length = 0;
  }

  // Create a child logger with the same configuration but different component name
  child(component: string): Logger {
    return new Logger({
      ...this.options,
      component: `${this.options.component}:${component}`,
    });
  }
}
