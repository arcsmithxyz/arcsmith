"use client";

import Link from "next/link";
import { useState } from "react";
import { useConnection, useReadContract, useReadContracts } from "wagmi";
import { simulateContract, waitForTransactionReceipt, writeContract } from "wagmi/actions";
import { getAddress, type Address, type Hex } from "viem";
import { blockCatalogAbi } from "@/lib/abi/BlockCatalog";
import { ruleBlockAbi } from "@/lib/abi/BaseBlock";
import { BLOCK_STATUSES, defaultValues, encodeConfig, formatValue, type BlockMetadata, type ConfigField } from "@/lib/blocks";
import { deployment } from "@/lib/config";
import { friendlyError } from "@/lib/errors";
import { isAddress } from "@/lib/permissions";
import { useDebounced } from "@/lib/hooks/useDebounced";
import { useFeePreview } from "@/lib/hooks/useFeePreview";
import { wagmiConfig } from "@/lib/wagmi";
import { FeeCurveChart } from "../FeeCurveChart";
import { EmptyState } from "../ui";
import { WalletGate } from "../WalletGate";

const PREFIX = "data:application/json;utf8,";
const MAX_METADATA_LENGTH = 2048; // BlockCatalog.MAX_METADATA_LENGTH
const TYPE_MAX: Record<ConfigField["type"], number> = { uint16: 65_535, uint24: 16_777_215, uint32: 4_294_967_295 };
const UNITS: { value: ConfigField["unit"]; label: string }[] = [
  { value: "pips", label: "pips (10000 = 1%)" },
  { value: "bps", label: "bps (100 = 1%)" },
  { value: "seconds", label: "seconds" },
  { value: "number", label: "plain number" },
];

type FieldDraft = { key: string; label: string; type: ConfigField["type"]; unit: ConfigField["unit"]; min: string; max: string; default: string };

const emptyField = (): FieldDraft => ({ key: "", label: "", type: "uint24", unit: "pips", min: "0", max: "10000", default: "0" });

