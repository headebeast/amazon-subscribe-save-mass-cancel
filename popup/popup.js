/**
 * Amazon Subscribe & Save Mass Cancel - Popup Controller
 */

class PopupController {
    constructor() {
        this.subscriptionIds = [];
        this.canceledCount = 0;
        this.errorCount = 0;
        this.errors = [];

        this.initElements();
        this.bindEvents();
        this.checkCurrentPage();
    }

    initElements() {
        this.elements = {
            snsSection: document.getElementById('sns-section'),
            statusPanel: document.getElementById('status-panel'),
            pageStatus: document.getElementById('page-status'),
            countPanel: document.getElementById('count-panel'),
            subCount: document.getElementById('sub-count'),
            progressPanel: document.getElementById('progress-panel'),
            progressPct: document.getElementById('progress-pct'),
            progressFill: document.getElementById('progress-fill'),
            progressDetails: document.getElementById('progress-details'),
            resultsPanel: document.getElementById('results-panel'),
            successCount: document.getElementById('success-count'),
            errorCount: document.getElementById('error-count'),
            errorList: document.getElementById('error-list'),
            btnScan: document.getElementById('btn-scan'),
            btnCancelAll: document.getElementById('btn-cancel-all'),
            instructions: document.getElementById('instructions')
        };
    }

    bindEvents() {
        this.elements.btnScan.addEventListener('click', () => this.scanPage());
        this.elements.btnCancelAll.addEventListener('click', () => this.cancelAll());
    }

    async checkCurrentPage() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

