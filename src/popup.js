document.addEventListener("DOMContentLoaded", async () => {
  const serverUrlInput = document.getElementById("iic-server-url");
  const apiKeyInput = document.getElementById("iic-api-key");
  const status = document.getElementById("iic-status");

  // Load saved settings
  const settings = await chrome.storage.sync.get(["serverUrl", "apiKey"]);
  serverUrlInput.value = settings.serverUrl || "";
  apiKeyInput.value = settings.apiKey || "";

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
