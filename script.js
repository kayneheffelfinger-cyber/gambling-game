// Smooth scrolling for navigation links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        const href = this.getAttribute('href');
        if (href !== '#' && document.querySelector(href)) {
            e.preventDefault();
            document.querySelector(href).scrollIntoView({
                behavior: 'smooth'
            });
        }
    });
});

const gameState = {
    game: null,
    credits: 1000,
    slots: ['🍒', '🍋', '💎'],
    pokerHand: [],
    rouletteResult: null,
    blackjackHand: [],
    blackjackDealer: [],
    blackjackDeck: [],
    blackjackInProgress: false,
    jackpotPool: 1000,
    jackpotLastRoll: 'No jackpot roll yet.',
    coinResult: null,
    kenoNumbers: [],
    kenoDraw: [],
    baccaratResult: null,
    currentBet: 10
};

const defaultUpdateHistory = [
    {
        version: '2026.09.15-roulette-number-guess',
        title: 'Roulette number guessing',
        details: ['Choose an exact number from 0 to 36.', 'Exact hits and color bets now have separate payouts.']
    },
    {
        version: '2026.09.15-animated-games',
        title: 'Animated game actions',
        details: ['Slots now use staggered animated reels.', 'Dice now tumble through changing faces before stopping.']
    },
    {
        version: '2026.09.15-accounts-tokens',
        title: 'Accounts and saved tokens',
        details: ['Create and save a local demo account.', 'Token balances are saved separately for each account.']
    },
    {
        version: '2026.09.15-admin-dashboard',
        title: 'Admin dashboard',
        details: ['Admins can review accounts and token balances.', 'Added Overview, Accounts, and Updates tabs.']
    }
];

const updatesStorageKey = 'lucky-jackpot-updates';

function getUpdateHistory() {
    try {
        const savedUpdates = JSON.parse(localStorage.getItem(updatesStorageKey) || 'null');
        return Array.isArray(savedUpdates) && savedUpdates.length ? savedUpdates : defaultUpdateHistory;
    } catch (error) {
        return defaultUpdateHistory;
    }
}

let updateHistory = getUpdateHistory();

const updateNotice = {
    version: updateHistory[0].version,
    title: `New update: ${updateHistory[0].title}`,
    details: updateHistory[0].details
};

const cardSuits = ['♠', '♥', '♦', '♣'];
const cardRanks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const accountStorageKey = 'lucky-jackpot-accounts';
const currentAccountStorageKey = 'lucky-jackpot-current-account';
const themeStorageKey = 'lucky-jackpot-theme';
const gameAvailabilityStorageKey = 'lucky-jackpot-game-availability';
const chatStorageKey = 'lucky-jackpot-chat-messages';
const blockedWordsStorageKey = 'lucky-jackpot-blocked-chat-words';
const supportTicketsStorageKey = 'lucky-jackpot-support-tickets';
const jackpotPoolStorageKey = 'lucky-jackpot-prize-pool';
const jackpotEntryStorageKey = 'lucky-jackpot-entry-counts';
const chatVisibilityStorageKey = 'lucky-jackpot-chat-open';
const gameHistoryStorageKey = 'lucky-jackpot-game-history';
const jackpotEntryLimit = 25;
const bigWinThreshold = 50;
const presenceOnlineWindow = 45 * 1000;
const defaultGameAvailability = {
    slots: true,
    poker: true,
    dice: true,
    roulette: true,
    blackjack: true,
    coinflip: true,
    jackpot: true,
    keno: true,
    baccarat: true
};
let adminSession = false;
let chatMessagesCache = [];
let chatRefreshTimer = null;
let presenceRefreshTimer = null;

try {
    const savedJackpotPool = Number(localStorage.getItem(jackpotPoolStorageKey));
    if (Number.isFinite(savedJackpotPool) && savedJackpotPool >= 100) gameState.jackpotPool = savedJackpotPool;
} catch (error) {
    // Use the default pool when storage is unavailable.
}

function initializeApp() {
    try { initializeChatWidget(); } catch (error) { console.error('Chat initialization failed:', error); }
    try { initializeTheme(); } catch (error) { console.error('Theme initialization failed:', error); }
    try { renderPublicUpdates(); } catch (error) { console.error('Updates initialization failed:', error); }
    try { renderChat(); } catch (error) { console.error('Chat rendering failed:', error); }
    try { showUpdateNotice(); } catch (error) { console.error('Update notice failed:', error); }
    try { showAccountPrompt(); } catch (error) { console.error('Account prompt failed:', error); }
    try { loadCurrentTokenBalance(); updateTokenCounter(); } catch (error) { console.error('Token initialization failed:', error); }
    try { startBankRefresh(); } catch (error) { console.error('Bank initialization failed:', error); }
    try { applyGameAvailability(); } catch (error) { console.error('Game availability failed:', error); }
    try { startChatRefresh(); startPresenceRefresh(); restoreSession(); initializeUserPage(); } catch (error) { console.error('Refresh initialization failed:', error); }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp, { once: true });
} else {
    initializeApp();
}

function initializeChatWidget() {
    document.querySelectorAll('.nav-links a[href="chat.html"]').forEach(link => link.remove());
    const existingChat = document.querySelector('#chat-drawer, #chat');
    if (existingChat) {
        existingChat.id = 'chat-drawer';
        if (!document.querySelector('.chat-open')) {
            const openButton = document.createElement('button');
            openButton.className = 'chat-open';
            openButton.type = 'button';
            openButton.setAttribute('aria-label', 'Open chat');
            openButton.textContent = 'Open chat';
            document.body.appendChild(openButton);
        }
        applyChatVisibility();
        return;
    }

    const drawer = document.createElement('section');
    drawer.id = 'chat-drawer';
    drawer.className = 'chat-section';
    drawer.innerHTML = `
        <div class="container">
            <div class="chat-heading">
                <div><span class="section-kicker">Community</span><h2>Player chat</h2></div>
                <button class="chat-close" type="button" aria-label="Close chat">&larr;</button>
                <p>Share questions, wins, and game tips.</p>
            </div>
            <div class="chat-layout"><div class="chat-panel">
                <div class="chat-toolbar"><input id="chat-search" class="chat-search" type="search" placeholder="Search messages" aria-label="Search messages"></div>
                <div id="chat-messages" class="chat-messages" aria-live="polite"></div>
                <p class="chat-only-big-wins">Big wins appear here automatically.</p>
            </div></div>
        </div>`;
    const openButton = document.createElement('button');
    openButton.className = 'chat-open';
    openButton.type = 'button';
    openButton.setAttribute('aria-label', 'Open chat');
    openButton.textContent = 'Open chat';
    document.body.append(drawer, openButton);
    applyChatVisibility();
}

function applyChatVisibility() {
    const isOpen = localStorage.getItem(chatVisibilityStorageKey) !== 'closed';
    document.querySelector('#chat-drawer')?.classList.toggle('is-closed', !isOpen);
    document.querySelector('.chat-open')?.classList.toggle('is-visible', !isOpen);
}

function setChatVisibility(isOpen) {
    localStorage.setItem(chatVisibilityStorageKey, isOpen ? 'open' : 'closed');
    applyChatVisibility();
}

function initializeTheme() {
    let savedTheme = 'dark';
    try {
        savedTheme = localStorage.getItem(themeStorageKey) || 'dark';
    } catch (error) {
        savedTheme = 'light';
    }
    applyTheme(savedTheme);
}

function applyTheme(theme) {
    const isDark = theme === 'dark';
    document.body.classList.toggle('dark-mode', isDark);
    document.body.classList.toggle('light-mode', !isDark);
    document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
    const themeButton = document.querySelector('#theme-toggle');
    if (themeButton) {
        themeButton.textContent = isDark ? 'Light mode' : 'Dark mode';
        themeButton.setAttribute('aria-pressed', String(isDark));
        themeButton.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
    }
    const adminButton = document.querySelector('.btn-admin');
    if (adminButton) {
        adminButton.hidden = false;
        adminButton.style.removeProperty('display');
    }
}

function showUpdateNotice() {
    let lastSeenVersion = null;
    try {
        lastSeenVersion = localStorage.getItem('lucky-jackpot-update');
    } catch (error) {
        lastSeenVersion = null;
    }

    if (lastSeenVersion === updateNotice.version) return;

    const modal = document.createElement('div');
    modal.className = 'update-modal is-open';
    modal.innerHTML = `
        <div class="update-dialog" role="dialog" aria-modal="true" aria-labelledby="update-title">
            <button class="update-close" type="button" data-action="dismiss-update" aria-label="Close update">&times;</button>
            <span class="game-kicker">Lucky Jackpot</span>
            <h2 id="update-title">${updateNotice.title}</h2>
            <p class="update-intro">The latest version is live on this site.</p>
            <ul class="update-list">${updateNotice.details.map(detail => `<li>${detail}</li>`).join('')}</ul>
            <button class="game-action" type="button" data-action="dismiss-update">Got it</button>
        </div>`;
    modal.addEventListener('click', event => {
        if (event.target === modal || event.target.closest('[data-action="dismiss-update"]')) {
            dismissUpdateNotice(modal);
        }
    });
    document.body.appendChild(modal);
    document.body.classList.add('modal-open');
}

function dismissUpdateNotice(modal) {
    try {
        localStorage.setItem('lucky-jackpot-update', updateNotice.version);
    } catch (error) {
        // The notification can still be dismissed when storage is unavailable.
    }
    modal.remove();
    if (!document.querySelector('.game-modal.is-open') && !document.querySelector('.account-modal.is-open')) {
        document.body.classList.remove('modal-open');
    }
}

function getSavedAccounts() {
    try {
        const accounts = JSON.parse(localStorage.getItem(accountStorageKey) || '[]');
        return Array.isArray(accounts) ? accounts.map(({ password, passwordHash, ...account }) => account) : [];
    } catch (error) {
        return [];
    }
}

function savePublicAccount(account) {
    if (!account?.email) return;
    const accounts = getSavedAccounts().filter(saved => saved.email !== account.email);
    accounts.push(account);
    localStorage.setItem(accountStorageKey, JSON.stringify(accounts));
}

