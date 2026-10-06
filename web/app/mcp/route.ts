import { getAddress } from "viem";
import { APP_NAME, SITE_URL } from "@/lib/config";
import { isAddress } from "@/lib/permissions";
import { overLimit } from "@/lib/server/api";
import { checkHook, checkRankings, checkToken } from "@/lib/server/hook-check";
import { checkPoolCost } from "@/lib/server/pool-check";
import { preTradeCheck } from "@/lib/server/pre-trade";

export const dynamic = "force-dynamic";

/**
 * Arcsmith as a remote MCP server (Model Context Protocol, Streamable HTTP, stateless): AI assistants
 * such as Claude or Cursor add https://arcsmith.xyz/mcp and can then check Uniswap v4 hooks and tokens
 * on Arc with the same answers as the public API (/api/v1). Read-only, no keys, no wallet.
 *
 * Only the requests a tool server needs are handled: initialize, ping, tools/list and tools/call, plus
 * notifications (accepted and ignored). Answers are plain JSON, never an event stream, and there are no
 * sessions, so every request stands alone.
 */

const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const ADDRESS_ARG = { type: "string", description: "A 42-character address starting with 0x.", pattern: "^0x[0-9a-fA-F]{40}$" };

const INSTRUCTIONS =
  `${APP_NAME} reads Uniswap v4 hooks on Arc mainnet. Answers are capabilities, not verdicts: they say what a hook's address ` +
  "allows it to do, not what it does or whether it is safe. When you relay them, keep that distinction, and point people to the " +
  "reader link in each answer for the full picture.";

const TOOLS = [
  {
    name: "check_hook",
    title: "Check a Uniswap v4 hook on Arc",
    description:
      "What a Uniswap v4 hook on Arc mainnet can do with a trade, read from its address: take a cut, set its own price, change the fee, " +
      "block trades, lock liquidity, cut deposits or withdrawals, refuse liquidity. Also its 14 permission flags, contract size and " +
      "whether its source code is published. Works even when the index is down.",
    inputSchema: { type: "object", properties: { address: { ...ADDRESS_ARG, description: "The hook's address." } }, required: ["address"] },
  },
  {
    name: "check_token",
    title: "Check a token's pools on Arc",
    description:
      "Every Uniswap v4 pool a token trades in on Arc mainnet, the hook each pool runs and what that hook can do. With cost=true it also " +
      "simulates a ~$5 buy and sell in the busiest hooked pools, so a hidden fee or a refused sell shows up. Flags tokens that copy the " +
      "symbol of a canonical Arc token (USDC, EURC, cirBTC…).",
    inputSchema: {
      type: "object",
      properties: {
        address: { ...ADDRESS_ARG, description: "The token's address." },
        cost: { type: "boolean", description: "Also simulate a small buy and sell in each hooked pool (slower).", default: false },
      },
      required: ["address"],
    },
  },
  {
    name: "trade_cost",
    title: "What a small trade costs in one pool",
    description:
      "Simulates a ~$5 buy and sell in one Uniswap v4 pool on Arc through Uniswap's Quoter, hook included, and reports the cost of each " +
      "against the pool's price. Only pools with USDC or EURC on one side.",
    inputSchema: {
      type: "object",
      properties: { poolId: { type: "string", description: "The pool id: 66 characters starting with 0x.", pattern: "^0x[0-9a-fA-F]{64}$" } },
      required: ["poolId"],
    },
  },
  {
    name: "pre_trade_check",
    title: "Should I trade this token? (your rules, our data)",
    description:
      "Runs a token through rules YOU set and answers proceed, stop or unknown, with the reasons. Stops if the token is a lookalike of a documented " +
      "Arc token (when block_lookalike), if no simulated pool accepts both a buy and a sell, or if the cheapest hooked pool costs more than " +
      "max_cost_percent on a ~$5 trade. Unknown means it could not be checked, which is not a go. The rules decide: Arcsmith makes no judgement of its own about whether a token is safe.",
    inputSchema: {
      type: "object",
      properties: {
        address: { ...ADDRESS_ARG, description: "The token's address." },
        max_cost_percent: { type: "number", minimum: 0, maximum: 100, description: "Stop if a ~$5 buy or sell costs more than this percent.", default: 5 },
        block_lookalike: { type: "boolean", description: "Stop if the token only looks like USDC, EURC, USYC, cirBTC or WETH.", default: true },
      },
      required: ["address"],
    },
  },
  {
    name: "top_hooks",
    title: "Busiest hooks on Arc",
    description: "The Uniswap v4 hooks on Arc with the most volume, leaving out hooks whose volume looks like wash trading (big volume, almost no liquidity).",
    inputSchema: { type: "object", properties: {} },
  },
];

