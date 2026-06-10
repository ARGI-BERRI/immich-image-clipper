document.addEventListener("DOMContentLoaded", async () => {
  const serverUrlInput = document.getElementById("iic-server-url");
  const apiKeyInput = document.getElementById("iic-api-key");

  // Load saved settings
  const settings = await chrome.storage.sync.get(["serverUrl", "apiKey"]);
  serverUrlInput.value = settings.serverUrl || "";
  apiKeyInput.value = settings.apiKey || "";

  // Save settings on form submit
  document.querySelector("form").addEventListener("submit", async (e) => {
    // Prevent form from submitting and refreshing the page
    e.preventDefault();

    await chrome.storage.sync.set({
      serverUrl: serverUrlInput.value,
      apiKey: apiKeyInput.value,
    });
  });
});
