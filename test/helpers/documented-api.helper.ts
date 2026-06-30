import * as request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { OpenAPIObject } from '@nestjs/swagger';

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

export type DocumentedApiCall = {
  operationId: string;
  summary: string;
  method: HttpMethod;
  path: string;
  headers?: Record<string, string>;
  pathParams?: Record<string, string>;
  query?: Record<string, string>;
  body?: unknown;
  expectedStatus: number;
};

export function resolvePath(
  path: string,
  pathParams: Record<string, string> = {},
): string {
  return Object.entries(pathParams).reduce(
    (resolved, [key, value]) => resolved.replace(`:${key}`, value),
    path,
  );
}

export function buildHeaders(
  headers: Record<string, string> = {},
): Record<string, string> {
  return {
    Accept: 'application/json',
    ...headers,
  };
}

export function formatCallDocumentation(call: DocumentedApiCall): string {
  const resolvedPath = resolvePath(call.path, call.pathParams);
  const lines = [
    `[${call.operationId}] ${call.summary}`,
    `${call.method.toUpperCase()} ${resolvedPath}`,
    `Expected status: ${call.expectedStatus}`,
  ];

  const headers = buildHeaders(call.headers);
  if (Object.keys(headers).length > 0) {
    lines.push('Headers:');
    for (const [key, value] of Object.entries(headers)) {
      lines.push(`  ${key}: ${value}`);
    }
  }

  if (call.pathParams && Object.keys(call.pathParams).length > 0) {
    lines.push('Path params:');
    for (const [key, value] of Object.entries(call.pathParams)) {
      lines.push(`  ${key}: ${value}`);
    }
  }

  if (call.query && Object.keys(call.query).length > 0) {
    lines.push('Query params:');
    for (const [key, value] of Object.entries(call.query)) {
      lines.push(`  ${key}: ${value}`);
    }
  }

  if (call.body !== undefined) {
    lines.push(`Body: ${JSON.stringify(call.body, null, 2)}`);
  }

  return lines.join('\n');
}

export async function executeDocumentedCall(
  app: INestApplication,
  call: DocumentedApiCall,
) {
  const resolvedPath = resolvePath(call.path, call.pathParams);
  let req = request(app.getHttpServer())[call.method](resolvedPath);

  const headers = buildHeaders(call.headers);
  for (const [key, value] of Object.entries(headers)) {
    req = req.set(key, value);
  }

  if (call.query) {
    req = req.query(call.query);
  }

  if (call.body !== undefined) {
    req = req.send(call.body as string | object);
  }

  const response = await req.expect(call.expectedStatus);
  return response;
}

export function assertSwaggerOperation(
  document: OpenAPIObject,
  operationId: string,
  method: HttpMethod,
  path: string,
) {
  const operation = document.paths?.[path]?.[method];
  expect(operation).toBeDefined();
  expect(operation?.operationId).toBe(operationId);
}

export function assertSwaggerHasSecurity(
  document: OpenAPIObject,
  path: string,
  method: HttpMethod,
) {
  const operation = document.paths?.[path]?.[method];
  expect(operation?.security).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ 'X-User-Id': [] }),
      expect.objectContaining({ 'X-User-Role': [] }),
    ]),
  );
}

export function assertSwaggerResponseSchema(
  document: OpenAPIObject,
  path: string,
  method: HttpMethod,
  status: number,
  schemaName: string,
) {
  const response = document.paths?.[path]?.[method]?.responses?.[String(status)];
  const schemaRef = (response as { content?: { 'application/json'?: { schema?: { $ref?: string } } } })
    ?.content?.['application/json']?.schema?.$ref;
  expect(schemaRef).toBe(`#/components/schemas/${schemaName}`);
}
