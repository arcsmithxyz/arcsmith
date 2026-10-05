"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useConnection, useReadContracts } from "wagmi";
import { simulateContract, waitForTransactionReceipt, writeContract } from "wagmi/actions";
import {
  encodeAbiParameters,
  erc20Abi,
  getAddress,
  keccak256,
  parseEventLogs,
  type Address,
  type Hex,
} from "viem";
import { launchpadAbi } from "@/lib/abi/Launchpad";
import { encodeConfig, fromInput, validateValues, type CatalogBlock } from "@/lib/blocks";
import { deployment, isUsdc } from "@/lib/config";
import { friendlyError } from "@/lib/errors";
import { formatBps, formatFee, formatQuoted } from "@/lib/format";
import { sqrtPriceFor } from "@/lib/market";
import { isAddress } from "@/lib/permissions";
import { useCatalog } from "@/lib/hooks/useCatalog";
import { useDebounced } from "@/lib/hooks/useDebounced";
import { useFeePreview, type StackItem } from "@/lib/hooks/useFeePreview";
import { uploadTokenImage } from "@/lib/token-image";
import { wagmiConfig } from "@/lib/wagmi";
import { BlockIcon, LockIcon } from "../BlockIcon";
import { FeeCurveChart } from "../FeeCurveChart";
import { EmptyState } from "../ui";
import { WalletGate } from "../WalletGate";
import { MAX_BLOCKS, StackEditor, type StackEntry } from "./StackEditor";
import { TokenImageField, type TokenImage } from "./TokenImageField";

type Lane = "launch" | "existing";

// Mirrors HookKernel and Launchpad limits so mistakes show up before the wallet does.
const MIN_BASE_FEE = 100;
const MAX_BASE_FEE = 30_000;
const DYNAMIC_FEE_FLAG = 0x800000;
const TICK_SPACINGS = [
  { value: 10, label: "10 — tight, for steady pairs" },
  { value: 60, label: "60 — standard" },
  { value: 200, label: "200 — wide, for volatile tokens" },
];
const LIMITS = { name: 32, symbol: 12, uri: 256, description: 500 };

const byteLength = (s: string) => new TextEncoder().encode(s).length;

type Resolved = { entry: StackEntry; block: CatalogBlock; config: Hex | null; error: string | null };

