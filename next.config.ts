import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,

  /**
   * The four tabs that merged into three still resolve.
   *
   * Mocks, Assessments, Comp reality and Roadmaps were each a single panel over one workbook
   * sheet, and they now render inside the page whose question they answer. Nothing was deleted,
   * so nothing should 404 — a bookmark that returns "not found" is indistinguishable from a
   * feature that was removed, and this app is read by its owner, by a daily digest that links
   * into it, and by an MCP server that cites rows.
   *
   * Permanent, because these paths are not coming back. Next serves 308s for `permanent: true`,
   * which preserves the method and is what a client should cache.
   */
  async redirects() {
    return [
      { source: "/mocks", destination: "/practice", permanent: true },
      { source: "/assessments", destination: "/practice", permanent: true },
      { source: "/comp", destination: "/market", permanent: true },
      { source: "/roadmaps", destination: "/library", permanent: true },
    ];
  },
};

export default nextConfig;
