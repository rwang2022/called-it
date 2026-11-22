import "server-only";
import { cache } from "react";

/** One timestamp per request, so every component in a render agrees on "now". */
export const requestNow = cache(() => Date.now());
