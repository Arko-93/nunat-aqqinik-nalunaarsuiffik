import { Schema } from "effect";

export class NunagisHttpError extends Schema.TaggedErrorClass<NunagisHttpError>()(
  "NunagisHttpError",
  {
    message: Schema.String,
    status: Schema.optionalKey(Schema.Number),
    cause: Schema.optionalKey(Schema.Defect()),
  },
) {}

export class NunagisDecodeError extends Schema.TaggedErrorClass<NunagisDecodeError>()(
  "NunagisDecodeError",
  {
    message: Schema.String,
    cause: Schema.optionalKey(Schema.Defect()),
  },
) {}

export class NunagisServiceError extends Schema.TaggedErrorClass<NunagisServiceError>()(
  "NunagisServiceError",
  {
    message: Schema.String,
    code: Schema.optionalKey(Schema.Number),
  },
) {}

export class FileWriteError extends Schema.TaggedErrorClass<FileWriteError>()(
  "FileWriteError",
  {
    path: Schema.String,
    message: Schema.String,
    cause: Schema.optionalKey(Schema.Defect()),
  },
) {}