async function restoreSession() {
    try {
        const response = await fetch('/api/auth/me', { cache: 'no-store' });
        if (!response.ok) return;
        const account = await response.json();
        savePublicAccount(account);
        localStorage.setItem(currentAccountStorageKey, JSON.stringify({ name: account.name, email: account.email, role: account.role }));
        gameState.credits = getAccountTokens(account);
        updateAccountButtons(account);
        updateTokenCounter();
        initializeUserPage();
    } catch (error) {}
}

async function getSharedAccounts() {
    try {
        const response = await fetch('/api/accounts', { cache: 'no-store' });
        if (!response.ok) throw new Error('Accounts API unavailable');
        return await response.json();
    } catch (error) {
        return getSavedAccounts();
    }
}

function getCurrentAccount() {
    try {
        return JSON.parse(localStorage.getItem(currentAccountStorageKey) || 'null');
    } catch (error) {
        return null;
    }
}

function getSupportTickets() {
    try {
        const tickets = JSON.parse(localStorage.getItem(supportTicketsStorageKey) || '[]');
        return Array.isArray(tickets) ? tickets : [];
    } catch (error) {
        return [];
    }
}

function saveSupportTicket(ticket) {
    const tickets = getSupportTickets();
    tickets.unshift(ticket);
    localStorage.setItem(supportTicketsStorageKey, JSON.stringify(tickets.slice(0, 200)));
}

function updateSupportTicketStatus(ticketId, status) {
    const tickets = getSupportTickets();
    const updated = tickets.map(ticket => ticket.id === ticketId ? { ...ticket, status } : ticket);
    localStorage.setItem(supportTicketsStorageKey, JSON.stringify(updated));
}

async function updatePresence() {
    const currentAccount = getCurrentAccount();
    if (!currentAccount?.email) return;
    try {
        await fetch('/api/presence', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });
    } catch (error) {
        // Presence is best effort when the shared server is unavailable.
    }
}

function startPresenceRefresh() {
    updatePresence();
    if (presenceRefreshTimer) window.clearInterval(presenceRefreshTimer);
    presenceRefreshTimer = window.setInterval(() => {
        if (!document.hidden) updatePresence();
    }, 15000);
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) updatePresence();
    });
}

function loadCurrentTokenBalance() {
    const currentAccount = getCurrentAccount();
    const savedAccount = getSavedAccounts().find(account => account.email === currentAccount?.email);
    if (savedAccount) gameState.credits = getAccountTokens(savedAccount);
}

function getAccountTokens(account) {
    return Number.isFinite(Number(account.tokens)) ? Number(account.tokens) : 1000;
}
const bankStorageKey = 'lucky-jackpot-bank-v1';
const bankRateStorageKey = 'lucky-jackpot-bank-rate-v1';
const bankRateRefreshMs = 5 * 60 * 1000;
const bankInterestIntervalMs = 24 * 60 * 60 * 1000;

function getBankState() {
    const account = getCurrentAccount();
    const key = account?.email ? `${bankStorageKey}:${account.email}` : bankStorageKey;
    try {
        const saved = JSON.parse(localStorage.getItem(key) || 'null');
        if (saved && Number.isFinite(Number(saved.balance))) {
            return {
                balance: Math.max(0, Number(saved.balance)),
                lastInterestAt: Number(saved.lastInterestAt) || Date.now()
            };
        }
    } catch (error) {}
    return { balance: 0, lastInterestAt: Date.now() };
}

function saveBankState(state) {
    const account = getCurrentAccount();
    const key = account?.email ? `${bankStorageKey}:${account.email}` : bankStorageKey;
    try { localStorage.setItem(key, JSON.stringify(state)); } catch (error) {}
}

function getBankRateState() {
    try {
        const saved = JSON.parse(localStorage.getItem(bankRateStorageKey) || 'null');
        if (saved && Number.isFinite(Number(saved.rate)) && Number.isFinite(Number(saved.changedAt))) return saved;
    } catch (error) {}
    return { rate: 0.02, changedAt: Date.now() };
}

function getCurrentBankRate() {
    let state = getBankRateState();
    const now = Date.now();
    if (now - state.changedAt >= bankRateRefreshMs) {
        const periods = Math.floor((now - state.changedAt) / bankRateRefreshMs);
        for (let i = 0; i < periods; i += 1) state.rate = (Math.floor(Math.random() * 401) + 100) / 10000;
        state.changedAt += periods * bankRateRefreshMs;
        try { localStorage.setItem(bankRateStorageKey, JSON.stringify(state)); } catch (error) {}
    }
    return state.rate;
}

function formatBankTime(ms) {
    if (ms <= 0) return 'Ready now';
    const totalSeconds = Math.ceil(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return hours ? `${hours}h ${minutes}m` : minutes ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function processBankInterest() {
    const state = getBankState();
    const now = Date.now();
    if (state.balance <= 0 || now - state.lastInterestAt < bankInterestIntervalMs) {
        saveBankState(state);
        return state;
    }
    const periods = Math.floor((now - state.lastInterestAt) / bankInterestIntervalMs);
    const rate = getCurrentBankRate();
    state.balance *= Math.pow(1 + rate, periods);
    state.lastInterestAt += periods * bankInterestIntervalMs;
    saveBankState(state);
    return state;
}

function renderBank() {
    const state = processBankInterest();
    const rate = getCurrentBankRate();
    const balanceEl = document.querySelector('#bank-balance');
    const rateEl = document.querySelector('#bank-rate');
    const nextEl = document.querySelector('#bank-next-interest');
    if (balanceEl) balanceEl.textContent = Math.floor(state.balance).toLocaleString();
    if (rateEl) rateEl.textContent = `${(rate * 100).toFixed(2)}%`;
    if (nextEl) nextEl.textContent = formatBankTime(Math.max(0, state.lastInterestAt + bankInterestIntervalMs - Date.now()));
}

function bankDeposit() {
    if (!getCurrentAccount()) { openAccountModal('login'); return; }
    const amount = Number(window.prompt('How many tokens would you like to deposit?', '100'));
    if (!Number.isFinite(amount) || amount <= 0) return;
    const wholeAmount = Math.floor(amount);
    if (wholeAmount > gameState.credits) {
        window.alert('You do not have enough wallet tokens.');
        return;
    }
    gameState.credits -= wholeAmount;
    const state = processBankInterest();
    state.balance += wholeAmount;
    saveBankState(state);
    persistTokenBalance();
    updateTokenCounter();
    renderBank();
}

function bankWithdraw() {
    if (!getCurrentAccount()) { openAccountModal('login'); return; }
    const state = processBankInterest();
    const amount = Number(window.prompt(`How many tokens would you like to withdraw? (Available: ${Math.floor(state.balance).toLocaleString()})`, '100'));
    if (!Number.isFinite(amount) || amount <= 0) return;
    const wholeAmount = Math.floor(amount);
    if (wholeAmount > state.balance) {
        window.alert('You do not have enough bank tokens.');
        return;
    }
    state.balance -= wholeAmount;
    gameState.credits += wholeAmount;
    saveBankState(state);
    persistTokenBalance();
    updateTokenCounter();
    renderBank();
}

function startBankRefresh() {
    renderBank();
    if (window.bankRefreshTimer) window.clearInterval(window.bankRefreshTimer);
    window.bankRefreshTimer = window.setInterval(() => {
        if (!document.hidden) renderBank();
    }, 1000);
}


function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[character]));
}

function renderPublicUpdates() {
    const updatesElement = document.querySelector('#public-updates');
    if (!updatesElement) return;
    updatesElement.innerHTML = updateHistory.map((update, index) => `
        <article class="update-card ${index === 0 ? 'is-latest' : ''}">
            <div class="update-card-top"><span class="update-version">${escapeHtml(update.version)}</span>${index === 0 ? '<span class="update-latest">Latest</span>' : ''}</div>
            <h3>${escapeHtml(update.title)}</h3>
            <ul>${update.details.map(detail => `<li>${escapeHtml(detail)}</li>`).join('')}</ul>
        </article>`).join('');
}

function saveUpdate(update) {
    updateHistory = [update, ...updateHistory].slice(0, 30);
    localStorage.setItem(updatesStorageKey, JSON.stringify(updateHistory));
    updateNotice.version = update.version;
    updateNotice.title = `New update: ${update.title}`;
    updateNotice.details = update.details;
    renderPublicUpdates();
}

function getLocalChatMessages() {
    try {
        const savedMessages = JSON.parse(localStorage.getItem(chatStorageKey) || '[]');
        return Array.isArray(savedMessages) ? savedMessages : [];
    } catch (error) {
        return [];
    }
}

async function getChatMessages() {
    try {
        const response = await fetch('/api/chat', { cache: 'no-store' });
        if (!response.ok) throw new Error('Chat API unavailable');
        chatMessagesCache = await response.json();
        return chatMessagesCache;
    } catch (error) {
        chatMessagesCache = getLocalChatMessages();
        return chatMessagesCache;
    }
}

function getBlockedWords() {
    try {
        const words = JSON.parse(localStorage.getItem(blockedWordsStorageKey) || '[]');
        return Array.isArray(words) ? words.filter(word => typeof word === 'string' && word.trim()) : [];
    } catch (error) {
        return [];
    }
}

function containsBlockedWord(message) {
    const normalizedMessage = message.toLowerCase();
    return getBlockedWords().find(word => new RegExp(`(^|\\W)${word.trim().replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}(?=\\W|$)`, 'i').test(normalizedMessage));
}

async function renderChat() {
    const messagesElement = document.querySelector('#chat-messages');
    if (!messagesElement) return;
    const wasNearBottom = messagesElement.scrollHeight - messagesElement.scrollTop - messagesElement.clientHeight < 48;
    const search = document.querySelector('#chat-search')?.value.trim().toLowerCase() || '';
    const messages = (await getChatMessages()).filter(message => {
        const searchableText = `${message.author} ${message.body}`.toLowerCase();
        return !search || searchableText.includes(search);
    });

    const currentAccount = getCurrentAccount();
    messagesElement.innerHTML = messages.length ? messages.map(message => `
        <article class="chat-message">
            <div class="chat-message-meta"><strong>${escapeHtml(message.author)}</strong><span class="chat-message-type">${escapeHtml(message.type)}</span><time>${new Date(message.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time>${currentAccount?.email && message.authorEmail === currentAccount.email ? `<button class="chat-delete" type="button" data-action="delete-own-chat" data-message-id="${escapeHtml(message.id || '')}">Delete</button>` : ''}</div>
            <p>${escapeHtml(message.body)}</p>
        </article>`).join('') : '<p class="chat-empty">No messages yet.</p>';
    if (wasNearBottom || messagesElement.children.length <= 1) messagesElement.scrollTop = messagesElement.scrollHeight;
}

