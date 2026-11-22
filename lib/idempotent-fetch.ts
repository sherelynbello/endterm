export interface IdempotentResponse<T> {
  ok: boolean;
  status: number;
  data: T;
  replayed: boolean;
  idempotencyKey: string;
}

export function createIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `idem-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function sendIdempotent<T>(
  url: string,
  method: "POST" | "DELETE",
  payload: unknown,
  idempotencyKey: string
): Promise<IdempotentResponse<T>> {
  const response = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(payload),
  });

  const data = (await response.json()) as T;
  const replayed = response.headers.get("X-Idempotent-Replayed") === "true";

  return {
    ok: response.ok,
    status: response.status,
    data,
    replayed,
    idempotencyKey,
  };
}

export async function postIdempotent<T>(
  url: string,
  payload: unknown,
  idempotencyKey: string
): Promise<IdempotentResponse<T>> {
  return sendIdempotent<T>(url, "POST", payload, idempotencyKey);
}
