import { createHash } from "crypto";
import { NextResponse } from "next/server";

export interface IdempotentResult {
  status: number;
  body: unknown;
}

interface CompletedRecord {
  state: "completed";
  requestHash: string;
  status: number;
  body: unknown;
  expiresAt: number;
}

interface PendingRecord {
  state: "pending";
  requestHash: string;
  promise: Promise<IdempotentResult>;
  expiresAt: number;
}

type IdempotencyRecord = CompletedRecord | PendingRecord;

const DEFAULT_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_KEY_LENGTH = 128;

const globalStore = globalThis as typeof globalThis & {
  __jdjsIdempotencyStore?: Map<string, IdempotencyRecord>;
};

function getStore(): Map<string, IdempotencyRecord> {
  if (!globalStore.__jdjsIdempotencyStore) {
    globalStore.__jdjsIdempotencyStore = new Map<string, IdempotencyRecord>();
  }
  return globalStore.__jdjsIdempotencyStore;
}

function pruneExpired(store: Map<string, IdempotencyRecord>, now: number): void {
  if (store.size < 100) return;
  for (const [key, record] of store.entries()) {
    if (record.expiresAt <= now) {
      store.delete(key);
    }
  }
}

function hashPayload(scope: string, rawBody: string): string {
  return createHash("sha256").update(`${scope}:${rawBody}`).digest("hex");
}

function buildResponse(
  result: IdempotentResult,
  idempotencyKey: string,
  replayed: boolean
): NextResponse {
  return NextResponse.json(result.body, {
    status: result.status,
    headers: {
      "Idempotency-Key": idempotencyKey,
      "X-Idempotent-Replayed": replayed ? "true" : "false",
    },
  });
}

/**
 * Enforces idempotent execution for mutating Route Handlers using the
 * `Idempotency-Key` request header, coalescing concurrent duplicates and
 * replaying cached responses for identical retries.
 */
export async function withIdempotency(
  request: Request,
  scope: string,
  rawBody: string,
  handler: () => Promise<IdempotentResult>
): Promise<NextResponse> {
  const rawKey = request.headers.get("idempotency-key")?.trim();

  if (!rawKey) {
    return NextResponse.json(
      { error: "Idempotency-Key header is required." },
      { status: 400 }
    );
  }

  if (rawKey.length > MAX_KEY_LENGTH || !/^[a-zA-Z0-9._:-]+$/.test(rawKey)) {
    return NextResponse.json(
      { error: "Idempotency-Key header format is invalid." },
      { status: 400 }
    );
  }

  const store = getStore();
  const now = Date.now();
  pruneExpired(store, now);

  const compositeKey = `${scope}:${rawKey}`;
  const requestHash = hashPayload(scope, rawBody);
  const existing = store.get(compositeKey);

  if (existing && existing.expiresAt > now) {
    if (existing.requestHash !== requestHash) {
      return NextResponse.json(
        {
          error:
            "Idempotency-Key was already used with a different request payload.",
        },
        {
          status: 409,
          headers: {
            "Idempotency-Key": rawKey,
            "X-Idempotent-Replayed": "false",
          },
        }
      );
    }

    if (existing.state === "completed") {
      return buildResponse(
        { status: existing.status, body: existing.body },
        rawKey,
        true
      );
    }

    const coalescedResult = await existing.promise;
    return buildResponse(coalescedResult, rawKey, true);
  }

  const executionPromise = handler();

  store.set(compositeKey, {
    state: "pending",
    requestHash,
    promise: executionPromise,
    expiresAt: now + DEFAULT_TTL_MS,
  });

  try {
    const result = await executionPromise;
    if (result.status >= 500) {
      store.delete(compositeKey);
    } else {
      store.set(compositeKey, {
        state: "completed",
        requestHash,
        status: result.status,
        body: result.body,
        expiresAt: Date.now() + DEFAULT_TTL_MS,
      });
    }
    return buildResponse(result, rawKey, false);
  } catch (error) {
    store.delete(compositeKey);
    throw error;
  }
}
