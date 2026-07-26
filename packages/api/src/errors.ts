/**
 * One error type for the whole service.
 *
 * A route never builds a response by hand: it throws, and the app's error
 * handler turns `code` into the JSON body and `status` into the status line.
 * The code is a stable machine string (`insufficient_coins`), not prose — the
 * client maps it to a localised message, so wording changes never break a UI
 * that was matching on it.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = new.target.name;
  }
}
