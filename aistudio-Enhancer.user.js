// ==UserScript==
// @name         תוסף עובד
// @namespace    https://example.com/
// @version      0.4 // Increment version
// @description  סרגל-התקדמות שמאלי עם צבעים שונים למשתמש ול-AI ב-aistudio.google.com. מתעלם מהודעות חשיבה של AI.
// @match        https://aistudio.google.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(() => {
'use strict';

const DEBUG = true;
const debugLog = DEBUG ? (...args) => console.log('[AI Studio Sidebar]', ...args) : () => {};
const debugWarn = DEBUG ? (...args) => console.warn('[AI Studio Sidebar]', ...args) : () => {};

/──────  קבועים  ──────/
const SIDEBAR_ID     = 'ais-progress-sidebar';
const LINE_ID        = 'ais-progress-line'; // Used in your example, kept for reference
const DOT_CLASS      = 'ais-progress-dot';  // CRITICAL: This must be defined before injectStyles
const OBS_DEBOUNCE   = 300;  // ms
const INIT_DELAY     = 2000; // Increased delay for initial load

/* צבעים מתוך הסקריפט המקורי שלך */
const COLOR_USER     = '#4CAF50';  // ירוק
const COLOR_ASSIST   = '#2196F3';  // כחול (במקור היה 0d6efd, זה קרוב יותר)

let   messages = [];
let   currentMessageIndex = -1;
let   chatContainer = null; // For IntersectionObserver root
let   sidebar = null;
let   intersectionObserver = null;
let   mutationObserver = null;
let   isInitialized = false;
let   resizeListenerAttached = false;

// Utility functions
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

function createElement(tag, className = '', attributes = {}) {
const element = document.createElement(tag);
if (className) element.className = className;
Object.entries(attributes).forEach(([key, value]) => {
element.setAttribute(key, value);
});
return element;
}

/*──────  בדיקת "חשיבה"  ──────*/
function isThinkingMessage(turn) {
  return (
    turn.querySelector('ms-thought-chunk') !== null ||   // ‫עטיפת Thoughts‬
    turn.querySelector('.thought-panel')   !== null      // ‫כותרת "Thoughts (experimental)"‬
  );
}


function injectStyles() {
if (document.getElementById('ai-studio-sidebar-styles')) return;

const style = createElement('style', '', { id: 'ai-studio-sidebar-styles' });
// Styles based on your working example, adapted for LTR and using constants
style.textContent = `
    #${SIDEBAR_ID} {
        position: fixed !important;
        top: 50% !important;
        transform: translateY(-50%) !important;
        z-index: 10000 !important;
        display: flex !important;
        flex-direction: column !important;
        align-items: center !important;
        pointer-events: none !important;
        transition: opacity 0.3s ease-out, left 0.3s ease-out; /* For smooth positioning */
        opacity: 0; /* Hidden by default */
    }

    #${SIDEBAR_ID}.visible {
        opacity: 1 !important;
    }

    /* Line mimicking your example's line */
    #${SIDEBAR_ID}::before {
        content: '';
        position: absolute;
        left: 50%;
        top: 0;
        width: 4px;
        height: 100%;
        background: #B0B0B0;
        border-radius: 2px;
        transform: translateX(-50%);
        z-index: -1; /* Behind dots */
    }

    #${SIDEBAR_ID} .${DOT_CLASS} { /* Using the constant DOT_CLASS */
        width: 10px !important;
        height: 10px !important;
        margin: 6px 0 !important;
        border-radius: 50% !important;
        cursor: pointer !important;
        pointer-events: all !important;
        transition: transform .2s, box-shadow .2s !important;
        position: relative; /* Needed for z-index to work above ::before */
        z-index: 1;
    }

    #${SIDEBAR_ID} .${DOT_CLASS}.user {
        background-color: ${COLOR_USER} !important;
    }

    #${SIDEBAR_ID} .${DOT_CLASS}.model {
        background-color: ${COLOR_ASSIST} !important;
    }

    #${SIDEBAR_ID} .${DOT_CLASS}.active {
        transform: scale(1.4) !important;
        box-shadow: 0 0 10px rgba(0,0,0,0.4) !important;
    }

    #${SIDEBAR_ID} .${DOT_CLASS}:hover {
        transform: scale(1.3) !important;
    }

    /* Basic Tooltip (can be enhanced) */
    #${SIDEBAR_ID} .${DOT_CLASS}[title]:hover::after {
        content: attr(title);
        position: absolute;
        left: 100%;
        top: 50%;
        transform: translateY(-50%) translateX(8px); /* Position to the right */
        background-color: rgba(0,0,0,0.8);
        color: white;
        padding: 3px 6px;
        border-radius: 3px;
        font-size: 11px;
        white-space: nowrap;
        z-index: 10002;
    }
`;
document.head.appendChild(style);
debugLog('Styles injected');
}

