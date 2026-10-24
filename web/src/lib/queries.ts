import "server-only";
import { cache } from "react";
import { authedApi } from "./api";
import type { Inbox, Me } from "./types";

export const getMe = cache(() => authedApi<Me>("/me"));

export const getInbox = cache(() => authedApi<Inbox>("/inbox"));
