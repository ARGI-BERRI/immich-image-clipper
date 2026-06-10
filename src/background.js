chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "save-to-immich",
    title: "Save to Immich",
    contexts: ["image"],
  });
});