function startChatRefresh() {
    if (chatRefreshTimer || !document.querySelector('#chat-messages')) return;
    chatRefreshTimer = window.setInterval(() => {
        if (!document.hidden) renderChat();
    }, 4000);
}

async function handleChatSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const data = new FormData(form);
    const body = String(data.get('message')).trim();
    if (!body) return;
        const blockedWord = containsBlockedWord(body);
        if (blockedWord) {
            form.querySelector('input[name="message"]')?.focus();
            renderChatNotice(`That message includes a blocked word: ${blockedWord}.`);
            return;
        }
    const currentAccount = getCurrentAccount();
    const message = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        author: currentAccount?.name || 'Guest',
        authorEmail: currentAccount?.email || '',
        body,
        type: String(data.get('type')),
        timestamp: new Date().toISOString()
    };
    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(message)
        });
        if (!response.ok) throw new Error('Chat API unavailable');
    } catch (error) {
        const messages = getLocalChatMessages();
        messages.push(message);
        localStorage.setItem(chatStorageKey, JSON.stringify(messages.slice(-100)));
    }
    form.reset();
    await renderChat();
}

async function publishBigWin(gameName, winnings) {
    if (winnings < bigWinThreshold) return;
    const currentAccount = getCurrentAccount();
    const message = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        author: currentAccount?.name || 'Guest',
        authorEmail: currentAccount?.email || '',
        body: `${currentAccount?.name || 'A player'} won ${winnings.toLocaleString()} credits in ${gameName}!`,
        type: 'win',
        timestamp: new Date().toISOString()
    };
    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(message)
        });
        if (!response.ok) throw new Error('Chat API unavailable');
    } catch (error) {
        const messages = getLocalChatMessages();
        messages.push(message);
        localStorage.setItem(chatStorageKey, JSON.stringify(messages.slice(-100)));
    }
    await renderChat();
}

async function deleteChatMessage(messageId) {
    try {
        const response = await fetch('/api/chat', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: messageId })
        });
        if (!response.ok) throw new Error('Chat API unavailable');
    } catch (error) {
        const messages = getLocalChatMessages().filter(message => message.id !== messageId);
        localStorage.setItem(chatStorageKey, JSON.stringify(messages));
    }
    await getChatMessages();
    const modal = document.querySelector('#admin-modal');
    if (modal) renderAdminDashboard(modal, 'chat', true);
    await renderChat();
}

function renderChatNotice(message) {
    const messagesElement = document.querySelector('#chat-messages');
    if (messagesElement) messagesElement.insertAdjacentHTML('afterbegin', `<p class="chat-notice">${escapeHtml(message)}</p>`);
}

async function saveAccount(account) {
    const response = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(account)
    });
    if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || 'Could not create account');
    }
    const savedAccount = await response.json();
    savePublicAccount(savedAccount);
    localStorage.setItem(currentAccountStorageKey, JSON.stringify({ name: savedAccount.name, email: savedAccount.email, role: savedAccount.role }));
    return savedAccount;
}

async function logoutAccount() {
    try { await fetch('/api/auth/logout', { method: 'POST' }); } catch (error) {}
    localStorage.removeItem(currentAccountStorageKey);
    gameState.credits = 1000;
    updateAccountButtons(null);
}

function showAccountPrompt() {
    if (!getCurrentAccount()) openAccountModal('create', true);
    updateAccountButtons();
}

function openAccountModal(mode = 'create', required = false, message = '') {
    let modal = document.querySelector('#account-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'account-modal';
        modal.className = 'account-modal';
        modal.addEventListener('click', handleAccountClick);
        document.body.appendChild(modal);
    }

    renderAccountModal(modal, mode, required, message);
    modal.classList.add('is-open');
    document.body.classList.add('modal-open');
}

function renderAccountModal(modal, mode, required, message = '') {
    const isCreate = mode === 'create';
    const isManage = mode === 'manage';
    const isReset = mode === 'reset';
    const currentAccount = getCurrentAccount();
    const currentBalance = getSavedAccounts().find(account => account.email === currentAccount?.email)?.tokens ?? gameState.credits;
    modal.innerHTML = `
        <div class="account-dialog" role="dialog" aria-modal="true" aria-labelledby="account-title">
            ${required ? '' : '<button class="account-close" type="button" data-action="close-account" aria-label="Close account dialog">&times;</button>'}
            <span class="game-kicker">Lucky Jackpot account</span>
            <h2 id="account-title">${isCreate ? 'Create your account' : isManage ? 'Manage your credits' : isReset ? 'Reset your password' : 'Welcome back'}</h2>
            <p class="account-intro">${isCreate ? 'Create an account to play. Your password is stored securely on the server.' : isManage ? 'You are signed in. Credit changes are only available through authorized game actions.' : isReset ? 'Request a one-time reset code, then choose a new password.' : 'Sign in securely with your email and password.'}</p>
            <form class="account-form" data-account-mode="${mode}">
                ${isManage ? `<label for="account-tokens">Credit balance</label><input id="account-tokens" name="tokens" type="number" min="0" step="1" value="${escapeHtml(currentBalance)}" required>` : `${isCreate ? '<label for="account-name">Display name</label><input id="account-name" name="name" type="text" autocomplete="name" minlength="2" required>' : ''}<label for="account-email">Email address</label><input id="account-email" name="email" type="email" autocomplete="email" required>${isReset ? '<label for="reset-token">Reset code</label><input id="reset-token" name="resetToken" type="text" autocomplete="one-time-code" placeholder="Paste the reset code">' : ''}<label for="account-password">${isReset ? 'New password' : 'Password'}</label><input id="account-password" name="password" type="password" autocomplete="new-password" minlength="10" ${isReset ? '' : 'required'}>`}
                ${isCreate ? '<label class="account-consent"><input name="terms" type="checkbox" required> I agree to the <a href="terms.html" target="_blank" rel="noopener">Terms of Service</a> and acknowledge the <a href="privacy.html" target="_blank" rel="noopener">Privacy Policy</a>.</label>' : ''}
                <p class="account-message" aria-live="polite">${message || (isCreate ? 'Use at least 10 characters. Never reuse a password from another service.' : isReset ? 'Enter your email, reset code, and a new password.' : '')}</p>
                <button class="game-action" type="submit">${isCreate ? 'Create account' : isManage ? 'Sign out' : isReset ? 'Request reset code' : 'Log in'}</button>
            </form>
            ${isManage ? '' : isReset ? '<button class="account-switch" type="button" data-action="switch-login">Back to log in</button>' : `<button class="account-switch" type="button" data-action="switch-account">${isCreate ? 'Already have an account? Log in' : 'Need an account? Create one.'}</button>${!isCreate ? '<button class="account-switch" type="button" data-action="switch-reset">Forgot password?</button>' : ''}`}
        </div>`;
    modal.dataset.required = required ? 'true' : 'false';
}

function handleAccountClick(event) {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'close-account' && event.currentTarget.dataset.required !== 'true') closeAccountModal();
    if (action === 'switch-reset') { openAccountModal('reset', false); return; }
    if (action === 'switch-login') { openAccountModal('login', false); return; }
    if (action === 'switch-account') {
        const form = event.currentTarget.querySelector('.account-form');
        const required = event.currentTarget.dataset.required === 'true';
        openAccountModal(form?.dataset.accountMode === 'create' ? 'login' : 'create', required);
    }
}

async function handleAccountSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const modal = form.closest('.account-modal');
    const data = new FormData(form);
    const email = String(data.get('email')).trim().toLowerCase();
    const password = String(data.get('password'));
    let account;

    if (form.dataset.accountMode === 'reset') {
        const resetToken = String(data.get('resetToken') || '').trim();
        try {
            const endpoint = resetToken ? '/api/auth/reset' : '/api/auth/reset-request';
            const payload = resetToken ? { email, token: resetToken, password } : { email };
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(result.error || 'Could not reset password');
            if (!resetToken) {
                const demoCode = result.demoResetToken ? ` Demo reset code: ${result.demoResetToken}` : '';
                renderAccountModal(modal, 'reset', false, `${result.message || 'Check your email for a reset code.'}${demoCode}`);
                return;
            }
            renderAccountModal(modal, 'login', false, 'Password reset successfully. Log in with your new password.');
        } catch (error) {
            renderAccountModal(modal, 'reset', false, error.message);
        }
        return;
    }

    if (form.dataset.accountMode === 'manage') {
        await logoutAccount();
        closeAccountModal();
        return;
    }

    if (form.dataset.accountMode === 'create') {
        const name = String(data.get('name')).trim();
        try {
            account = await saveAccount({ name, email, password, termsAcceptedAt: new Date().toISOString() });
        } catch (error) {
            renderAccountModal(modal, 'create', modal.dataset.required === 'true', error.message);
            return;
        }
        gameState.credits = getAccountTokens(account);
    } else {
        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(result.error || 'Email or password is incorrect.');
            account = result;
            savePublicAccount(account);
            localStorage.setItem(currentAccountStorageKey, JSON.stringify({ name: account.name, email: account.email, role: account.role }));
            gameState.credits = getAccountTokens(account);
        } catch (error) {
            renderAccountModal(modal, 'login', false, error.message);
            return;
        }
    }

    closeAccountModal();
    updateAccountButtons(account);
    updateCreditCounter();
    updatePresence();
}

function closeAccountModal() {
    document.querySelector('#account-modal')?.classList.remove('is-open');
    if (!document.querySelector('.game-modal.is-open') && !document.querySelector('.update-modal.is-open')) {
        document.body.classList.remove('modal-open');
    }
}

function updateAccountButtons(account = getCurrentAccount()) {
    const signupButton = document.querySelector('.btn-signup');
    if (signupButton && account) signupButton.textContent = account.name;
}

