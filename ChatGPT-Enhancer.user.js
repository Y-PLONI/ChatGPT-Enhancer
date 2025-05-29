// ==UserScript==
// @name         כלי עזר משולבים וסרגל צד ל-ChatGPT (עם הגדרות v3.1.3 - אופטימיזציות מתקדמות)
// @namespace    http://tampermonkey.net/
// @version      3.1.3
// @description  משלב עיצוב בועות, RTL, העתקה, הסתרת "תוכניות", וסרגל צד Timeline, עם התאמה אישית ואופטימיזציות ביצועים מתקדמות.
// @author       Y-PLONI
// @match        *://chatgpt.com/*
// @match        *://chat.openai.com/*
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_setClipboard
// @grant        GM_log
// @grant        GM_notification
// @run-at       document-idle
// @require      https://code.jquery.com/jquery-3.7.1.slim.min.js
// @updateURL    https://raw.githubusercontent.com/Y-PLONI/SCRIPT1/main/SCRIPT.user.js // קישור לקובץ הגולמי לבדיקת עדכונים
// @downloadURL  https://raw.githubusercontent.com/Y-PLONI/SCRIPT1/main/SCRIPT.user.js // קישור לקובץ הגולמי להורדת העדכון

// ==/UserScript==

(function() {
    'use strict';

    const DEBUG = false; // DEBUG Global for all features
    const debugLog = DEBUG ? (...args) => console.log('[CGPT Script]', ...args) : () => {};
    const debugWarn = DEBUG ? (...args) => console.warn('[CGPT Script]', ...args) : () => {};
    const debugError = DEBUG ? (...args) => console.error('[CGPT Script]', ...args) : () => {};

    debugLog('ChatGPT Combined Utilities & Timeline Script v3.1.3 - Started');

    // --- START: Settings and General Utilities ---
    const SETTINGS_KEYS = {
        enableStyling: 'chatgpt_utils_enableStyling_v2',
        enableCopyButton: 'chatgpt_utils_enableCopyButton_v2',
        enableHidePlansButton: 'chatgpt_utils_enableHidePlansButton_v1',
        enableTimelineSidebar: 'chatgpt_utils_enableTimelineSidebar_v1'
    };
    let currentSettings = {};
    let pageVisible = true; // For pausing observers when tab is hidden

    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    const STYLE_ID_BASE = 'chatgpt-userscript-style-';
    function injectStyles(id, cssText){
        let el = document.getElementById(id);
        if (cssText){
            if (!el){ el = document.createElement('style'); el.id = id; document.head.appendChild(el); }
            el.textContent = cssText;
            debugLog(`Styles injected/updated for ID: ${id}`);
        } else if (el){
            el.remove();
            debugLog(`Styles removed for ID: ${id}`);
        }
    }

    function loadSettings() {
        currentSettings.enableStyling = GM_getValue(SETTINGS_KEYS.enableStyling, true);
        currentSettings.enableCopyButton = GM_getValue(SETTINGS_KEYS.enableCopyButton, true);
        currentSettings.enableHidePlansButton = GM_getValue(SETTINGS_KEYS.enableHidePlansButton, false);
        currentSettings.enableTimelineSidebar = GM_getValue(SETTINGS_KEYS.enableTimelineSidebar, true);
        debugLog('CombinedScript - Loaded settings:', currentSettings);
    }
    // --- END: Settings and General Utilities ---

    // --- START: Combined Utilities Feature - Bubble Styling, RTL, Copy, Hide Plans ---
    const userMessageContainerSelector = 'div[data-message-author-role="user"][data-message-id]';
    const userMessageBubbleSelector = 'div[data-message-author-role="user"] div[class*="rounded-3xl"]';
    const userTextContentSelector = 'div[data-message-author-role="user"] .whitespace-pre-wrap';
    const userMessageFlexContainerSelector = 'div[data-message-author-role="user"].text-message';
    const aiMessageContainerSelector = 'div[data-message-author-role="assistant"][data-message-id]';
    // const userBackgroundColor = '#F4FFF7'; // No longer needed here, moved to CSS variables
    const aiPadding = '10px 15px';
    const aiBorderRadius = '1.5rem';
    const aiMarginBottom = '15px';
    const aiMarginTop = '15px';

    const ACTIONS_CONTAINER_SELECTOR = '#conversation-header-actions';
    const SHARE_BUTTON_SELECTOR = 'button[data-testid="share-chat-button"]';
    const RETRY_MS = 500;
    const MAX_FIND_ACTIONS_CONTAINER_RETRIES = 10;

    const HIDE_PLANS_MAIN_TEXT = "View plans";
    const HIDE_PLANS_SUBTEXT_KEYWORD = "Unlimited access";
    const PLANS_BUTTON_ITEM_SELECTOR = 'div[class*="__menu-item"]';
    const PLANS_BUTTON_WRAPPER_ATTR = 'data-plans-wrapper-hidden-by-script';
    const PLANS_BUTTON_ITEM_ATTR = 'data-plans-item-hidden-by-script';

    let copyButtonObserver = null;
    let findActionsContainerRetries = 0;
    let hidePlansObserver = null;
    let hidePlansAttempts = 0;

    function applyStylesOnLoad() {
        const STYLE_ID_STYLING = STYLE_ID_BASE + 'styling';
        const STYLE_ID_COPY    = STYLE_ID_BASE + 'copy';
        let cssStyling = "", cssCopy = "";

        if (currentSettings.enableStyling) {
            cssStyling += `
                :root{
                    --cgpt-user-bubble: #F4FFF7;
                    --cgpt-user-stripe: #A5D6A7;
                    --cgpt-ai-bubble: #E3F2FD;
                    --cgpt-ai-border: #BBDEFB;
                    --cgpt-ai-stripe: #64B5F6;
                }
                ${userMessageContainerSelector} { direction: rtl !important; }
                ${userMessageFlexContainerSelector} { align-items: flex-start !important; }
                ${userTextContentSelector} { text-align: right !important; }
                ${userMessageBubbleSelector} {
                    background-color: var(--cgpt-user-bubble) !important;
                    padding: 10px 15px !important;
                    border-right: 4px solid var(--cgpt-user-stripe) !important;
                }
                ${aiMessageContainerSelector} {
                    background-color: var(--cgpt-ai-bubble) !important; /* כחול בהיר מאוד */
                    padding: ${aiPadding} !important;
                    border-radius: ${aiBorderRadius} !important;
                    margin-bottom: ${aiMarginBottom} !important;
                    margin-top: ${aiMarginTop} !important;
                    border: 1px solid var(--cgpt-ai-border) !important; /* גבול כחול מעט יותר כהה */
                    border-left: 4px solid var(--cgpt-ai-stripe) !important; /* פס כחול בצד, מעט יותר כהה מהרקע */
                }
                ${aiMessageContainerSelector} > div:first-child { padding-top: 0 !important; }
            `;
        }

        if (currentSettings.enableCopyButton) {
            cssCopy += `
                #copy-chatgpt-conversation {
                    display: flex; align-items: center; justify-content: center; height: 36px; min-width: 36px;
                    padding: 0 8px; margin-inline-end: 8px;
                    background-color: #FFFFFF !important; /* רקע לבן */
                    color: #343A40 !important; /* צבע טקסט/אייקון כהה */
                    font-size: 18px; line-height: 1;
                    border: 1px solid #DEE2E6 !important; /* גבול אפור בהיר */
                    border-radius: 6px; cursor: pointer;
                    user-select: none; order: -1; /* order: -1 ממקם אותו ראשון בקונטיינר */
                    font-family: inherit; /* ירושה של פונט */
                }
                #copy-chatgpt-conversation:hover {
                    background-color: #F8F9FA !important; /* רקע מעט אפרפר ב-hover */
                    border-color: #CED4DA !important; /* גבול מעט כהה יותר ב-hover */
                    opacity: 1;
                }
            `;
        }

        injectStyles(STYLE_ID_STYLING, cssStyling);
        injectStyles(STYLE_ID_COPY, cssCopy);
        debugLog('CombinedScript Styles - Applied/updated via injectStyles with CSS variables.');
    }

    function initializeCopyButtonFeature() {
        if (copyButtonObserver) copyButtonObserver.disconnect(); copyButtonObserver = null;
        const existingButton = document.getElementById('copy-chatgpt-conversation');
        if (existingButton) existingButton.remove();

        if (currentSettings.enableCopyButton) {
            debugLog('CopyButton - Initializing.');
            findActionsContainerRetries = 0;
            setTimeout(attemptToSetupCopyButtonObserver, 750);
            if (!window.__cgptCopyBtnBodyObserver) {
                window.__cgptCopyBtnBodyObserver = new MutationObserver(() => {
                    if (!currentSettings.enableCopyButton || !pageVisible) return;
                    if (!document.getElementById('copy-chatgpt-conversation') &&
                        document.querySelector(ACTIONS_CONTAINER_SELECTOR)) {
                        debugLog('CopyButton - Body observer detected missing button. Re-initializing.');
                        initializeCopyButtonFeature();
                    }
                });
                if (pageVisible) window.__cgptCopyBtnBodyObserver.observe(document.body, { childList: true, subtree: true });
            } else if (pageVisible && !copyButtonObserver && document.querySelector(ACTIONS_CONTAINER_SELECTOR)) { // Re-observe if already exists but disconnected
                 if (!window.__cgptCopyBtnBodyObserver.takeRecords().length) { // Check if it's already observing
                    try { window.__cgptCopyBtnBodyObserver.observe(document.body, { childList: true, subtree: true }); } catch(e) { /* already observing or error */ }
                 }
            }
        } else {
            if (window.__cgptCopyBtnBodyObserver) {
                window.__cgptCopyBtnBodyObserver.disconnect();
                window.__cgptCopyBtnBodyObserver = null;
            }
            debugLog('CopyButton - Disabled by settings.');
        }
    }

    function attemptToSetupCopyButtonObserver() {
        if (!currentSettings.enableCopyButton || !pageVisible) return;
        const actionsContainer = document.querySelector(ACTIONS_CONTAINER_SELECTOR);
        if (actionsContainer) {
            debugLog('CopyButton - Actions container found. Setting up MutationObserver.');
            if (copyButtonObserver) copyButtonObserver.disconnect();
            copyButtonObserver = new MutationObserver((mutationsList, observer) => {
                if(!pageVisible) return;
                debugLog('CopyButton - Mutation in actions container.');
                const currentActionsContainer = document.querySelector(ACTIONS_CONTAINER_SELECTOR);
                if (!currentActionsContainer || !document.body.contains(currentActionsContainer)) {
                    debugWarn('CopyButton - Actions container no longer in DOM. Re-initializing.');
                    observer.disconnect(); copyButtonObserver = null; findActionsContainerRetries = 0;
                    setTimeout(attemptToSetupCopyButtonObserver, RETRY_MS * 2);
                    return;
                }
                ensureCopyButtonPresent(currentActionsContainer);
            });
            copyButtonObserver.observe(actionsContainer, { childList: true, subtree: true });
            ensureCopyButtonPresent(actionsContainer);
        } else {
            findActionsContainerRetries++;
            if (findActionsContainerRetries < MAX_FIND_ACTIONS_CONTAINER_RETRIES) {
                debugLog(`CopyButton - Actions container not found (attempt ${findActionsContainerRetries}). Retrying...`);
                setTimeout(attemptToSetupCopyButtonObserver, RETRY_MS * (findActionsContainerRetries < 5 ? 2 : 4));
            } else { debugError('CopyButton - Actions container not found. Observer not set up.'); }
        }
    }

    function ensureCopyButtonPresent(container) {
        if (!currentSettings.enableCopyButton || !container || !document.body.contains(container)) {
            const btn = document.getElementById('copy-chatgpt-conversation'); if (btn) btn.remove();
            return;
        }
        const shareButtonOriginal = container.querySelector(SHARE_BUTTON_SELECTOR);
        if (!shareButtonOriginal) {
            debugLog('CopyButton - Share button not found in container, possibly transient.');
            return;
        }
        let copyBtn = document.getElementById('copy-chatgpt-conversation');
        if (copyBtn && container.contains(copyBtn) && copyBtn.nextSibling === shareButtonOriginal) return;
        if (copyBtn) { copyBtn.remove(); debugLog('CopyButton - Removed existing (misplaced/detached).'); }
        copyBtn = document.createElement('button');
        copyBtn.id = 'copy-chatgpt-conversation';
        copyBtn.textContent = '📋';
        copyBtn.title = 'העתק את השיחה';
        copyBtn.addEventListener('click', copyConversation);
        container.insertBefore(copyBtn, shareButtonOriginal);
        debugLog('CopyButton - Injected/Re-injected.');
    }

    function buildConversationText() {
        const conversationTurns = document.querySelectorAll('article[data-testid^="conversation-turn-"]');
        let output = '';
        conversationTurns.forEach((turn) => {
            const userMessageBlock = turn.querySelector('div[data-message-author-role="user"]');
            const assistantMessageBlock = turn.querySelector('div[data-message-author-role="assistant"]');
            let role = '', text = '';
            if (userMessageBlock) {
                role = 'user';
                const textElement = userMessageBlock.querySelector('.whitespace-pre-wrap');
                text = textElement ? textElement.innerText.trim() : userMessageBlock.innerText.trim();
            } else if (assistantMessageBlock) {
                role = 'assistant';
                const markdownProseElement = assistantMessageBlock.querySelector('.markdown.prose');
                if (markdownProseElement) text = markdownProseElement.innerText.trim();
                else {
                    const fallbackTextElement = assistantMessageBlock.querySelector('div[data-message-id] > div > div:not([class*="agent-verification"])');
                    text = fallbackTextElement ? fallbackTextElement.innerText.trim() : assistantMessageBlock.innerText.trim();
                }
            }
            if (text) output += (role === 'user' ? 'שאלתי:\n' : 'וענו לי:\n') + text + '\n\n';
        });
        return output.trim();
    }
    async function copyConversation() {
        const textToCopy = buildConversationText(); if (!textToCopy) { flashIcon('🤔'); return; }
        try {
            if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') await navigator.clipboard.writeText(textToCopy);
            else if (typeof GM_setClipboard === 'function') GM_setClipboard(textToCopy, { type: 'text', mimetype: 'text/plain' });
            else throw new Error('Clipboard API not available');
            flashIcon('✔️');
        } catch (err) {
            debugError('CopyButton - Copy failed:', err); flashIcon('❌');
            if (typeof GM_notification === 'function') GM_notification({ title: 'שגיאת העתקה', text: `ההעתקה נכשלה: ${err.message}`, silent: true, timeout: 8000 });
        }
    }
    function flashIcon(str) {
        const btn = document.getElementById('copy-chatgpt-conversation'); if (!btn) return;
        const originalContent = '📋'; btn.textContent = str;
        setTimeout(() => { const cb = document.getElementById('copy-chatgpt-conversation'); if(cb) cb.textContent = originalContent; }, 1500);
    }

    function findAndHidePlansButton() {
        if (!currentSettings.enableHidePlansButton) return false;
        hidePlansAttempts++;
        debugLog(`HidePlans - Attempt ${hidePlansAttempts} to find and hide.`);
        const potentialItems = document.querySelectorAll(PLANS_BUTTON_ITEM_SELECTOR);
        let itemToHide = null;
        for (let i = 0; i < potentialItems.length; i++) {
            const item = potentialItems[i];
            if (item.getAttribute(PLANS_BUTTON_ITEM_ATTR) || (item.parentElement && item.parentElement.getAttribute(PLANS_BUTTON_WRAPPER_ATTR))) {
                if (item.parentElement && item.parentElement.getAttribute(PLANS_BUTTON_WRAPPER_ATTR) && item.parentElement.style.display !== 'none') {
                    item.parentElement.style.display = 'none';
                } else if (item.getAttribute(PLANS_BUTTON_ITEM_ATTR) && item.style.display !== 'none' && !(item.parentElement && item.parentElement.getAttribute(PLANS_BUTTON_WRAPPER_ATTR))) {
                     item.style.display = 'none';
                }
                continue;
            }
            const mainTextElement = item.querySelector('.truncate');
            if (!mainTextElement || mainTextElement.textContent.trim() !== HIDE_PLANS_MAIN_TEXT) continue;
            const minW0Container = item.querySelector('div.min-w-0');
            if (!minW0Container) continue;
            let subTextElement = null;
            const divsInMinW0 = minW0Container.querySelectorAll('div');
            for (const div of divsInMinW0) {
                if (div !== mainTextElement && div !== mainTextElement.parentElement && div.textContent.includes(HIDE_PLANS_SUBTEXT_KEYWORD)) {
                    subTextElement = div; break;
                }
            }
            if (!subTextElement) continue;
            const svgIcon = item.querySelector('svg');
            if (!svgIcon) continue;
            itemToHide = item; break;
        }
        if (itemToHide) {
            const wrapperToHide = itemToHide.parentElement;
            if (wrapperToHide && wrapperToHide.tagName !== 'BODY' && wrapperToHide.contains(itemToHide) && wrapperToHide.classList.contains('bg-token-bg-elevated-secondary')) {
                 if (wrapperToHide.style.display !== 'none') {
                    debugLog('HidePlans - Wrapper identified. Hiding it:', wrapperToHide);
                    wrapperToHide.style.display = 'none';
                }
                wrapperToHide.setAttribute(PLANS_BUTTON_WRAPPER_ATTR, 'true');
                itemToHide.setAttribute(PLANS_BUTTON_ITEM_ATTR, 'true');
                itemToHide.style.display = 'none';
            } else {
                debugWarn('HidePlans - Wrapper not as expected. Hiding only inner item.', itemToHide, wrapperToHide);
                 if (itemToHide.style.display !== 'none') itemToHide.style.display = 'none';
                itemToHide.setAttribute(PLANS_BUTTON_ITEM_ATTR, 'true');
            }
            return true;
        } else {
            if (potentialItems.length > 0) debugLog(`HidePlans - Target not fully matched among ${potentialItems.length} candidates.`);
            return false;
        }
    }

    function initializeHidePlansFeature() {
        if (hidePlansObserver) hidePlansObserver.disconnect(); hidePlansObserver = null;
        const previouslyHiddenWrapper = document.querySelector(`[${PLANS_BUTTON_WRAPPER_ATTR}="true"]`);
        if (previouslyHiddenWrapper) { previouslyHiddenWrapper.style.display = ''; previouslyHiddenWrapper.removeAttribute(PLANS_BUTTON_WRAPPER_ATTR); }
        const previouslyHiddenItem = document.querySelector(`[${PLANS_BUTTON_ITEM_ATTR}="true"]`);
        if (previouslyHiddenItem) { previouslyHiddenItem.style.display = ''; previouslyHiddenItem.removeAttribute(PLANS_BUTTON_ITEM_ATTR); }

        if (!currentSettings.enableHidePlansButton) {
            debugLog('HidePlans - Disabled by settings. Ensured elements visible.');
            return;
        }
        debugLog('HidePlans - Initializing.');
        hidePlansAttempts = 0;
        findAndHidePlansButton();
        hidePlansObserver = new MutationObserver(debounce((mutationsList, observer) => {
            if (!currentSettings.enableHidePlansButton || !pageVisible) {
                if(!pageVisible && currentSettings.enableHidePlansButton) return; // Paused due to page visibility
                observer.disconnect(); hidePlansObserver = null; return;
            }
            const wrapperProcessedAndHidden = document.querySelector(`[${PLANS_BUTTON_WRAPPER_ATTR}="true"]`);
            if (wrapperProcessedAndHidden && wrapperProcessedAndHidden.style.display === 'none') return;
            const itemProcessedAndHidden = document.querySelector(`[${PLANS_BUTTON_ITEM_ATTR}="true"]`);
             if (itemProcessedAndHidden && itemProcessedAndHidden.style.display === 'none' && !wrapperProcessedAndHidden) {
                 debugLog("HidePlans - Item hidden but wrapper not, re-evaluating.");
             }
            findAndHidePlansButton();
        }, 300));
        if (pageVisible) hidePlansObserver.observe(document.body, { childList: true, subtree: true });
        debugLog('HidePlans - MutationObserver monitoring (if page visible).');
    }
    // --- END: Combined Utilities Feature ---

    // --- START: Timeline Sidebar Feature ---
    const TIMELINE_CSS_ID = "cgpt-timeline-styles";
    const TIMELINE_HTML_ID = "cgpt-timeline-root";
    let timeline_messages = [];
    let timeline_currentMessageIndex = -1;
    let timeline_chatScrollContainer;
    let timeline_chatScrollContainerTop = 0;
    let timeline_mainElementResizeObserver = null;
    let timeline_domObserver = null;
    let timeline_intersectionObserver = null;
    let timeline_initialized = false;

    const timelineCSS = `
        /* ... (CSS remains the same as previous full version) ... */
        #${TIMELINE_HTML_ID} {
            position: fixed !important; top: 15vh !important; width: 4px !important;
            height: 60vh !important; background-color: #B0B0B0 !important;
            z-index: 2147483640 !important; border-radius: 2px !important;
            transition: opacity 0.3s, left 0.3s ease-out;
        }
        #${TIMELINE_HTML_ID}.hidden { opacity: 0 !important; pointer-events: none !important; }
        #${TIMELINE_HTML_ID} .cgpt-dots {
            margin: 0 !important; padding: 0 !important; list-style: none !important;
            position: relative !important; height: 100% !important;
        }
        #${TIMELINE_HTML_ID} .cgpt-dots li {
            position: absolute !important; left: 50% !important; transform: translateX(-50%) !important;
            width: 10px !important; height: 10px !important; padding: 4px !important;
            box-sizing: content-box !important; border-radius: 50% !important; cursor: pointer !important;
            transition: width 0.2s ease-in-out, height 0.2s ease-in-out, background-color 0.2s ease-in-out, transform 0.2s ease-in-out;
        }
        #${TIMELINE_HTML_ID} .cgpt-dots li::before {
            content: ''; position: absolute; top: 50%; left: 50%;
            width: 8px; height: 8px; background-color: grey;
            border-radius: 50%; transform: translate(-50%, -50%);
            transition: width 0.2s ease-in-out, height 0.2s ease-in-out, background-color 0.2s ease-in-out;
        }
        #${TIMELINE_HTML_ID} .cgpt-dots li.user::before { background-color: #4CAF50 !important; }
        #${TIMELINE_HTML_ID} .cgpt-dots li.assistant::before { background-color: #0d6efd !important; }
        #${TIMELINE_HTML_ID} .cgpt-dots li.active::before { width: 12px !important; height: 12px !important; }
        #${TIMELINE_HTML_ID} .cgpt-dots li span {
            position: absolute !important; white-space: nowrap !important; font-size: 11px !important;
            left: 16px !important; top: 50% !important; transform: translateY(-50%) !important;
            color: grey !important; background-color: rgba(255, 255, 255, 0.75);
            padding: 1px 3px !important; border-radius: 2px !important; pointer-events: none;
        }
        #${TIMELINE_HTML_ID} .cgpt-dots li.endpoint-number span { color: black !important; font-weight: bold; }
        #${TIMELINE_HTML_ID} .cgpt-dots li:not(.endpoint-number) span { opacity: 0.55 !important; }
    `;

    const timelineNavigatorHtml = `
        <div id="${TIMELINE_HTML_ID}" class="hidden"><ul class="cgpt-dots"></ul></div>
    `;

    function timeline_injectCSS_local(cssText, id) { // Renamed to avoid conflict if global injectStyles has different purpose
        let styleElement = document.getElementById(id);
        if (!styleElement) {
            styleElement = document.createElement('style');
            styleElement.id = id; styleElement.type = 'text/css'; document.head.appendChild(styleElement);
        }
        styleElement.textContent = cssText;
    }

    function timeline_updateTimelinePositionAndVisibility() {
        const $navigatorRoot = $(`#${TIMELINE_HTML_ID}`); if (!$navigatorRoot.length) return;
        const $mainElement = $('main');
        if (!$mainElement.length) { $navigatorRoot.addClass('hidden'); debugWarn('Timeline - Main element not found.'); return; }
        const mainRect = $mainElement.get(0).getBoundingClientRect();
        $navigatorRoot.css('left', (mainRect.left + 15) + 'px');
        if (timeline_messages.length > 0 && timeline_chatScrollContainer && timeline_chatScrollContainer.length && timeline_chatScrollContainer.get(0).isConnected) {
            $navigatorRoot.removeClass('hidden');
        } else { $navigatorRoot.addClass('hidden'); }
    }

    function timeline_findChatElements() {
        timeline_chatScrollContainer = $('#thread div.flex.h-full.flex-col.overflow-y-auto[class*="scrollbar-gutter:stable_both-edges"]').first();
        if (!timeline_chatScrollContainer || !timeline_chatScrollContainer.length) {
             timeline_chatScrollContainer = $('div.flex.h-full.flex-col.overflow-y-auto').first();
        }
        if (!timeline_chatScrollContainer || !timeline_chatScrollContainer.length || !timeline_chatScrollContainer.get(0).isConnected) {
            debugLog('Timeline - Chat scroll container not found/connected.');
            timeline_messages = []; return false;
        }
        timeline_chatScrollContainerTop = timeline_chatScrollContainer.get(0).getBoundingClientRect().top;
        const messageArticles = timeline_chatScrollContainer.find('article[data-testid^="conversation-turn-"]');
        const newMessages = messageArticles.toArray().map(articleEl => {
            const $article = $(articleEl);
            const $messageDiv = $article.find('div[data-message-id]').first();
            let role = 'user';
            if ($article.find('div[data-message-author-role="assistant"]').length > 0) role = 'assistant';
            return { element: $messageDiv, role: role, id: $messageDiv.attr('data-message-id') };
        }).filter(msg => msg.element && msg.element.length > 0 && msg.id);
        if (newMessages.length !== timeline_messages.length || timeline_messages.some((oldMsg, idx) => oldMsg.id !== newMessages[idx]?.id)) {
            timeline_messages = newMessages;
            debugLog('Timeline - Message structure updated.', timeline_messages.length, 'messages found.');
            return true;
        }
        return false;
    }

    function timeline_renderDots() {
        const $dotsUl = $(`#${TIMELINE_HTML_ID} .cgpt-dots`); if (!$dotsUl.length) return;
        $dotsUl.empty();
        if (timeline_messages.length === 0) {
             timeline_updateTimelinePositionAndVisibility();
             if (timeline_intersectionObserver) timeline_intersectionObserver.disconnect();
             return;
        }
        timeline_messages.forEach((msgData, i) => {
            const li = $('<li/>').addClass(msgData.role === 'assistant' ? 'assistant' : 'user').attr('data-idx', i).attr('title', `הודעה ${i+1} (${msgData.role})`);
            if (i === 0 || i === timeline_messages.length - 1) li.addClass('endpoint-number');
            let topPercentage = timeline_messages.length === 1 ? 50 : (timeline_messages.length > 1 ? (i / (timeline_messages.length - 1)) * 100 : 0);
            li.css('top', topPercentage + '%').append($(`<span>${i+1}</span>`));
            $dotsUl.append(li);
        });
        timeline_updateTimelineState(false);
        timeline_updateTimelinePositionAndVisibility();
        if (pageVisible) timeline_setupIntersectionObserver();
    }

    function timeline_updateTimelineState(isScrollingEvent = true) {
        const $dotsUl = $(`#${TIMELINE_HTML_ID} .cgpt-dots`);
        if (timeline_messages.length === 0 || !timeline_chatScrollContainer || !timeline_chatScrollContainer.length || !timeline_chatScrollContainer.get(0).isConnected || !$dotsUl.length) {
            if ($dotsUl.length) $dotsUl.children('li').removeClass('active');
            timeline_currentMessageIndex = -1; return;
        }
        timeline_chatScrollContainerTop = timeline_chatScrollContainer.get(0).getBoundingClientRect().top;
        const containerScrollTop = timeline_chatScrollContainer.scrollTop(), containerVisibleHeight = timeline_chatScrollContainer.innerHeight();
        let bestMatchIndex = -1, smallestPositiveOffset = Infinity;
        const visibilityThreshold = 0.3;
        for (let i = 0; i < timeline_messages.length; i++) {
            const msg = timeline_messages[i].element; if (!msg || !msg.length) continue;
            const msgDomElement = msg.get(0); if (!msgDomElement || !msgDomElement.isConnected) continue;
            const msgRect = msgDomElement.getBoundingClientRect(), msgHeight = msgRect.height; if (msgHeight === 0) continue;
            const msgTopRel = msgRect.top - timeline_chatScrollContainerTop, msgBottomRel = msgTopRel + msgHeight;
            const visibleHeightInContainer = Math.min(containerVisibleHeight, msgBottomRel) - Math.max(0, msgTopRel);
            const visiblePortion = visibleHeightInContainer / msgHeight;
            if (visiblePortion >= visibilityThreshold) {
                if (msgTopRel >= -(msgHeight * (1 - visibilityThreshold)) && msgTopRel < smallestPositiveOffset) {
                     smallestPositiveOffset = msgTopRel; bestMatchIndex = i;
                } else if (bestMatchIndex === -1) bestMatchIndex = i;
            }
        }
        if (bestMatchIndex === -1 && timeline_currentMessageIndex !== -1 && timeline_currentMessageIndex < timeline_messages.length) {
             const prevMsgEl = timeline_messages[timeline_currentMessageIndex].element.get(0);
             if (prevMsgEl && prevMsgEl.isConnected) {
                const prevRect = prevMsgEl.getBoundingClientRect();
                if ((prevRect.top - timeline_chatScrollContainerTop + prevRect.height) > 0 && (prevRect.top - timeline_chatScrollContainerTop) < containerVisibleHeight) {
                    bestMatchIndex = timeline_currentMessageIndex;
                }
             }
        }
        if (bestMatchIndex === -1 && timeline_messages.length > 0) {
            if (containerScrollTop <= 10) bestMatchIndex = 0;
            else if (containerScrollTop + containerVisibleHeight >= timeline_chatScrollContainer.get(0).scrollHeight - 20) bestMatchIndex = timeline_messages.length - 1;
            else bestMatchIndex = timeline_currentMessageIndex >= 0 && timeline_currentMessageIndex < timeline_messages.length ? timeline_currentMessageIndex : 0;
        }
        bestMatchIndex = timeline_messages.length > 0 ? Math.max(0, Math.min(bestMatchIndex, timeline_messages.length - 1)) : -1;
        if (bestMatchIndex !== -1 && (timeline_currentMessageIndex !== bestMatchIndex || $dotsUl.children('li.active').length === 0) ) {
            timeline_currentMessageIndex = bestMatchIndex;
            $dotsUl.children('li').removeClass('active').eq(timeline_currentMessageIndex).addClass('active');
            debugLog(`Timeline State: Active dot ${timeline_currentMessageIndex} via updateTimelineState`);
        }
    }

    function timeline_setupIntersectionObserver(){
        if (!pageVisible || !currentSettings.enableTimelineSidebar) {
            if (timeline_intersectionObserver) timeline_intersectionObserver.disconnect();
            return;
        }
        if (!('IntersectionObserver' in window)) { debugWarn("Timeline - IO not supported."); return; }
        if (timeline_intersectionObserver) timeline_intersectionObserver.disconnect();
        const rootEl = timeline_chatScrollContainer && timeline_chatScrollContainer.length ? timeline_chatScrollContainer.get(0) : null;
        if (!rootEl || timeline_messages.length === 0) {
            debugLog("Timeline - IO not setup (no root/messages)."); return;
        }
        const io_options = { root: rootEl, rootMargin: '0px', threshold: 0.35 };
        timeline_intersectionObserver = new IntersectionObserver((entries) => {
            if(!pageVisible) return;
            let lastIntersectingIdx = -1;
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const idx = parseInt(entry.target.getAttribute('data-cgpt-idx'));
                    if (!isNaN(idx)) lastIntersectingIdx = idx;
                }
            });
            const visibleIdx = lastIntersectingIdx !== -1 ? lastIntersectingIdx : timeline_currentMessageIndex;
            if (visibleIdx !== -1 && visibleIdx < timeline_messages.length && (visibleIdx !== timeline_currentMessageIndex || !$(`#${TIMELINE_HTML_ID} .cgpt-dots li.active`).length)) {
                timeline_currentMessageIndex = visibleIdx;
                $(`#${TIMELINE_HTML_ID} .cgpt-dots li`).removeClass('active').eq(visibleIdx).addClass('active');
                debugLog(`Timeline IO: Message ${visibleIdx} active.`);
            }
        }, io_options);
        timeline_messages.forEach((msgData, i) => {
            if (msgData.element && msgData.element.length && msgData.element.get(0)) {
                const domEl = msgData.element.get(0);
                domEl.setAttribute('data-cgpt-idx', i.toString());
                timeline_intersectionObserver.observe(domEl);
            }
        });
        debugLog("Timeline - IntersectionObserver setup.");
    }

    function timeline_scrollToMessage(index, smooth = true) {
        const $dotsUl = $(`#${TIMELINE_HTML_ID} .cgpt-dots`);
        const elementsFound = timeline_findChatElements();
        if (!elementsFound && timeline_messages.length === 0) { timeline_renderDots(); return; }
        if (index >= 0 && index < timeline_messages.length) {
            const messageEl = timeline_messages[index].element;
            if (messageEl && messageEl.length && messageEl.get(0) && messageEl.get(0).isConnected) {
                const messageDomElement = messageEl.get(0);
                timeline_chatScrollContainerTop = timeline_chatScrollContainer.get(0).getBoundingClientRect().top;
                const messageRectTop = messageDomElement.getBoundingClientRect().top;
                const offsetRelativeToContainerViewport = messageRectTop - timeline_chatScrollContainerTop;
                const targetScrollTop = timeline_chatScrollContainer.scrollTop() + offsetRelativeToContainerViewport;
                timeline_currentMessageIndex = index;
                if ($dotsUl.length) $dotsUl.children('li').removeClass('active').eq(timeline_currentMessageIndex).addClass('active');

                const scrollContainerElement = timeline_chatScrollContainer.get(0);
                if ('scrollTo' in scrollContainerElement && typeof scrollContainerElement.scrollTo === 'function') {
                    scrollContainerElement.scrollTo({ top: targetScrollTop, behavior: smooth ? 'smooth' : 'auto' });
                } else { // Fallback for older browsers or if native scrollTo isn't available
                    timeline_chatScrollContainer.stop().animate({ scrollTop: targetScrollTop }, smooth ? 300 : 0);
                }
                debugLog(`Timeline - Scrolled to message index: ${index}`);
                // IntersectionObserver should handle the active state after scroll, but a nudge can be good
                requestAnimationFrame(() => timeline_updateTimelineState(false));
            } else {
                debugWarn(`Timeline - Message element at index ${index} not found/connected.`);
                timeline_renderDots();
            }
        } else { debugWarn(`Timeline - Invalid index ${index} for scrollToMessage.`); }
    }

    function timeline_setupDOMObserver() {
        if (timeline_domObserver) timeline_domObserver.disconnect();
        const observerTargetNode = document.getElementById('thread') || document.body;
        debugLog(`Timeline - DOMObserver target: ${observerTargetNode.id || observerTargetNode.tagName}`);
        if (!observerTargetNode) { debugError("Timeline - Could not find target for DOMObserver."); return; }

        timeline_domObserver = new MutationObserver(debounce((mutationsList) => {
            if (!currentSettings.enableTimelineSidebar || !pageVisible) return;
            let refreshNeeded = false;
            for (const mutation of mutationsList) {
                if (timeline_chatScrollContainer && timeline_chatScrollContainer.length && timeline_chatScrollContainer.get(0).contains(mutation.target)) {
                    refreshNeeded = true; break;
                }
                if ($(mutation.target).closest('#thread').length > 0 || Array.from(mutation.addedNodes).some(node => $(node).closest('#thread').length > 0 || (node.id === 'thread'))) {
                     refreshNeeded = true; break;
                }
                 if (!timeline_chatScrollContainer || !timeline_chatScrollContainer.length) {
                     if (mutation.type === 'childList' && (mutation.addedNodes.length || mutation.removedNodes.length)) {
                         refreshNeeded = true; break;
                     }
                 }
            }

            if (refreshNeeded) {
                debugLog("Timeline DOMObserver: Detected relevant DOM change.");
                const messagesHaveChangedStructurally = timeline_findChatElements();
                if (messagesHaveChangedStructurally) {
                    debugLog("Timeline DOMObserver: Message structure changed. Re-rendering dots.");
                    timeline_currentMessageIndex = -1;
                    timeline_renderDots();
                } else if (timeline_messages.length > 0 && !$(`#${TIMELINE_HTML_ID} .cgpt-dots li.active`).length) {
                    debugLog("Timeline DOMObserver: No active dot, attempting update.");
                    timeline_updateTimelineState(false);
                } else if (timeline_messages.length === 0 && $(`#${TIMELINE_HTML_ID} .cgpt-dots li`).length > 0) {
                    debugLog("Timeline DOMObserver: Messages cleared, re-rendering to remove dots.");
                    timeline_renderDots();
                }
                // Self-disconnect if no messages are left to observe
                if (timeline_messages.length === 0 && timeline_domObserver){
                    debugLog("Timeline DOMObserver: No messages, disconnecting DOM observer.");
                    timeline_domObserver.disconnect();
                }
            }
        }, 500));
        if (pageVisible) timeline_domObserver.observe(observerTargetNode, { childList: true, subtree: true });
        debugLog("Timeline - DOMObserver attached (if page visible).");
    }

    function timeline_setupResizeObserver() {
        if (timeline_mainElementResizeObserver) timeline_mainElementResizeObserver.disconnect();
        const mainEl = $('main').get(0);
        if (!mainEl) {
            $(window).off('resize.cgpttimeline').on('resize.cgpttimeline', debounce(timeline_updateTimelinePositionAndVisibility, 200));
            debugWarn("Timeline - 'main' not found for ResizeObserver, fallback to window resize.");
            return;
        }
        timeline_mainElementResizeObserver = new ResizeObserver(debounce(timeline_updateTimelinePositionAndVisibility, 200));
        timeline_mainElementResizeObserver.observe(mainEl);
        debugLog("Timeline - ResizeObserver attached to 'main'.");
    }

    function timeline_cleanup() {
        debugLog('Timeline - Cleaning up...');
        $(`#${TIMELINE_HTML_ID}`).remove();
        $(`#${TIMELINE_CSS_ID}`).remove();
        if (timeline_domObserver) { timeline_domObserver.disconnect(); timeline_domObserver = null; }
        if (timeline_mainElementResizeObserver) { timeline_mainElementResizeObserver.disconnect(); timeline_mainElementResizeObserver = null; }
        if (timeline_intersectionObserver) { timeline_intersectionObserver.disconnect(); timeline_intersectionObserver = null; }
        $(window).off('resize.cgpttimeline');
        timeline_messages = [];
        timeline_currentMessageIndex = -1;
        timeline_initialized = false;
        debugLog('Timeline - Cleanup complete.');
    }

    function initializeActualTimelineLogic() {
        if (!pageVisible || !currentSettings.enableTimelineSidebar) {
            debugLog('Timeline - Actual initialization skipped (page not visible or feature disabled).');
            return;
        }
        debugLog('Timeline - Attempting actual initialization...');
        if (!document.getElementById(TIMELINE_HTML_ID)) $('body').append(timelineNavigatorHtml);
        timeline_injectCSS_local(timelineCSS, TIMELINE_CSS_ID);
        const $navigatorRootTimeline = $(`#${TIMELINE_HTML_ID}`);
        if ($navigatorRootTimeline.length) {
            $navigatorRootTimeline.off('click.cgptTimelineDots').on('click.cgptTimelineDots', '.cgpt-dots li', function(e){
                e.stopPropagation();
                const idx = parseInt($(this).attr('data-idx'));
                if (!isNaN(idx)) {
                    debugLog(`Timeline - Dot clicked, index: ${idx}`);
                    timeline_scrollToMessage(idx, true);
                }
            });
            debugLog('Timeline - Click listener for dots attached.');
        } else { debugError('Timeline - Could not find navigator root for dot click listener.'); }

        if (timeline_findChatElements() || timeline_messages.length === 0) {
            timeline_renderDots();
        }
        timeline_setupDOMObserver();
        timeline_setupResizeObserver();
        timeline_initialized = true;
        debugLog("Timeline - Initialized successfully.");
        timeline_updateTimelinePositionAndVisibility();
    }

    function initializeTimelineFeatureWrapper() {
        if (currentSettings.enableTimelineSidebar) {
            if (!timeline_initialized) {
                debugLog('Timeline - Feature enabled. Starting initialization...');
                if ('requestIdleCallback' in window){
                    requestIdleCallback(initializeActualTimelineLogic, { timeout: 4000 });
                } else {
                    setTimeout(initializeActualTimelineLogic, 3500); // Fallback
                }
            } else {
                 debugLog('Timeline - Feature enabled, already initialized. Ensuring setup.');
                 timeline_injectCSS_local(timelineCSS, TIMELINE_CSS_ID);
                 timeline_updateTimelinePositionAndVisibility();
                 if (pageVisible) { // Only setup observers if page is visible
                    if (!timeline_domObserver || (timeline_domObserver && !timeline_domObserver.takeRecords().length)) timeline_setupDOMObserver(); // Re-setup if needed
                    if (!timeline_mainElementResizeObserver) timeline_setupResizeObserver(); // Should be fine
                    if (!timeline_intersectionObserver && timeline_messages.length > 0) timeline_setupIntersectionObserver();
                 }
            }
        } else {
            debugLog('Timeline - Feature disabled. Cleaning up...');
            timeline_cleanup();
        }
    }
    // --- END: Timeline Sidebar Feature ---

    // --- START: Settings Dialog ---
    function openSettingsDialog() {
        const DIALOG_ID = 'chatgpt-userscript-settings-dialog';
        let dialog = document.getElementById(DIALOG_ID);
        if (dialog) { dialog.style.display = 'block'; }
        else {
            dialog = document.createElement('div');
            dialog.id = DIALOG_ID;
            dialog.style.cssText = ` /* ... (dialog CSS same as before) ... */
                position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
                background-color: white; border: 1px solid #ccc; padding: 25px; z-index: 2147483647;
                box-shadow: 0 4px 15px rgba(0,0,0,0.2); border-radius: 8px; direction: rtl; text-align: right;
                width: 450px; font-family: sans-serif; max-height: 80vh; overflow-y: auto; `;
            dialog.innerHTML = ` <!-- ... (dialog HTML same as before) ... -->
                <h3 style="margin-top:0; margin-bottom:20px; border-bottom: 1px solid #eee; padding-bottom:10px; font-size: 1.2em;">הגדרות כלי עזר וסרגל צד</h3>
                <div style="margin-bottom: 12px;"><input type="checkbox" id="setting-enable-styling" style="margin-left: 8px; vertical-align: middle;"><label for="setting-enable-styling" style="vertical-align: middle; cursor:pointer;">הפעל עיצוב בועות ו-RTL</label></div>
                <div style="margin-bottom: 12px;"><input type="checkbox" id="setting-enable-copy-button" style="margin-left: 8px; vertical-align: middle;"><label for="setting-enable-copy-button" style="vertical-align: middle; cursor:pointer;">הפעל כפתור "העתק שיחה"</label></div>
                <div style="margin-bottom: 12px;"><input type="checkbox" id="setting-enable-hide-plans" style="margin-left: 8px; vertical-align: middle;"><label for="setting-enable-hide-plans" style="vertical-align: middle; cursor:pointer;">הסתר את כפתור "הצג תוכניות"</label></div>
                <div style="margin-bottom: 20px;"><input type="checkbox" id="setting-enable-timeline-sidebar" style="margin-left: 8px; vertical-align: middle;"><label for="setting-enable-timeline-sidebar" style="vertical-align: middle; cursor:pointer;">הפעל סרגל צד לניווט (Timeline)</label></div>
                <div style="text-align:left;"><button id="settings-save-button" style="background-color: #10a37f; color: white; border: none; padding: 10px 18px; border-radius: 5px; cursor: pointer; margin-left: 10px; font-size: 0.95em;">שמור וסגור</button><button id="settings-cancel-button" style="background-color: #aaa; color: white; border: none; padding: 10px 18px; border-radius: 5px; cursor: pointer; font-size: 0.95em;">ביטול</button></div>
                <p style="font-size:0.85em; color:#555; margin-top:20px; margin-bottom:0;">שינויים יחולו במלואם לאחר רענון הדף או מיידית במידת האפשר.</p> `;
            document.body.appendChild(dialog);
            document.getElementById('settings-save-button').addEventListener('click', () => {
                currentSettings.enableStyling = document.getElementById('setting-enable-styling').checked;
                currentSettings.enableCopyButton = document.getElementById('setting-enable-copy-button').checked;
                currentSettings.enableHidePlansButton = document.getElementById('setting-enable-hide-plans').checked;
                currentSettings.enableTimelineSidebar = document.getElementById('setting-enable-timeline-sidebar').checked;
                GM_setValue(SETTINGS_KEYS.enableStyling, currentSettings.enableStyling);
                GM_setValue(SETTINGS_KEYS.enableCopyButton, currentSettings.enableCopyButton);
                GM_setValue(SETTINGS_KEYS.enableHidePlansButton, currentSettings.enableHidePlansButton);
                GM_setValue(SETTINGS_KEYS.enableTimelineSidebar, currentSettings.enableTimelineSidebar);
                dialog.style.display = 'none';
                alert('ההגדרות נשמרו. חלק מהשינויים עשויים לדרוש רענון דף.');
                applyStylesOnLoad();
                initializeCopyButtonFeature();
                initializeHidePlansFeature();
                initializeTimelineFeatureWrapper();
                debugLog("Settings saved and features re-initialized.");
            });
            document.getElementById('settings-cancel-button').addEventListener('click', () => { dialog.style.display = 'none'; });
        }
        document.getElementById('setting-enable-styling').checked = currentSettings.enableStyling;
        document.getElementById('setting-enable-copy-button').checked = currentSettings.enableCopyButton;
        document.getElementById('setting-enable-hide-plans').checked = currentSettings.enableHidePlansButton;
        document.getElementById('setting-enable-timeline-sidebar').checked = currentSettings.enableTimelineSidebar;
    }
    // --- END: Settings Dialog ---

    // --- START: Main Initialization ---
    function main() {
        loadSettings();
        applyStylesOnLoad();
        initializeCopyButtonFeature();
        initializeHidePlansFeature();
        initializeTimelineFeatureWrapper();
        GM_registerMenuCommand('הגדרות כלי עזר וסרגל צד', openSettingsDialog);

        // Visibility handler to pause/resume observers
        document.addEventListener('visibilitychange', ()=>{
            const oldPageVisible = pageVisible;
            pageVisible = !document.hidden;
            debugLog(`Page visibility changed to: ${pageVisible}`);

            if (pageVisible && !oldPageVisible) { // Page became visible
                // Re-initialize or re-activate features that depend on visibility
                if (currentSettings.enableCopyButton) {
                    if(window.__cgptCopyBtnBodyObserver && !copyButtonObserver && document.querySelector(ACTIONS_CONTAINER_SELECTOR)) {
                        try { window.__cgptCopyBtnBodyObserver.observe(document.body, { childList: true, subtree: true }); } catch(e) { /* already observing */ }
                    }
                    if(!copyButtonObserver && document.querySelector(ACTIONS_CONTAINER_SELECTOR)) attemptToSetupCopyButtonObserver();
                }
                if (currentSettings.enableHidePlansButton && hidePlansObserver) {
                     try { hidePlansObserver.observe(document.body, { childList: true, subtree: true }); } catch(e) { /* already observing */ }
                }
                if (currentSettings.enableTimelineSidebar) {
                    timeline_setupIntersectionObserver(); // Will re-observe if needed
                    if (timeline_domObserver && (!timeline_domObserver.takeRecords || timeline_domObserver.takeRecords().length === 0)) { // Ensure it's not already observing
                         const observerTargetNode = document.getElementById('thread') || document.body;
                         try { timeline_domObserver.observe(observerTargetNode, { childList: true, subtree: true }); } catch(e) { /* already observing or error */ }
                         debugLog("Timeline DOMObserver re-activated on visibility.")
                    } else if (!timeline_domObserver && timeline_initialized) { // If observer was nulled but timeline is init
                        timeline_setupDOMObserver(); // Recreate and observe
                    }
                    timeline_updateTimelinePositionAndVisibility(); // Refresh position
                }
            } else if (!pageVisible && oldPageVisible) { // Page became hidden
                if (copyButtonObserver) copyButtonObserver.disconnect();
                // window.__cgptCopyBtnBodyObserver can remain, it's lightweight
                if (hidePlansObserver) hidePlansObserver.disconnect();
                if (timeline_intersectionObserver) timeline_intersectionObserver.disconnect();
                if (timeline_domObserver) timeline_domObserver.disconnect();
                debugLog("Observers paused due to page hidden.");
            }
        });
        debugLog('CombinedScript & Timeline Script v3.1.3 - Fully initialized.');
    }

    if (typeof $ === 'undefined') {
        debugError("jQuery (slim) not loaded! Script cannot run.");
        if (typeof GM_notification === 'function') GM_notification({ title: 'שגיאת טעינה', text: 'jQuery לא נטען, התוסף לא יפעל.', silent: false, timeout: 10000 });
        return;
    }
    $(document).ready(function() {
         setTimeout(main, 750);
    });

})();