            if (tab.url && /amazon\.[a-z.]+\/auto-deliveries/.test(tab.url)) {
                this.elements.snsSection.classList.remove('hidden');
                this.setStatus('ready', 'Ready - Subscribe & Save page detected');
            } else {
                this.elements.snsSection.classList.add('hidden');
            }
        } catch (error) {
            this.elements.snsSection.classList.add('hidden');
        }
    }

    setStatus(type, message) {
        const statusEl = this.elements.pageStatus;
        statusEl.className = `status-indicator ${type}`;
        statusEl.querySelector('.text').textContent = message;
    }

    async scanPage() {
        this.elements.btnScan.disabled = true;
        this.elements.btnScan.textContent = '⏳ Scanning...';
        this.setStatus('', 'Scanning for subscriptions...');

        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

            // Inject and execute the extraction script
            const results = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: extractSubscriptionIds
            });

            const ids = results[0]?.result || [];
            this.subscriptionIds = ids;

            if (ids.length > 0) {
                this.elements.subCount.textContent = ids.length;
                this.elements.btnCancelAll.disabled = false;
                this.setStatus('ready', `Found ${ids.length} subscription(s)`);
                this.elements.instructions.classList.add('hidden');
            } else {
                this.setStatus('error', 'No subscriptions found. Click "Show more" on the page.');
            }
        } catch (error) {
            console.error('Scan error:', error);
            this.setStatus('error', 'Scan failed - make sure you\'re on the Subscribe & Save page');
        }

        this.elements.btnScan.disabled = false;
        this.elements.btnScan.textContent = '🔍 Scan Page';
    }

    async cancelAll() {
        if (this.subscriptionIds.length === 0) return;

        // Confirm with user
        const total = this.subscriptionIds.length;

        // Hide other panels, show progress
        this.elements.countPanel.classList.add('hidden');
        this.elements.progressPanel.classList.remove('hidden');
        this.elements.btnScan.disabled = true;
        this.elements.btnCancelAll.disabled = true;
        this.elements.instructions.classList.add('hidden');

        // Reset counters
        this.canceledCount = 0;
        this.errorCount = 0;
        this.errors = [];

        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        // Process each subscription
        for (let i = 0; i < this.subscriptionIds.length; i++) {
            const subId = this.subscriptionIds[i];
            this.updateProgress(i + 1, total, `Canceling ${subId.slice(0, 12)}...`);

            try {
                const result = await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: cancelSubscription,
                    args: [subId]
                });

                const response = result[0]?.result;

                if (response && response.success) {
                    this.canceledCount++;
                } else {
                    this.errorCount++;
                    this.errors.push({ id: subId, error: response?.error || 'Unknown error' });
                }
            } catch (error) {
                this.errorCount++;
                this.errors.push({ id: subId, error: error.message });
            }

            // Small delay to avoid rate limiting
            await this.sleep(500);
        }

        this.showResults();
    }

    updateProgress(current, total, detail) {
        const percent = Math.round((current / total) * 100);
        this.elements.progressPct.textContent = `${percent}%`;
        this.elements.progressFill.style.width = `${percent}%`;
        this.elements.progressDetails.textContent = detail;
    }

    showResults() {
        this.elements.progressPanel.classList.add('hidden');
        this.elements.resultsPanel.classList.remove('hidden');

        this.elements.successCount.textContent = this.canceledCount;
        this.elements.errorCount.textContent = this.errorCount;

        if (this.errors.length > 0) {
            this.elements.errorList.classList.remove('hidden');
            this.elements.errorList.innerHTML = this.errors
                .map(e => `<div>❌ ${e.id.slice(0, 15)}... - ${e.error}</div>`)
                .join('');
        }

        this.setStatus('ready', 'Complete!');
        this.elements.btnScan.disabled = false;
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

/**
 * Injected function to extract subscription IDs from page
 */
function extractSubscriptionIds() {
    const ids = [];

    // Method 1: Look for data attributes on edit links
    const spans = document.querySelectorAll('span[data-action="edit-link-subscription-tablet"]');
    spans.forEach(span => {
        const data = span.getAttribute('data-edit-link-subscription-tablet');
        if (data) {
            const match = data.match(/subscriptionId=([^&"]+)/);
            if (match && !ids.includes(match[1])) ids.push(match[1]);
        }
    });

    // Method 2: Look for subscription links in the page
    if (ids.length === 0) {
        const links = document.querySelectorAll('a[href*="subscriptionId="]');
        links.forEach(link => {
            const match = link.href.match(/subscriptionId=([^&]+)/);
            if (match && !ids.includes(match[1])) {
                ids.push(match[1]);
            }
        });
    }

    // Method 3: Look for hidden inputs
    if (ids.length === 0) {
        const inputs = document.querySelectorAll('input[name="subscriptionId"]');
        inputs.forEach(input => {
            if (input.value && !ids.includes(input.value)) {
                ids.push(input.value);
            }
        });
    }

    return ids;
}

/**
 * Injected function to cancel a single subscription
 */
async function cancelSubscription(subscriptionId) {
    const cancelDate = Date.now();
    // Get the base URL from the current page (works for any Amazon domain)
    const baseUrl = window.location.origin;
    const url = `${baseUrl}/auto-deliveries/ajax/cancelSubscriptionAction?actionType=cancelSubscription&canceledNextDeliveryDate=${cancelDate}&subscriptionId=${subscriptionId}`;

    try {
        const response = await fetch(url, {
            method: 'GET',
            credentials: 'include',
            headers: {
                'Accept': 'application/json, text/javascript, */*; q=0.01',
                'X-Requested-With': 'XMLHttpRequest'
            }
        });

        if (response.ok) {
            const text = await response.text();
            // Amazon returns HTML/JSON depending on the action
            // If we get a response without error, consider it successful
            if (!text.includes('error') && !text.includes('Error')) {
                return { success: true };
            }
            return { success: false, error: 'Amazon returned an error' };
        } else {
            return { success: false, error: `HTTP ${response.status}` };
        }
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// Initialize popup
document.addEventListener('DOMContentLoaded', () => {
    new PopupController();
    new PromotionsToggle();
    new UpdateBanner();
});

/**
 * Promotions Blocker Toggle — manages the 3-state UI in the popup.
 * Reads/writes "promoBlockerMode" in chrome.storage.local.
 */
class PromotionsToggle {
    constructor() {
        this.storageKey = 'promoBlockerMode';
        this.toggleContainer = document.getElementById('promo-toggle');
        if (!this.toggleContainer) return;

        this.options = this.toggleContainer.querySelectorAll('.promo-option');
        this.loadState();
        this.bindEvents();
    }

    loadState() {
        if (chrome?.storage?.local) {
            chrome.storage.local.get([this.storageKey], (result) => {
                const mode = result[this.storageKey] || 'highlight';
                this.setActiveOption(mode);
            });
        }
    }

    bindEvents() {
        this.options.forEach(option => {
            option.addEventListener('click', () => {
                const radio = option.querySelector('input[type="radio"]');
                const mode = radio.value;
                radio.checked = true;
                this.setActiveOption(mode);
                if (chrome?.storage?.local) {
                    chrome.storage.local.set({ [this.storageKey]: mode });
                }
            });
        });
    }

    setActiveOption(mode) {
        this.options.forEach(opt => {
            opt.classList.toggle('active', opt.dataset.mode === mode);
            const radio = opt.querySelector('input[type="radio"]');
            radio.checked = opt.dataset.mode === mode;
        });
    }
}

/**
 * Update Banner — shows a one-time notification when the extension version changes.
 * Compares chrome.runtime.getManifest().version to stored "lastSeenVersion".
 */
class UpdateBanner {
    constructor() {
        this.banner = document.getElementById('update-banner');
        this.dismissBtn = document.getElementById('dismiss-update');
        if (!this.banner || !chrome?.runtime?.getManifest) return;

        this.currentVersion = chrome.runtime.getManifest().version;
        this.storageKey = 'lastSeenVersion';
        this.check();
        this.dismissBtn?.addEventListener('click', () => this.dismiss());
    }

    check() {
        if (!chrome?.storage?.local) return;
        chrome.storage.local.get([this.storageKey], (result) => {
            const lastVersion = result[this.storageKey];
            if (lastVersion && lastVersion !== this.currentVersion) {
                this.banner.classList.remove('hidden');
            } else if (!lastVersion) {
                // First install — store version, don't show banner
                chrome.storage.local.set({ [this.storageKey]: this.currentVersion });
            }
        });
    }

    dismiss() {
        this.banner.classList.add('hidden');
        if (chrome?.storage?.local) {
            chrome.storage.local.set({ [this.storageKey]: this.currentVersion });
        }
    }
}
