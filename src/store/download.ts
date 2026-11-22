import { STORE_TARGET } from './index';

interface DownloadsCapability {
  save(args: { filename: string; data: string | Blob }): Promise<void>;
}

/**
 * Hand the viewer a file.
 *
 * A plain `<a download>` works in the local app but is inert inside an
 * Artifact, where the viewer's frame blocks page-initiated downloads. Since
 * exporting is the escape hatch that keeps this data from being trapped, the
 * hosted build asks the runtime to do it instead.
 */
export async function saveFile(filename: string, text: string): Promise<void> {
  if (STORE_TARGET === 'artifact') {
    const claude = (globalThis as { claude?: { use(n: string): Promise<unknown> } }).claude;
    const dl = (await claude?.use('downloads')) as DownloadsCapability | null | undefined;
    if (dl) {
      await dl.save({ filename, data: text });
      return;
    }
    throw new Error(
      'This page cannot save files. Copy the JSON from the box below instead, or use the local app.',
    );
  }

  const blob = new Blob([text], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
