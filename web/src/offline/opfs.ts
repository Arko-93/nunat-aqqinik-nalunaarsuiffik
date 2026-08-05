/**
 * Thin OPFS adapter so corridor-pack install/delete can be tested without a browser.
 */

import { PackError } from "./manifest.ts";

export type OpfsDirectory = {
  getDirectoryHandle(
    name: string,
    options?: { create?: boolean },
  ): Promise<OpfsDirectory>;
  getFileHandle(
    name: string,
    options?: { create?: boolean },
  ): Promise<OpfsFileHandle>;
  removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>;
};

export type OpfsFileHandle = {
  createWritable(): Promise<{
    write(data: BufferSource | Blob | string): Promise<void>;
    close(): Promise<void>;
  }>;
  getFile(): Promise<Blob>;
};

export type OpfsRootProvider = () => Promise<OpfsDirectory>;

export const browserOpfsRoot: OpfsRootProvider = async () => {
  if (
    typeof navigator === "undefined" ||
    !("storage" in navigator) ||
    typeof navigator.storage.getDirectory !== "function"
  ) {
    throw new PackError("OPFS unavailable in this browser");
  }
  return navigator.storage.getDirectory() as unknown as OpfsDirectory;
};

/** In-memory OPFS for unit tests. */
export function createMemoryOpfsRoot(): {
  provider: OpfsRootProvider;
  root: MemoryDir;
} {
  const root = new MemoryDir();
  return {
    root,
    provider: async () => root,
  };
}

class MemoryFile implements OpfsFileHandle {
  bytes = new Uint8Array();

  async createWritable() {
    const chunks: Uint8Array[] = [];
    return {
      write: async (data: BufferSource | Blob | string) => {
        if (typeof data === "string") {
          chunks.push(new TextEncoder().encode(data));
          return;
        }
        if (data instanceof Blob) {
          chunks.push(new Uint8Array(await data.arrayBuffer()));
          return;
        }
        chunks.push(new Uint8Array(data as ArrayBufferLike));
      },
      close: async () => {
        const total = chunks.reduce((n, c) => n + c.byteLength, 0);
        const out = new Uint8Array(total);
        let offset = 0;
        for (const chunk of chunks) {
          out.set(chunk, offset);
          offset += chunk.byteLength;
        }
        this.bytes = out;
      },
    };
  }

  async getFile(): Promise<Blob> {
    return new Blob([this.bytes]);
  }
}

class MemoryDir implements OpfsDirectory {
  dirs = new Map<string, MemoryDir>();
  files = new Map<string, MemoryFile>();

  async getDirectoryHandle(
    name: string,
    options?: { create?: boolean },
  ): Promise<OpfsDirectory> {
    let dir = this.dirs.get(name);
    if (!dir) {
      if (!options?.create) {
        throw Object.assign(new Error("NotFoundError"), { name: "NotFoundError" });
      }
      dir = new MemoryDir();
      this.dirs.set(name, dir);
    }
    return dir;
  }

  async getFileHandle(
    name: string,
    options?: { create?: boolean },
  ): Promise<OpfsFileHandle> {
    let file = this.files.get(name);
    if (!file) {
      if (!options?.create) {
        throw Object.assign(new Error("NotFoundError"), { name: "NotFoundError" });
      }
      file = new MemoryFile();
      this.files.set(name, file);
    }
    return file;
  }

  async removeEntry(name: string, _options?: { recursive?: boolean }): Promise<void> {
    this.dirs.delete(name);
    this.files.delete(name);
  }
}
