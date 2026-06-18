const UPLOADED_URLS_STORAGE_KEY = "uploadedURLs";
const UPLOADED_URL_HISTORY_LIMIT = 5;

document.addEventListener("DOMContentLoaded", async () => {
  const serverUrlInput = document.getElementById("iic-server-url");
  const apiKeyInput = document.getElementById("iic-api-key");
  const status = document.getElementById("iic-status");
  const uploadedURLList = document.getElementById("iic-uploaded-url-list");
  const uploadedURLEmpty = document.getElementById("iic-uploaded-url-empty");

  // Load saved settings
  const settings = await chrome.storage.sync.get(["serverUrl", "apiKey"]);
  serverUrlInput.value = settings.serverUrl || "";
  apiKeyInput.value = settings.apiKey || "";

  const uploadHistory = await chrome.storage.local.get(
    UPLOADED_URLS_STORAGE_KEY,
  );

  renderUploadedURLs({
    uploadedURLs: uploadHistory[UPLOADED_URLS_STORAGE_KEY],
    uploadedURLList,
    uploadedURLEmpty,
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes[UPLOADED_URLS_STORAGE_KEY]) {
      return;
    }

    renderUploadedURLs({
      uploadedURLs: changes[UPLOADED_URLS_STORAGE_KEY].newValue,
      uploadedURLList,
      uploadedURLEmpty,
    });
  });

  // Save settings on form submit
  document.querySelector("form").addEventListener("submit", async (e) => {
    // Prevent form from submitting and refreshing the page
    e.preventDefault();

    const serverUrl = serverUrlInput.value.trim();
    const apiKey = apiKeyInput.value.trim();

    if (!serverUrl || !apiKey) {
      status.textContent = "Server URL and API key are required.";
      status.className = "status status-error";
      return;
    }

    await chrome.storage.sync.set({
      serverUrl,
      apiKey,
    });

    serverUrlInput.value = serverUrl;
    apiKeyInput.value = apiKey;

    // Reflect saved results in the Popup UI
    status.textContent = "Saved.";
    status.className = "status status-success";
  });
});

function renderUploadedURLs({
  uploadedURLs,
  uploadedURLList,
  uploadedURLEmpty,
}) {
  uploadedURLList.textContent = "";

  const recentUploadedURLs = Array.isArray(uploadedURLs)
    ? uploadedURLs
        .filter((uploadedURL) => typeof uploadedURL === "string")
        .slice(0, UPLOADED_URL_HISTORY_LIMIT)
    : [];

  uploadedURLEmpty.hidden = recentUploadedURLs.length > 0;

  for (const uploadedURL of recentUploadedURLs) {
    const item = document.createElement("li");
    const link = document.createElement("a");

    link.href = uploadedURL;
    link.textContent = uploadedURL;
    link.target = "_blank";
    link.rel = "noreferrer";

    item.append(link);
    uploadedURLList.append(item);
  }
}