/** Submits a rule block to the catalog, with a metadata builder so the Builder can render its settings. */
export function SubmitBlockForm() {
  const { address: account } = useConnection();
  const [blockInput, setBlockInput] = useState("");
  const [name, setName] = useState("");
  const [summary, setSummary] = useState("");
  const [lanes, setLanes] = useState<"any" | "launch">("any");
  const [fields, setFields] = useState<FieldDraft[]>([]);
  const [status, setStatus] = useState<{ busy: boolean; message: string | null; done?: Address }>({ busy: false, message: null });

  const blk = isAddress(blockInput) ? getAddress(blockInput.trim().toLowerCase()) : undefined;

  // --- Metadata ------------------------------------------------------------------------
  const fieldErrors: string[] = [];
  const keys = new Set<string>();
  const config: ConfigField[] = fields.map((f, i) => {
    const [min, max, def] = [Number(f.min), Number(f.max), Number(f.default)];
    const where = `Setting ${i + 1}`;
    if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(f.key)) fieldErrors.push(`${where}: key must be letters and digits, starting with a letter.`);
    else if (keys.has(f.key)) fieldErrors.push(`${where}: key "${f.key}" is used twice.`);
    keys.add(f.key);
    if (!f.label.trim()) fieldErrors.push(`${where}: add a label.`);
    if (![min, max, def].every((n) => Number.isInteger(n) && n >= 0)) fieldErrors.push(`${where}: min, max and default must be whole numbers.`);
    else if (!(min <= def && def <= max && max <= TYPE_MAX[f.type])) fieldErrors.push(`${where}: needs min ≤ default ≤ max ≤ ${TYPE_MAX[f.type].toLocaleString("en-US")}.`);
    return { key: f.key, type: f.type, label: f.label.trim(), unit: f.unit, min, max, default: def };
  });
  const metadata: BlockMetadata = { name: name.trim(), summary: summary.trim(), lanes, config };
  const uri = PREFIX + JSON.stringify(metadata);
  const uriLength = new TextEncoder().encode(uri).length;

  const errors = [
    ...(!blk ? ["Enter the block's contract address."] : []),
    ...(!metadata.name ? ["Give the block a name."] : []),
    ...(!metadata.summary ? ["Describe what it does in one or two sentences."] : []),
    ...fieldErrors,
    ...(uriLength > MAX_METADATA_LENGTH ? [`Metadata is ${uriLength} bytes; the catalog allows ${MAX_METADATA_LENGTH}.`] : []),
  ];
  const defaultsConfig = fieldErrors.length === 0 ? encodeConfig(metadata, defaultValues(metadata)) : undefined;

  // --- On-chain checks -------------------------------------------------------------------
  const enabled = Boolean(blk && deployment);
  const points = useReadContract({ address: blk, abi: ruleBlockAbi, functionName: "hookPoints", query: { enabled, retry: false } });
  const entry = useReadContract({
    address: deployment?.catalog,
    abi: blockCatalogAbi,
    functionName: "entryOf",
    args: blk ? [blk] : undefined,
    query: { enabled },
  });
  const validity = useReadContracts({
    contracts: [true, false].map(
      (isLaunch) =>
        ({ address: blk, abi: ruleBlockAbi, functionName: "validateConfig", args: [defaultsConfig ?? "0x", isLaunch] }) as const,
    ),
    query: { enabled: enabled && points.isSuccess && defaultsConfig !== undefined },
  });
  const entryStatus = entry.data ? BLOCK_STATUSES[entry.data.status] : undefined;
  const validLaunch = validity.data?.[0]?.result;
  const validMarket = validity.data?.[1]?.result;
  const implementsBlock = points.isSuccess;
  const alreadyListed = entryStatus !== undefined && entryStatus !== "none" && entryStatus !== "rejected";
  const defaultsRejected = lanes === "launch" ? validLaunch === false : validLaunch === false || validMarket === false;

  const chainErrors = [
    ...(blk && points.isError ? ["That address doesn't answer hookPoints() — is it an IRuleBlock?"] : []),
    ...(alreadyListed ? [`This block is already in the catalog (${entryStatus}).`] : []),
    ...(defaultsConfig && defaultsRejected ? ["The block's validateConfig() rejects the default settings."] : []),
  ];
  const allErrors = [...errors, ...chainErrors];
  const ready = Boolean(deployment) && allErrors.length === 0 && implementsBlock;

  // Fee preview with the default settings, straight from the block.
  // Debounced as a string so typing in the settings doesn't fire a query per keystroke.
  const previewKey = useDebounced(blk && implementsBlock && defaultsConfig ? `${blk}:${defaultsConfig}` : "", 400);
  const [previewBlock, previewConfig] = previewKey.split(":");
  const previewStack = previewKey ? [{ address: previewBlock as Address, config: previewConfig as Hex }] : [];
  const preview = useFeePreview(10_000, previewStack, lanes === "launch");

  async function submit() {
    if (!deployment || !account || !blk || !ready) return;
    try {
      setStatus({ busy: true, message: "Checking…" });
      const { request } = await simulateContract(wagmiConfig, {
        account,
        address: deployment.catalog,
        abi: blockCatalogAbi,
        functionName: "submit",
        args: [blk, uri],
      });
      setStatus({ busy: true, message: "Confirm in your wallet…" });
      const hash = await writeContract(wagmiConfig, request);
      setStatus({ busy: true, message: "Waiting for confirmation…" });
      const receipt = await waitForTransactionReceipt(wagmiConfig, { hash });
      if (receipt.status !== "success") throw new Error("The transaction reverted.");
      setStatus({ busy: false, message: null, done: blk });
      await entry.refetch();
    } catch (error) {
      setStatus({ busy: false, message: friendlyError(error) });
    }
  }

  if (!deployment) {
    return <EmptyState title="Not deployed yet" body="Submissions open once the contracts are live on this network." />;
  }
  if (status.done) {
    return (
      <EmptyState
        title="Submitted for review"
        body="Your block is in the catalog as “in review”. Once approved, builders can use it and you earn a royalty from every launch that does."
        action={{ href: `/blocks/${status.done}`, label: "View your block" }}
      />
    );
  }

  const updateField = (i: number, patch: Partial<FieldDraft>) =>
    setFields(fields.map((f, j) => (j === i ? { ...f, ...patch } : f)));

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="flex min-w-0 flex-col gap-6">
        <section className="card p-6" aria-labelledby="contract">
          <h2 id="contract" className="text-lg font-medium">
            Contract
          </h2>
          <label htmlFor="block-address" className="mt-4 block text-sm font-medium">
            Block address
          </label>
          <input
            id="block-address"
            className="field mt-2 font-mono text-sm"
            placeholder="0x…"
            spellCheck={false}
            autoComplete="off"
            value={blockInput}
            onChange={(e) => setBlockInput(e.target.value)}
          />
          <p className="mt-2 text-xs text-muted">
            {blk && points.isLoading
              ? "Checking the contract…"
              : blk && implementsBlock
                ? "Implements IRuleBlock."
                : "Deployed on this network, implementing IRuleBlock. Blocks run read-only: no state writes, no transfers."}
          </p>
        </section>

        <section className="card p-6" aria-labelledby="describe">
          <h2 id="describe" className="text-lg font-medium">
            How builders see it
          </h2>
          <div className="mt-4 grid gap-4">
            <div>
              <label htmlFor="block-name" className="text-sm font-medium">
                Name
              </label>
              <input id="block-name" className="field mt-2" value={name} onChange={(e) => setName(e.target.value)} placeholder="Weekend fee" />
            </div>
            <div>
              <label htmlFor="block-summary" className="text-sm font-medium">
                What it does
              </label>
              <textarea
                id="block-summary"
                rows={3}
                className="field mt-2"
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="One or two plain sentences a token creator can understand."
              />
            </div>
            <fieldset>
              <legend className="text-sm font-medium">Works on</legend>
              <div className="mt-2 flex flex-wrap gap-4 text-sm">
                {(["any", "launch"] as const).map((v) => (
                  <label key={v} className="flex items-center gap-2">
                    <input type="radio" name="lanes" checked={lanes === v} onChange={() => setLanes(v)} />
                    {v === "any" ? "New and existing tokens" : "New tokens only"}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        </section>

        <section className="card p-6" aria-labelledby="config">
          <div className="flex items-center justify-between gap-3">
            <h2 id="config" className="text-lg font-medium">
              Settings
            </h2>
            <button type="button" className="pill pill-ghost pill-sm" onClick={() => setFields([...fields, emptyField()])}>
              + Add setting
            </button>
          </div>
          <p className="mt-1 text-sm text-muted">
            In the order your block ABI-decodes its config. The builder renders one field for each.
          </p>
          {fields.length === 0 ? (
            <p className="panel mt-4 p-4 text-sm text-muted">No settings — the block takes an empty config.</p>
          ) : (
            <ol className="mt-4 flex flex-col gap-3">
              {fields.map((f, i) => (
                <li key={i} className="panel grid gap-3 p-4 sm:grid-cols-6">
                  <Mini label="Key" className="sm:col-span-2">
                    <input className="field font-mono text-sm" value={f.key} onChange={(e) => updateField(i, { key: e.target.value })} placeholder="maxFee" />
                  </Mini>
                  <Mini label="Label" className="sm:col-span-4">
                    <input className="field" value={f.label} onChange={(e) => updateField(i, { label: e.target.value })} placeholder="Max extra fee" />
                  </Mini>
                  <Mini label="Type" className="sm:col-span-2">
                    <select className="field" value={f.type} onChange={(e) => updateField(i, { type: e.target.value as ConfigField["type"] })}>
                      <option value="uint16">uint16</option>
                      <option value="uint24">uint24</option>
                      <option value="uint32">uint32</option>
                    </select>
                  </Mini>
                  <Mini label="Unit" className="sm:col-span-4">
                    <select className="field" value={f.unit} onChange={(e) => updateField(i, { unit: e.target.value as ConfigField["unit"] })}>
                      {UNITS.map((u) => (
                        <option key={u.value} value={u.value}>
                          {u.label}
                        </option>
                      ))}
                    </select>
                  </Mini>
                  {(["min", "max", "default"] as const).map((k) => (
                    <Mini key={k} label={k[0].toUpperCase() + k.slice(1)} className="sm:col-span-2">
                      <input className="field tabular" inputMode="numeric" value={f[k]} onChange={(e) => updateField(i, { [k]: e.target.value })} />
                    </Mini>
                  ))}
                  <div className="flex items-center justify-between gap-3 sm:col-span-6">
                    <span className="text-xs text-subtle">
                      {Number.isFinite(Number(f.default)) &&
                        `Shown as ${formatValue(config[i], Number(f.min))} – ${formatValue(config[i], Number(f.max))}, default ${formatValue(config[i], Number(f.default))}`}
                    </span>
                    <button type="button" className="text-xs text-muted hover:text-sell" onClick={() => setFields(fields.filter((_, j) => j !== i))}>
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="card p-6" aria-labelledby="preview">
          <h2 id="preview" className="text-lg font-medium">
            Preview, with default settings
          </h2>
          <p className="mt-1 mb-4 text-sm text-muted">Computed by your contract on a pool with a 1% base fee.</p>
          <FeeCurveChart curves={preview.curves} loading={preview.isLoading} />
        </section>
      </div>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <section className="card p-6" aria-label="Submit">
          <p className="eyebrow">Review</p>
          <ul className="mt-3 flex flex-col gap-2 text-sm leading-relaxed text-muted">
            <li>The catalog owner reviews the code before approving. Approval pins its code hash.</li>
            <li>Approved blocks earn a royalty — a share of the protocol&apos;s fees from each launch that uses them.</li>
            <li>
              Metadata <span className="tabular">{uriLength}</span> / {MAX_METADATA_LENGTH} bytes, stored on-chain.
            </li>
          </ul>
          <div className="mt-5">
            <WalletGate>
              <button type="button" className="pill pill-ink w-full" disabled={!ready || status.busy} onClick={submit}>
                {status.busy ? status.message : "Submit for review"}
              </button>
            </WalletGate>
          </div>
          <div aria-live="polite">
            {!status.busy && status.message && <p className="mt-3 text-sm text-sell">{status.message}</p>}
            {allErrors.length > 0 && (
              <ul className="mt-3 flex flex-col gap-1 text-xs text-muted">
                {allErrors.slice(0, 5).map((e) => (
                  <li key={e}>· {e}</li>
                ))}
              </ul>
            )}
          </div>
          <p className="mt-5 text-xs text-muted">
            Writing one? Start from the native blocks in <code>contracts/src/blocks</code> and see{" "}
            <Link href="/blocks" className="underline underline-offset-2">
              the kernel&apos;s guarantees
            </Link>
            .
          </p>
        </section>
      </aside>
    </div>
  );
}

function Mini({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={`flex flex-col gap-1 text-xs text-muted ${className ?? ""}`}>
      {label}
      {children}
    </label>
  );
}
