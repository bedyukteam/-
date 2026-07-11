import {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const R2_BUCKET = process.env.R2_BUCKET ?? "podcast-studio";

let _client: S3Client | null = null;

/** Lazily-built S3 client against the Cloudflare R2 endpoint. */
export function r2(): S3Client {
  if (_client) return _client;
  const accountId = process.env.R2_ACCOUNT_ID;
  if (!accountId) throw new Error("R2 לא מוגדר (חסר R2_ACCOUNT_ID בסביבה)");
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) {
    throw new Error("R2 לא מוגדר (חסרים R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY בסביבה)");
  }
  _client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  return _client;
}

export async function createMultipart(key: string, contentType: string): Promise<string> {
  const r = await r2().send(
    new CreateMultipartUploadCommand({ Bucket: R2_BUCKET, Key: key, ContentType: contentType }),
  );
  if (!r.UploadId) throw new Error("R2 לא החזיר UploadId");
  return r.UploadId;
}

export function signPartUrl(key: string, uploadId: string, partNumber: number): Promise<string> {
  return getSignedUrl(
    r2(),
    new UploadPartCommand({ Bucket: R2_BUCKET, Key: key, UploadId: uploadId, PartNumber: partNumber }),
    { expiresIn: 3600 },
  );
}

export async function completeMultipart(
  key: string,
  uploadId: string,
  parts: { ETag: string; PartNumber: number }[],
) {
  await r2().send(
    new CompleteMultipartUploadCommand({
      Bucket: R2_BUCKET,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: { Parts: [...parts].sort((a, b) => a.PartNumber - b.PartNumber) },
    }),
  );
}

export async function abortMultipart(key: string, uploadId: string) {
  await r2().send(
    new AbortMultipartUploadCommand({ Bucket: R2_BUCKET, Key: key, UploadId: uploadId }),
  );
}

export function signGetUrl(key: string, expiresIn = 12 * 3600): Promise<string> {
  return getSignedUrl(r2(), new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }), { expiresIn });
}

export async function objectSize(key: string): Promise<number> {
  const r = await r2().send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }));
  return r.ContentLength ?? 0;
}

/** Fetch a byte range of an object into memory (used for 16MB YouTube chunks). */
export async function getRange(key: string, start: number, end: number): Promise<Buffer> {
  const r = await r2().send(
    new GetObjectCommand({ Bucket: R2_BUCKET, Key: key, Range: `bytes=${start}-${end}` }),
  );
  return Buffer.from(await r.Body!.transformToByteArray());
}

export async function uploadBuffer(key: string, body: Buffer, contentType: string) {
  await r2().send(
    new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: body, ContentType: contentType }),
  );
}

export async function deleteObject(key: string) {
  await r2().send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
}
