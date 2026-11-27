import type { MetadataRoute } from "next";

/**
 * Shared bet and invite links unfurl in chat apps, but they shouldn't end up in
 * search results. Search engines are asked not to crawl app, bet and invite
 * pages; the link-preview bots that build chat cards are let through explicitly.
 */
const PREVIEW_BOTS = [
  "Discordbot",
  "Slackbot",
  "Slackbot-LinkExpanding",
  "Twitterbot",
  "facebookexternalhit",
  "WhatsApp",
  "TelegramBot",
  "LinkedInBot",
  "redditbot",
  "SkypeUriPreview",
];

const PRIVATE = ["/bets/", "/share/", "/join/", "/g/", "/u/", "/home", "/inbox", "/groups", "/api/"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: PREVIEW_BOTS, allow: "/" },
      { userAgent: "*", allow: "/", disallow: PRIVATE },
    ],
  };
}
