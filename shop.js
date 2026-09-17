(function () {
    const ACCOUNT_KEY = 'lucky-jackpot-accounts';
    const CURRENT_KEY = 'lucky-jackpot-current-account';
    const LOCKER_KEY = 'lucky-jackpot-locker-v1';
    const ITEMS = [
        { id: 'neon', icon: '⚡', name: 'Neon Pulse', description: 'A bright cyber glow for your progression panel.', price: 150 },
        { id: 'royal', icon: '👑', name: 'Royal Crown', description: 'A gold-and-purple champion look.', price: 300 },
        { id: 'emerald', icon: '💚', name: 'Emerald Edge', description: 'A fresh green winner accent.', price: 225 },
        { id: 'cyber', icon: '🪩', name: 'Cyber Disco', description: 'A vivid pink arcade style.', price: 400 },
        { id: 'champion', icon: '🏆', name: 'Champion Flame', description: 'A fiery look for big winners.', price: 550 }
    ];
    const read = (key, fallback) => { try { const value = JSON.parse(localStorage.getItem(key) || 'null'); return value ?? fallback; } catch { return fallback; } };
    const account = () => read(CURRENT_KEY, null);
    const accountKey = () => account()?.email || 'guest';
    const accounts = () => read(ACCOUNT_KEY, []);
    const locker = () => { const all = read(LOCKER_KEY, {}); const data = all[accountKey()] || { owned: ['starter'], equipped: 'starter' }; return { all, data }; };
    const saveLocker = (all, data) => { all[accountKey()] = data; localStorage.setItem(LOCKER_KEY, JSON.stringify(all)); };
    const balance = () => { const found = accounts().find(item => item.email === account()?.email); return Math.max(0, Math.round(Number(found?.tokens ?? window.gameState?.credits ?? 1000))); };
    function render() {
        const { data } = locker(); const tokens = balance();
        document.querySelector('#shop-balance').textContent = `${tokens.toLocaleString()} tokens`;
        document.querySelector('#token-count').textContent = tokens.toLocaleString();
        document.querySelector('#shop-items').innerHTML = ITEMS.map(item => {
            const owned = data.owned.includes(item.id);
            return `<article class="shop-item ${owned ? 'is-owned' : ''}"><div class="shop-item-icon">${item.icon}</div><div class="shop-item-copy"><strong>${item.name}</strong><p>${item.description}</p><span>${owned ? 'Owned' : `${item.price.toLocaleString()} tokens`}</span></div><button class="shop-action" data-shop-action="${owned ? 'equip' : 'buy'}" data-item="${item.id}" ${!owned && tokens < item.price ? 'disabled' : ''}>${owned ? (data.equipped === item.id ? 'Equipped' : 'Equip') : 'Buy'}</button></article>`;
        }).join('');
        const ownedItems = [{ id: 'starter', icon: '✨', name: 'Starter Glow' }, ...ITEMS].filter(item => data.owned.includes(item.id));
        document.querySelector('#locker-items').innerHTML = ownedItems.map(item => `<div class="locker-item ${data.equipped === item.id ? 'is-equipped' : ''}"><span class="locker-icon">${item.icon}</span><span><strong>${item.name}</strong><small>${data.equipped === item.id ? 'Currently equipped' : 'Owned'}</small></span>${data.equipped === item.id ? '<b>✓</b>' : `<button class="shop-action" data-shop-action="equip" data-item="${item.id}">Equip</button>`}</div>`).join('');
    }
    document.addEventListener('click', event => {
        const button = event.target.closest('[data-shop-action]'); if (!button) return;
        const item = ITEMS.find(entry => entry.id === button.dataset.item); const state = locker();
        if (button.dataset.shopAction === 'buy') {
            const tokens = balance(); if (!item || tokens < item.price) return;
            const list = accounts(); const saved = list.find(entry => entry.email === account()?.email); if (saved) { saved.tokens = tokens - item.price; localStorage.setItem(ACCOUNT_KEY, JSON.stringify(list)); }
            if (typeof gameState !== 'undefined') gameState.credits = tokens - item.price;
            if (typeof updateOwnTokenBalance === 'function' && account()?.email) updateOwnTokenBalance(account().email, tokens - item.price).catch(() => {});
            state.data.owned.push(item.id); saveLocker(state.all, state.data);
            if (typeof updateTokenCounter === 'function') updateTokenCounter();
        } else if (button.dataset.shopAction === 'equip' && (button.dataset.item === 'starter' || state.data.owned.includes(button.dataset.item))) {
            state.data.equipped = button.dataset.item; saveLocker(state.all, state.data);
            document.documentElement.dataset.progressionCosmetic = button.dataset.item;
        }
        render();
    });
    document.addEventListener('DOMContentLoaded', render, { once: true });
}());

