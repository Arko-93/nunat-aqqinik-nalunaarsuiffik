export type MarineErrorTag =
  | "PermissionError"
  | "NativeError"
  | "StorageError"
  | "PackageError"
  | "ChecksumError"
  | "LocationError"
  | "ExportError";

export class MarineError extends Error {
  readonly _tag: MarineErrorTag;

  constructor(tag: MarineErrorTag, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = tag;
    this._tag = tag;
  }
}

export class PermissionError extends MarineError {
  constructor(message: string, options?: ErrorOptions) {
    super("PermissionError", message, options);
  }
}

export class NativeError extends MarineError {
  constructor(message: string, options?: ErrorOptions) {
    super("NativeError", message, options);
  }
}

export class StorageError extends MarineError {
  constructor(message: string, options?: ErrorOptions) {
    super("StorageError", message, options);
  }
}

export class PackageError extends MarineError {
  constructor(message: string, options?: ErrorOptions) {
    super("PackageError", message, options);
  }
}

export class ChecksumError extends MarineError {
  constructor(message: string, options?: ErrorOptions) {
    super("ChecksumError", message, options);
  }
}

export class LocationError extends MarineError {
  constructor(message: string, options?: ErrorOptions) {
    super("LocationError", message, options);
  }
}

export class ExportError extends MarineError {
  constructor(message: string, options?: ErrorOptions) {
    super("ExportError", message, options);
  }
}
