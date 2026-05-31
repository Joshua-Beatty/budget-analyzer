import { z } from "zod";

/**
 * SimpleFIN protocol client.
 *
 * @see https://www.simplefin.org/protocol.html
 */

// ---------------------------------------------------------------------------
// Zod schemas (response validation)
// ---------------------------------------------------------------------------

/** @see https://www.simplefin.org/protocol.html#error */
export const ErrorSchema = z.object({
  code: z.string(),
  msg: z.string(),
  conn_id: z.string().optional(),
  account_id: z.string().optional(),
});
export type SimpleFinError = z.infer<typeof ErrorSchema>;

/** @see https://www.simplefin.org/protocol.html#connection */
export const ConnectionSchema = z.object({
  conn_id: z.string(),
  name: z.string(),
  org_id: z.string(),
  org_url: z.string().optional(),
  sfin_url: z.string(),
});
export type Connection = z.infer<typeof ConnectionSchema>;

/** @see https://www.simplefin.org/protocol.html#transaction */
export const TransactionSchema = z.object({
  id: z.string(),
  posted: z.number(),
  amount: z.string(),
  description: z.string(),
  transacted_at: z.number().optional(),
  pending: z.boolean().optional(),
  extra: z.record(z.string(), z.unknown()).optional(),
});
export type Transaction = z.infer<typeof TransactionSchema>;

/** @see https://www.simplefin.org/protocol.html#account */
export const AccountSchema = z.object({
  id: z.string(),
  name: z.string(),
  conn_id: z.string(),
  currency: z.string(),
  balance: z.string(),
  "available-balance": z.string().optional(),
  "balance-date": z.number(),
  transactions: z.array(TransactionSchema).optional(),
  extra: z.record(z.string(), z.unknown()).optional(),
});
export type Account = z.infer<typeof AccountSchema>;

/** @see https://www.simplefin.org/protocol.html#account-set */
export const AccountSetSchema = z.object({
  errlist: z.array(ErrorSchema),
  /** @deprecated Use {@link AccountSet.errlist} instead. */
  errors: z.array(z.string()).optional(),
  connections: z.array(ConnectionSchema),
  accounts: z.array(AccountSchema),
});
export type AccountSet = z.infer<typeof AccountSetSchema>;

// ---------------------------------------------------------------------------
// Claim
// ---------------------------------------------------------------------------

/**
 * Claim an Access URL from a SimpleFIN Token.
 *
 * A SimpleFIN Token is a Base64-encoded claim URL. This decodes it and makes a
 * POST request to claim a (one-time) Access URL which should be stored
 * securely for later use.
 *
 * @param token The SimpleFIN Token received from the user.
 * @returns The Access URL (a URL with embedded HTTP Basic Auth credentials).
 * @throws If the token is invalid or the claim fails (e.g. a 403, meaning the
 *   token may be compromised).
 *
 * @see https://www.simplefin.org/protocol.html#claim-the-access-url
 */
export async function claim(token: string): Promise<string> {
  let claimUrl: string;
  try {
    claimUrl = atob(token.trim());
  } catch {
    throw new SimpleFinClaimError("Invalid SimpleFIN Token: not valid Base64.");
  }

  if (!claimUrl.startsWith("https://")) {
    throw new SimpleFinClaimError(
      "Invalid SimpleFIN Token: decoded claim URL must be HTTPS.",
    );
  }

  const res = await fetch(claimUrl, { method: "POST" });

  if (res.status === 403) {
    throw new SimpleFinClaimError(
      "Claim failed (403): the token does not exist or has already been " +
        "claimed. The token may be compromised and should be disabled.",
      res.status,
    );
  }

  if (!res.ok) {
    throw new SimpleFinClaimError(
      `Claim failed with status ${res.status}.`,
      res.status,
    );
  }

  const accessUrl = (await res.text()).trim();

  if (!accessUrl.startsWith("https://")) {
    throw new SimpleFinClaimError(
      "Claim succeeded but returned an unexpected (non-HTTPS) Access URL.",
      res.status,
    );
  }

  return accessUrl;
}

/** Error thrown when claiming an Access URL fails. */
export class SimpleFinClaimError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "SimpleFinClaimError";
    this.status = status;
  }
}

/** Error thrown when a request to a SimpleFIN Server fails. */
export class SimpleFinRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "SimpleFinRequestError";
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

/**
 * Options for {@link SimpleFinClient.getAccounts}.
 *
 * @see https://www.simplefin.org/protocol.html#get-accounts
 */
export interface GetAccountsOptions {
  /**
   * If given, transactions are restricted to those on or after this Unix
   * epoch timestamp (in seconds).
   */
  startDate?: number;
  /**
   * If given, transactions are restricted to those before (but not on) this
   * Unix epoch timestamp (in seconds).
   */
  endDate?: number;
  /**
   * Include pending transactions (if supported by the server). Pending
   * transactions are excluded by default.
   */
  pending?: boolean;
  /**
   * Only return information related to the given account id(s). May be a
   * single id or an array of ids.
   */
  account?: string | string[];
  /** If `true`, no transaction data is returned (balances only). */
  balancesOnly?: boolean;
  /** Protocol version. Must be `2` for this version of the protocol. */
  version?: 1 | 2;
}

/**
 * An {@link Account} guaranteed to have no `transactions` field, returned when
 * {@link GetAccountsOptions.balancesOnly} is set.
 */
export type BalanceOnlyAccount = Omit<Account, "transactions">;

