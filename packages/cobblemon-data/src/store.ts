import { readFile } from "node:fs/promises";
import { snapshotSchema } from "./schema.js";
import type { SpawnSnapshot } from "./schema.js";
import { verifySnapshotIntegrity } from "./importer.js";

export class SnapshotStore {
  private snapshot: SpawnSnapshot | null = null;
  private loadedAt: Date | null = null;

  get isLoaded(): boolean {
    return this.snapshot !== null;
  }

  get current(): SpawnSnapshot | null {
    return this.snapshot;
  }

  get loadedAtDate(): Date | null {
    return this.loadedAt;
  }

  get ageSeconds(): number | null {
    if (!this.loadedAt) return null;
    return Math.max(0, Math.floor((Date.now() - this.loadedAt.getTime()) / 1000));
  }

  async loadFromFile(filePath: string): Promise<SpawnSnapshot> {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    const validated = snapshotSchema.safeParse(parsed);
    if (!validated.success) {
      throw new Error(
        `Snapshot de spawns inválido: ${validated.error.issues
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join("; ")}`,
      );
    }
    if (!verifySnapshotIntegrity(validated.data)) {
      throw new Error("Snapshot de spawns corrompido: hash de conteúdo não confere.");
    }
    this.snapshot = validated.data;
    this.loadedAt = new Date();
    return validated.data;
  }

  setSnapshot(snapshot: SpawnSnapshot): void {
    this.snapshot = snapshot;
    this.loadedAt = new Date();
  }

  clear(): void {
    this.snapshot = null;
    this.loadedAt = null;
  }

  findBySpecies(species: string, limit = 25): SpawnSnapshot["entries"] {
    if (!this.snapshot) return [];
    const results: SpawnSnapshot["entries"] = [];
    for (const entry of this.snapshot.entries) {
      if (entry.pokemon === species) {
        results.push(entry);
        if (results.length >= limit) break;
      }
    }
    return results;
  }
}
