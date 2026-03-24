const script = document.createElement("script");
script.src = chrome.runtime.getURL("bca-intercept.js");
script.onload = function () {
  this.remove();
};
(document.head || document.documentElement).appendChild(script);