/**
 * The shape of an Account Set, narrowed based on the request options. When
 * `balancesOnly` is `true`, accounts are guaranteed to omit `transactions`.
 */
export type AccountSetFor<Options extends GetAccountsOptions> =
  Options extends { balancesOnly: true }
    ? Omit<AccountSet, "accounts"> & { accounts: BalanceOnlyAccount[] }
    : AccountSet;

/**
 * A client for a SimpleFIN Server, scoped to a single Access URL.
 *
 * @example
 * ```ts
 * const accessUrl = await claim(token);
 * const client = new SimpleFinClient(accessUrl);
 * const { accounts } = await client.getAccounts({ balancesOnly: true });
 * ```
 */
export class SimpleFinClient {
  /**
   * Base URL with credentials stripped (without trailing slash), e.g.
   * `https://beta-bridge.simplefin.org/simplefin`. Credentials are sent via
   * the {@link authHeader} instead, since the `fetch`/`Request` constructor
   * rejects URLs that embed credentials.
   */
  private readonly baseUrl: string;

  /** Pre-computed HTTP Basic `Authorization` header value. */
  private readonly authHeader: string;

  /**
   * @param accessUrl The Access URL obtained from {@link claim}. It is an
   *   HTTPS URL with embedded HTTP Basic Auth credentials, e.g.
   *   `https://user:[email protected]/simplefin`.
   */
  constructor(accessUrl: string) {
    let url: URL;
    try {
      url = new URL(accessUrl.trim());
    } catch {
      throw new Error("Access URL is not a valid URL.");
    }

    if (url.protocol !== "https:") {
      throw new Error("Access URL must be an HTTPS URL.");
    }

    // SimpleFIN uses HTTP Basic Auth. The credentials are carried in the
    // Access URL's userinfo, but the WHATWG `Request` constructor forbids
    // URLs containing credentials, so move them into an Authorization header.
    const username = decodeURIComponent(url.username);
    const password = decodeURIComponent(url.password);
    this.authHeader = `Basic ${btoa(`${username}:${password}`)}`;

    url.username = "";
    url.password = "";
    this.baseUrl = url.toString().replace(/\/+$/, "");
  }

  /**
   * `GET /accounts` — retrieve account and transaction data.
   *
   * The return type is narrowed based on the provided options: passing
   * `balancesOnly: true` produces accounts without a `transactions` field.
   *
   * @param options Query options (all optional).
   * @returns A validated {@link AccountSet}.
   * @throws {SimpleFinRequestError} On a non-2xx response (e.g. 402, 403).
   * @throws {z.ZodError} If the response body does not match the schema.
   *
   * @see https://www.simplefin.org/protocol.html#get-accounts
   */
  async getAccounts<
    const Options extends GetAccountsOptions = GetAccountsOptions,
  >(options?: Options): Promise<AccountSetFor<Options>> {
    const url = new URL(`${this.baseUrl}/accounts`);
    const params = url.searchParams;

    if (options?.startDate !== undefined) {
      params.set("start-date", String(options.startDate));
    }
    if (options?.endDate !== undefined) {
      params.set("end-date", String(options.endDate));
    }
    if (options?.pending) {
      params.set("pending", "1");
    }
    if (options?.balancesOnly) {
      params.set("balances-only", "1");
    }
    // Default to protocol v2. Servers such as the SimpleFIN Bridge only
    // return the v2 response shape (errlist/connections/conn_id) when
    // `version=2` is explicitly requested; otherwise they fall back to v1.
    params.set("version", String(options?.version ?? 2));
    if (options?.account !== undefined) {
      const accounts = Array.isArray(options.account)
        ? options.account
        : [options.account];
      for (const id of accounts) {
        params.append("account", id);
      }
    }

    const res = await fetch(url, {
      headers: { Authorization: this.authHeader },
    });

    if (!res.ok) {
      let detail = "";
      try {
        detail = (await res.text()).trim();
      } catch {
        // ignore body read failures
      }
      throw new SimpleFinRequestError(
        `GET /accounts failed with status ${res.status}.${
          detail ? ` ${detail}` : ""
        }`,
        res.status,
      );
    }

    const json: unknown = await res.json();
    return AccountSetSchema.parse(json) as AccountSetFor<Options>;
  }

  /**
   * Check whether this Access URL is still usable.
   *
   * The SimpleFIN protocol has no dedicated validation endpoint, so this
   * makes a real (minimal) `GET /accounts?balances-only=1` request and
   * inspects the result:
   *
   * - `200` → resolves `true`.
   * - `403` → resolves `false`. Note the server cannot distinguish a revoked
   *   Access URL from incorrect credentials, so both map to `false`.
   *
   * Any other failure (network error, `402` Payment Required, `5xx`, or an
   * invalid response body) is re-thrown so the caller can handle it
   * separately rather than mistaking it for an expired URL.
   *
   * Be aware this counts as a normal data request and may be rate-limited or
   * billed by the server, so avoid calling it on a hot path.
   *
   * @returns `true` if the Access URL authenticates successfully.
   * @throws {SimpleFinRequestError} On non-403 HTTP failures.
   *
   * @see https://www.simplefin.org/protocol.html#get-accounts
   */
  async isAccessUrlValid(): Promise<boolean> {
    try {
      await this.getAccounts({ balancesOnly: true });
      return true;
    } catch (err) {
      if (err instanceof SimpleFinRequestError && err.status === 403) {
        return false;
      }
      throw err;
    }
  }
}
