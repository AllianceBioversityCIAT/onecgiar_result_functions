export type HttpMethod =
  | "get"
  | "post"
  | "put"
  | "patch"
  | "delete"
  | "options"
  | "head";

export interface OpenApiParameter {
  name: string;
  in: "query" | "path" | "header" | "cookie";
  required?: boolean;
  description?: string;
  /** Some specs put enum on the parameter instead of inside schema */
  enum?: string[];
  schema?: {
    type?: string;
    enum?: string[];
    example?: unknown;
    default?: unknown;
  };
  example?: unknown;
}

export interface OpenApiMediaType {
  schema?: unknown;
  example?: unknown;
  examples?: Record<string, { summary?: string; value: unknown }>;
}

export interface OpenApiOperation {
  summary?: string;
  description?: string;
  parameters?: OpenApiParameter[];
  requestBody?: {
    required?: boolean;
    content?: Record<string, OpenApiMediaType>;
  };
  responses?: Record<string, { description?: string }>;
}

export type PathItem = Partial<Record<HttpMethod, OpenApiOperation>>;

export interface OpenApiDocument {
  openapi?: string;
  info?: { title?: string; version?: string; description?: string };
  paths: Record<string, PathItem>;
}

export interface ListedOperation {
  method: HttpMethod;
  path: string;
  operation: OpenApiOperation;
}