function getGameAvailability() {
    try {
        return { ...defaultGameAvailability, ...JSON.parse(localStorage.getItem(gameAvailabilityStorageKey) || '{}') };
    } catch (error) {
        return { ...defaultGameAvailability };
    }
}

function setGameAvailability(game, isOpen) {
    const availability = getGameAvailability();
    availability[game] = isOpen;
    localStorage.setItem(gameAvailabilityStorageKey, JSON.stringify(availability));
}

function applyGameAvailability() {
    const availability = getGameAvailability();
    document.querySelectorAll('.btn-play').forEach(button => {
        const isOpen = availability[button.dataset.game] !== false;
        button.disabled = !isOpen;
        button.textContent = isOpen ? 'Play Now' : 'Closed';
        button.setAttribute('aria-disabled', String(!isOpen));
        button.closest('.game-card')?.classList.toggle('game-closed', !isOpen);
    });
}

async function openAdminPanel() {
    let modal = document.querySelector('#admin-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'admin-modal';
        modal.className = 'admin-modal';
        modal.addEventListener('click', handleAdminClick);
        document.body.appendChild(modal);
    }

    const currentAccount = getCurrentAccount();
    const accounts = await getSharedAccounts();
    const account = accounts.find(savedAccount => savedAccount.email === currentAccount?.email);
    if (account?.isAdmin) {
        adminSession = true;
        renderAdminDashboard(modal);
    } else {
        renderAdminAccessDenied(modal);
    }
    modal.classList.add('is-open');
    document.body.classList.add('modal-open');
}

function renderAdminAccessDenied(modal) {
    modal.innerHTML = `
        <div class="admin-dialog" role="dialog" aria-modal="true" aria-labelledby="admin-title">
            <button class="account-close" type="button" data-action="close-admin" aria-label="Close admin panel">&times;</button>
            <span class="game-kicker">Private area</span>
            <h2 id="admin-title">Admin access required</h2>
            <p class="account-intro">This account has not been approved for admin access.</p>
        </div>`;
}

async function renderAdminDashboard(modal, activeTab = 'overview', messagesLoaded = false, accountsLoaded = false) {
    const accounts = accountsLoaded ? getSavedAccounts() : await getSharedAccounts();
    const savedCurrentAccount = getCurrentAccount();
    const currentAccount = accounts.find(account => account.email === savedCurrentAccount?.email) || savedCurrentAccount;
    const totalTokens = accounts.reduce((total, account) => total + getAccountTokens(account), 0);
    modal.innerHTML = `
        <div class="admin-dialog admin-dashboard" role="dialog" aria-modal="true" aria-labelledby="admin-title">
            <button class="account-close" type="button" data-action="close-admin" aria-label="Close admin panel">&times;</button>
            <div class="admin-header">
                <div>
                    <span class="game-kicker">Private area</span>
                    <h2 id="admin-title">Admin panel</h2>
                    <p class="admin-subtitle">A live view of accounts and token balances.</p>
                </div>
                <span class="admin-badge"><i></i> Protected</span>
            </div>
            <div class="admin-tabs" role="tablist" aria-label="Admin sections">
                <button class="admin-tab ${activeTab === 'overview' ? 'is-active' : ''}" type="button" role="tab" aria-selected="${activeTab === 'overview'}" data-action="admin-tab" data-tab="overview">Overview</button>
                <button class="admin-tab ${activeTab === 'accounts' ? 'is-active' : ''}" type="button" role="tab" aria-selected="${activeTab === 'accounts'}" data-action="admin-tab" data-tab="accounts">Accounts</button>
                <button class="admin-tab ${activeTab === 'games' ? 'is-active' : ''}" type="button" role="tab" aria-selected="${activeTab === 'games'}" data-action="admin-tab" data-tab="games">Games</button>
                <button class="admin-tab ${activeTab === 'updates' ? 'is-active' : ''}" type="button" role="tab" aria-selected="${activeTab === 'updates'}" data-action="admin-tab" data-tab="updates">Updates</button>
                <button class="admin-tab ${activeTab === 'support' ? 'is-active' : ''}" type="button" role="tab" aria-selected="${activeTab === 'support'}" data-action="admin-tab" data-tab="support">Support</button>
                <button class="admin-tab ${activeTab === 'chat' ? 'is-active' : ''}" type="button" role="tab" aria-selected="${activeTab === 'chat'}" data-action="admin-tab" data-tab="chat">Chat</button>
            </div>
            <div class="admin-tab-panel">${adminTabContent(activeTab, accounts, currentAccount, totalTokens)}</div>
            <div class="admin-actions">
                <button class="game-action" type="button" data-action="logout-admin">Lock panel</button>
                <button class="account-switch" type="button" data-action="close-admin">Close</button>
            </div>
        </div>`;
    if (activeTab === 'chat' && !messagesLoaded) {
        getChatMessages().then(() => renderAdminDashboard(modal, 'chat', true));
    }
}

