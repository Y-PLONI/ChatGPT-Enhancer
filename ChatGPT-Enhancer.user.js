// ==UserScript==
// @name         כלי עזר משולבים וסרגל צד ל-ChatGPT (עם הגדרות v3.1.9 - תיקוני טבלאות ורשימות)
// @namespace    http://tampermonkey.net/
// @version      3.1.10
// @description  משלב עיצוב בועות, RTL, העתקה, הסתרת "תוכניות", וסרגל צד Timeline דינמי מרובה עמודות, עם התאמה אישית, אופטימיזציות, ותמיכה במצב כהה. תיקונים לטבלאות ורשימות.
// @author       Y-PLONI (שינויים על ידי עוזר AI)
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
// @require      https://code.jquery.com/jquery-3.7.1.min.js
// @updateURL    https://raw.githubusercontent.com/Y-PLONI/SCRIPT1/main/ChatGPT-Enhancer.meta.js
// @downloadURL  https://raw.githubusercontent.com/Y-PLONI/SCRIPT1/main/ChatGPT-Enhancer.user.js
// ==/UserScript==

(function() {
    'use strict';

    const DEBUG = false;
    const debugLog = DEBUG ? (...args) => console.log('[CGPT Script]', ...args) : () => {};
    const debugWarn = DEBUG ? (...args) => console.warn('[CGPT Script]', ...args) : () => {};
    const debugError = DEBUG ? (...args) => console.error('[CGPT Script]', ...args) : () => {};

    debugLog('ChatGPT Combined Utilities & Timeline Script v3.1.9 - Started');

    // --- START: Settings and General Utilities ---
    const SETTINGS_KEYS = {
        enableStyling: 'chatgpt_utils_enableStyling_v2',
        enableCopyButton: 'chatgpt_utils_enableCopyButton_v2',
        enableHidePlansButton: 'chatgpt_utils_enableHidePlansButton_v1',
        enableTimelineSidebar: 'chatgpt_utils_enableTimelineSidebar_v1'
    };
    let currentSettings = {};
    let pageVisible = !document.hidden;

    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => { clearTimeout(timeout); func(...args); };
            clearTimeout(timeout); timeout = setTimeout(later, wait);
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

    const userMessageContainerSelector = 'div[data-message-author-role="user"][data-message-id]';
    const userMessageBubbleSelector = 'div[data-message-author-role="user"] div[class*="rounded-3xl"]';
    const userTextContentSelector = 'div[data-message-author-role="user"] .whitespace-pre-wrap';
    const userMessageFlexContainerSelector = 'div[data-message-author-role="user"].text-message';
    const aiMessageContainerSelector = 'div[data-message-author-role="assistant"][data-message-id]';
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

    function isDarkModeActive() {
        return document.documentElement.classList.contains('dark');
    }

    function applyStylesOnLoad() {
        const STYLE_ID_STYLING = STYLE_ID_BASE + 'styling';
        const STYLE_ID_COPY    = STYLE_ID_BASE + 'copy';
        const STYLE_ID_SETTINGS_DARK_MODE = STYLE_ID_BASE + 'settings-dark';

        let cssStyling = "", cssCopy = "", cssSettingsDark = "";
        const isDarkMode = isDarkModeActive();
        debugLog('Applying styles. Dark mode active:', isDarkMode);

        if (currentSettings.enableStyling) {
            cssStyling += `
                :root{
                    --cgpt-user-bubble-bg: ${isDarkMode ? '#3A3F47' : '#F4FFF7'};
                    --cgpt-user-bubble-text: ${isDarkMode ? '#E0E0E0' : 'inherit'};
                    --cgpt-user-stripe: ${isDarkMode ? '#508D50' : '#A5D6A7'};
                    --cgpt-ai-bubble-bg: ${isDarkMode ? '#2C3035' : '#E3F2FD'};
                    --cgpt-ai-bubble-text: ${isDarkMode ? '#E0E0E0' : 'inherit'};
                    --cgpt-ai-border: ${isDarkMode ? '#454A50' : '#BBDEFB'};
                    --cgpt-ai-stripe: ${isDarkMode ? '#4A7ABE' : '#64B5F6'};
                }
                ${userMessageContainerSelector} { direction: rtl !important; }
                ${userMessageFlexContainerSelector} { align-items: flex-start !important; }
                ${userTextContentSelector} { text-align: right !important; }
                ${userMessageBubbleSelector} {
                    background-color: var(--cgpt-user-bubble-bg) !important;
                    color: var(--cgpt-user-bubble-text) !important;
                    padding: 10px 15px !important;
                    border-right: 4px solid var(--cgpt-user-stripe) !important;
                }
                ${aiMessageContainerSelector} {
                    background-color: var(--cgpt-ai-bubble-bg) !important;
                    color: var(--cgpt-ai-bubble-text) !important;
                    padding: ${aiPadding} !important;
                    border-radius: ${aiBorderRadius} !important;
                    margin-bottom: ${aiMarginBottom} !important;
                    margin-top: ${aiMarginTop} !important;
                    border: 1px solid var(--cgpt-ai-border) !important;
                    border-left: 4px solid var(--cgpt-ai-stripe) !important;
                    overflow: hidden !important;
                    overflow-x: auto !important;
                }
                ${aiMessageContainerSelector} .markdown.prose, ${aiMessageContainerSelector} .text-token-text-primary {
                     color: var(--cgpt-ai-bubble-text) !important;
                }
                /* NEW/MODIFIED: Styles for tables and lists inside AI messages */
                ${aiMessageContainerSelector} .markdown.prose table {
                    display: block !important;
                    width: 100% !important;
                    max-width: 100% !important;
                    overflow-x: auto !important;
                    margin-top: 0.5em !important;
                    margin-bottom: 0.5em !important;
                    border-collapse: collapse !important; /* Ensures borders are clean */
                }
                ${aiMessageContainerSelector} .markdown.prose table th,
                ${aiMessageContainerSelector} .markdown.prose table td {
                    padding: 6px 10px !important;
                    border: 1px solid ${isDarkMode ? '#5A6067' : '#A1C4E5'} !important;
                    text-align: right !important; /* Ensure table cell content is also RTL */
                    color: var(--cgpt-ai-bubble-text) !important; /* Ensure text color consistency */
                }
                 ${aiMessageContainerSelector} .markdown.prose table th { /* Header specific styling */
                    background-color: ${isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)'} !important;
                }
                ${aiMessageContainerSelector} .markdown.prose ul,
                ${aiMessageContainerSelector} .markdown.prose ol {
                    padding-right: 25px !important; /* Increased padding for better spacing from edge */
                    padding-left: 5px !important;    /* Minimal left padding */
                    margin-right: 0px !important;  /* Remove default browser margin if any */
                }
                ${aiMessageContainerSelector} .markdown.prose li {
                    text-align: right !important;
                    margin-bottom: 0.25em !important; /* Spacing between list items */
                }
                /* END NEW/MODIFIED */
                ${aiMessageContainerSelector} > div:first-child { padding-top: 0 !important; }
            `;
        }

        if (currentSettings.enableCopyButton) {
            cssCopy += `
                #copy-chatgpt-conversation {
                    display: flex; align-items: center; justify-content: center; height: 36px; min-width: 36px;
                    padding: 0 8px; margin-inline-end: 8px;
                    background-color: ${isDarkMode ? '#4A4D4F' : '#FFFFFF'} !important;
                    color: ${isDarkMode ? '#E0E0E0' : '#343A40'} !important;
                    font-size: 18px; line-height: 1;
                    border: 1px solid ${isDarkMode ? '#6A6D6F' : '#DEE2E6'} !important;
                    border-radius: 6px; cursor: pointer;
                    user-select: none; order: -1;
                    font-family: inherit;
                }
                #copy-chatgpt-conversation:hover {
                    background-color: ${isDarkMode ? '#5A5D5F' : '#F8F9FA'} !important;
                    border-color: ${isDarkMode ? '#7A7D7F' : '#CED4DA'} !important;
                }
            `;
        }

        cssSettingsDark = `
            #chatgpt-userscript-settings-dialog.cgpt-settings-dark {
                background-color: #282A2E !important; color: #EAEAEA !important; border-color: #404246 !important;
            }
            #chatgpt-userscript-settings-dialog.cgpt-settings-dark h3 { color: #F0F0F0 !important; border-bottom-color: #404246 !important; }
            #chatgpt-userscript-settings-dialog.cgpt-settings-dark label { color: #D8D8D8 !important; }
            #chatgpt-userscript-settings-dialog.cgpt-settings-dark p { color: #B0B0B0 !important; }
            #chatgpt-userscript-settings-dialog.cgpt-settings-dark button#settings-save-button { background-color: #1E8E3E !important; color: #FFFFFF !important; border: 1px solid #1A7D36 !important; }
            #chatgpt-userscript-settings-dialog.cgpt-settings-dark button#settings-cancel-button { background-color: #4A4D4F !important; color: #E0E0E0 !important; border: 1px solid #3A3D3F !important; }
            #chatgpt-userscript-settings-dialog.cgpt-settings-dark input[type="checkbox"] { filter: invert(1) hue-rotate(180deg) brightness(0.8) contrast(1.2); border: 1px solid #5A5D5F; }
        `;
        injectStyles(STYLE_ID_SETTINGS_DARK_MODE, cssSettingsDark);
        injectStyles(STYLE_ID_STYLING, cssStyling);
        injectStyles(STYLE_ID_COPY, cssCopy);
        debugLog('CombinedScript Styles - Applied/updated via injectStyles with dark mode considerations.');
    }

    function initializeCopyButtonFeature() {
        if (copyButtonObserver) copyButtonObserver.disconnect(); copyButtonObserver = null;
        const existingButton = document.getElementById('copy-chatgpt-conversation');
        if (existingButton) existingButton.remove();

        if (currentSettings.enableCopyButton) {
            debugLog('CopyButton - Initializing.');
            applyStylesOnLoad();
            findActionsContainerRetries = 0;
            attemptToSetupCopyButtonObserver();
            if (!window.__cgptCopyBtnBodyObserver) {
                window.__cgptCopyBtnBodyObserver = new MutationObserver(() => {
                    if (!currentSettings.enableCopyButton || !pageVisible) return;
                    if (!document.getElementById('copy-chatgpt-conversation') &&
                        document.querySelector(ACTIONS_CONTAINER_SELECTOR)) {
                        debugLog('CopyButton - Body observer detected missing button. Re-initializing.');
                        attemptToSetupCopyButtonObserver();
                    }
                });
                if (pageVisible) {
                     try { window.__cgptCopyBtnBodyObserver.observe(document.body, { childList: true, subtree: true }); } catch(e) { debugWarn("CopyButton: BodyObserver already observing or error.", e); }
                }
            }
        } else {
            if (window.__cgptCopyBtnBodyObserver) {
                window.__cgptCopyBtnBodyObserver.disconnect();
                window.__cgptCopyBtnBodyObserver = null;
            }
            injectStyles(STYLE_ID_BASE + 'copy', "");
            debugLog('CopyButton - Disabled by settings.');
        }
    }
    function attemptToSetupCopyButtonObserver() {
        if (!currentSettings.enableCopyButton) return;
        const actionsContainer = document.querySelector(ACTIONS_CONTAINER_SELECTOR);
        if (actionsContainer) {
            debugLog('CopyButton - Actions container found. Setting up MutationObserver.');
            if (copyButtonObserver) copyButtonObserver.disconnect();
            copyButtonObserver = new MutationObserver((mutationsList, observer) => {
                if(!pageVisible || !currentSettings.enableCopyButton) return;
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
                return;
            }
            const wrapperProcessedAndHidden = document.querySelector(`[${PLANS_BUTTON_WRAPPER_ATTR}="true"]`);
            if (wrapperProcessedAndHidden && wrapperProcessedAndHidden.style.display === 'none') return;
            const itemProcessedAndHidden = document.querySelector(`[${PLANS_BUTTON_ITEM_ATTR}="true"]`);
             if (itemProcessedAndHidden && itemProcessedAndHidden.style.display === 'none' && !wrapperProcessedAndHidden) {
                 debugLog("HidePlans - Item hidden but wrapper not, re-evaluating.");
             }
            findAndHidePlansButton();
        }, 300));
        if (pageVisible) {
             try { hidePlansObserver.observe(document.body, { childList: true, subtree: true }); } catch(e) { debugWarn("HidePlans: Observer already observing or error.", e); }
        }
        debugLog('HidePlans - MutationObserver monitoring (if page visible).');
    }

    // --- START: Timeline Sidebar Feature ---
    const TIMELINE_CSS_ID = "cgpt-timeline-styles";
    const TIMELINE_HTML_ID_PREFIX = "cgpt-timeline-root-";
    let timeline_messages = [];
    let timeline_currentMessageIndex = -1;
    let timeline_chatScrollContainer;
    let timeline_chatScrollContainerTop = 0;
    let timeline_mainElementResizeObserver = null;
    let timeline_domObserver = null;
    let timeline_intersectionObserver = null;
    let timeline_initialized = false;

    const TIMELINE_MESSAGE_THRESHOLD_FOR_EXPANSION = 30;
    const TIMELINE_MAX_MESSAGES_PER_SIDEBAR = 60;
    const TIMELINE_SIDEBAR_SPACING_PX = 12;
    const TIMELINE_SIDEBAR_VISUAL_WIDTH_PX = 30;

    const TIMELINE_DEFAULT_TOP_VH = 15;
    const TIMELINE_DEFAULT_HEIGHT_VH = 60;
    const TIMELINE_EXPANDED_TOP_OFFSET_PX = 60;
    const TIMELINE_EXPANDED_BOTTOM_OFFSET_PX = 90;


    function _getTimelineLayoutConfig() {
        let numSidebars = 0;
        if (timeline_messages.length > 0) {
            numSidebars = Math.ceil(timeline_messages.length / TIMELINE_MAX_MESSAGES_PER_SIDEBAR);
        }
        const messagesPerEffectiveSidebar = (numSidebars > 0) ? Math.ceil(timeline_messages.length / numSidebars) : 0;
        return { numSidebars, messagesPerEffectiveSidebar };
    }


    const getTimelineSidebarHtml = (index) => `<div id="${TIMELINE_HTML_ID_PREFIX}${index}" class="cgpt-timeline-sidebar-instance hidden"><ul class="cgpt-dots"></ul></div>`;


    function timeline_ensureSidebarDivs(targetCount) {
        const $existingSidebars = $('div[id^="' + TIMELINE_HTML_ID_PREFIX + '"]');

        for (let i = $existingSidebars.length - 1; i >= targetCount; i--) {
            $($existingSidebars[i]).remove();
            debugLog(`Timeline - Removed sidebar DIV: ${TIMELINE_HTML_ID_PREFIX}${i}`);
        }

        for (let i = $existingSidebars.length; i < targetCount; i++) {
            $('body').append(getTimelineSidebarHtml(i));
            debugLog(`Timeline - Added sidebar DIV: ${TIMELINE_HTML_ID_PREFIX}${i}`);
        }
    }


    function getTimelineCSS() {
        const isDark = isDarkModeActive();

        return `
            div[id^="${TIMELINE_HTML_ID_PREFIX}"] {
                position: fixed !important;
                width: 4px !important;
                background-color: ${isDark ? '#555' : '#B0B0B0'} !important;
                z-index: 2147483640 !important;
                border-radius: 2px !important;
                transition: opacity 0.3s, left 0.3s ease-out, top 0.3s ease-out, height 0.3s ease-out;
            }
            div[id^="${TIMELINE_HTML_ID_PREFIX}"].hidden { opacity: 0 !important; pointer-events: none !important; }
            div[id^="${TIMELINE_HTML_ID_PREFIX}"] .cgpt-dots { margin: 0 !important; padding: 0 !important; list-style: none !important; position: relative !important; height: 100% !important; }
            div[id^="${TIMELINE_HTML_ID_PREFIX}"] .cgpt-dots li { position: absolute !important; left: 50% !important; transform: translateX(-50%) !important; width: 10px !important; height: 10px !important; padding: 4px !important; box-sizing: content-box !important; border-radius: 50% !important; cursor: pointer !important; transition: width 0.2s ease-in-out, height 0.2s ease-in-out, background-color 0.2s ease-in-out, transform 0.2s ease-in-out; }
            div[id^="${TIMELINE_HTML_ID_PREFIX}"] .cgpt-dots li::before { content: ''; position: absolute; top: 50%; left: 50%; width: 8px; height: 8px; background-color: ${isDark ? '#888' : 'grey'}; border-radius: 50%; transform: translate(-50%, -50%); transition: width 0.2s ease-in-out, height 0.2s ease-in-out, background-color 0.2s ease-in-out; }
            div[id^="${TIMELINE_HTML_ID_PREFIX}"] .cgpt-dots li.user::before { background-color: ${isDark ? '#67A36A' : '#4CAF50'} !important; }
            div[id^="${TIMELINE_HTML_ID_PREFIX}"] .cgpt-dots li.assistant::before { background-color: ${isDark ? '#3B82F6' : '#0d6efd'} !important; }
            div[id^="${TIMELINE_HTML_ID_PREFIX}"] .cgpt-dots li.active::before { width: 12px !important; height: 12px !important; }
            div[id^="${TIMELINE_HTML_ID_PREFIX}"] .cgpt-dots li span {
                position: absolute !important; white-space: nowrap !important; font-size: 11px !important;
                left: 16px !important;
                top: 50% !important; transform: translateY(-50%) !important;
                color: ${isDark ? '#D0D0D0' : 'grey'} !important;
                background-color: ${isDark ? 'rgba(40, 40, 40, 0.85)' : 'rgba(255, 255, 255, 0.75)'} !important;
                padding: 1px 3px !important; border-radius: 2px !important; pointer-events: none;
            }
            div[id^="${TIMELINE_HTML_ID_PREFIX}"] .cgpt-dots li.endpoint-number span { color: ${isDark ? '#F0F0F0' : 'black'} !important; font-weight: bold; }
            div[id^="${TIMELINE_HTML_ID_PREFIX}"] .cgpt-dots li:not(.endpoint-number) span { opacity: 0.75 !important; }
        `;
    }


    function timeline_injectCSS_local() {
        injectStyles(TIMELINE_CSS_ID, getTimelineCSS());
    }

    function timeline_updateTimelinePositionAndVisibility() {
        const $mainElement = $('main');
        if (!$mainElement.length) {
            $('div[id^="' + TIMELINE_HTML_ID_PREFIX + '"]').addClass('hidden');
            debugWarn('Timeline - Main element not found.'); return;
        }

        const mainRect = $mainElement.get(0).getBoundingClientRect();
        const baseLeftOffset = mainRect.left + 15;

        const { numSidebars, messagesPerEffectiveSidebar } = _getTimelineLayoutConfig();

        for (let s = 0; s < numSidebars; s++) {
            const $navigatorRoot = $(`#${TIMELINE_HTML_ID_PREFIX}${s}`);
            if (!$navigatorRoot.length) continue;


            const currentLeft = baseLeftOffset + s * (TIMELINE_SIDEBAR_VISUAL_WIDTH_PX + TIMELINE_SIDEBAR_SPACING_PX);
            $navigatorRoot.css('left', currentLeft + 'px');


            const startIndex = s * messagesPerEffectiveSidebar;
            const endIndex = Math.min(startIndex + messagesPerEffectiveSidebar, timeline_messages.length);
            const numMessagesInThisSidebar = endIndex - startIndex;

            if (numMessagesInThisSidebar > TIMELINE_MESSAGE_THRESHOLD_FOR_EXPANSION) {
                const newTop = TIMELINE_EXPANDED_TOP_OFFSET_PX;
                const newHeight = window.innerHeight - TIMELINE_EXPANDED_TOP_OFFSET_PX - TIMELINE_EXPANDED_BOTTOM_OFFSET_PX;
                $navigatorRoot.css({ 'top': newTop + 'px', 'height': newHeight + 'px' });
            } else {
                $navigatorRoot.css({ 'top': TIMELINE_DEFAULT_TOP_VH + 'vh', 'height': TIMELINE_DEFAULT_HEIGHT_VH + 'vh' });
            }

            if (timeline_messages.length > 0 && timeline_chatScrollContainer && timeline_chatScrollContainer.length && timeline_chatScrollContainer.get(0).isConnected) {
                $navigatorRoot.removeClass('hidden');
            } else {
                $navigatorRoot.addClass('hidden');
            }
        }

        $('div[id^="' + TIMELINE_HTML_ID_PREFIX + '"]').each(function(index) {
            if (index >= numSidebars) {
                $(this).addClass('hidden');
            }
        });
        if (numSidebars > 0) debugLog(`Timeline updated: ${numSidebars} sidebar(s) positioned.`);
    }


    function timeline_findChatElements() {
        timeline_chatScrollContainer = $('#thread div.flex.h-full.flex-col.overflow-y-auto[class*="scrollbar-gutter:stable_both-edges"]').first();
        if (!timeline_chatScrollContainer || !timeline_chatScrollContainer.length) {
             timeline_chatScrollContainer = $('div.flex.h-full.flex-col.overflow-y-auto').first();
        }
        if (!timeline_chatScrollContainer || !timeline_chatScrollContainer.length || !timeline_chatScrollContainer.get(0).isConnected) {
            debugLog('Timeline - Chat scroll container not found/connected.');
            if (timeline_messages.length > 0) { timeline_messages = []; return true; }
            timeline_messages = []; return false;
        }
        timeline_chatScrollContainerTop = timeline_chatScrollContainer.get(0).getBoundingClientRect().top;
        const messageArticles = timeline_chatScrollContainer.find('article[data-testid^="conversation-turn-"]');
        const newMessages = messageArticles.toArray().map(articleEl => {
            const $article = $(articleEl);
            const $messageDiv = $article.find('div[data-message-id]').first();
            let role = 'user';
            if ($article.find('div[data-message-author-role="assistant"]').length > 0) role = 'assistant';
            else if ($article.find('div[data-message-author-role="user"]').length > 0) role = 'user';
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
        if (timeline_intersectionObserver) { timeline_intersectionObserver.disconnect(); }

        const { numSidebars, messagesPerEffectiveSidebar } = _getTimelineLayoutConfig();
        timeline_ensureSidebarDivs(numSidebars);

        if (numSidebars === 0) {
            $('div[id^="' + TIMELINE_HTML_ID_PREFIX + '"] .cgpt-dots').empty();
            timeline_updateTimelinePositionAndVisibility();
            return;
        }

        debugLog(`Timeline - Rendering dots for ${numSidebars} sidebar(s), ~${messagesPerEffectiveSidebar} messages/sidebar.`);

        for (let s = 0; s < numSidebars; s++) {
            const $dotsUl = $(`#${TIMELINE_HTML_ID_PREFIX}${s} .cgpt-dots`);
            if (!$dotsUl.length) {
                debugWarn(`Timeline - Dots UL not found for sidebar ${s}`);
                continue;
            }
            $dotsUl.empty();

            const startIndex = s * messagesPerEffectiveSidebar;
            const endIndex = Math.min(startIndex + messagesPerEffectiveSidebar, timeline_messages.length);
            const numMessagesInThisSidebar = endIndex - startIndex;

            for (let i = startIndex; i < endIndex; i++) {
                const msgData = timeline_messages[i];
                const localIndex = i - startIndex;

                const li = $('<li/>').addClass(msgData.role === 'assistant' ? 'assistant' : 'user')
                                   .attr('data-idx', i)
                                   .attr('title', `הודעה ${i+1} (${msgData.role})`);


                if (i === 0 || i === timeline_messages.length - 1) {
                    li.addClass('endpoint-number');
                }

                let topPercentage = 0;
                if (numMessagesInThisSidebar === 1) {
                    topPercentage = 50;
                } else if (numMessagesInThisSidebar > 1) {
                    topPercentage = (localIndex / (numMessagesInThisSidebar - 1)) * 100;
                }
                li.css('top', topPercentage + '%').append($(`<span>${i+1}</span>`));
                $dotsUl.append(li);
            }
        }
        timeline_updateTimelinePositionAndVisibility();
        timeline_updateTimelineState(false);
        if (pageVisible && currentSettings.enableTimelineSidebar) { timeline_setupIntersectionObserver(); }
    }


    function timeline_updateTimelineState(isScrollingEvent = true) {
        const { numSidebars, messagesPerEffectiveSidebar } = _getTimelineLayoutConfig();
        const $allDotsLi = $(`div[id^="${TIMELINE_HTML_ID_PREFIX}"] .cgpt-dots li`);

        if (timeline_messages.length === 0 || !timeline_chatScrollContainer || !timeline_chatScrollContainer.length || !timeline_chatScrollContainer.get(0).isConnected || numSidebars === 0) {
            $allDotsLi.removeClass('active');
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
                } else if (bestMatchIndex === -1) { bestMatchIndex = i; }
            }
        }
        if (bestMatchIndex === -1 && timeline_messages.length > 0) {
            if (timeline_currentMessageIndex !== -1 && timeline_currentMessageIndex < timeline_messages.length) {
                 const prevMsgEl = timeline_messages[timeline_currentMessageIndex].element.get(0);
                 if (prevMsgEl && prevMsgEl.isConnected) {
                    const prevRect = prevMsgEl.getBoundingClientRect();
                    if ((prevRect.top - timeline_chatScrollContainerTop + prevRect.height) > 0 && (prevRect.top - timeline_chatScrollContainerTop) < containerVisibleHeight) {
                        bestMatchIndex = timeline_currentMessageIndex;
                    }
                 }
            }
            if (bestMatchIndex === -1) {
                if (containerScrollTop <= 10) bestMatchIndex = 0;
                else if (containerScrollTop + containerVisibleHeight >= timeline_chatScrollContainer.get(0).scrollHeight - 20) bestMatchIndex = timeline_messages.length - 1;
                else bestMatchIndex = (timeline_currentMessageIndex >= 0 && timeline_currentMessageIndex < timeline_messages.length) ? timeline_currentMessageIndex : 0;
            }
        }
        bestMatchIndex = timeline_messages.length > 0 ? Math.max(0, Math.min(bestMatchIndex, timeline_messages.length - 1)) : -1;

        if (bestMatchIndex !== -1 && (timeline_currentMessageIndex !== bestMatchIndex || $allDotsLi.filter('.active').length === 0) ) {
            timeline_currentMessageIndex = bestMatchIndex;
            $allDotsLi.removeClass('active');

            if (messagesPerEffectiveSidebar > 0) {
                const targetSidebarIndex = Math.floor(timeline_currentMessageIndex / messagesPerEffectiveSidebar);
                const localIndexInSidebar = timeline_currentMessageIndex % messagesPerEffectiveSidebar;
                 if(targetSidebarIndex < numSidebars){
                    $(`#${TIMELINE_HTML_ID_PREFIX}${targetSidebarIndex} .cgpt-dots li`).eq(localIndexInSidebar).addClass('active');
                } else {
                    debugWarn(`Timeline - Calculated targetSidebarIndex ${targetSidebarIndex} is out of bounds for ${numSidebars} sidebars.`);
                }
            }
        } else if (bestMatchIndex === -1 && timeline_currentMessageIndex !== -1) {

            $allDotsLi.removeClass('active');
            timeline_currentMessageIndex = -1;
        }
    }


    function timeline_setupIntersectionObserver(){
        if (!pageVisible || !currentSettings.enableTimelineSidebar) {
            if (timeline_intersectionObserver) timeline_intersectionObserver.disconnect();
            return;
        }
        if (!('IntersectionObserver' in window)) { debugWarn("Timeline - IntersectionObserver not supported."); return; }
        if (timeline_intersectionObserver) timeline_intersectionObserver.disconnect();
        const rootEl = timeline_chatScrollContainer && timeline_chatScrollContainer.length ? timeline_chatScrollContainer.get(0) : null;
        if (!rootEl || timeline_messages.length === 0) {
            debugLog("Timeline - IO not setup (no root scroll container or no messages)."); return;
        }
        const io_options = { root: rootEl, rootMargin: '0px', threshold: 0.35 };
        timeline_intersectionObserver = new IntersectionObserver((entries) => {
            if(!pageVisible || !currentSettings.enableTimelineSidebar) return;
            let bestEntry = null;
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    if (!bestEntry || entry.intersectionRatio > bestEntry.intersectionRatio) {
                        bestEntry = entry;
                    }
                }
            });
            if (bestEntry) {
                 const idx = parseInt(bestEntry.target.getAttribute('data-cgpt-idx'));
                 if (!isNaN(idx) && idx < timeline_messages.length) {
                    const $allDotsLi = $(`div[id^="${TIMELINE_HTML_ID_PREFIX}"] .cgpt-dots li`);
                    if (idx !== timeline_currentMessageIndex || !$allDotsLi.filter('.active').length) {
                        timeline_currentMessageIndex = idx;
                        $allDotsLi.removeClass('active');

                        const { messagesPerEffectiveSidebar, numSidebars } = _getTimelineLayoutConfig();
                        if (messagesPerEffectiveSidebar > 0) {
                            const targetSidebarIndex = Math.floor(idx / messagesPerEffectiveSidebar);
                            const localIndexInSidebar = idx % messagesPerEffectiveSidebar;
                            if(targetSidebarIndex < numSidebars){
                                $(`#${TIMELINE_HTML_ID_PREFIX}${targetSidebarIndex} .cgpt-dots li`).eq(localIndexInSidebar).addClass('active');
                            } else {
                                debugWarn(`Timeline IO - Calculated targetSidebarIndex ${targetSidebarIndex} is out of bounds for ${numSidebars} sidebars.`);
                            }
                        }
                    }
                 }
            }
        }, io_options);
        timeline_messages.forEach((msgData, i) => {
            if (msgData.element && msgData.element.length && msgData.element.get(0)) {
                const domEl = msgData.element.get(0);
                domEl.setAttribute('data-cgpt-idx', i.toString());
                timeline_intersectionObserver.observe(domEl);
            }
        });
        debugLog("Timeline - IntersectionObserver setup and observing messages.");
    }

    function timeline_scrollToMessage(index, smooth = true) {
        if (index >= 0 && index < timeline_messages.length) {
            const messageEl = timeline_messages[index].element;
            if (messageEl && messageEl.length && messageEl.get(0) && messageEl.get(0).isConnected && timeline_chatScrollContainer && timeline_chatScrollContainer.length) {
                const messageDomElement = messageEl.get(0);
                const scrollContainerElement = timeline_chatScrollContainer.get(0);
                timeline_chatScrollContainerTop = scrollContainerElement.getBoundingClientRect().top;
                const messageRectTop = messageDomElement.getBoundingClientRect().top;
                const offsetRelativeToContainerViewport = messageRectTop - timeline_chatScrollContainerTop;
                const targetScrollTop = scrollContainerElement.scrollTop + offsetRelativeToContainerViewport;


                const $allDotsLi = $(`div[id^="${TIMELINE_HTML_ID_PREFIX}"] .cgpt-dots li`);
                if (timeline_currentMessageIndex !== index || !$allDotsLi.filter('.active').length) {
                    timeline_currentMessageIndex = index;
                    $allDotsLi.removeClass('active');
                    const { messagesPerEffectiveSidebar, numSidebars } = _getTimelineLayoutConfig();
                     if (messagesPerEffectiveSidebar > 0) {
                        const targetSidebarIndex = Math.floor(index / messagesPerEffectiveSidebar);
                        const localIndexInSidebar = index % messagesPerEffectiveSidebar;
                        if(targetSidebarIndex < numSidebars){
                            $(`#${TIMELINE_HTML_ID_PREFIX}${targetSidebarIndex} .cgpt-dots li`).eq(localIndexInSidebar).addClass('active');
                        } else {
                             debugWarn(`Timeline Scroll - Calculated targetSidebarIndex ${targetSidebarIndex} is out of bounds for ${numSidebars} sidebars.`);
                        }
                     }
                }

                if ('scrollTo' in scrollContainerElement && typeof scrollContainerElement.scrollTo === 'function') {
                    scrollContainerElement.scrollTo({ top: targetScrollTop, behavior: smooth ? 'smooth' : 'auto' });
                } else {
                    $(scrollContainerElement).stop().animate({ scrollTop: targetScrollTop }, smooth ? 300 : 0);
                }
                debugLog(`Timeline - Scrolled to message index: ${index}`);
            } else {
                debugWarn(`Timeline - Message element at index ${index} not found/connected or scroll container missing. Re-evaluating elements.`);
                if(timeline_findChatElements()) timeline_renderDots();
            }
        } else { debugWarn(`Timeline - Invalid index ${index} for scrollToMessage.`); }
    }


    function timeline_setupDOMObserver() {
        if (timeline_domObserver) timeline_domObserver.disconnect();
        const observerTargetNode = document.body;
        debugLog(`Timeline - DOMObserver target: ${observerTargetNode.tagName}`);
        timeline_domObserver = new MutationObserver(debounce((mutationsList) => {
            if (!currentSettings.enableTimelineSidebar || !pageVisible) return;
            let refreshNeeded = false;
            for (const mutation of mutationsList) {
                if (mutation.target.id === 'root' || mutation.target.tagName === 'MAIN' ||
                    (mutation.target.parentElement && mutation.target.parentElement.id === 'root') ||
                    $(mutation.target).closest('#thread').length > 0 ||
                    Array.from(mutation.addedNodes).some(node => $(node).closest('#thread').length > 0 || (node.id === 'thread') || (node.nodeType === 1 && $(node).find('#thread').length > 0)) ||
                    Array.from(mutation.removedNodes).some(node => $(node).closest('#thread').length > 0 || (node.id === 'thread'))) {
                     refreshNeeded = true; break;
                }
                if ((!timeline_chatScrollContainer || !timeline_chatScrollContainer.length) &&
                    (mutation.type === 'childList' && (mutation.addedNodes.length || mutation.removedNodes.length))) {
                     refreshNeeded = true; break;
                }

                if (mutation.type === 'childList' && Array.from(mutation.removedNodes).some(node => node.nodeType === 1 && node.id && node.id.startsWith(TIMELINE_HTML_ID_PREFIX))) {
                    debugLog("Timeline DOMObserver: A timeline sidebar was removed, flagging for refresh.");
                    refreshNeeded = true; break;
                }
            }
            if (refreshNeeded) {
                debugLog("Timeline DOMObserver: Detected relevant DOM change.");
                const messagesHaveChangedStructurally = timeline_findChatElements();
                if (messagesHaveChangedStructurally || $(`div[id^="${TIMELINE_HTML_ID_PREFIX}"]`).length === 0 && timeline_messages.length > 0) {
                    debugLog("Timeline DOMObserver: Message structure changed or sidebars missing. Re-rendering dots.");
                    const oldIndex = timeline_currentMessageIndex;
                    timeline_currentMessageIndex = -1;
                    timeline_renderDots();
                    if (DEBUG && oldIndex !== -1) console.log("Timeline DOMObserver: currentMessageIndex reset due to structural change.");
                } else if (timeline_messages.length > 0 && !$(`div[id^="${TIMELINE_HTML_ID_PREFIX}"] .cgpt-dots li.active`).length) {
                    debugLog("Timeline DOMObserver: No active dot, attempting to update state based on calculation.");
                    timeline_updateTimelineState(false);
                } else if (timeline_messages.length === 0 && $(`div[id^="${TIMELINE_HTML_ID_PREFIX}"] .cgpt-dots li`).length > 0) {
                    debugLog("Timeline DOMObserver: Messages cleared, re-rendering to remove dots.");
                    timeline_renderDots();
                } else {

                    timeline_updateTimelinePositionAndVisibility();
                }
            }
        }, 500));
        if (pageVisible && currentSettings.enableTimelineSidebar) {
            try { timeline_domObserver.observe(observerTargetNode, { childList: true, subtree: true }); } catch (e) { debugWarn("Timeline DOMObserver: Already observing or error.", e); }
        }
        debugLog("Timeline - DOMObserver attached (if page visible and feature enabled).");
    }

    function timeline_setupResizeObserver() {
        if (timeline_mainElementResizeObserver) timeline_mainElementResizeObserver.disconnect();
        const mainEl = $('main').get(0);
        const windowEl = window;

        const debouncedUpdate = debounce(timeline_updateTimelinePositionAndVisibility, 200);

        if (mainEl) {
            timeline_mainElementResizeObserver = new ResizeObserver(debouncedUpdate);
            timeline_mainElementResizeObserver.observe(mainEl);
            debugLog("Timeline - ResizeObserver attached to 'main'.");
        } else {
             debugWarn("Timeline - 'main' not found for ResizeObserver.");
        }
        $(windowEl).off('resize.cgpttimeline').on('resize.cgpttimeline', debouncedUpdate);
        debugLog("Timeline - Attached to window resize event.");
    }

    function timeline_cleanup() {
        debugLog('Timeline - Cleaning up...');
        timeline_ensureSidebarDivs(0);
        $(`#${TIMELINE_CSS_ID}`).remove();
        if (timeline_domObserver) { timeline_domObserver.disconnect(); timeline_domObserver = null; }
        if (timeline_mainElementResizeObserver) { timeline_mainElementResizeObserver.disconnect(); timeline_mainElementResizeObserver = null; }
        if (timeline_intersectionObserver) { timeline_intersectionObserver.disconnect(); timeline_intersectionObserver = null; }
        $(window).off('resize.cgpttimeline');
        $(document.body).off('click.cgptTimelineDots');
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

        timeline_injectCSS_local();


        $(document.body).off('click.cgptTimelineDots').on('click.cgptTimelineDots', `div[id^="${TIMELINE_HTML_ID_PREFIX}"] .cgpt-dots li`, function(e){
            e.stopPropagation();
            const idx = parseInt($(this).attr('data-idx'));
            if (!isNaN(idx)) {
                debugLog(`Timeline - Dot clicked, global index: ${idx}`);
                timeline_scrollToMessage(idx, true);
            }
        });
        debugLog('Timeline - Delegated click listener for dots attached to document.body.');

        if (timeline_findChatElements() || timeline_messages.length === 0) {
            timeline_renderDots();
        }
        timeline_setupDOMObserver();
        timeline_setupResizeObserver();
        timeline_initialized = true;
        debugLog("Timeline - Initialized successfully.");
    }


    function initializeTimelineFeatureWrapper() {
        if (currentSettings.enableTimelineSidebar) {
            if (!timeline_initialized) {
                debugLog('Timeline - Feature enabled. Starting initialization...');
                if ('requestIdleCallback' in window){
                    requestIdleCallback(initializeActualTimelineLogic, { timeout: 2000 });
                } else {
                    setTimeout(initializeActualTimelineLogic, 1500);
                }
            } else {
                 debugLog('Timeline - Feature enabled, already initialized. Ensuring setup and visibility.');
                 timeline_injectCSS_local();
                 if (timeline_findChatElements() || $(`div[id^="${TIMELINE_HTML_ID_PREFIX}"]`).length === 0 && timeline_messages.length > 0) {
                    timeline_renderDots();
                 } else {
                    timeline_updateTimelinePositionAndVisibility();
                 }
                 if (pageVisible) {
                    if (!timeline_domObserver) timeline_setupDOMObserver();
                    else { try { timeline_domObserver.observe(document.body, { childList: true, subtree: true }); } catch(e) {} }

                    const mainEl = $('main').get(0);
                    if (!timeline_mainElementResizeObserver && mainEl) timeline_setupResizeObserver();
                    else if (mainEl) { try {timeline_mainElementResizeObserver.observe(mainEl);} catch(e){} }

                    timeline_setupIntersectionObserver();
                 }
            }
        } else {
            debugLog('Timeline - Feature disabled by settings. Cleaning up...');
            timeline_cleanup();
        }
    }

    // --- Settings Dialog ---
    function openSettingsDialog() {
        const DIALOG_ID = 'chatgpt-userscript-settings-dialog';
        let dialog = document.getElementById(DIALOG_ID);
        if (dialog) {
            if (isDarkModeActive()) dialog.classList.add('cgpt-settings-dark');
            else dialog.classList.remove('cgpt-settings-dark');
            dialog.style.display = 'block';
        } else {
            dialog = document.createElement('div');
            dialog.id = DIALOG_ID;
            if (isDarkModeActive()) {
                dialog.classList.add('cgpt-settings-dark');
            }
            dialog.style.cssText = `
                position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
                padding: 25px; z-index: 2147483647;
                box-shadow: 0 4px 15px rgba(0,0,0,0.2); border-radius: 8px; direction: rtl; text-align: right;
                width: 450px; font-family: sans-serif; max-height: 80vh; overflow-y: auto;
                background-color: white; border: 1px solid #ccc;
            `;
            dialog.innerHTML = `
                <h3 style="margin-top:0; margin-bottom:20px; border-bottom: 1px solid #eee; padding-bottom:10px; font-size: 1.2em;">הגדרות כלי עזר וסרגל צד</h3>
                <div style="margin-bottom: 12px;"><input type="checkbox" id="setting-enable-styling" style="margin-left: 8px; vertical-align: middle;"><label for="setting-enable-styling" style="vertical-align: middle; cursor:pointer;">הפעל עיצוב בועות ו-RTL</label></div>
                <div style="margin-bottom: 12px;"><input type="checkbox" id="setting-enable-copy-button" style="margin-left: 8px; vertical-align: middle;"><label for="setting-enable-copy-button" style="vertical-align: middle; cursor:pointer;">הפעל כפתור "העתק שיחה"</label></div>
                <div style="margin-bottom: 12px;"><input type="checkbox" id="setting-enable-hide-plans" style="margin-left: 8px; vertical-align: middle;"><label for="setting-enable-hide-plans" style="vertical-align: middle; cursor:pointer;">הסתר את כפתור "הצג תוכניות"</label></div>
                <div style="margin-bottom: 20px;"><input type="checkbox" id="setting-enable-timeline-sidebar" style="margin-left: 8px; vertical-align: middle;"><label for="setting-enable-timeline-sidebar" style="vertical-align: middle; cursor:pointer;">הפעל סרגל צד לניווט (Timeline)</label></div>
                <div style="text-align:left;">
                  <button id="settings-save-button" style="color: white; border: none; padding: 10px 18px; border-radius: 5px; cursor: pointer; margin-left: 10px; font-size: 0.95em; background-color: #10a37f;">שמור וסגור</button>
                  <button id="settings-cancel-button" style="color: white; border: none; padding: 10px 18px; border-radius: 5px; cursor: pointer; font-size: 0.95em; background-color: #aaa;">ביטול</button>
                </div>
                <p style="font-size:0.85em; color:#555; margin-top:20px; margin-bottom:0;">שינויים יחולו במלואם לאחר רענון הדף או מיידית במידת האפשר.</p>
            `;
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

    // --- Theme Watcher ---
    let themeWatcherObserver = null;
    function initializeThemeWatcher() {
        if (themeWatcherObserver) themeWatcherObserver.disconnect();
        const htmlElement = document.documentElement;
        if (!htmlElement) return;
        themeWatcherObserver = new MutationObserver((mutationsList) => {
            for (const mutation of mutationsList) {
                if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                    debugLog('HTML class attribute changed. Re-applying styles for dark mode check.');
                    applyStylesOnLoad();
                    if (currentSettings.enableTimelineSidebar && timeline_initialized) {
                        timeline_injectCSS_local();
                        timeline_updateTimelinePositionAndVisibility();
                    }
                    const settingsDialog = document.getElementById('chatgpt-userscript-settings-dialog');
                    if (settingsDialog && settingsDialog.style.display === 'block') {
                        if (isDarkModeActive()) settingsDialog.classList.add('cgpt-settings-dark');
                        else settingsDialog.classList.remove('cgpt-settings-dark');
                    }
                    return;
                }
            }
        });
        themeWatcherObserver.observe(htmlElement, { attributes: true });
        debugLog('Theme watcher initialized on <html> element.');
    }

    // --- Main Initialization ---
    function main() {
        loadSettings();
        applyStylesOnLoad();
        initializeCopyButtonFeature();
        initializeHidePlansFeature();
        initializeTimelineFeatureWrapper();
        initializeThemeWatcher();
        GM_registerMenuCommand('הגדרות כלי עזר וסרגל צד (v3.1.9)', openSettingsDialog);

        document.addEventListener('visibilitychange', ()=>{
            const oldPageVisible = pageVisible;
            pageVisible = !document.hidden;
            debugLog(`Page visibility changed to: ${pageVisible}`);
            if (pageVisible && !oldPageVisible) {

                if (currentSettings.enableCopyButton) {
                     if (!copyButtonObserver && document.querySelector(ACTIONS_CONTAINER_SELECTOR)) attemptToSetupCopyButtonObserver();
                     else if (copyButtonObserver && document.querySelector(ACTIONS_CONTAINER_SELECTOR)) { try { copyButtonObserver.observe(document.querySelector(ACTIONS_CONTAINER_SELECTOR), { childList: true, subtree: true }); } catch(e) {} }
                     if (window.__cgptCopyBtnBodyObserver) { try { window.__cgptCopyBtnBodyObserver.observe(document.body, { childList: true, subtree: true }); } catch(e) {} }
                }
                if (currentSettings.enableHidePlansButton) {
                    findAndHidePlansButton();
                    if (!hidePlansObserver) initializeHidePlansFeature();
                    else { try { hidePlansObserver.observe(document.body, { childList: true, subtree: true }); } catch(e) {} }
                }
                if (currentSettings.enableTimelineSidebar) {
                    if (!timeline_initialized) {
                        initializeTimelineFeatureWrapper();
                    } else {

                        timeline_updateTimelinePositionAndVisibility();
                        if (timeline_domObserver) { try { timeline_domObserver.observe(document.body, { childList: true, subtree: true }); } catch(e) {} }
                        else timeline_setupDOMObserver();

                        const mainEl = $('main').get(0);
                        if (timeline_mainElementResizeObserver && mainEl) { try { timeline_mainElementResizeObserver.observe(mainEl); } catch(e){} }
                        else if(mainEl) timeline_setupResizeObserver();

                        timeline_setupIntersectionObserver();
                    }
                }
                 debugLog("Features re-checked/re-activated on page visibility.");
            } else if (!pageVisible && oldPageVisible) {
                if (copyButtonObserver) { try { copyButtonObserver.disconnect(); } catch(e){} }
                if (window.__cgptCopyBtnBodyObserver) { try { window.__cgptCopyBtnBodyObserver.disconnect(); } catch(e){} }
                if (hidePlansObserver) { try { hidePlansObserver.disconnect(); } catch(e){} }
                if (timeline_domObserver) { try { timeline_domObserver.disconnect(); } catch(e){} }

                if (timeline_intersectionObserver) {
                    timeline_intersectionObserver.disconnect();
                    debugLog("Timeline IntersectionObserver disconnected due to page hidden.");
                }
                 debugLog("Some observers disconnected due to page hidden.");
            }
        });
        debugLog('CombinedScript & Timeline Script v3.1.9 - Fully initialized.');
    }

    if (typeof $ === 'undefined' || typeof $.fn.jquery === 'undefined') {
        debugError("jQuery not loaded! Script cannot run.");
        if (typeof GM_notification === 'function') GM_notification({ title: 'שגיאת טעינה', text: 'jQuery לא נטען, התוסף לא יפעל.', silent: false, timeout: 10000 });
        return;
    }
    $(document).ready(function() {
         setTimeout(main, 750);
    });

})();