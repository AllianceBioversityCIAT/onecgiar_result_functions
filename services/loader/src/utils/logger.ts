import { ProcessingResult, ProcessedResult } from "../types.js";

export enum LogLevel {
  INFO = "INFO",
  WARN = "WARN",
  ERROR = "ERROR",
  SUCCESS = "SUCCESS",
}

export interface ProcessingLog {
  timestamp: string;
  level: LogLevel;
  message: string;
  resultId?: string;
  resultType?: string;
  tenant?: string;
  details?: any;
}

export class Logger {
  private logs: ProcessingLog[] = [];

  log(
    level: LogLevel,
    message: string,
    resultId?: string,
    details?: any
  ): void {
    const logEntry: ProcessingLog = {
      timestamp: new Date().toISOString(),
      level,
      message,
      resultId,
      details,
    };

    this.logs.push(logEntry);

    const logMessage = `[${logEntry.timestamp}] ${level} ${
      resultId ? `[${resultId}] ` : ""
    }${message}`;

    switch (level) {
      case LogLevel.ERROR:
        console.error(logMessage, details || "");
        break;
      case LogLevel.WARN:
        console.warn(logMessage, details || "");
        break;
      case LogLevel.SUCCESS:
        console.log(`✅ ${logMessage}`, details || "");
        break;
      default:
        console.log(logMessage, details || "");
    }
  }

  info(message: string, resultId?: string, details?: any): void {
    this.log(LogLevel.INFO, message, resultId, details);
  }

  warn(message: string, resultId?: string, details?: any): void {
    this.log(LogLevel.WARN, message, resultId, details);
  }

  error(message: string, resultId?: string, details?: any): void {
    this.log(LogLevel.ERROR, message, resultId, details);
  }

  success(message: string, resultId?: string, details?: any): void {
    this.log(LogLevel.SUCCESS, message, resultId, details);
  }

  logProcessingResult(
    result: ProcessingResult,
    resultData?: ProcessedResult
  ): void {
    const resultId = resultData?.idempotencyKey || "unknown";
    const resultType = resultData?.type || "unknown";

    if (result.success) {
      this.success(`Result processed successfully`, resultId, {
        type: resultType,
        tenant: resultData?.tenant,
        hasExternalId: !!result.result?.result_id,
        hasResultCode: !!result.result?.result_code,
        externalApiStatus: result.externalApiResponse?.status,
        opensearchIndexed: !!result.opensearchResponse,
      });
    } else {
      this.error(`Result processing failed: ${result.error}`, resultId, {
        type: resultType,
        tenant: resultData?.tenant,
        error: result.error,
      });
    }
  }

  logBatchSummary(
    total: number,
    successful: number,
    failed: number,
    processingTimeMs: number
  ): void {
    const successRate =
      total > 0 ? ((successful / total) * 100).toFixed(1) : "0";

    this.info(`Batch processing completed`, undefined, {
      total,
      successful,
      failed,
      successRate: `${successRate}%`,
      processingTimeMs,
      avgTimePerResult:
        total > 0 ? (processingTimeMs / total).toFixed(2) + "ms" : "0ms",
    });
  }

  getLogs(): ProcessingLog[] {
    return [...this.logs];
  }

  getLogsSummary(): { total: number; byLevel: Record<LogLevel, number> } {
    const byLevel = {
      [LogLevel.INFO]: 0,
      [LogLevel.WARN]: 0,
      [LogLevel.ERROR]: 0,
      [LogLevel.SUCCESS]: 0,
    };

    this.logs.forEach((log) => {
      byLevel[log.level]++;
    });

    return {
      total: this.logs.length,
      byLevel,
    };
  }

  clearLogs(): void {
    this.logs = [];
  }
}