function adminTabContent(activeTab, accounts, currentAccount, totalTokens) {
    if (activeTab === 'accounts') {
        const canManageRoles = currentAccount?.role === 'owner' || (!currentAccount?.role && currentAccount?.isAdmin);
        const canMute = canManageRoles || currentAccount?.role === 'moderator' || currentAccount?.isAdmin;
        return `
            <div class="admin-section-heading"><h3>All accounts</h3><span>${accounts.length} total</span></div>
            <div class="admin-account-list">${accounts.length ? `<div class="admin-account admin-account-header"><span>PLAYER</span><span>ACTIVITY / ACCESS</span></div>${accounts.map(account => { const isOnline = account.lastSeenAt && Date.now() - new Date(account.lastSeenAt).getTime() <= presenceOnlineWindow; const lastSeen = account.lastSeenAt ? new Date(account.lastSeenAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'Never'; const tokenBalance = getAccountTokens(account); return `<div class="admin-account"><div class="admin-account-identity"><span class="admin-avatar">${escapeHtml(account.name).charAt(0).toUpperCase()}</span><div><strong>${escapeHtml(account.name)}</strong><span>${escapeHtml(account.email)}</span><span class="admin-presence ${isOnline ? 'is-online' : ''}"><i></i>${isOnline ? 'Online now' : `Last on ${escapeHtml(lastSeen)}`}</span></div></div><div class="admin-account-controls">${canManageRoles ? `<select class="admin-role-select" data-action="set-admin-role" data-email="${escapeHtml(account.email)}" aria-label="Admin role for ${escapeHtml(account.name)}"><option value="player" ${account.role === 'player' || (!account.role && !account.isAdmin) ? 'selected' : ''}>Player</option><option value="moderator" ${account.role === 'moderator' || (!account.role && account.isAdmin) ? 'selected' : ''}>Moderator</option><option value="owner" ${account.role === 'owner' ? 'selected' : ''}>Owner</option></select>` : `<span class="admin-role-label">${escapeHtml(account.role || (account.isAdmin ? 'moderator' : 'player'))}</span>`}${canMute && account.email !== currentAccount?.email ? `<button class="admin-game-toggle ${account.mutedUntil && new Date(account.mutedUntil).getTime() > Date.now() ? 'is-open' : 'is-close'}" type="button" data-action="toggle-mute" data-email="${escapeHtml(account.email)}">${account.mutedUntil && new Date(account.mutedUntil).getTime() > Date.now() ? 'Unmute' : 'Mute'}</button>` : ''}<div class="admin-token-box"><label>Tokens</label><div><input class="admin-token-input" type="number" min="0" step="10" value="${tokenBalance}" data-email="${escapeHtml(account.email)}" aria-label="Token balance for ${escapeHtml(account.name)}"><button class="admin-game-toggle is-open" type="button" data-action="set-tokens" data-email="${escapeHtml(account.email)}">Apply</button></div></div></div></div>`; }).join('')}` : '<p class="account-intro">No accounts have been created yet.</p>'}</div>`;
    }

    if (activeTab === 'updates') {
        return `
            <div class="admin-section-heading"><h3>Publish an update</h3><span>${updateHistory.length} releases</span></div>
            <form class="admin-form admin-update-form">
                <label for="admin-update-version">Version</label>
                <input id="admin-update-version" name="version" type="text" maxlength="80" placeholder="2026.09.16-new-feature" required>
                <label for="admin-update-title">Title</label>
                <input id="admin-update-title" name="title" type="text" maxlength="120" placeholder="What changed?" required>
                <label for="admin-update-details">Details</label>
                <textarea id="admin-update-details" name="details" rows="4" maxlength="1000" placeholder="Add one detail per line." required></textarea>
                <button class="admin-game-toggle is-open" type="submit">Publish update</button>
            </form>
            <div class="admin-section-heading"><h3>Update history</h3><span>Public release notes</span></div>
            <div class="admin-update-list">${updateHistory.map(update => `<div class="admin-update-card"><span class="admin-update-icon">&#9733;</span><div><strong>${escapeHtml(update.title)}</strong><span class="admin-update-version">${escapeHtml(update.version)}</span><p>${update.details.map(detail => escapeHtml(detail)).join(' ')}</p></div></div>`).join('')}</div>`;
    }

    if (activeTab === 'support') {
        const tickets = getSupportTickets();
        const canManageSupport = currentAccount?.role === 'owner' || currentAccount?.role === 'moderator' || currentAccount?.isAdmin;
        return `
            <div class="admin-section-heading"><h3>Support requests</h3><span>${tickets.length} total</span></div>
            <div class="admin-ticket-list">${tickets.length ? tickets.map(ticket => `<div class="admin-ticket-card ${ticket.status === 'resolved' ? 'is-resolved' : ''}"><div class="admin-ticket-head"><div><strong>${escapeHtml(ticket.subject || 'Support request')}</strong><span>${escapeHtml(ticket.name || 'Guest')} · ${escapeHtml(ticket.email || 'No email')}</span></div><span class="admin-ticket-status ${ticket.status === 'resolved' ? 'is-resolved' : 'is-open'}">${ticket.status === 'resolved' ? 'Resolved' : 'Open'}</span></div><p>${escapeHtml(ticket.message || 'No details provided.')}</p><small>${new Date(ticket.createdAt || Date.now()).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</small>${canManageSupport ? `<button class="admin-game-toggle ${ticket.status === 'resolved' ? 'is-close' : 'is-open'}" type="button" data-action="toggle-support-status" data-ticket-id="${escapeHtml(ticket.id || '')}">${ticket.status === 'resolved' ? 'Reopen' : 'Resolve'}</button>` : ''}</div>`).join('') : '<p class="account-intro">No support tickets have been submitted yet.</p>'}</div>`;
    }

    if (activeTab === 'chat') {
        const blockedWords = getBlockedWords();
        return `
            <div class="admin-section-heading"><h3>Chat filter</h3><span>${blockedWords.length} blocked</span></div>
            <form class="admin-blocked-word-form">
                <label for="blocked-chat-word">Add a blocked word</label>
                <div><input id="blocked-chat-word" name="word" type="text" maxlength="40" required><button class="admin-game-toggle is-open" type="submit">Add word</button></div>
            </form>
            <div class="admin-blocked-word-list">${blockedWords.length ? blockedWords.map(word => `<div class="admin-blocked-word"><span>${escapeHtml(word)}</span><button class="admin-game-toggle is-close" type="button" data-action="remove-blocked-word" data-word="${escapeHtml(word)}">Remove</button></div>`).join('') : '<p class="account-intro">No blocked words have been added.</p>'}</div>
            <div class="admin-section-heading"><h3>Player messages</h3><span>${chatMessagesCache.length} saved</span></div>
            <div class="admin-chat-message-list">${chatMessagesCache.length ? chatMessagesCache.slice().reverse().map(message => `<div class="admin-chat-message"><div><strong>${escapeHtml(message.author)}</strong><p>${escapeHtml(message.body)}</p></div><button class="admin-game-toggle is-close" type="button" data-action="delete-chat" data-message-id="${escapeHtml(message.id || '')}">Delete</button></div>`).join('') : '<p class="account-intro">No chat messages have been posted.</p>'}</div>`;
    }

    if (activeTab === 'games') {
        const availability = getGameAvailability();
        const gameNames = { slots: 'Slots', poker: 'Poker', dice: 'Dice', roulette: 'Roulette', blackjack: 'Blackjack', coinflip: 'Coin Flip', keno: 'Keno', baccarat: 'Baccarat', jackpot: 'Lucky Jackpot' };
        return `
            <div class="admin-section-heading"><h3>Game availability</h3><span>Close a broken game</span></div>
            <div class="admin-game-list">${Object.entries(gameNames).map(([game, name]) => {
                const isOpen = availability[game] !== false;
                return `<div class="admin-game-row"><div><strong>${name}</strong><span class="admin-game-status ${isOpen ? 'is-open' : 'is-closed'}">${isOpen ? 'Open to players' : 'Closed'}</span></div><button class="admin-game-toggle ${isOpen ? 'is-close' : 'is-open'}" type="button" data-action="toggle-game" data-game="${game}">${isOpen ? 'Close game' : 'Open game'}</button></div>`;
            }).join('')}</div>
            <div class="admin-jackpot-control"><div><strong>Jackpot control</strong><span>Pool: ${gameState.jackpotPool.toLocaleString()} credits</span><p>${escapeHtml(gameState.jackpotLastRoll)}</p></div><div class="admin-jackpot-actions"><label for="admin-jackpot-amount">Set prize pool</label><div><input id="admin-jackpot-amount" type="number" min="100" step="50" value="${gameState.jackpotPool}" aria-label="Jackpot prize pool amount"><button class="admin-game-toggle is-open" type="button" data-action="set-jackpot">Set amount</button></div><button class="admin-game-toggle is-open" type="button" data-action="force-jackpot">Force jackpot roll</button></div></div>`;
    }

    return `
        <div class="admin-stats">
            <div><strong>${accounts.length}</strong><span>Saved accounts</span></div>
            <div><strong>${currentAccount ? 'Active' : 'None'}</strong><span>Current session</span></div>
            <div><strong>${totalTokens.toLocaleString()}</strong><span>Total tokens</span></div>
        </div>
        <div class="admin-overview-note"><span class="admin-overview-dot"></span><div><strong>System is running normally</strong><p>Account balances are stored locally for this demo.</p></div></div>`;
}

async function handleAdminClick(event) {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (event.target === event.currentTarget || action === 'close-admin') closeAdminPanel();
    if (action === 'admin-tab') renderAdminDashboard(event.currentTarget, event.target.closest('[data-tab]').dataset.tab);
    if (action === 'toggle-game') {
        const game = event.target.closest('[data-game]').dataset.game;
        const isOpen = getGameAvailability()[game] !== false;
        setGameAvailability(game, !isOpen);
        applyGameAvailability();
        renderAdminDashboard(event.currentTarget, 'games');
    }
    if (action === 'toggle-mute') {
        const email = event.target.closest('[data-email]')?.dataset.email;
        const account = (await getSharedAccounts()).find(savedAccount => savedAccount.email === email);
        const isMuted = account?.mutedUntil && new Date(account.mutedUntil).getTime() > Date.now();
        if (account) await updateAccountPermission(email, { mutedUntil: isMuted ? null : new Date(Date.now() + 10 * 60 * 1000).toISOString() });
        renderAdminDashboard(event.currentTarget, 'accounts');
    }
    if (action === 'set-tokens') {
        const email = event.target.closest('[data-email]')?.dataset.email;
        const amountInput = event.currentTarget.querySelector(`.admin-token-input[data-email="${CSS.escape(email || '')}"]`);
        const nextAmount = Number(amountInput?.value ?? 0);
        if (email && Number.isFinite(nextAmount)) {
            await updateAccountPermission(email, { tokens: Math.max(0, Math.round(nextAmount)) });
        }
        renderAdminDashboard(event.currentTarget, 'accounts');
    }
    if (action === 'toggle-support-status') {
        const ticketId = event.target.closest('[data-ticket-id]')?.dataset.ticketId;
        const ticket = getSupportTickets().find(item => item.id === ticketId);
        if (ticketId && ticket) {
            updateSupportTicketStatus(ticketId, ticket.status === 'resolved' ? 'open' : 'resolved');
            renderAdminDashboard(event.currentTarget, 'support');
        }
    }
    if (action === 'force-jackpot') {
        forceJackpotRoll();
        renderAdminDashboard(event.currentTarget, 'games');
    }
    if (action === 'delete-chat') {
        const messageId = event.target.closest('[data-message-id]')?.dataset.messageId;
        if (messageId) deleteChatMessage(messageId);
    }
    if (action === 'remove-blocked-word') {
        const wordToRemove = event.target.closest('[data-word]')?.dataset.word;
        const words = getBlockedWords().filter(word => word.toLowerCase() !== wordToRemove?.toLowerCase());
        localStorage.setItem(blockedWordsStorageKey, JSON.stringify(words));
        renderAdminDashboard(event.currentTarget, 'chat', true);
    }
    if (action === 'set-jackpot') {
        const amount = Number(event.currentTarget.querySelector('#admin-jackpot-amount')?.value);
        if (Number.isFinite(amount) && amount >= 100) {
            gameState.jackpotPool = Math.floor(amount);
            localStorage.setItem(jackpotPoolStorageKey, String(gameState.jackpotPool));
            gameState.jackpotLastRoll = `Admin set the jackpot pool to ${gameState.jackpotPool.toLocaleString()} credits.`;
        }
        renderAdminDashboard(event.currentTarget, 'games');
    }
    if (action === 'logout-admin') {
        adminSession = false;
        closeAdminPanel();
    }
}

async function updateAccountPermission(email, changes) {
    await fetch('/api/accounts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, ...changes })
    });
}

async function updateOwnTokenBalance(email, tokens) {
    try {
        const response = await fetch('/api/accounts', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, tokens })
        });
        if (!response.ok) throw new Error('Accounts API unavailable');
        const updatedAccount = await response.json();
        const accounts = getSavedAccounts();
        const accountIndex = accounts.findIndex(savedAccount => savedAccount.email === email);
        if (accountIndex >= 0) accounts[accountIndex] = { ...accounts[accountIndex], ...updatedAccount };
        else accounts.push(updatedAccount);
        localStorage.setItem(accountStorageKey, JSON.stringify(accounts));
    } catch (error) {
        const accounts = getSavedAccounts();
        const account = accounts.find(savedAccount => savedAccount.email === email);
        if (!account) throw error;
        account.tokens = tokens;
        localStorage.setItem(accountStorageKey, JSON.stringify(accounts));
    }
}

function handleBlockedWordSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const word = String(new FormData(form).get('word')).trim().toLowerCase();
    if (!word) return;
    const words = getBlockedWords();
    if (!words.some(existingWord => existingWord.toLowerCase() === word)) words.push(word);
    localStorage.setItem(blockedWordsStorageKey, JSON.stringify(words.slice(0, 100)));
    renderAdminDashboard(form.closest('.admin-modal'), 'chat');
}

function handleUpdateSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const formData = new FormData(form);
    const details = String(formData.get('details') || '')
        .split('\n')
        .map(detail => detail.trim())
        .filter(Boolean)
        .slice(0, 10);
    const update = {
        version: String(formData.get('version') || '').trim().slice(0, 80),
        title: String(formData.get('title') || '').trim().slice(0, 120),
        details
    };
    if (!update.version || !update.title || !details.length) return;
    saveUpdate(update);
    form.reset();
    renderAdminDashboard(form.closest('.admin-modal'), 'updates');
    showUpdateNotice();
}

function handleSupportSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const formData = new FormData(form);
    const currentAccount = getCurrentAccount();
    const ticket = {
        id: `ticket-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        name: String(formData.get('support-name') || currentAccount?.name || 'Guest').trim().slice(0, 60) || 'Guest',
        email: String(formData.get('support-email') || currentAccount?.email || '').trim().slice(0, 160),
        subject: String(formData.get('support-subject') || 'General support').trim().slice(0, 120),
        message: String(formData.get('support-message') || '').trim().slice(0, 1000),
        status: 'open',
        createdAt: new Date().toISOString()
    };

    if (!ticket.message) return;
    saveSupportTicket(ticket);
    form.reset();
    alert('Your support ticket has been submitted. A staff member will review it soon.');
}

function closeAdminPanel() {
    document.querySelector('#admin-modal')?.classList.remove('is-open');
    if (!document.querySelector('.game-modal.is-open') && !document.querySelector('.account-modal.is-open') && !document.querySelector('.update-modal.is-open')) {
        document.body.classList.remove('modal-open');
    }
}

// Use delegated clicks so game buttons keep working even when parts of the page are
// rendered dynamically or an optional startup feature fails.
document.addEventListener('click', event => {
    const button = event.target.closest('.btn-play');
    if (button) {
        event.preventDefault();
        openGame(button.dataset.game);
    }
});

function openGame(game) {
    if (getGameAvailability()[game] === false) return;
    gameState.game = game;
    let modal = document.querySelector('#game-modal');

    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'game-modal';
        modal.className = 'game-modal';
        modal.addEventListener('click', handleGameClick);
        document.body.appendChild(modal);
    }

    renderGame();
    modal.classList.add('is-open');
    document.body.classList.add('modal-open');
}

function closeGame() {
    document.querySelector('#game-modal')?.classList.remove('is-open');
    document.body.classList.remove('modal-open');
}

function renderGame(message = 'Demo credits only. No real money is used.') {
    const modal = document.querySelector('#game-modal');
    if (!modal) return;

    const titles = {
        slots: 'Lucky Slots',
        roulette: 'Roulette',
        dice: 'High Roller Dice',
        poker: 'Five Card Poker',
        blackjack: 'Blackjack',
        coinflip: 'Coin Flip',
        keno: 'Keno',
        baccarat: 'Baccarat',
        jackpot: 'Lucky Jackpot'
    };

    modal.innerHTML = `
        <div class="game-dialog" role="dialog" aria-modal="true" aria-labelledby="game-title">
            <button class="game-close" type="button" data-action="close" aria-label="Close game">&times;</button>
            <div class="game-dialog-header">
                <div>
                    <span class="game-kicker">Play money demo</span>
                    <h2 id="game-title">${titles[gameState.game]}</h2>
                </div>
                <div class="credit-counter">Credits <strong>${gameState.credits}</strong></div>
            </div>
            <label class="bet-control" for="game-bet">Bet tokens
                <input id="game-bet" type="number" min="1" max="${Math.max(1, gameState.credits)}" step="1" value="${Math.min(gameState.currentBet, Math.max(1, gameState.credits))}">
            </label>
            <div class="game-board">${gameMarkup()}</div>
            <p class="game-message" aria-live="polite">${message}</p>
        </div>`;
}

function gameMarkup() {
    if (gameState.game === 'slots') {
        return `
            <div class="slot-reels">${gameState.slots.map(symbol => `<span>${symbol}</span>`).join('')}</div>
            <p class="game-help">Match two symbols to win 25 credits. Match all three to win 100.</p>
            <button class="game-action" type="button" data-action="spin-slots">Spin</button>`;
    }

    if (gameState.game === 'roulette') {
        return `
            <div class="roulette-number" data-roulette-number>${gameState.rouletteResult ?? '?'}</div>
            <label class="game-label" for="roulette-number-guess">Guess an exact number</label>
            <select class="game-select" id="roulette-number-guess">
                <option value="">No exact number</option>
                ${Array.from({ length: 37 }, (_, number) => `<option value="${number}">${number}</option>`).join('')}
            </select>
            <label class="game-label" for="roulette-bet">Or bet on a color</label>
            <select class="game-select" id="roulette-bet">
                <option value="red">Red</option>
                <option value="black">Black</option>
                <option value="green">Green (0)</option>
            </select>
            <p class="game-help">Exact number wins 350 credits. A correct color wins 20.</p>
            <button class="game-action" type="button" data-action="spin-roulette">Spin</button>`;
    }

    if (gameState.game === 'dice') {
        return `
            <div class="dice-result"><span>?</span><span>?</span></div>
            <label class="game-label" for="dice-bet">Choose your call</label>
            <select class="game-select" id="dice-bet">
                <option value="high">High (8-12)</option>
                <option value="low">Low (2-6)</option>
                <option value="even">Even total</option>
                <option value="odd">Odd total</option>
            </select>
            <button class="game-action" type="button" data-action="roll-dice">Roll</button>`;
    }

    if (gameState.game === 'blackjack') {
        return `
            <div class="blackjack-table">
                <div><span class="game-label">Dealer</span><div class="poker-hand">${formatBlackjackHand(gameState.blackjackDealer, gameState.blackjackInProgress)}</div></div>
                <div><span class="game-label">You</span><div class="poker-hand">${formatBlackjackHand(gameState.blackjackHand)}</div></div>
            </div>
            <p class="game-help">Get closer to 21 than the dealer to win 40 credits.</p>
            ${gameState.blackjackInProgress ? '<div class="game-actions"><button class="game-action" type="button" data-action="hit-blackjack">Hit</button><button class="game-action" type="button" data-action="stand-blackjack">Stand</button></div>' : '<button class="game-action" type="button" data-action="deal-blackjack">Deal hand</button>'}`;
    }

    if (gameState.game === 'coinflip') {
        return `
            <div class="coin-result ${gameState.coinResult ? 'has-result' : ''}">${gameState.coinResult || '?'}</div>
            <label class="game-label" for="coin-choice">Choose a side</label>
            <select class="game-select" id="coin-choice">
                <option value="Heads">Heads</option>
                <option value="Tails">Tails</option>
            </select>
            <button class="game-action" type="button" data-action="flip-coin">Flip</button>`;
    }

    if (gameState.game === 'keno') {
        const selectedNumbers = new Set(gameState.kenoNumbers);
        return `
            <div class="number-grid">${Array.from({ length: 20 }, (_, index) => {
                const number = index + 1;
                return `<button class="number-choice ${selectedNumbers.has(number) ? 'is-selected' : ''}" type="button" data-action="toggle-keno-number" data-number="${number}" aria-pressed="${selectedNumbers.has(number)}">${number}</button>`;
            }).join('')}</div>
            <p class="game-help">Choose six numbers. Match four or more to win up to 120 credits.</p>
            <button class="game-action" type="button" data-action="draw-keno" ${gameState.kenoNumbers.length !== 6 ? 'disabled' : ''}>Draw</button>`;
    }

    if (gameState.game === 'baccarat') {
        const result = gameState.baccaratResult;
        return `
            <div class="baccarat-table">
                <div><span class="game-label">Player</span><strong>${result ? result.player : '?'}</strong></div>
                <div><span class="game-label">Banker</span><strong>${result ? result.banker : '?'}</strong></div>
            </div>
            <label class="game-label" for="baccarat-bet">Choose your side</label>
            <select class="game-select" id="baccarat-bet">
                <option value="player">Player</option>
                <option value="banker">Banker</option>
                <option value="tie">Tie</option>
            </select>
            <p class="game-help">Player and Banker pay 20 credits. A tie pays 90.</p>
            <button class="game-action" type="button" data-action="deal-baccarat">Deal hand</button>`;
    }

    if (gameState.game === 'jackpot') {
        const jackpotEntries = getJackpotEntryCount();
        return `
            <div class="jackpot-pool"><span>Current prize pool</span><strong>${gameState.jackpotPool.toLocaleString()} credits</strong><small>${escapeHtml(gameState.jackpotLastRoll)}</small></div>
            <p class="game-help">Choose your entry amount. Every entry adds to the community prize pool.</p>
            <p class="jackpot-entries">Entries used: ${jackpotEntries}/${jackpotEntryLimit}</p>
            <button class="game-action" type="button" data-action="enter-jackpot" ${jackpotEntries >= jackpotEntryLimit ? 'disabled' : ''}>${jackpotEntries >= jackpotEntryLimit ? 'Entry limit reached' : 'Enter draw'}</button>`;
    }

    return `
        <div class="poker-hand">${gameState.pokerHand.length ? gameState.pokerHand.map(card => `<span class="playing-card ${card.suit === '♥' || card.suit === '♦' ? 'red-card' : ''}">${card.rank}<b>${card.suit}</b></span>`).join('') : '<span class="card-placeholder">Deal five cards</span>'}</div>
        <p class="game-help">A pair or better wins 50 credits.</p>
        <button class="game-action" type="button" data-action="deal-poker">Deal hand</button>`;
}

function forceJackpotRoll() {
    gameState.jackpotLastRoll = `Admin force-rolled the jackpot at ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`;
    gameState.jackpotPool = 1000;
    localStorage.setItem(jackpotPoolStorageKey, String(gameState.jackpotPool));
}

function handleGameClick(event) {
    if (event.target === event.currentTarget || event.target.closest('[data-action="close"]')) {
        closeGame();
        return;
    }

    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'spin-slots') spinSlots();
    if (action === 'spin-roulette') spinRoulette();
    if (action === 'roll-dice') rollDice();
    if (action === 'deal-poker') dealPoker();
    if (action === 'deal-blackjack') dealBlackjack();
    if (action === 'hit-blackjack') hitBlackjack();
    if (action === 'stand-blackjack') standBlackjack();
    if (action === 'flip-coin') flipCoin();
    if (action === 'toggle-keno-number') toggleKenoNumber(Number(event.target.closest('[data-number]')?.dataset.number));
    if (action === 'draw-keno') drawKeno();
    if (action === 'deal-baccarat') dealBaccarat();
    if (action === 'enter-jackpot') enterJackpot();
}

function canPlay() {
    const requestedBet = Number(document.querySelector('#game-bet')?.value);
    const bet = Number.isInteger(requestedBet) ? requestedBet : 0;
    if (bet < 1 || bet > gameState.credits) {
        renderGame(bet < 1 ? 'Enter a bet of at least 1 token.' : 'Your bet cannot exceed your token balance.');
        return false;
    }
    gameState.currentBet = bet;
    gameState.credits -= bet;
    recordGamePlay(gameState.game, bet);
    updateCreditCounter();
    return true;
}

function getBetPayout(multiplier) {
    return Math.floor(gameState.currentBet * multiplier);
}

function spinSlots() {
    if (!canPlay()) return;
    const symbols = ['🍒', '🍋', '💎', '7️⃣'];
    const finalSlots = Array.from({ length: 3 }, () => symbols[Math.floor(Math.random() * symbols.length)]);
    const reels = [...document.querySelectorAll('.slot-reels span')];
    const spinButton = document.querySelector('[data-action="spin-slots"]');
    let ticks = 0;

    if (!reels.length || !spinButton) return;

    spinButton.disabled = true;
    spinButton.textContent = 'Spinning...';
    document.querySelector('.slot-reels')?.setAttribute('aria-busy', 'true');
    updateGameMessage('The reels are spinning...');

    const spinTimer = setInterval(() => {
        ticks += 1;
        reels.forEach((reel, index) => {
            if (ticks < 9 + index * 3) {
                reel.textContent = symbols[Math.floor(Math.random() * symbols.length)];
            } else {
                reel.textContent = finalSlots[index];
                reel.classList.remove('is-spinning');
            }
        });

        if (ticks === 1) reels.forEach(reel => reel.classList.add('is-spinning'));

        if (ticks >= 15) {
            clearInterval(spinTimer);
            gameState.slots = finalSlots;
            const uniqueSymbols = new Set(finalSlots).size;
            const winnings = uniqueSymbols === 1 ? getBetPayout(10) : uniqueSymbols === 2 ? getBetPayout(2) : 0;
            gameState.credits += winnings;
            publishBigWin('Lucky Slots', winnings);
            spinButton.disabled = false;
            spinButton.textContent = 'Spin';
            document.querySelector('.slot-reels')?.setAttribute('aria-busy', 'false');
            updateCreditCounter();
            updateGameMessage(winnings ? `Nice! You won ${formatWinPayout(winnings)}.` : 'No match this time. Try again.');
        }
    }, 90);
}

function updateGameMessage(message) {
    const messageElement = document.querySelector('.game-message');
    if (messageElement) messageElement.textContent = message;
}

function formatWinPayout(winnings) {
    const multiplier = winnings / gameState.currentBet;
    const formattedMultiplier = Number.isInteger(multiplier) ? multiplier : multiplier.toFixed(1);
    return `${winnings.toLocaleString()} credits (${formattedMultiplier}x multiplier)`;
}

function updateCreditCounter() {
    const creditElement = document.querySelector('.credit-counter strong');
    if (creditElement) creditElement.textContent = gameState.credits;
    updateTokenCounter();
    persistTokenBalance();
}

function updateTokenCounter() {
    const tokenElement = document.querySelector('#token-count');
    if (tokenElement) tokenElement.textContent = gameState.credits.toLocaleString();
}

function getGameHistory() {
    const email = getCurrentAccount()?.email;
    if (!email) return [];
    try {
        const history = JSON.parse(localStorage.getItem(gameHistoryStorageKey) || '{}');
        return Array.isArray(history[email]) ? history[email] : [];
    } catch (error) {
        return [];
    }
}

function recordGamePlay(game, bet, result = 'Played', winnings = 0) {
    const email = getCurrentAccount()?.email;
    if (!email) return;
    try {
        const history = JSON.parse(localStorage.getItem(gameHistoryStorageKey) || '{}');
        const playerHistory = Array.isArray(history[email]) ? history[email] : [];
        playerHistory.unshift({
            id: `play-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            game,
            bet,
            result,
            winnings,
            playedAt: new Date().toISOString()
        });
        history[email] = playerHistory.slice(0, 100);
        localStorage.setItem(gameHistoryStorageKey, JSON.stringify(history));
    } catch (error) {}
}

