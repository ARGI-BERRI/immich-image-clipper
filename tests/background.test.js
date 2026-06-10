import { describe, expect, it } from "vitest";
import {
  getDeviceAssetId,
  getFileNameFromContentDisposition,
  getFileNameFromUrl,
  getSuggestedFileName,
  prepareImageUploadRequestForm,
  sanitizeFileName,
} from "../src/background.js";

describe("getSuggestedFileName", () => {
  it("should return the file name from Content-Disposition if it is available", () => {
    const fileName = getSuggestedFileName({
      contentDisposition: 'attachment; filename="image.jpg"',
      contentType: "image/png",
      imageUrl: "https://example.com/fallback.png",
    });

    expect(fileName).toBe("image.jpg");
  });

  it("should return the file name from URL if Content-Disposition is not available`", () => {
    const fileName = getSuggestedFileName({
      contentDisposition: null,
      contentType: "image/png",
      imageUrl: "https://example.com/fallback.png",
    });

    expect(fileName).toBe("fallback.png");
  });

  it("should infer an extension from the content type when missing", () => {
    const fileName = getSuggestedFileName({
      contentDisposition: null,
      contentType: "image/webp",
      imageUrl: "https://example.com/path/image",
    });

    expect(fileName).toBe("image.webp");
  });

  it("should fall back to 'image' when no file name can be inferred", () => {
    const fileName = getSuggestedFileName({
      contentDisposition: null,
      contentType: "application/octet-stream",
      imageUrl: "not a url",
    });

    expect(fileName).toBe("image");
  });
});

describe("getFileNameFromContentDisposition", () => {
  it("should return the file name from a simple content disposition header", () => {
    const fileName = getFileNameFromContentDisposition(
      'attachment; filename="example.jpg"',
    );
    expect(fileName).toBe("example.jpg");
  });

  it("should return the file name from an encoded content disposition header", () => {
    const fileName = getFileNameFromContentDisposition(
      "attachment; filename*=UTF-8''%E2%82%AC%20rates.jpg",
    );
    expect(fileName).toBe("€ rates.jpg");
  });

  it("should return null if the content disposition header is missing", () => {
    const fileName = getFileNameFromContentDisposition(null);
    expect(fileName).toBeNull();
  });

  it("should return null if the content disposition header does not contain a file name", () => {
    const fileName = getFileNameFromContentDisposition("attachment");
    expect(fileName).toBeNull();
  });
});

describe("getFileNameFromUrl", () => {
  it("should return the file name with extension if available", () => {
    const fileName = getFileNameFromUrl(
      "https://example.com/path/to/image.jpg",
    );
    expect(fileName).toBe("image.jpg");
  });

  it("should return the file name only if no extension is available", () => {
    const fileName = getFileNameFromUrl("https://example.com/path/to/image");
    expect(fileName).toBe("image");
  });

  it("should return the final path segment if no file name is found", () => {
    const fileName = getFileNameFromUrl("https://example.com/path/to/");
    expect(fileName).toBe("to");
  });
});

describe("sanitizeFileName", () => {
  it("should remove invalid characters", () => {
    const fileName = sanitizeFileName("in*valid:file?name<.jpg");
    expect(fileName).toBe("in_valid_file_name_.jpg");
  });

  it("should return an empty string if the file name consists entirely of invalid characters", () => {
    const fileName = sanitizeFileName("...");
    expect(fileName).toBe("");
  });
});

describe("prepareImageUploadRequestForm", () => {
  it("should contain required field for uploading an image to Immich", () => {
    const file = new File(["dummy content"], "test.jpg", {
      type: "image/jpeg",
    });
    const formData = prepareImageUploadRequestForm(file);

    expect(formData.get("file")).toStrictEqual(file);
    expect(formData.get("file").name).toBe("test.jpg");
    expect(typeof formData.get("deviceAssetId")).toBe("string");
    expect(formData.get("deviceId")).toBe("ImmichImageClipperExtension");
  });
});

describe("getDeviceAssetId", () => {
  it("should contain a timestamp and a random UUID", () => {
    const deviceAssetId = getDeviceAssetId();
    const parts = deviceAssetId.split("_");
    expect(parts).toHaveLength(3);

    // Prefix
    expect(parts[0]).toBe("IIC");

    // Timestamp
    const timestamp = Number(parts[1]);
    expect(Number.isSafeInteger(timestamp)).toBe(true);
    expect(timestamp).toBeLessThanOrEqual(Date.now().valueOf());

    // UUID V4
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(uuidRegex.test(parts[2])).toBe(true);
  });
});