type Json = Record<string, unknown>;
type RpcRequest = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Json };

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, GET, OPTIONS",
  "access-control-allow-headers": "content-type, accept, mcp-protocol-version, mcp-session-id",
};

const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { ...CORS, "cache-control": "no-store" } });
const result = (id: RpcRequest["id"], value: unknown) => ({ jsonrpc: "2.0", id, result: value });
const failure = (id: RpcRequest["id"], code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

/** A tool's answer: the JSON as text (what every client shows) and as structured content (for clients that read it). */
const toolAnswer = (data: Json) => ({ content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data });
/** A failed tool call is still a successful request: the model reads the message and can try again. */
const toolError = (message: string) => ({ content: [{ type: "text", text: message }], isError: true });

/** Reader links in the answers are paths; make them full URLs for an assistant to show. */
function withFullLinks(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withFullLinks);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, typeof v === "string" && v.startsWith("/") ? `${SITE_URL}${v}` : withFullLinks(v)]));
  }
  return value;
}

async function callTool(name: string, args: Json) {
  try {
    switch (name) {
      case "check_hook": {
        const address = String(args.address ?? "");
        if (!isAddress(address)) return toolError("Give the hook's address: 42 characters starting with 0x.");
        return toolAnswer(withFullLinks(await checkHook(getAddress(address.toLowerCase()))) as Json);
      }
      case "check_token": {
        const address = String(args.address ?? "");
        if (!isAddress(address)) return toolError("Give the token's address: 42 characters starting with 0x.");
        const token = await checkToken(getAddress(address.toLowerCase()), args.cost === true);
        if (!token) return toolError("The Arc index doesn't know this address as a token in any Uniswap v4 pool on Arc mainnet.");
        return toolAnswer(withFullLinks(token) as Json);
      }
      case "trade_cost": {
        const poolId = String(args.poolId ?? "");
        if (!/^0x[0-9a-fA-F]{64}$/.test(poolId)) return toolError("Give the pool id: 66 characters starting with 0x.");
        const check = await checkPoolCost(poolId);
        return check.ok ? toolAnswer(withFullLinks(check.result) as Json) : toolError(check.message);
      }
      case "pre_trade_check": {
        const address = String(args.address ?? "");
        if (!isAddress(address)) return toolError("Give the token's address: 42 characters starting with 0x.");
        const limit = typeof args.max_cost_percent === "number" && args.max_cost_percent >= 0 && args.max_cost_percent <= 100 ? args.max_cost_percent : 5;
        const answer = await preTradeCheck(getAddress(address.toLowerCase()), { maxCostPercent: limit, blockLookalike: args.block_lookalike !== false });
        return toolAnswer(withFullLinks(answer) as Json);
      }
      case "top_hooks":
        return toolAnswer(withFullLinks(await checkRankings()) as Json);
      default:
        return null;
    }
  } catch {
    return toolError("The Arc index or RPC didn't answer just now. Try again in a minute.");
  }
}

async function handle(message: RpcRequest) {
  const { id, method, params = {} } = message;
  switch (method) {
    case "initialize": {
      const asked = String(params.protocolVersion ?? "");
      return result(id, {
        protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "arcsmith", title: `${APP_NAME} hook check`, version: "1.0.0", websiteUrl: SITE_URL },
        instructions: INSTRUCTIONS,
      });
    }
    case "ping":
      return result(id, {});
    case "tools/list":
      return result(id, { tools: TOOLS });
    case "tools/call": {
      const answer = await callTool(String(params.name ?? ""), (params.arguments as Json) ?? {});
      return answer ? result(id, answer) : failure(id, -32602, `Unknown tool: ${String(params.name)}`);
    }
    default:
      return failure(id, -32601, `Method not found: ${method}`);
  }
}

export async function POST(request: Request) {
  const limited = await overLimit(request);
  if (limited) return limited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return reply(failure(null, -32700, "Parse error: send a JSON-RPC message."), 400);
  }

  const messages = (Array.isArray(body) ? body : [body]) as RpcRequest[];
  if (messages.length === 0 || messages.length > 20 || messages.some((m) => !m || typeof m !== "object" || m.jsonrpc !== "2.0")) {
    return reply(failure(null, -32600, "Invalid request: expected JSON-RPC 2.0."), 400);
  }

  // Notifications (no id) need no answer.
  const requests = messages.filter((m) => m.id !== undefined && m.id !== null);
  if (requests.length === 0) return new Response(null, { status: 202, headers: CORS });

  const answers = await Promise.all(requests.map(handle));
  return reply(Array.isArray(body) ? answers : answers[0]);
}

/** No server-to-client stream: this server only answers requests. */
export function GET() {
  return new Response("This MCP server answers POST requests only (stateless Streamable HTTP).", {
    status: 405,
    headers: { ...CORS, allow: "POST, OPTIONS" },
  });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
