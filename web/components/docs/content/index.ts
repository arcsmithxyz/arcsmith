import type { ComponentType } from "react";
import { HookCheckApi } from "./api";
import { McpDoc } from "./mcp";
import { NativeBlocks, WriteABlock } from "./blocks";
import { HowItWorks, Introduction, QuickStart } from "./getting-started";
import { ExistingTokens, HookReaderDoc, LaunchToken, TradingAndLiquidity } from "./guides";
import { FaqDoc, Risks } from "./help";
import { Contracts, Fees, Safety, TrustModel } from "./protocol";

/** Docs page bodies by slug; the order and titles live in lib/docs.ts. */
export const DOC_CONTENT: Record<string, ComponentType> = {
  "": Introduction,
  "quick-start": QuickStart,
  "how-it-works": HowItWorks,
  "launch-a-token": LaunchToken,
  "existing-tokens": ExistingTokens,
  "trading-and-liquidity": TradingAndLiquidity,
  "hook-reader": HookReaderDoc,
  api: HookCheckApi,
  mcp: McpDoc,
  blocks: NativeBlocks,
  "write-a-block": WriteABlock,
  safety: Safety,
  fees: Fees,
  "trust-model": TrustModel,
  contracts: Contracts,
  faq: FaqDoc,
  risks: Risks,
};
