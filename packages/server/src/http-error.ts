/** An error that carries the HTTP status the server should answer with. */
export class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}
