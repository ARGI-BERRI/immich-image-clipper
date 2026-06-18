const chromeApi = globalThis.chrome;
const UPLOADED_URL_HISTORY_LIMIT = 5;
export const UPLOADED_URLS_STORAGE_KEY = "uploadedURLs";

if (chromeApi?.runtime?.onInstalled) {
  chromeApi.runtime.onInstalled.addListener(() => {
    chromeApi.contextMenus.create({
      id: "iic-save",
      title: "Upload to Immich",
      contexts: ["image"],
    });
  });

  chromeApi.contextMenus.onClicked.addListener(async (clickData) => {
    // Early return if the clicked menu item is not our "Upload to Immich" action
    if (clickData.menuItemId !== "iic-save") {
      return;
    }

    const { imageUrl, serverUrl, apiKey } = await getArguments(clickData);

    if (!imageUrl) {
      const message = "No image URL found in context menu click data.";
      console.error(message);

      showNotification({
        title: "Immich upload failed",
        message: "No image URL was found for this menu click.",
      });

      return;
    }

    if (!serverUrl || !apiKey) {
      const message = "Server URL or API key not set in extension options.";
      console.error(message);

      showNotification({
        title: "Immich settings missing",
        message: "Set your Immich server URL and API key first.",
      });

      return;
    }

    let image;

    try {
      image = await fetchImageAsFile(imageUrl);
      console.log("Fetched image:", {
        fileName: image.fileName,
        type: image.file.type,
        size: image.file.size,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown image fetch error";
      console.error("Error fetching image:", error);

      showNotification({
        title: "Image fetch failed",
        message,
      });

      return;
    }

    try {
      const uploadResult = await uploadImageToImmich({
        file: image.file,
        serverUrl,
        apiKey,
      });

      const uploadedURL = `${serverUrl.replace(/\/+$/, "")}/photo/${uploadResult.id}`;

      try {
        await saveUploadedURL(uploadedURL);
      } catch (error) {
        console.warn("Could not save uploaded URL history:", error);
      }

      console.log("Upload successful:", uploadResult);
      console.log("Uploaded image URL:", uploadedURL);

      showNotification({
        title: "Uploaded to Immich",
        message: `${image.fileName} (${uploadedURL})`,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown upload error";
      console.error("Error uploading image to Immich:", error);

      showNotification({
        title: "Immich upload failed",
        message,
      });

      return;
    }
  });
}

/**
 * Shows a browser notification when the extension API is available.
 *
 * @param {Object} param
 * @param {string} param.title
 * @param {string} param.message
 */
export function showNotification({ title, message }) {
  chromeApi?.notifications?.create({
    type: "basic",
    iconUrl: "icons/icon128.png",
    title,
    message,
  });
}

/**
 * Saves a successful upload URL in newest-first order.
 *
 * @param {string} uploadedURL
 * @param {chrome.storage.StorageArea} storageArea
 */
export async function saveUploadedURL(
  uploadedURL,
  storageArea = chromeApi?.storage?.local,
) {
  if (!storageArea) {
    return;
  }

  const stored = await storageArea.get(UPLOADED_URLS_STORAGE_KEY);
  const uploadedURLs = addUploadedURLToHistory(
    stored[UPLOADED_URLS_STORAGE_KEY],
    uploadedURL,
  );

  await storageArea.set({ [UPLOADED_URLS_STORAGE_KEY]: uploadedURLs });
}

/**
 * Adds a URL to upload history, removing duplicates and keeping only recent items.
 *
 * @param {unknown} uploadedURLs
 * @param {string} uploadedURL
 * @returns {string[]}
 */
export function addUploadedURLToHistory(uploadedURLs, uploadedURL) {
  const existingURLs = Array.isArray(uploadedURLs)
    ? uploadedURLs.filter(
        (storedURL) =>
          typeof storedURL === "string" && storedURL !== uploadedURL,
      )
    : [];

  return [uploadedURL, ...existingURLs].slice(0, UPLOADED_URL_HISTORY_LIMIT);
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

/**
 * Uploads an image file to the Immich server using the provided API key.
 *
 * @see https://api.immich.app/endpoints/assets/uploadAsset
 *
 * @param {Object} param
 * @param {File} param.file
 * @param {string} param.serverUrl
 * @param {string} param.apiKey
 * @returns {Promise<{ status: string, id: string }>} The response from the Immich API after uploading the image
 */
export async function uploadImageToImmich({ file, serverUrl, apiKey }) {
  const formData = prepareImageUploadRequestForm(file);

  const endpoint = `${serverUrl.replace(/\/+$/, "")}/api/assets`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "x-api-key": apiKey },
    body: formData,
  });

  if (!response.ok) {
    const responseBody = await response.text();
    const msg = `Failed to upload image: ${response.status} ${response.statusText}: ${responseBody}`;
    throw new Error(msg);
  }

  return await response.json();
}

/**
 * Prepares the request form data for uploading an image to Immich.
 *
 * @param {File} file The image file to be uploaded
 * @returns FormData The prepared FormData object containing the necessary fields
 */
export function prepareImageUploadRequestForm(file) {
  const fileDate = new Date(file.lastModified);

  const requestBody = {
    deviceAssetId: getDeviceAssetId(),
    deviceId: "ImmichImageClipperExtension",
    fileCreatedAt: fileDate.toISOString(),
    fileModifiedAt: fileDate.toISOString(),
    filename: file.name,
  };

  const formData = new FormData();
  formData.append("assetData", file, file.name);

  for (const [key, value] of Object.entries(requestBody)) {
    formData.append(key, value);
  }

  return formData;
}

/**
 * Generates a unique device asset ID using the current timestamp and a random UUID.
 *
 * @returns string deviceAssetId in the format "IIC_{timestamp}_{randomUUID}"
 */
export function getDeviceAssetId() {
  const timestamp = Date.now();
  const randomPart = crypto.randomUUID();
  return `IIC_${timestamp}_${randomPart}`;
}
