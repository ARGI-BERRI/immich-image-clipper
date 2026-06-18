import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addUploadedURLToHistory,
  fetchImageAsFile,
  getDeviceAssetId,
  getFileNameFromContentDisposition,
  getFileNameFromUrl,
  getSuggestedFileName,
  prepareImageUploadRequestForm,
  sanitizeFileName,
  saveUploadedURL,
  UPLOADED_URLS_STORAGE_KEY,
} from "../src/background.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchImageAsFile", () => {
  it("should fetch an image and return it as a File", async () => {
    const blob = new Blob(["image bytes"], { type: "image/png" });
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      url: "https://example.com/images/original.png",
      headers: new Headers({
        "content-disposition": 'attachment; filename="download.png"',
        "content-type": "image/png",
      }),
      blob: vi.fn().mockResolvedValue(blob),
    });

    vi.stubGlobal("fetch", fetch);

    const result = await fetchImageAsFile("https://example.com/image");

    expect(fetch).toHaveBeenCalledWith("https://example.com/image", {
      credentials: "include",
    });
    expect(result.blob).toBe(blob);
    expect(result.fileName).toBe("download.png");
    expect(result.file).toBeInstanceOf(File);
    expect(result.file.name).toBe("download.png");
    expect(result.file.type).toBe("image/png");
    expect(await result.file.text()).toBe("image bytes");
  });

  it("should infer file type from the response header when the blob type is missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        url: "https://example.com/images/photo.webp",
        headers: new Headers({
          "content-type": "image/webp",
        }),
        blob: vi.fn().mockResolvedValue(new Blob(["image bytes"])),
      }),
    );

    const result = await fetchImageAsFile("https://example.com/image");

    expect(result.fileName).toBe("photo.webp");
    expect(result.file.type).toBe("image/webp");
  });

  it("should use the original URL and default content type when response metadata is missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        url: "",
        headers: new Headers(),
        blob: vi.fn().mockResolvedValue(new Blob(["image bytes"])),
      }),
    );

    const result = await fetchImageAsFile("https://example.com/original.gif");

    expect(result.fileName).toBe("original.gif");
    expect(result.file.type).toBe("application/octet-stream");
  });

  it("should throw when the image fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
      }),
    );

    await expect(
      fetchImageAsFile("https://example.com/missing.jpg"),
    ).rejects.toThrow("Failed to fetch image: 404 Not Found");
  });
});

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

  it("should fall back to 'image' when the inferred file name is empty after sanitizing", () => {
    const fileName = getSuggestedFileName({
      contentDisposition: 'attachment; filename="..."',
      contentType: "image/png",
      imageUrl: "https://example.com/fallback.jpg",
    });

    expect(fileName).toBe("image.png");
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

  it("should decode an encoded content disposition value without charset metadata", () => {
    const fileName = getFileNameFromContentDisposition(
      "attachment; filename*=%E2%82%AC%20rates.jpg",
    );
    expect(fileName).toBe("€ rates.jpg");
  });

  it("should return the encoded content disposition value if decoding fails", () => {
    const fileName = getFileNameFromContentDisposition(
      "attachment; filename*=UTF-8''invalid%ZZ.jpg",
    );
    expect(fileName).toBe("invalid%ZZ.jpg");
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

  it("should return null if the URL has no valid path", () => {
    const fileName = getFileNameFromUrl("file:///");
    expect(fileName).toBeNull();
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

describe("addUploadedURLToHistory", () => {
  it("should add the latest uploaded URL first and keep the five most recent URLs", () => {
    const uploadedURLs = addUploadedURLToHistory(
      [
        "https://immich.example.com/photo/5",
        "https://immich.example.com/photo/4",
        "https://immich.example.com/photo/3",
        "https://immich.example.com/photo/2",
        "https://immich.example.com/photo/1",
      ],
      "https://immich.example.com/photo/6",
    );

    expect(uploadedURLs).toStrictEqual([
      "https://immich.example.com/photo/6",
      "https://immich.example.com/photo/5",
      "https://immich.example.com/photo/4",
      "https://immich.example.com/photo/3",
      "https://immich.example.com/photo/2",
    ]);
  });

  it("should move an existing uploaded URL to the front instead of duplicating it", () => {
    const uploadedURLs = addUploadedURLToHistory(
      [
        "https://immich.example.com/photo/3",
        "https://immich.example.com/photo/2",
        "https://immich.example.com/photo/1",
      ],
      "https://immich.example.com/photo/2",
    );

    expect(uploadedURLs).toStrictEqual([
      "https://immich.example.com/photo/2",
      "https://immich.example.com/photo/3",
      "https://immich.example.com/photo/1",
    ]);
  });

  it("should ignore invalid stored values", () => {
    const uploadedURLs = addUploadedURLToHistory(
      ["https://immich.example.com/photo/1", null, 1],
      "https://immich.example.com/photo/2",
    );

    expect(uploadedURLs).toStrictEqual([
      "https://immich.example.com/photo/2",
      "https://immich.example.com/photo/1",
    ]);
  });
});

describe("saveUploadedURL", () => {
  it("should save uploaded URLs to the provided storage area", async () => {
    const storageArea = {
      get: vi.fn().mockResolvedValue({
        [UPLOADED_URLS_STORAGE_KEY]: ["https://immich.example.com/photo/1"],
      }),
      set: vi.fn().mockResolvedValue(undefined),
    };

    await saveUploadedURL("https://immich.example.com/photo/2", storageArea);

    expect(storageArea.get).toHaveBeenCalledWith(UPLOADED_URLS_STORAGE_KEY);
    expect(storageArea.set).toHaveBeenCalledWith({
      [UPLOADED_URLS_STORAGE_KEY]: [
        "https://immich.example.com/photo/2",
        "https://immich.example.com/photo/1",
      ],
    });
  });
});

describe("prepareImageUploadRequestForm", () => {
  it("should contain required field for uploading an image to Immich", () => {
    const file = new File(["dummy content"], "test.jpg", {
      type: "image/jpeg",
    });
    const formData = prepareImageUploadRequestForm(file);

    expect(formData.get("assetData")).toStrictEqual(file);
    expect(formData.get("assetData").name).toBe("test.jpg");
    expect(typeof formData.get("deviceAssetId")).toBe("string");
    expect(formData.get("deviceId")).toBe("ImmichImageClipperExtension");
    expect(formData.get("filename")).toBe("test.jpg");
    expect(typeof formData.get("fileCreatedAt")).toBe("string");
    expect(typeof formData.get("fileModifiedAt")).toBe("string");
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
