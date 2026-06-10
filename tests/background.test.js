import { describe, expect, it } from "vitest";
import {
  getFileNameFromContentDisposition,
  getFileNameFromUrl,
  sanitizeFileName,
} from "../src/background.js";

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