function createSidebar() {
if (document.getElementById(SIDEBAR_ID)) return document.getElementById(SIDEBAR_ID);

sidebar = createElement('div', '', { id: SIDEBAR_ID });
// The line is now part of the sidebar's ::before pseudo-element in CSS
// The dots will be appended directly to the sidebar div.
document.body.appendChild(sidebar);

debugLog('Sidebar created');
return sidebar;
}

function findChatElements() {
// Try to get the scrollable container first for IntersectionObserver
chatContainer = document.querySelector('ms-autoscroll-container');
if (!chatContainer) {
debugWarn('ms-autoscroll-container not found for IntersectionObserver. Active highlighting might be impaired.');
// Fallback: try the chat session itself, though scrolling might be on a child
chatContainer = document.querySelector('ms-chat-session');
if(chatContainer) {
debugLog('Using ms-chat-session as chatContainer for IntersectionObserver.');
} else {
debugWarn('ms-chat-session also not found. Scroll-based active dot will not work.');
}
} else {
debugLog('Found ms-autoscroll-container.');
}

// Get all ms-chat-turn elements, as these represent individual messages
const messageElements = Array.from(document.querySelectorAll('ms-chat-turn'));

if (messageElements.length === 0) {
    debugLog('No message elements (ms-chat-turn) found.');
    if (messages.length > 0) {
        messages = [];
        return true; // Change: messages disappeared
    }
    return false; // No messages, no change
}

// Filter out thinking messages and process the rest
const filteredElements = messageElements.filter(element => {
    const hasThinking = isThinkingMessage(element);
    if (hasThinking) {
        debugLog('Skipping thinking message:', element);
    }
    return !hasThinking;
});

const newMessages = filteredElements.map((element, index) => {
    let role = 'unknown';
    // Check based on the class of the direct child div.chat-turn-container
    const turnContainerDiv = element.querySelector('div.chat-turn-container');
    if (turnContainerDiv) {
        if (turnContainerDiv.classList.contains('user')) {
            role = 'user';
        } else if (turnContainerDiv.classList.contains('model')) {
            role = 'model';
        }
    }

    // Fallback if the above didn't identify (less likely given the HTML)
    // This was the original simpler logic from the user's working script
    if (role === 'unknown') {
         debugLog(`Role not identified by class for message ${index}, falling back to index-based (even/odd).`);
         role = index % 2 === 0 ? 'user' : 'model'; // User, AI, User, AI...
    }

    return {
        element,
        role,
        index,
        id: element.id || `sidebar-msg-${Date.now()}-${index}`
    };
});

if (newMessages.length !== messages.length ||
    newMessages.some((msg, i) =>
        !messages[i] ||
        messages[i].element !== msg.element ||
        messages[i].role !== msg.role
    )
) {
    messages = newMessages;
    debugLog(`Found and processed ${messages.length} messages (filtered out thinking messages). Roles: ${messages.map(m=>m.role).join(', ')}`);
    return true; // Indicates a change
}
return false; // No significant change
}

function renderDots() {
if (!sidebar) {
debugWarn('Sidebar not available for rendering dots.');
return;
}
// Clear existing dots (sidebar is the flex container for dots now)
while (sidebar.firstChild && sidebar.firstChild.classList && sidebar.firstChild.classList.contains(DOT_CLASS)) {
sidebar.removeChild(sidebar.firstChild);
}

if (messages.length === 0) {
    sidebar.classList.remove('visible');
    debugLog('No messages to render, sidebar hidden.');
    return;
}

messages.forEach((messageData, index) => {
    const dot = createElement('div', `${DOT_CLASS} ${messageData.role}`, { // Use div as in user's script
        'data-message-index': index.toString(),
    });
    dot.title = `הודעה ${index + 1} (${messageData.role === 'user' ? 'משתמש' : 'מודל'})`;

    dot.addEventListener('click', (e) => {
        e.stopPropagation();
        scrollToMessage(index);
    });
    // Hover effect via CSS

    sidebar.appendChild(dot); // Append dots directly to sidebar
});

updateSidebarPosition();
sidebar.classList.add('visible');
if (intersectionObserver) intersectionObserver.disconnect();
setupIntersectionObserver();
debugLog(`Rendered ${messages.length} dots (excluding thinking messages).`);
}

function positionSidebar () {
if (!sidebar) return;

let referenceElement = document.querySelector('ms-chat-turn'); // As per user's script
if (!referenceElement && messages.length > 0) referenceElement = messages[0].element;

if (referenceElement) {
  const rect = referenceElement.getBoundingClientRect();
  const newLeft = Math.max(rect.left - 20 - 10, 8); // 20 margin, 10 for sidebar width/dot
  sidebar.style.left = `${newLeft}px`;
} else {
  sidebar.style.left = '12px'; // Fallback
  debugWarn('Could not find ms-chat-turn for positioning, using fallback left.');
}
// Vertical centering is done by CSS (top: 50%, transform: translateY(-50%))
// Height is auto based on dot count.
}

function updateSidebarPosition() { // Renamed from user's positionSidebar
positionSidebar(); // Call the actual positioning logic
}