function initializeUserPage() {
    const historyElement = document.querySelector('#user-game-history');
    if (!historyElement) return;
    const account = getCurrentAccount();
    const nameElement = document.querySelector('#user-name');
    const emailElement = document.querySelector('#user-email');
    const tokenElement = document.querySelector('#user-token-balance');
    const emptyElement = document.querySelector('#user-history-empty');
    if (!account) {
        if (nameElement) nameElement.textContent = 'Sign in to view your profile';
        if (emailElement) emailElement.textContent = 'Your game history is saved per account.';
        if (tokenElement) tokenElement.textContent = '—';
        historyElement.innerHTML = '<p class="user-history-note">Please sign in on the Games page to see your past games.</p>';
        if (emptyElement) emptyElement.hidden = true;
        return;
    }
    if (nameElement) nameElement.textContent = account.name || 'Player';
    if (emailElement) emailElement.textContent = account.email || '';
    const savedAccount = getSavedAccounts().find(item => item.email === account.email);
    if (tokenElement) tokenElement.textContent = getAccountTokens(savedAccount || account).toLocaleString();
    const history = getGameHistory();
    if (!history.length) {
        historyElement.innerHTML = '';
        if (emptyElement) emptyElement.hidden = false;
        return;
    }
    if (emptyElement) emptyElement.hidden = true;
    historyElement.innerHTML = history.map(play => `
        <article class="user-history-row">
            <div><strong>${escapeHtml(play.game)}</strong><span>${new Date(play.playedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span></div>
            <div><span>Bet</span><strong>${Number(play.bet).toLocaleString()} tokens</strong></div>
            <div><span>Result</span><strong>${escapeHtml(play.result)}</strong></div>
            <div><span>Winnings</span><strong class="${Number(play.winnings) > 0 ? 'is-win' : ''}">${Number(play.winnings).toLocaleString()} tokens</strong></div>
        </article>`).join('');
}

function persistTokenBalance() {
    const currentAccount = getCurrentAccount();
    if (!currentAccount) return;
    const accounts = getSavedAccounts();
    const savedAccount = accounts.find(account => account.email === currentAccount.email);
    if (!savedAccount) return;
    savedAccount.tokens = gameState.credits;
    localStorage.setItem(accountStorageKey, JSON.stringify(accounts));
}

function spinRoulette() {
    if (!canPlay()) return;
    const result = Math.floor(Math.random() * 37);
    const color = result === 0 ? 'green' : result % 2 ? 'red' : 'black';
    const guessedNumber = document.querySelector('#roulette-number-guess')?.value;
    const bet = document.querySelector('#roulette-bet')?.value;
    const exactNumberHit = guessedNumber !== '' && Number(guessedNumber) === result;
    const colorHit = bet === color;
    const winnings = exactNumberHit ? getBetPayout(35) : colorHit ? getBetPayout(2) : 0;
    gameState.rouletteResult = result;
    gameState.credits += winnings;
    publishBigWin('Roulette', winnings);
    updateCreditCounter();
    const resultMessage = exactNumberHit ? `Exact hit! You won ${formatWinPayout(winnings)}.` : colorHit ? `The wheel landed on ${result} ${color}. You won ${formatWinPayout(winnings)}.` : `The wheel landed on ${result} ${color}. No win this round.`;
    renderGame(resultMessage);
}

function rollDice() {
    if (!canPlay()) return;
    const first = Math.floor(Math.random() * 6) + 1;
    const second = Math.floor(Math.random() * 6) + 1;
    const total = first + second;
    const bet = document.querySelector('#dice-bet')?.value;
    const dice = [...document.querySelectorAll('.dice-result span')];
    const rollButton = document.querySelector('[data-action="roll-dice"]');
    let ticks = 0;

    if (!dice.length || !rollButton) return;

    rollButton.disabled = true;
    rollButton.textContent = 'Rolling...';
    document.querySelector('.dice-result')?.setAttribute('aria-busy', 'true');
    updateGameMessage('The dice are rolling...');
    dice.forEach(die => die.classList.add('is-rolling'));

    const rollTimer = setInterval(() => {
        ticks += 1;
        if (ticks < 12) {
            dice.forEach(die => {
                die.textContent = Math.floor(Math.random() * 6) + 1;
            });
        } else {
            clearInterval(rollTimer);
            dice[0].textContent = first;
            dice[1].textContent = second;
            dice.forEach(die => die.classList.remove('is-rolling'));
            const won = bet === 'high' ? total >= 8 : bet === 'low' ? total <= 6 : bet === 'even' ? total % 2 === 0 : total % 2 !== 0;
            const winnings = won ? getBetPayout(2) : 0;
            gameState.credits += winnings;
            updateCreditCounter();
            rollButton.disabled = false;
            rollButton.textContent = 'Roll';
            document.querySelector('.dice-result')?.setAttribute('aria-busy', 'false');
            updateGameMessage(`You rolled ${total}. ${won ? `Great call! You won ${formatWinPayout(winnings)}.` : 'That call missed.'}`);
        }
    }, 100);
}

function dealPoker() {
    if (!canPlay()) return;
    const deck = cardSuits.flatMap(suit => cardRanks.map(rank => ({ suit, rank })));
    gameState.pokerHand = deck.sort(() => Math.random() - 0.5).slice(0, 5);
    const counts = gameState.pokerHand.reduce((result, card) => {
        result[card.rank] = (result[card.rank] || 0) + 1;
        return result;
    }, {});
    const hasPair = Object.values(counts).some(count => count > 1);
    const winnings = hasPair ? getBetPayout(5) : 0;
    gameState.credits += winnings;
    publishBigWin('Five Card Poker', winnings);
    updateCreditCounter();
    renderGame(`${hasPair ? `Pair or better! You won ${formatWinPayout(winnings)}.` : 'No pair this hand.'}`);
}

function formatBlackjackHand(hand, hideSecondCard = false) {
    if (!hand.length) return '<span class="card-placeholder">Deal a hand</span>';
    return hand.map((card, index) => hideSecondCard && index === 1 ? '<span class="playing-card hidden-card">?</span>' : `<span class="playing-card ${card.suit === '♥' || card.suit === '♦' ? 'red-card' : ''}">${card.rank}<b>${card.suit}</b></span>`).join('');
}

function getBlackjackValue(hand) {
    let value = hand.reduce((total, card) => total + (card.rank === 'A' ? 11 : ['K', 'Q', 'J'].includes(card.rank) ? 10 : Number(card.rank)), 0);
    let aces = hand.filter(card => card.rank === 'A').length;
    while (value > 21 && aces > 0) {
        value -= 10;
        aces -= 1;
    }
    return value;
}

function createDeck() {
    return cardSuits.flatMap(suit => cardRanks.map(rank => ({ suit, rank })));
}

function dealBlackjack() {
    if (!canPlay()) return;
    gameState.blackjackDeck = createDeck().sort(() => Math.random() - 0.5);
    gameState.blackjackHand = gameState.blackjackDeck.splice(0, 2);
    gameState.blackjackDealer = gameState.blackjackDeck.splice(0, 2);
    gameState.blackjackInProgress = true;
    renderGame('Choose Hit to draw another card or Stand to hold your hand.');
}

