const chromeApi = globalThis.chrome;

if (chromeApi?.runtime?.onInstalled) {
  chromeApi.runtime.onInstalled.addListener(() => {
    chromeApi.contextMenus.create({
      id: "iic-save",
      title: "Upload to Immich",
      contexts: ["image"],
    });
  });

  chromeApi.contextMenus.onClicked.addListener(async (clickData) => {
    if (clickData.menuItemId === "iic-save") {
      const { imageUrl, serverUrl, apiKey } = await getArguments(clickData);

      if (!imageUrl) {
        console.error("No image URL found in context menu click data.");
        return;
      }

      if (!serverUrl || !apiKey) {
        console.error("Server URL or API key not set in extension options.");
        return;
      }

      try {
        const image = await fetchImageAsFile(imageUrl);
        console.log("Fetched image:", {
          fileName: image.fileName,
          type: image.file.type,
          size: image.file.size,
        });
      } catch (error) {
        console.error("Error fetching image:", error);
        return;
      }
    }
  });
}

/**
 * Extracts necessary arguments.
 *
 * @param {chrome.contextMenus.OnClickData} clickData
 * @return {Promise<{ imageUrl: string, serverUrl: string, apiKey: string }>} Arguments
 */
export async function getArguments(clickData) {
  const imageUrl = clickData.srcUrl;

  const { serverUrl, apiKey } = await chrome.storage.sync.get([
    "serverUrl",
    "apiKey",
  ]);

  return { imageUrl, serverUrl, apiKey };
}

/**
 * Fetches an image from the given URL and returns it as a Blob and File object.
 *
 * The function attempts to determine the file name from
 * the Content-Disposition header or the URL.
 *
 * @param {string} imageUrl The URL of the image to fetch
 * @returns {Promise<{ blob: Blob, file: File, fileName: string }>}
 */
export async function fetchImageAsFile(imageUrl) {
  const response = await fetch(imageUrl, { credentials: "include" });

  if (!response.ok) {
    const msg = `Failed to fetch image: ${response.status} ${response.statusText}`;
    throw new Error(msg);
  }

  const blob = await response.blob();
  const contentType =
    blob.type ||
    response.headers.get("content-type") ||
    "application/octet-stream";

  const fileName = getSuggestedFileName({
    contentDisposition: response.headers.get("content-disposition"),
    contentType,
    imageUrl: response.url || imageUrl,
  });

  const file = new File([blob], fileName, { type: contentType });

  return { blob, file, fileName };
}

/**
 * Determines a suggested file name for an image based on options.
 *
 * @param {Object} options
 * @param {string} options.contentDisposition Content-Disposition header
 * @param {string} options.contentType Content-Type header
 * @param {string} options.imageUrl Original image URL
 * @returns {string} Suggested file name for the image, including extension if possible
 */
export function getSuggestedFileName({
  contentDisposition,
  contentType,
  imageUrl,
}) {
  const inferredFileName =
    getFileNameFromContentDisposition(contentDisposition) ||
    getFileNameFromUrl(imageUrl) ||
    "image";

  // NOTE: sanitizeFileName may return "" if inferredFileName consists entirely of invalid characters
  const fileName = sanitizeFileName(inferredFileName) || "image";

  // Return fileName as is if it already has an extension
  if (/\.[a-z0-9]{1,8}$/i.test(fileName)) {
    return fileName;
  }

  // Otherwise, infer extension from content type
  const extensions = {
    "image/avif": "avif",
    "image/bmp": "bmp",
    "image/gif": "gif",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/svg+xml": "svg",
    "image/webp": "webp",
    "image/x-icon": "ico",
  };

  const extension = extensions[contentType.split(";")[0].toLowerCase()] || null;

  if (!extension) {
    return fileName;
  }

  return `${fileName}.${extension}`;
}

/**
 * Extracts a file name from the Content-Disposition header.
 *
 * @param {string | null} contentDisposition The Content-Disposition header
 * @returns {string | null} The extracted file name, or null if it cannot be determined
 */
export function getFileNameFromContentDisposition(contentDisposition) {
  if (!contentDisposition) {
    return null;
  }

  const encodedMatch = contentDisposition.match(/filename\*\s*=\s*([^;]+)/i);

  if (encodedMatch) {
    const unquotedValue = encodedMatch[1].trim().replace(/^["']|["']$/g, "");
    const parts = unquotedValue.split("'");
    const encodedFileName =
      parts.length >= 3 ? parts.slice(2).join("'") : unquotedValue;

    try {
      return decodeURIComponent(encodedFileName);
    } catch {
      return encodedFileName;
    }
  } else {
    const plainMatch = contentDisposition.match(/filename\s*=\s*([^;]+)/i);

    if (plainMatch) {
      return plainMatch[1].trim().replace(/^["']|["']$/g, "");
    }

    return null;
  }
}

/**
 * Extracts a file name from the given image URL.
 *
 * @param {string} imageUrl The URL of the image
 * @returns {string | null} The extracted file name, or null if it cannot be determined
 */
export function getFileNameFromUrl(imageUrl) {
  try {
    const url = new URL(imageUrl);

    const pathPart = url.pathname.split("/").filter(Boolean).pop();

    if (!pathPart) {
      return null;
    }

    return decodeURIComponent(pathPart);
  } catch {
    return null;
  }
}

/**
 * Sanitizes a file name by replacing invalid characters with underscores and trimming whitespace.
 *
 * @param {string} fileName The original file name to sanitize
 * @returns string The sanitized file name
 */
export function sanitizeFileName(fileName) {
  return Array.from(fileName, (character) => {
    if (character.charCodeAt(0) < 32 || /[<>:"/\\|?*]/.test(character)) {
      return "_";
    }

    return character;
  })
    .join("")
    .replace(/\s+/g, " ")
    .replace(/^\.+/, "")
    .trim();
}
