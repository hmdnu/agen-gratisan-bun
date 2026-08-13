import type { HTTPClient as HTTPClientInterface } from "../provider/provider.js";
import { errorMessage } from "../util/guards.js";

// HTTPClient wraps the global fetch API. Mirrors Go's http.DefaultClient:
// redirects followed, no timeout.
export class HTTPClient implements HTTPClientInterface {
  async get(url: string): Promise<Uint8Array> {
    let response: Response;
    try {
      response = await fetch(url);
    } catch (err) {
      throw new Error("execute GET request: " + errorMessage(err));
    }

    if (response.status < 200 || response.status >= 300) {
      throw new Error(
        `GET ${url} returned status ${response.status} ${response.statusText}`,
      );
    }

    try {
      return new Uint8Array(await response.arrayBuffer());
    } catch (err) {
      throw new Error("read GET response: " + errorMessage(err));
    }
  }
}
