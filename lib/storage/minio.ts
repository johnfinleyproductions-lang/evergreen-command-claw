import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const endpoint = process.env.MINIO_ENDPOINT!;
const bucket = process.env.MINIO_BUCKET || "evergreen-vault";

let _s3: S3Client | null = null;

function getS3Client(): S3Client {
  if (!_s3) {
    _s3 = new S3Client({
      endpoint,
      region: "us-east-1",
      credentials: {
        accessKeyId: process.env.MINIO_ACCESS_KEY!,
        secretAccessKey: process.env.MINIO_SECRET_KEY!,
      },
      forcePathStyle: true,
    });
  }
  return _s3;
}

export async function ensureBucket(): Promise<void> {
  const s3 = getS3Client();
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: bucket }));
    console.log(`[MinIO] Created bucket: ${bucket}`);
  }
}

export async function uploadFile(
  key: string,
  body: Buffer,
  contentType: string
): Promise<string> {
  const s3 = getS3Client();
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
  return `${endpoint}/${bucket}/${key}`;
}

export async function getPresignedUrl(
  key: string,
  expiresIn = 3600
): Promise<string> {
  const s3 = getS3Client();
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn }
  );
}

export async function deleteFile(key: string): Promise<void> {
  const s3 = getS3Client();
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

export async function getFile(key: string): Promise<Buffer> {
  const s3 = getS3Client();
  const response = await s3.send(
    new GetObjectCommand({ Bucket: bucket, Key: key })
  );
  const stream = response.Body as NodeJS.ReadableStream;
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
