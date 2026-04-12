// Load shared utilities first, then the BCA-specific intercept script
const shared = document.createElement("script");
shared.src = chrome.runtime.getURL("carlytics-shared.js");
shared.onload = function () {
  this.remove();
  const main = document.createElement("script");
  main.src = chrome.runtime.getURL("bca-intercept.js");
  main.onload = function () { this.remove(); };
  (document.head || document.documentElement).appendChild(main);
};
(document.head || document.documentElement).appendChild(shared);
