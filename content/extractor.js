/**
 * Amazon Subscribe & Save Mass Cancel - Content Script
 * 
 * This script runs on Amazon Subscribe & Save pages to help with extraction.
 * Most of the logic is in popup.js via executeScript for better control.
 */

(function () {
    console.log('[Subscribe & Save Mass Cancel] Content script loaded on S&S page');

    // Mark page as ready for the extension
    window.__SNS_MASS_CANCEL_READY__ = true;
})();
