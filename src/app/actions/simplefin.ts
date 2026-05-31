"use server";

import { getSetting, setSetting } from "@/app/actions/settings";
import {
  type AccountSetFor,
  claim,
  type GetAccountsOptions,
  SimpleFinClient,
} from "@/utils/simplefin";

/**
 * Settings key under which the claimed SimpleFIN Access URL is stored.
 *
 * The Access URL contains HTTP Basic Auth credentials and should be treated as
 * a secret.
 */
const ACCESS_URL_SETTING_KEY = "simplefin_access_url";

/**
 * Settings key under which the timestamp (epoch ms) of the last successful
 * Access URL validation is stored.
 */
const VALIDATED_AT_SETTING_KEY = "simplefin_validated_at";

/**
 * How long a successful validation is trusted before {@link getTokenStatus}
 * downgrades the token back to {@link TokenStatus.Present}.
 */
const VALIDATION_TRUST_WINDOW_MS = 4 * 60 * 60 * 1000; // 4 hours

/**
 * The state of the stored SimpleFIN Access URL.
 *
 * - `Missing`: no Access URL is stored.
 * - `Present`: an Access URL is stored but has not been validated recently.
 * - `Valid`: an Access URL is stored and was confirmed usable within the trust
 *   window ({@link VALIDATION_TRUST_WINDOW_MS}).
 */
export type TokenStatus = "Missing" | "Present" | "Valid";

/**
 * Read the stored SimpleFIN Access URL, if one has been claimed.
 *
 * @returns the Access URL string, or `undefined` when none is stored.
 */
async function getStoredAccessUrl(): Promise<string | undefined> {
  const setting = await getSetting(ACCESS_URL_SETTING_KEY);
  const value = setting?.value;
  return typeof value === "string" ? value : undefined;
}

/**
 * Read the epoch-ms timestamp of the last successful validation, if any.
 */
async function getValidatedAt(): Promise<number | undefined> {
  const setting = await getSetting(VALIDATED_AT_SETTING_KEY);
  const value = setting?.value;
  return typeof value === "number" ? value : undefined;
}

/**
 * Whether a SimpleFIN Access URL has been claimed and saved.
 *
 * This only checks that an Access URL is present in the database; it does not
 * make a network request to confirm it is still usable. Use
 * {@link haveValidToken} for a live check.
 *
 * @returns `true` when an Access URL is stored.
 */
export async function haveToken(): Promise<boolean> {
  return (await getStoredAccessUrl()) !== undefined;
}

/**
 * Resolve the current {@link TokenStatus} without making a network request.
 *
 * Returns `Valid` only when an Access URL is stored *and* it was validated
 * within the last {@link VALIDATION_TRUST_WINDOW_MS}. Otherwise returns
 * `Present` (stored but stale/unvalidated) or `Missing`.
 */
export async function getTokenStatus(): Promise<TokenStatus> {
  const accessUrl = await getStoredAccessUrl();
  if (accessUrl === undefined) {
    return "Missing";
  }

  const validatedAt = await getValidatedAt();
  if (
    validatedAt !== undefined &&
    Date.now() - validatedAt < VALIDATION_TRUST_WINDOW_MS
  ) {
    return "Valid";
  }

  return "Present";
}

/**
 * Whether the stored SimpleFIN Access URL is present *and* still usable.
 *
 * Unlike {@link haveToken}, this makes a live, minimal `GET /accounts` request
 * (via {@link SimpleFinClient.isAccessUrlValid}) to confirm the credentials
 * still authenticate. A revoked or incorrect Access URL returns `false`.
 *
 * Be aware this counts as a real data request and may be rate-limited or
 * billed by the server, so prefer {@link haveToken} when a presence check is
 * sufficient.
 *
 * @returns `true` when an Access URL is stored and authenticates successfully.
 * @throws when the validation request fails for a non-auth reason (network
 *   error, `402` Payment Required, `5xx`, etc.).
 */
export async function haveValidToken(): Promise<boolean> {
  const accessUrl = await getStoredAccessUrl();
  if (accessUrl === undefined) {
    return false;
  }

  const client = new SimpleFinClient(accessUrl);
  return client.isAccessUrlValid();
}

/**
 * Validate the stored Access URL against the SimpleFIN Server and record the
 * result. On success the validation timestamp is refreshed so the token is
 * trusted for {@link VALIDATION_TRUST_WINDOW_MS}; on failure the stale
 * timestamp is cleared.
 *
 * This is what the settings "Check" button calls to move a token from
 * `Present` to `Valid`.
 *
 * @returns the resulting {@link TokenStatus} (`Valid` or `Present`).
 * @throws when no Access URL is stored, or validation fails for a non-auth
 *   reason (network error, `402`, `5xx`, etc.).
 */
export async function checkToken(): Promise<TokenStatus> {
  const accessUrl = await getStoredAccessUrl();
  if (accessUrl === undefined) {
    throw new Error("No SimpleFIN Access URL is stored.");
  }

  const client = new SimpleFinClient(accessUrl);
  const valid = await client.isAccessUrlValid();

  if (valid) {
    await setSetting(VALIDATED_AT_SETTING_KEY, Date.now());
    return "Valid";
  }

  await setSetting(VALIDATED_AT_SETTING_KEY, null);
  return "Present";
}

/**
 * Claim a SimpleFIN Token and persist the resulting Access URL.
 *
 * The token is exchanged for an Access URL via {@link claim}, which is then
 * stored in the settings table for later use. Any prior validation timestamp
 * is cleared so the new token starts as `Present`.
 *
 * @param token the SimpleFIN Token pasted in by the user.
 * @throws {SimpleFinClaimError} when the token is invalid or the claim fails.
 */
export async function saveNewToken(token: string): Promise<void> {
  const accessUrl = await claim(token);
  await setSetting(ACCESS_URL_SETTING_KEY, accessUrl);
  await setSetting(VALIDATED_AT_SETTING_KEY, null);
}

/**
 * Fetch accounts (and transactions) from the stored SimpleFIN Access URL.
 *
 * Wraps {@link SimpleFinClient.getAccounts}, preserving its option-based return
 * type narrowing (e.g. passing `balancesOnly: true` omits transactions).
 *
 * @param options query options forwarded to `GET /accounts`.
 * @returns a validated Account Set.
 * @throws when no Access URL has been saved yet, or when the request fails.
 */
export async function getAccounts<
  const Options extends GetAccountsOptions = GetAccountsOptions,
>(options?: Options): Promise<AccountSetFor<Options>> {
  const accessUrl = await getStoredAccessUrl();
  if (accessUrl === undefined) {
    throw new Error(
      "No SimpleFIN Access URL is stored. Call saveNewToken() first.",
    );
  }

  const client = new SimpleFinClient(accessUrl);
  return client.getAccounts(options);
}