function hitBlackjack() {
    if (!gameState.blackjackInProgress || !gameState.blackjackDeck.length) return;
    gameState.blackjackHand.push(gameState.blackjackDeck.pop());
    const playerValue = getBlackjackValue(gameState.blackjackHand);
    if (playerValue > 21) {
        gameState.blackjackInProgress = false;
        renderGame(`You bust with ${playerValue}. The dealer wins.`);
        return;
    }
    renderGame(`You have ${playerValue}. Hit again or stand.`);
}

function standBlackjack() {
    if (!gameState.blackjackInProgress) return;
    while (getBlackjackValue(gameState.blackjackDealer) < 17 && gameState.blackjackDeck.length) {
        gameState.blackjackDealer.push(gameState.blackjackDeck.pop());
    }

    const playerValue = getBlackjackValue(gameState.blackjackHand);
    const dealerValue = getBlackjackValue(gameState.blackjackDealer);
    const playerWins = dealerValue > 21 || playerValue > dealerValue;
    const tie = playerValue === dealerValue;
    const winnings = playerWins ? getBetPayout(4) : tie ? gameState.currentBet : 0;
    gameState.blackjackInProgress = false;
    gameState.credits += winnings;
    updateCreditCounter();
    renderGame(playerWins ? `You have ${playerValue}. You won ${formatWinPayout(winnings)}!` : tie ? `Both hands are ${playerValue}. Your ${gameState.currentBet}-token stake is returned.` : `The dealer wins with ${dealerValue}. Your hand was ${playerValue}.`);
}

function flipCoin() {
    if (!canPlay()) return;
    const choice = document.querySelector('#coin-choice')?.value;
    const result = Math.random() < 0.5 ? 'Heads' : 'Tails';
    const won = choice === result;
    gameState.coinResult = result;
    const winnings = won ? getBetPayout(2) : 0;
    gameState.credits += winnings;
    updateCreditCounter();
    renderGame(`${result}! ${won ? `You won ${formatWinPayout(winnings)}.` : 'Your call missed.'}`);
}

function toggleKenoNumber(number) {
    if (!Number.isInteger(number) || number < 1 || number > 20) return;
    const selectedNumbers = new Set(gameState.kenoNumbers);
    if (selectedNumbers.has(number)) {
        selectedNumbers.delete(number);
    } else if (selectedNumbers.size < 6) {
        selectedNumbers.add(number);
    }
    gameState.kenoNumbers = [...selectedNumbers].sort((first, second) => first - second);
    renderGame('Select six numbers, then draw.');
}

function drawKeno() {
    if (gameState.kenoNumbers.length !== 6 || !canPlay()) return;
    const draw = Array.from({ length: 20 }, (_, index) => index + 1).sort(() => Math.random() - 0.5).slice(0, 6).sort((first, second) => first - second);
    const hits = gameState.kenoNumbers.filter(number => draw.includes(number)).length;
    const winnings = hits === 6 ? getBetPayout(12) : hits === 5 ? getBetPayout(6) : hits === 4 ? getBetPayout(2.5) : 0;
    gameState.kenoDraw = draw;
    gameState.credits += winnings;
    updateCreditCounter();
    publishBigWin('Keno', winnings);
    renderGame(`${draw.join(', ')} drawn. ${hits ? `${hits} matches! You won ${formatWinPayout(winnings)}.` : 'No matches this time.'}`);
}

function dealBaccarat() {
    if (!canPlay()) return;
    const player = Math.floor(Math.random() * 10) + Math.floor(Math.random() * 10);
    const banker = Math.floor(Math.random() * 10) + Math.floor(Math.random() * 10);
    const playerTotal = player % 10;
    const bankerTotal = banker % 10;
    const winner = playerTotal === bankerTotal ? 'tie' : playerTotal > bankerTotal ? 'player' : 'banker';
    const bet = document.querySelector('#baccarat-bet')?.value;
    const winnings = bet === winner ? (winner === 'tie' ? getBetPayout(9) : getBetPayout(2)) : 0;
    gameState.baccaratResult = { player: playerTotal, banker: bankerTotal };
    gameState.credits += winnings;
    updateCreditCounter();
    publishBigWin('Baccarat', winnings);
    renderGame(`${winner[0].toUpperCase()}${winner.slice(1)} wins. ${winnings ? `You won ${formatWinPayout(winnings)}.` : 'Your bet missed.'}`);
}

function enterJackpot() {
    const jackpotEntries = getJackpotEntryCount();
    if (jackpotEntries >= jackpotEntryLimit) {
        renderGame(`You have reached the ${jackpotEntryLimit}-entry Jackpot limit.`);
        return;
    }
    if (!canPlay()) return;
    saveJackpotEntryCount(jackpotEntries + 1);
    gameState.jackpotPool += gameState.currentBet;
    const won = Math.random() < 0.1;
    if (won) {
        const winnings = gameState.jackpotPool;
        gameState.credits += winnings;
        publishBigWin('Lucky Jackpot', winnings);
        gameState.jackpotPool = 1000;
        localStorage.setItem(jackpotPoolStorageKey, String(gameState.jackpotPool));
        updateCreditCounter();
        renderGame(`Jackpot! You won ${formatWinPayout(winnings)}.`);
        return;
    }
    localStorage.setItem(jackpotPoolStorageKey, String(gameState.jackpotPool));
    updateCreditCounter();
    renderGame(`Not this time. The jackpot is now ${gameState.jackpotPool.toLocaleString()} credits.`);
}

function getJackpotPlayerKey() {
    return getCurrentAccount()?.email || 'guest';
}

function getJackpotEntryCounts() {
    try {
        const counts = JSON.parse(localStorage.getItem(jackpotEntryStorageKey) || '{}');
        return counts && typeof counts === 'object' ? counts : {};
    } catch (error) {
        return {};
    }
}

function getJackpotEntryCount() {
    const count = Number(getJackpotEntryCounts()[getJackpotPlayerKey()]);
    return Number.isFinite(count) && count >= 0 ? count : 0;
}

function saveJackpotEntryCount(count) {
    const counts = getJackpotEntryCounts();
    counts[getJackpotPlayerKey()] = count;
    localStorage.setItem(jackpotEntryStorageKey, JSON.stringify(counts));
}

document.querySelector('.btn-primary')?.addEventListener('click', function() {
    if (!getCurrentAccount()) {
        openAccountModal('create', true);
        return;
    }
    document.querySelector('#games')?.scrollIntoView({ behavior: 'smooth' });
});

document.querySelector('.btn-signup')?.addEventListener('click', function() {
    openAccountModal(getCurrentAccount() ? 'manage' : 'create');
});

document.querySelector('.btn-login')?.addEventListener('click', function() {
    openAccountModal('login');
});

document.querySelector('.btn-admin')?.addEventListener('click', openAdminPanel);

document.addEventListener('click', event => {
    const bankButton = event.target.closest('[data-bank-action]');
    if (!bankButton) return;
    event.preventDefault();
    if (bankButton.dataset.bankAction === 'deposit') bankDeposit();
    if (bankButton.dataset.bankAction === 'withdraw') bankWithdraw();
});
document.querySelector('#theme-toggle')?.addEventListener('click', function() {
    const currentIsDark = document.body.classList.contains('dark-mode');
    const nextTheme = currentIsDark ? 'light' : 'dark';
    applyTheme(nextTheme);
    try {
        localStorage.setItem(themeStorageKey, nextTheme);
    } catch (error) {
        // The theme still applies for the current session when storage is unavailable.
    }
});

document.addEventListener('change', event => {
    if (event.target.matches('[data-action="set-admin-role"]')) {
        const modal = event.target.closest('.admin-modal');
        updateAccountPermission(event.target.dataset.email, { role: event.target.value }).then(() => renderAdminDashboard(modal, 'accounts'));
    }
});

document.addEventListener('submit', event => {
    if (event.target.matches('.account-form')) handleAccountSubmit(event);
    if (event.target.matches('.admin-blocked-word-form')) handleBlockedWordSubmit(event);
    if (event.target.matches('.admin-update-form')) handleUpdateSubmit(event);
    if (event.target.matches('.chat-form')) handleChatSubmit(event);
    if (event.target.matches('.support-form')) handleSupportSubmit(event);
});

document.querySelector('#chat-search')?.addEventListener('input', renderChat);
document.querySelector('.chat-close')?.addEventListener('click', function () {
    setChatVisibility(false);
});
document.querySelector('.chat-open')?.addEventListener('click', function () {
    setChatVisibility(true);
});

document.addEventListener('click', event => {
    const deleteButton = event.target.closest('[data-action="delete-own-chat"]');
    if (deleteButton) deleteChatMessage(deleteButton.dataset.messageId);
});

window.addEventListener('storage', event => {
    if (event.key === chatVisibilityStorageKey) applyChatVisibility();
});

// Contact form submission
const contactForm = document.querySelector('.contact-form');
if (contactForm) {
    contactForm.addEventListener('submit', function(e) {
        e.preventDefault();
        alert('Thank you for your message! We will get back to you soon.');
        this.reset();
    });
}

// Add animation to elements on scroll
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -100px 0px'
};

const observer = new IntersectionObserver(function(entries) {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
        }
    });
}, observerOptions);

// Observe all game cards and feature cards
document.querySelectorAll('.game-card, .feature').forEach(element => {
    element.style.opacity = '0';
    element.style.transform = 'translateY(20px)';
    element.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
    observer.observe(element);
});

// Animate hero content on load
window.addEventListener('load', function() {
    const heroContent = document.querySelector('.hero-content');
    if (heroContent) {
        heroContent.style.animation = 'fadeInUp 0.8s ease';
    }
});

// Add CSS animation
const style = document.createElement('style');
style.textContent = `
    @keyframes fadeInUp {
        from {
            opacity: 0;
            transform: translateY(30px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }
`;
document.head.appendChild(style);

// Bonus claim button
const bonusButton = document.querySelector('.btn-primary-large');
if (bonusButton) {
    bonusButton.addEventListener('click', function() {
        alert('Thank you for claiming your bonus! Please sign up to receive your 100% welcome bonus.');
    });
}

console.log('Lucky Jackpot website loaded successfully!');