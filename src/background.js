chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "iic-save",
    title: "Upload to Immich",
    contexts: ["image"],
  });
});

chrome.contextMenus.onClicked.addListener(async (clickData, _) => {
  if (clickData.menuItemId === "iic-save") {
    const imageUrl = clickData.srcUrl;
    const settings = await chrome.storage.sync.get(["serverUrl", "apiKey"]);

    if (!settings.serverUrl || !settings.apiKey) {
      console.error("Server URL or API key not set in settings.");
      return;
    }

    console.log("Saving image to Immich:", {
      serverUrl: settings.serverUrl,
      imageUrl,
    });
  }
});
