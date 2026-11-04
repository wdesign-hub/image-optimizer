import { Action, ActionPanel, Form, List, Icon, Toast, getSelectedFinderItems, getPreferenceValues, showToast } from "@raycast/api";
import { useEffect, useRef, useState } from "react";
import path from "node:path";
import { findMagick, optimize, presets, size, type Format, type Result } from "./optimizer";
export default function Command() {
  const [files, setFiles] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const [quality, setQuality] = useState("80");
  const [preset, setPreset] = useState("balanced");
  const [results, setResults] = useState<Result[] | null>(null);
  const [progress, setProgress] = useState("");
  async function selection() {
    try { setFiles([...new Set((await getSelectedFinderItems()).map(item => item.path))]); }
    catch { await showToast({ style: Toast.Style.Failure, title: "Select images in Finder or use Choose Files" }); }
  }
  useEffect(() => { void selection(); }, []);
  async function submit(values: { format: Format; pngLossy: boolean; stripMetadata: boolean; onlySmaller: boolean; destination: string[] }) {
    if (running.current) return;
    if (!files.length || !/^\d+$/.test(quality) || Number(quality) < 1 || Number(quality) > 100) {
      await showToast({ style: Toast.Style.Failure, title: "Choose files and a quality from 1 to 100" }); return;
    }
    running.current = true; setBusy(true);
    try {
      const magick = await findMagick(getPreferenceValues<{ magickPath?: string }>().magickPath);
      const toast = await showToast({ style: Toast.Style.Animated, title: "Optimizing images…" });
      const completed: Result[] = [];
      for (const [index, file] of files.entries()) {
        const message = `${index + 1}/${files.length}: ${path.basename(file)}`;
        setProgress(message); toast.message = message;
        completed.push(await optimize(file, { ...values, quality: Number(quality), destination: values.destination?.[0] }, magick));
      }
      setResults(completed);
      toast.style = completed.some(r => r.status === "error") ? Toast.Style.Failure : Toast.Style.Success;
      toast.title = "Batch complete";
      toast.message = `${completed.filter(r => r.status === "saved").length} saved, ${completed.filter(r => r.status === "skipped").length} skipped, ${completed.filter(r => r.status === "error").length} failed`;
    } catch (error) { await showToast({ style: Toast.Style.Failure, title: "Unable to optimize", message: String(error) }); }
    finally { running.current = false; setBusy(false); setProgress(""); }
  }
  if (results) {
    const saved = results.filter(r => r.status === "saved");
    const before = saved.reduce((sum, r) => sum + r.before, 0);
    const after = saved.reduce((sum, r) => sum + (r.after || 0), 0);
    return <List navigationTitle="Optimization Results" actions={<ActionPanel><Action title="Back to Settings" onAction={() => setResults(null)} /></ActionPanel>}>
      <List.Section title={`${saved.length} saved · ${results.filter(r => r.status === "skipped").length} skipped · ${results.filter(r => r.status === "error").length} failed`} subtitle={before ? `${size(before)} → ${size(after)} · ${((1 - after / before) * 100).toFixed(1)}% saved` : "No files saved"}>
        {results.map((r, index) => <List.Item key={index} title={path.basename(r.input)} icon={r.status === "error" ? Icon.ExclamationMark : r.status === "skipped" ? Icon.Minus : Icon.CheckCircle} subtitle={r.status === "saved" ? `${size(r.before)} → ${size(r.after!)} (${((1 - r.after! / r.before) * 100).toFixed(1)}% saved)` : r.message} accessories={[{ text: r.width ? `${r.width} × ${r.height}` : "" }]} actions={<ActionPanel>
          {r.output && <Action.ShowInFinder path={r.output} />}
          {r.output && <Action.Open title="Open Optimized Image" target={r.output} />}
          <Action.ShowInFinder title="Show Original in Finder" path={r.input} />
          <Action.CopyToClipboard title="Copy Result" content={`${r.input}\n${r.output || r.message}\n${size(r.before)} → ${r.after === undefined ? "—" : size(r.after)}`} />
          <Action title="Back to Settings" onAction={() => setResults(null)} />
        </ActionPanel>} />)}
      </List.Section>
    </List>;
  }
  return <Form isLoading={busy} navigationTitle="Image Optimizer" actions={<ActionPanel>
    <Action.SubmitForm title="Optimize Images" onSubmit={submit} />
    <Action title="Refresh Finder Selection" onAction={selection} icon={Icon.ArrowClockwise} />
  </ActionPanel>}>
    <Form.Description title="Selected" text={busy ? progress : `${files.length} file(s) selected. Originals are never replaced.`} />
    <Form.FilePicker id="files" title="Choose Files" value={files} onChange={setFiles} allowMultipleSelection canChooseDirectories={false} />
    <Form.Dropdown id="format" title="Output Format" defaultValue="original"><Form.Dropdown.Item value="original" title="Keep Original Format" />{["jpeg", "png", "webp", "avif"].map(f => <Form.Dropdown.Item key={f} value={f} title={f.toUpperCase()} />)}</Form.Dropdown>
    <Form.Dropdown id="preset" title="Preset" value={preset} onChange={v => { setPreset(v); if (v !== "custom") setQuality(String(presets[v as keyof typeof presets])); }}>
      <Form.Dropdown.Item value="balanced" title="Balanced · 80" /><Form.Dropdown.Item value="small" title="Smaller File · 60" /><Form.Dropdown.Item value="high" title="High Quality · 92" /><Form.Dropdown.Item value="custom" title="Custom" />
    </Form.Dropdown>
    <Form.TextField id="quality" title="Quality (1–100)" value={quality} onChange={v => { setQuality(v); setPreset("custom"); }} info="PNG uses quality only when palette reduction is enabled." />
    <Form.Checkbox id="pngLossy" title="PNG" label="Reduce palette (lossy; may introduce banding)" defaultValue={false} />
    <Form.Checkbox id="stripMetadata" title="Metadata" label="Remove descriptive metadata; retain color profile" defaultValue={true} />
    <Form.Checkbox id="onlySmaller" title="Size Check" label="Save only if smaller than the original" defaultValue={true} />
    <Form.FilePicker id="destination" title="Output Folder" canChooseFiles={false} canChooseDirectories allowMultipleSelection={false} info="Optional; defaults to the original file’s folder." />
    <Form.Description text="Dimensions are preserved after orientation correction. JPEG transparency becomes white. Animated images are skipped. All image processing stays on your Mac." />
  </Form>;
}
