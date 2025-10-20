export interface EventDetail {
  s3?: {
    bucket: string;
    key: string;
  };
  payload?: any;
  idempotencyKey?: string;
  correlationId?: string;
  ts?: number;
}

export interface LambdaEvent {
  source?: string;
  "detail-type"?: string;
  detail?: EventDetail;
}

export interface ResultData {
  tenant?: string;
  type: string;
  op?: string;
  received_at: string;
  idempotencyKey: string;
  [key: string]: any;
}

export interface ProcessedResult extends ResultData {
  result_type_id: number;
  result_level_id: number;
  result_id?: number;
  result_code?: number;
}

export interface ExternalApiResponse {
  response: {
    results: Array<{
      id: number;
      result_code: number;
    }>;
  };
  message: string;
  status: number;
}

export interface ProcessingResult {
  success: boolean;
  result?: ProcessedResult;
  error?: string;
  externalApiResponse?: ExternalApiResponse;
  opensearchResponse?: any;
}

export interface ProcessorInterface {
  process(result: ResultData): Promise<ProcessingResult>;
}
