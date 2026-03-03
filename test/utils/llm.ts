import type { SaveMemoryInput } from '../../src/types.js';

interface BatchExtractResult {
  contents: string[];
  metadatas: SaveMemoryInput['metadata'][];
}

export async function batchExtractMetadata(
  contents: string[],
  _llmClient: any
): Promise<BatchExtractResult> {
  // Placeholder: join contents and extract metadata in batch
  // In real implementation, call LLM once with all contents
  const metadatas: SaveMemoryInput['metadata'][] = contents.map((content) => ({
    tags: [],
    subjects: [],
    keywords: [],
    importance: 0.5,
    summary: content.substring(0, 100)
  }));

  return { contents, metadatas };
}