function scrollToMessage(index) {
if (index < 0 || index >= messages.length) return;
const messageElement = messages[index].element;
if (!messageElement) return;

messageElement.scrollIntoView({
      behavior: 'smooth',
      block: 'center'
  });
  updateActiveMessage(index);
  debugLog(`Scrolled to message ${index + 1}`);
}

function updateActiveMessage(index) {
if (!sidebar || currentMessageIndex === index) return;

currentMessageIndex = index;

  sidebar.querySelectorAll(`.${DOT_CLASS}`).forEach(dot => {
      dot.classList.remove('active');
  });

  if (index >= 0 && index < messages.length) {
      const activeDot = sidebar.querySelector(`.${DOT_CLASS}[data-message-index="${index}"]`);
      if (activeDot) {
          activeDot.classList.add('active');
      }
  }
}

function setupIntersectionObserver() {
if (intersectionObserver) {
intersectionObserver.disconnect();
}

if (!chatContainer || messages.length === 0) { // chatContainer is the scroll root
      debugLog('Cannot setup IntersectionObserver: chatContainer not found or no messages.');
      currentMessageIndex = -1; // Reset active index
      if(sidebar) sidebar.querySelectorAll(`.${DOT_CLASS}`).forEach(dot => dot.classList.remove('active'));
      return;
  }

  const options = {
      root: chatContainer,
      rootMargin: '-40% 0px -40% 0px', // Try to detect when message is in middle 20% of viewport
      threshold: 0.01 // Detect even slight visibility within rootMargin
  };

  intersectionObserver = new IntersectionObserver((entries) => {
      let mostCenteredEntry = null;
      let highestVisibility = 0; // Store the highest ratio for truly visible items

      entries.forEach(entry => {
          if (entry.isIntersecting) { // Element is within rootMargin
              // Find the one closest to center (or simply most visible if rootMargin is complex)
              // For simplicity, take the last one that isIntersecting as it's likely the "current"
              // A more robust way would be to check entry.boundingClientRect.top relative to rootBounds.top
              if (entry.intersectionRatio > highestVisibility) {
                  highestVisibility = entry.intersectionRatio;
                  mostCenteredEntry = entry;
              }
          }
      });

      if (mostCenteredEntry) {
          const messageIndex = messages.findIndex(msg => msg.element === mostCenteredEntry.target);
          if (messageIndex !== -1 && messageIndex !== currentMessageIndex) {
              updateActiveMessage(messageIndex);
          }
      }
  }, options);

  messages.forEach(messageData => {
      if (messageData.element) {
          intersectionObserver.observe(messageData.element);
      }
  });
  debugLog('Intersection observer setup/reset complete for scroll detection.');
}

const debouncedRebuildAndReposition = debounce(() => {
debugLog('MutationObserver: debouncedRebuildAndReposition triggered.');
const changed = findChatElements();
if (changed) {
renderDots(); // Will also call setupIntersectionObserver
}
positionSidebar(); // Always reposition
}, OBS_DEBOUNCE);

function setupMutationObserver() {
if (mutationObserver) return;

mutationObserver = new MutationObserver(() => {
      debouncedRebuildAndReposition();
  });

  // Observe a high-level stable parent or document.body
  // ms-chat-session might be a good target if it's stable and wraps all messages
  let observerTarget = document.querySelector('ms-chat-session');
  if (!observerTarget) {
      observerTarget = document.body;
      debugWarn("ms-chat-session not found for MutationObserver, falling back to document.body. This might be less performant.");
  }

  mutationObserver.observe(observerTarget, {
      childList: true,
      subtree: true
  });
  debugLog('Mutation observer setup complete on:', observerTarget.tagName);
}

function setupResizeObserver() {
if (resizeListenerAttached) return;
const debouncedResize = debounce(() => {
positionSidebar();
// Re-evaluate intersection observer if container size changed significantly
if (chatContainer) setupIntersectionObserver();
}, 200);
window.addEventListener('resize', debouncedResize);
resizeListenerAttached = true;
debugLog('Resize listener setup complete.');
}

function initialize() {
if (isInitialized) return;
debugLog('Initializing AI Studio Sidebar (Fixed LTR - No Thinking)...');

injectStyles();
  sidebar = createSidebar(); // Assign to global sidebar

  // Initial attempt to find elements and render
  const initialFound = findChatElements();
  if (initialFound) {
      renderDots();
  } else {
      debugLog('Initial element scan found no messages. Will rely on MutationObserver.');
  }
  positionSidebar(); // Position sidebar even if no dots initially

  setupMutationObserver();
  setupResizeObserver();

  isInitialized = true;
  debugLog('Sidebar initialization complete.');
}

// Start initialization after page load
if (document.readyState === 'loading') {
document.addEventListener('DOMContentLoaded', () => setTimeout(initialize, INIT_DELAY));
} else {
setTimeout(initialize, INIT_DELAY);
}

debugLog('AI Studio Timeline Sidebar (Fixed LTR - No Thinking) script loaded');
})();