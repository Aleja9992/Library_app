import "server-only";
import sharp from "sharp";
import { ApiError } from "@/lib/errors";
import type { CoverContentType } from "@/lib/data/books";

const MAX_IMAGE_PIXELS = 20_000_000;

const supportedFormats: Record<CoverContentType, string> = {
  "image/jpeg": "jpeg",
  "image/png": "png",
  "image/webp": "webp",
};

export async function validateCoverImage(
  contentType: CoverContentType,
  data: string,
): Promise<Buffer> {
  const bytes = Buffer.from(data, "base64");

  if (
    bytes.length === 0 ||
    bytes.toString("base64").replace(/=+$/, "") !== data.replace(/=+$/, "")
  ) {
    throw invalidImage();
  }

  try {
    const image = sharp(bytes, {
      failOn: "error",
      limitInputPixels: MAX_IMAGE_PIXELS,
      sequentialRead: true,
    });
    const metadata = await image.metadata();
    if (
      metadata.format !== supportedFormats[contentType] ||
      !metadata.width ||
      !metadata.height ||
      metadata.width * metadata.height > MAX_IMAGE_PIXELS
    ) {
      throw invalidImage();
    }

    // stats() forces a full local decode; metadata alone only checks the header.
    await image.stats();
    return bytes;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw invalidImage();
  }
}

function invalidImage(): ApiError {
  return new ApiError(
    400,
    "VALIDATION_ERROR",
    "La portada no es una imagen JPEG, PNG o WebP válida.",
  );
}