export function BuildView() {
  const router = useRouter();
  const { address: account } = useConnection();
  const catalog = useCatalog();

  const [lane, setLane] = useState<Lane>("launch");
  const [baseFeeInput, setBaseFeeInput] = useState("1");
  const [stack, setStack] = useState<StackEntry[]>([]);
  const [details, setDetails] = useState({ name: "", symbol: "", description: "", website: "" });
  const [image, setImage] = useState<TokenImage | null>(null);
  // The picked image's URL once uploaded, so a retried launch doesn't upload it again.
  const [uploaded, setUploaded] = useState<{ image: TokenImage; url: string } | null>(null);
  const [market, setMarket] = useState({ subject: "", quote: "", tickSpacing: 60, price: "" });
  const [status, setStatus] = useState<{ busy: boolean; message: string | null }>({ busy: false, message: null });

  const isLaunch = lane === "launch";
  const available = catalog.blocks.filter((b) => b.status === "approved" && b.metadata);

  // --- Rules -------------------------------------------------------------------
  const baseFee = Math.round(Number(baseFeeInput) * 10_000);
  const baseFeeError =
    !baseFeeInput.trim() || !Number.isFinite(baseFee) || baseFee < MIN_BASE_FEE || baseFee > MAX_BASE_FEE
      ? "The base fee must be between 0.01% and 3%."
      : null;

  const resolved: Resolved[] = stack.flatMap((entry) => {
    const block = catalog.byAddress.get(entry.address.toLowerCase());
    if (!block?.metadata) return [];
    const meta = block.metadata;
    const blank = entry.inputs.some((v) => !v.trim() || !Number.isFinite(Number(v)));
    const values = meta.config.map((f, i) => fromInput(f, Number(entry.inputs[i])));
    const error = blank ? `${meta.name}: fill in every setting.` : validateValues(meta, values);
    return [{ entry, block, config: error ? null : encodeConfig(meta, values), error }];
  });
  const stackErrors = new Map(resolved.filter((r) => r.error).map((r) => [r.entry.address.toLowerCase(), r.error!]));

  // Debounced as a string so typing in a setting doesn't fire a query per keystroke.
  const previewKey = useDebounced(
    JSON.stringify(resolved.filter((r) => r.config).map((r) => ({ address: r.entry.address, config: r.config }))),
    300,
  );
  const debouncedStack = JSON.parse(previewKey) as StackItem[];
  const debouncedFee = useDebounced(baseFeeError ? MIN_BASE_FEE : baseFee, 300);
  const preview = useFeePreview(debouncedFee, debouncedStack, isLaunch);

  // --- Existing-token lane -------------------------------------------------------
  const subject = isAddress(market.subject) ? getAddress(market.subject.trim().toLowerCase()) : undefined;
  const quoteInput = market.quote.trim() || deployment?.usdc || "";
  const quote = isAddress(quoteInput) ? getAddress(quoteInput.toLowerCase()) : undefined;
  const poolId = subject && quote && deployment && subject !== quote ? poolIdFor(subject, quote, market.tickSpacing, deployment.kernel) : undefined;

  const tokens = useReadContracts({
    contracts: [
      { address: subject, abi: erc20Abi, functionName: "name" },
      { address: subject, abi: erc20Abi, functionName: "symbol" },
      { address: subject, abi: erc20Abi, functionName: "decimals" },
      { address: quote, abi: erc20Abi, functionName: "symbol" },
      { address: quote, abi: erc20Abi, functionName: "decimals" },
      { address: deployment?.launchpad, abi: launchpadAbi, functionName: "marketIdPlusOne", args: [poolId ?? "0x"] },
    ],
    query: { enabled: !isLaunch && Boolean(subject && quote && poolId) },
  });
  const subjectName = tokens.data?.[0]?.result;
  const subjectSymbol = tokens.data?.[1]?.result;
  const subjectDecimals = tokens.data?.[2]?.result;
  const quoteSymbol = tokens.data?.[3]?.result;
  const quoteDecimals = tokens.data?.[4]?.result;
  const existingMarket = tokens.data?.[5]?.result ?? 0n;
  const price = Number(market.price);

  // --- Validation ----------------------------------------------------------------
  const detailErrors: string[] = [];
  if (isLaunch) {
    if (!details.name.trim() || byteLength(details.name) > LIMITS.name) detailErrors.push(`Name: 1–${LIMITS.name} characters.`);
    if (!details.symbol.trim() || byteLength(details.symbol) > LIMITS.symbol)
      detailErrors.push(`Ticker: 1–${LIMITS.symbol} characters.`);
    if (byteLength(details.website) > LIMITS.uri) detailErrors.push(`Website: at most ${LIMITS.uri} characters.`);
    if (byteLength(details.description) > LIMITS.description)
      detailErrors.push(`Description: at most ${LIMITS.description} characters.`);
  } else {
    if (!subject) detailErrors.push("Enter the token's address.");
    else if (!tokens.isLoading && subjectDecimals === undefined) detailErrors.push("That address isn't an ERC-20 token on this network.");
    if (!quote) detailErrors.push("Enter the quote token's address.");
    else if (subject && subject === quote) detailErrors.push("The token and the quote token must differ.");
    else if (!tokens.isLoading && quoteDecimals === undefined) detailErrors.push("The quote address isn't an ERC-20 token.");
    if (!(price > 0)) detailErrors.push("Set a starting price.");
    if (existingMarket > 0n) detailErrors.push("A market for this pair and tick spacing already exists.");
  }
  const allErrors = [...(baseFeeError ? [baseFeeError] : []), ...stackErrors.values(), ...detailErrors];
  const ready = Boolean(deployment) && allErrors.length === 0 && !catalog.isLoading && resolved.length === stack.length;

  function switchLane(next: Lane) {
    setLane(next);
    setStatus({ busy: false, message: null });
    // Launch-only blocks (like the launch guard) can't run on an existing token's pool.
    if (next === "existing") {
      setStack((s) => s.filter((e) => catalog.byAddress.get(e.address.toLowerCase())?.metadata?.lanes !== "launch"));
    }
  }

  async function submit() {
    if (!deployment || !account || !ready) return;
    const rules = {
      baseFee,
      blocks: resolved.map((r) => r.entry.address),
      configs: resolved.map((r) => r.config!),
    };
    try {
      // The image is stored on arcsmith.xyz and its URL goes on-chain with the token.
      let imageURI = "";
      if (isLaunch && image) {
        imageURI = uploaded?.image === image ? uploaded.url : "";
        if (!imageURI) {
          setStatus({ busy: true, message: "Uploading the image…" });
          imageURI = await uploadTokenImage(image.blob);
          setUploaded({ image, url: imageURI });
        }
      }
      setStatus({ busy: true, message: "Checking…" });
      const confirm = () => setStatus({ busy: true, message: "Confirm in your wallet…" });
      // Simulated first so a bad setting fails here, with a readable reason, not in the wallet.
      const hash = isLaunch
        ? await simulateContract(wagmiConfig, {
            account,
            address: deployment.launchpad,
            abi: launchpadAbi,
            functionName: "launch",
            args: [
              {
                name: details.name.trim(),
                symbol: details.symbol.trim(),
                imageURI,
                description: details.description.trim(),
                website: details.website.trim(),
                rules,
              },
            ],
          }).then(({ request }) => (confirm(), writeContract(wagmiConfig, request)))
        : await simulateContract(wagmiConfig, {
            account,
            address: deployment.launchpad,
            abi: launchpadAbi,
            functionName: "openMarket",
            args: [
              {
                subject: subject!,
                quote: quote!,
                tickSpacing: market.tickSpacing,
                sqrtPriceX96: sqrtPriceFor(price, subject!.toLowerCase() < quote!.toLowerCase(), subjectDecimals!, quoteDecimals!),
                rules,
              },
            ],
          }).then(({ request }) => (confirm(), writeContract(wagmiConfig, request)));

      setStatus({ busy: true, message: "Waiting for confirmation…" });
      const receipt = await waitForTransactionReceipt(wagmiConfig, { hash });
      if (receipt.status !== "success") throw new Error("The transaction reverted.");

      // Pool pages live under the token's address; an opened market names its number too, and
      // the page drops it again if this is the token's first market here.
      const [launched] = parseEventLogs({ abi: launchpadAbi, logs: receipt.logs, eventName: "Launched" });
      const [opened] = parseEventLogs({ abi: launchpadAbi, logs: receipt.logs, eventName: "MarketOpened" });
      setStatus({ busy: true, message: "Done. Opening your pool…" });
      router.push(
        launched
          ? `/pool/${launched.args.token}`
          : opened
            ? `/pool/${opened.args.subject}?market=${opened.args.marketId}`
            : "/discover",
      );
    } catch (error) {
      setStatus({ busy: false, message: friendlyError(error) });
    }
  }

  if (!deployment) {
    return <EmptyState title="Not deployed yet" body="The builder opens once the contracts are live on this network." />;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="flex min-w-0 flex-col gap-6">
        <Step number={1} title="What are you building?">
          <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Lane">
            <LaneOption
              selected={isLaunch}
              onSelect={() => switchLane("launch")}
              title="Launch a new token"
              body="Mint 1B tokens straight into a locked pool against USDC. You earn a share of its trading fees."
            />
            <LaneOption
              selected={!isLaunch}
              onSelect={() => switchLane("existing")}
              title="Rules for an existing token"
              body="Open a hooked pool for any Arc token at a price you set. Liquidity providers earn its fees."
            />
          </div>
        </Step>

        <Step number={2} title="Compose the rules">
          <div className="mb-6 max-w-xs">
            <label htmlFor="base-fee" className="text-sm font-medium">
              Base fee
            </label>
            <div className="relative mt-2">
              <input
                id="base-fee"
                className="field tabular pr-10"
                inputMode="decimal"
                value={baseFeeInput}
                onChange={(e) => setBaseFeeInput(e.target.value.replace(",", "."))}
                aria-invalid={baseFeeError !== null}
              />
              <span className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-sm text-subtle">%</span>
            </div>
            <p className={`mt-1 text-xs ${baseFeeError ? "text-sell" : "text-subtle"}`}>
              {baseFeeError ?? "Every trade pays this; it goes to liquidity. 0.01% – 3%."}
            </p>
          </div>
          <StackEditor
            stack={stack}
            errors={stackErrors}
            available={available}
            catalog={catalog.byAddress}
            isLaunch={isLaunch}
            loading={catalog.isLoading}
            onChange={(next) => {
              setStack(next.slice(0, MAX_BLOCKS));
              setStatus({ busy: false, message: null });
            }}
          />
        </Step>

        <Step number={3} title="Preview the fees">
          <p className="mb-4 text-sm text-muted">
            Computed live by the block contracts themselves, with the kernel&apos;s caps applied.
          </p>
          <FeeCurveChart curves={preview.curves} loading={preview.isLoading} />
        </Step>

        <Step number={4} title={isLaunch ? "Your token" : "The market"}>
          {isLaunch ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField id="name" label="Name" max={LIMITS.name} value={details.name} onChange={(v) => setDetails({ ...details, name: v })} placeholder="Harbor Coin" />
              <TextField id="symbol" label="Ticker" max={LIMITS.symbol} value={details.symbol} onChange={(v) => setDetails({ ...details, symbol: v.toUpperCase() })} placeholder="HRBR" />
              <TokenImageField value={image} onChange={setImage} />
              <TextField id="website" label="Website" optional max={LIMITS.uri} value={details.website} onChange={(v) => setDetails({ ...details, website: v })} placeholder="https://…" />
              <div className="sm:col-span-2">
                <TextField id="description" label="Description" optional multiline max={LIMITS.description} value={details.description} onChange={(v) => setDetails({ ...details, description: v })} placeholder="What is it for?" />
              </div>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <TextField id="subject" label="Token address" mono value={market.subject} onChange={(v) => setMarket({ ...market, subject: v })} placeholder="0x…" />
                {subjectSymbol && (
                  <p className="mt-1 text-xs text-muted">
                    {subjectName} ({subjectSymbol}) · anyone can open a market for any token, so double-check the address.
                  </p>
                )}
              </div>
              <div>
                <TextField id="quote" label="Quote token" mono value={market.quote} onChange={(v) => setMarket({ ...market, quote: v })} placeholder={`${deployment.usdc.slice(0, 10)}… (USDC)`} />
                <p className="mt-1 text-xs text-muted">{quoteSymbol ? `Trades against ${quoteSymbol}.` : "Leave empty for USDC."}</p>
              </div>
              <div>
                <label htmlFor="spacing" className="text-sm font-medium">
                  Tick spacing
                </label>
                <select
                  id="spacing"
                  className="field mt-2"
                  value={market.tickSpacing}
                  onChange={(e) => setMarket({ ...market, tickSpacing: Number(e.target.value) })}
                >
                  {TICK_SPACINGS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="price" className="text-sm font-medium">
                  Starting price
                </label>
                <div className="mt-2 flex items-center gap-2">
                  <span className="shrink-0 text-sm text-muted">1 {subjectSymbol ?? "token"} =</span>
                  <input
                    id="price"
                    className="field tabular"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={market.price}
                    onChange={(e) => setMarket({ ...market, price: e.target.value.replace(",", ".") })}
                  />
                  <span className="shrink-0 text-sm text-muted">{quoteSymbol ?? "USDC"}</span>
                </div>
                <p className="mt-1 text-xs text-muted">
                  The pool opens empty at this price. Set it to the token&apos;s market price, then add liquidity from the pool
                  page.
                </p>
              </div>
            </div>
          )}
        </Step>
      </div>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <section className="card p-6" aria-label="Summary">
          <p className="eyebrow">Summary</p>
          <h2 className="mt-2 text-lg font-medium">
            {isLaunch ? (details.symbol ? `Launch ${details.symbol}` : "New token launch") : subjectSymbol ? `${subjectSymbol} market` : "Existing-token market"}
          </h2>
          <ul className="mt-4 flex flex-col gap-2.5 text-sm">
            <li className="flex items-center gap-3">
              <span className="grid size-6 place-items-center rounded-[7px] border border-line bg-panel text-[0.7rem]">%</span>
              Base fee {baseFeeError ? "—" : formatFee(baseFee)}
            </li>
            {resolved.map((r) => (
              <li key={r.entry.address} className="flex items-center gap-3">
                <BlockIcon kind={r.block.kind} size="sm" />
                <span className={r.error ? "text-sell" : ""}>{r.block.metadata?.name}</span>
                {r.block.royaltyBps > 0 && isLaunch && (
                  <span className="ml-auto text-xs text-subtle">{formatBps(r.block.royaltyBps)} royalty</span>
                )}
              </li>
            ))}
          </ul>
          <div className="mt-5 flex gap-3 rounded-[14px] bg-surface p-3.5 text-xs leading-relaxed text-muted">
            <LockIcon />
            <p>
              Frozen once {isLaunch ? "launched" : "opened"}. Fees are capped at 50% for 15 minutes, then 10%.
              {isLaunch && " Royalties come out of the protocol's share, not yours."}
            </p>
          </div>
          {!isLaunch && price > 0 && subjectSymbol && quote && (
            <p className="mt-4 text-sm text-muted">
              Opens at 1 {subjectSymbol} = {formatQuoted(price, quoteSymbol ?? "", isUsdc(quote))}
            </p>
          )}
          <div className="mt-5">
            <WalletGate>
              <button type="button" className="pill pill-ink w-full" disabled={!ready || status.busy} onClick={submit}>
                {status.busy ? status.message : isLaunch ? "Launch token" : "Open market"}
              </button>
            </WalletGate>
          </div>
          <div aria-live="polite">
            {!status.busy && status.message && <p className="mt-3 text-sm text-sell">{status.message}</p>}
            {!status.busy && allErrors.length > 0 && (
              <ul className="mt-3 flex flex-col gap-1 text-xs text-muted">
                {allErrors.slice(0, 4).map((e) => (
                  <li key={e}>· {e}</li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </aside>
    </div>
  );
}

/** v4 PoolId: keccak256 of the ABI-encoded PoolKey. Our pools always use the dynamic-fee flag. */
function poolIdFor(subject: Address, quote: Address, tickSpacing: number, kernel: Address): Hex {
  const [currency0, currency1] = subject.toLowerCase() < quote.toLowerCase() ? [subject, quote] : [quote, subject];
  return keccak256(
    encodeAbiParameters(
      [{ type: "address" }, { type: "address" }, { type: "uint24" }, { type: "int24" }, { type: "address" }],
      [currency0, currency1, DYNAMIC_FEE_FLAG, tickSpacing, kernel],
    ),
  );
}

function Step({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <section className="card p-6" aria-labelledby={`step-${number}`}>
      <div className="mb-5 flex items-center gap-3">
        <span className="tabular grid size-7 place-items-center rounded-full bg-ink text-xs font-medium text-on-ink">{number}</span>
        <h2 id={`step-${number}`} className="text-lg font-medium">
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

function LaneOption({ selected, onSelect, title, body }: { selected: boolean; onSelect: () => void; title: string; body: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`panel flex flex-col gap-2 p-5 text-left transition-colors ${
        selected ? "border-ink ring-1 ring-ink" : "hover:bg-surface-hover"
      }`}
    >
      <span className="flex items-center gap-2 font-medium">
        <span className={`size-3.5 rounded-full border ${selected ? "border-[4px] border-ink" : "border-line-strong"}`} aria-hidden />
        {title}
      </span>
      <span className="text-sm leading-relaxed text-muted">{body}</span>
    </button>
  );
}

function TextField({
  id,
  label,
  value,
  onChange,
  placeholder,
  max,
  optional,
  multiline,
  mono,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  max?: number;
  optional?: boolean;
  multiline?: boolean;
  mono?: boolean;
}) {
  const over = max !== undefined && byteLength(value) > max;
  const className = `field mt-2 ${mono ? "font-mono text-sm" : ""}`;
  return (
    <div>
      <label htmlFor={id} className="flex items-baseline justify-between text-sm font-medium">
        <span>
          {label}
          {optional && <span className="ml-1.5 font-normal text-subtle">optional</span>}
        </span>
        {max !== undefined && value.length > 0 && (
          <span className={`tabular text-xs font-normal ${over ? "text-sell" : "text-subtle"}`}>
            {byteLength(value)}/{max}
          </span>
        )}
      </label>
      {multiline ? (
        <textarea id={id} rows={4} className={className} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input
          id={id}
          className={className}
          value={value}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={mono ? false : undefined}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}
