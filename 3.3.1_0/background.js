chrome.runtime.onInstalled.addListener(function () {
  // Replace all rules ...
  chrome.declarativeContent.onPageChanged.removeRules(undefined, function () {
    // With a new rule ...
    chrome.declarativeContent.onPageChanged.addRules([
      {
        // That fires when a page's URL contains a 'g' ...
        conditions: [
          new chrome.declarativeContent.PageStateMatcher({
            pageUrl: { hostEquals: "cloudcraft.acloud.guru" }, // Update URL
          }),
        ],
        // And shows the extension's page action.
        actions: [new chrome.declarativeContent.ShowPageAction()],
      },
    ]);
  });
});

// Listen navigation update and change Popup HTML
chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tabInfo) {
  var popUpURL = "",
    selectedTabURL = tabInfo.url;
  // Update URL
  if (selectedTabURL.match(/.*cloudcraft\.acloud.guru.*/) != null) {
    popUpURL = "questions_popup.html";
  }

  chrome.pageAction.setPopup({
    popup: popUpURL,
    tabId,
  });
});
