"use client";
// Must be a Client Component — Apollo Client runs in the browser, not on the server

import {
  ApolloClient,
  InMemoryCache,
  createHttpLink,
  from,
} from "@apollo/client";
import { onError } from "@apollo/client/link/error";
import { setContext } from "@apollo/client/link/context";

// ── HTTP link: where GraphQL requests are sent ─────────────
const httpLink = createHttpLink({
  uri: process.env.NEXT_PUBLIC_GRAPHQL_URL ?? "http://localhost:4000/graphql",
  credentials: "include", // send cookies (refresh token) with every request
});

// ── Access token storage ────────────────────────────────────
// Stored in a plain JS variable — NOT localStorage, NOT sessionStorage
// This lives only in memory — cleared on page refresh (by design)
// On refresh, the app calls refreshToken mutation using the cookie to get a new one
let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

// ── Auth link: attaches access token to every outgoing request ──
const authLink = setContext((_, { headers }) => ({
  headers: {
    ...headers,
    ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
  },
}));

// ── Error link: catches GraphQL and network errors globally ─────
const errorLink = onError(({ graphQLErrors, networkError }) => {
  if (graphQLErrors) {
    for (const err of graphQLErrors) {
      if (err.extensions?.code === "UNAUTHENTICATED") {
        console.warn("Auth error — token expired or invalid");
        setAccessToken(null); // clear the stale token
      }
    }
  }
  if (networkError) {
    console.error("Network error:", networkError);
  }
});

// ── Apollo Client instance ───────────────────────────────────
export const apolloClient = new ApolloClient({
  link: from([errorLink, authLink, httpLink]),
  // Link order matters: errorLink wraps everything, authLink runs before httpLink
  cache: new InMemoryCache({
    typePolicies: {
      Module: { keyFields: ["id"] }, // tells Apollo how to identify Module in cache
      User: { keyFields: ["id"] },
    },
  }),
  defaultOptions: {
    watchQuery: {
      fetchPolicy: "cache-and-network", // show cached data instantly, refresh in background
    },
  },
});
