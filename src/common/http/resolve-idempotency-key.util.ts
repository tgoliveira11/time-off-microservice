export function resolveIdempotencyKey(
  headerKey?: string,
  bodyKey?: string,
): string | undefined {
  const normalizedHeader = headerKey?.trim();
  if (normalizedHeader) {
    return normalizedHeader;
  }

  const normalizedBody = bodyKey?.trim();
  return normalizedBody || undefined;
}
