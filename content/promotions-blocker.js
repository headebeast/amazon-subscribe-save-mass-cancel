/**
 * Amazon Subscribe & Save Mass Cancel — Promotions Blocker
 *
 * Content script injected on ALL Amazon pages.
 * Detects sponsored / promoted content and applies the user's chosen mode:
 *   - "block"     → hides sponsored items completely
 *   - "highlight" → adds a red border + SPONSORED badge
 *   - "off"       → does nothing (default)
 *
 * State is persisted via chrome.storage.local under key "promoBlockerMode".
 */

(function () {
    'use strict';

    // ── Selectors that match Amazon's sponsored / promoted elements ──
    const SPONSORED_SELECTORS = [
        // Search results
        '[data-component-type="sp-sponsored-result"]',
        '[data-component-type="sp-search-result"]',
        '.AdHolder',
        '.s-result-item[data-asin] .s-label-popover-default',
        // Product page
        '#sp_detail',
        '#sp_detail2',
        '#sp_detail_thematic',
        '[cel_widget_id*="sp-sponsored"]',
        // Sidebar / below-fold
        '.a-carousel-container [data-a-carousel-options*="sponsor"]',
        '#pdagSponsored',
        '#sp_hqp',
        '#sp_dp_discoverybox',
        // Homepage & category pages
        '[data-component-type="s-ads-metrics"]',
        '[data-ad-feedback]',
        '.sbv-product',
        // Brand / headline ads
        '[data-component-type="sbr-header"]',
        '[data-component-type="sbv-video"]',
        '[cel_widget_id*="brand-header"]',
    ];

    // Additional text markers inside elements that signal sponsored content
    const SPONSORED_TEXT_MARKERS = ['Sponsored', 'Ad feedback'];

    const CSS_CLASS_BLOCK = 'sns-promo-blocked';
    const CSS_CLASS_HIGHLIGHT = 'sns-promo-highlighted';
    const STORAGE_KEY = 'promoBlockerMode';

    let currentMode = 'highlight';

    // ── Core logic ──────────────────────────────────────────────────

    /**
     * Find all sponsored elements on the page.
     * Returns the top-level container for each sponsored item.
     */
    function findSponsoredElements() {
        const found = new Set();

        // 1. Direct selector matches
        SPONSORED_SELECTORS.forEach(selector => {
            try {
                document.querySelectorAll(selector).forEach(el => {
                    const container = getPromotionContainer(el);
                    if (container) found.add(container);
                });
            } catch (_) {
                // Some selectors may fail on certain page structures — ignore
            }
        });

        // 2. Text-based detection: find small labels that say "Sponsored"
        const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: node => {
                    const text = node.textContent.trim();
                    if (SPONSORED_TEXT_MARKERS.some(marker => text === marker)) {
                        return NodeFilter.FILTER_ACCEPT;
                    }
                    return NodeFilter.FILTER_REJECT;
                }
            }
        );

        while (walker.nextNode()) {
            const container = getPromotionContainer(walker.currentNode.parentElement);
            if (container) found.add(container);
        }

        return found;
    }

    /**
     * Walk up from a detected sponsored indicator to find the meaningful
     * container element (the whole product card / ad block).
     */
    function getPromotionContainer(el) {
        if (!el) return null;

        // Walk up to find a recognisable product/ad container
        let current = el;
        const maxDepth = 12;
        for (let i = 0; i < maxDepth && current && current !== document.body; i++) {
            // Search result items
            if (current.matches && (
                current.matches('.s-result-item[data-asin]') ||
                current.matches('.AdHolder') ||
                current.matches('[data-component-type^="sp-"]') ||
                current.matches('[data-component-type^="sbr-"]') ||
                current.matches('[data-component-type^="sbv-"]') ||
                current.matches('[cel_widget_id*="sp-sponsored"]') ||
                current.matches('[data-ad-feedback]') ||
                current.matches('#sp_detail') ||
                current.matches('#sp_detail2')
            )) {
                return current;
            }
            current = current.parentElement;
        }

        // Fallback: return the element itself if it looks sizeable enough
        if (el.offsetHeight > 50) return el;
        return null;
    }

    /**
     * Apply the current mode to all detected sponsored elements.
     */
    function applyMode() {
        const elements = findSponsoredElements();

        elements.forEach(el => {
            // Clear previous classes
            el.classList.remove(CSS_CLASS_BLOCK, CSS_CLASS_HIGHLIGHT);

            switch (currentMode) {
                case 'block':
                    el.classList.add(CSS_CLASS_BLOCK);
                    break;
                case 'highlight':
                    el.classList.add(CSS_CLASS_HIGHLIGHT);
                    break;
                case 'off':
                default:
                    // Leave as-is
                    break;
            }
        });
    }

    /**
     * Remove all applied classes from every element on the page.
     */
    function clearAll() {
        document.querySelectorAll(`.${CSS_CLASS_BLOCK}, .${CSS_CLASS_HIGHLIGHT}`).forEach(el => {
            el.classList.remove(CSS_CLASS_BLOCK, CSS_CLASS_HIGHLIGHT);
        });
    }

    // ── Initialization ──────────────────────────────────────────────

    function init() {
        // Read stored preference
        chrome.storage.local.get([STORAGE_KEY], result => {
            currentMode = result[STORAGE_KEY] || 'off';
            if (currentMode !== 'off') {
                applyMode();
            }
        });

        // Watch for storage changes (user toggles in popup)
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === 'local' && changes[STORAGE_KEY]) {
                currentMode = changes[STORAGE_KEY].newValue || 'off';
                clearAll();
                if (currentMode !== 'off') {
                    applyMode();
                }
            }
        });

        // Watch for dynamically loaded content
        const observer = new MutationObserver(() => {
            if (currentMode !== 'off') {
                applyMode();
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    // Kick off
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
