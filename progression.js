(() => {
    'use strict';

    const STORAGE_PREFIX = 'lucky-jackpot-progression-v1';
    const MAX_LEVEL = 50;
    const XP_PER_DAILY = 75;
    const XP_PER_ACHIEVEMENT = 50;
    const PLAY_XP = 10;
    const WIN_XP = 25;

    const playActions = new Set([
        'spin-slots',
        'spin-roulette',
        'roll-dice',
        'deal-poker',
        'deal-blackjack',
        'flip-coin',
        'draw-keno',
        'deal-baccarat',
        'enter-jackpot'
    ]);
    const resultActions = new Set([
        'spin-slots',
        'spin-roulette',
        'roll-dice',
        'deal-poker',
        'flip-coin',
        'draw-keno',
        'deal-baccarat',
        'enter-jackpot',
        'stand-blackjack'
    ]);

    const achievements = {
        first_game: { icon: '🎮', title: 'First Spin', description: 'Complete your first game.' },
        level_2: { icon: '⭐', title: 'Level Up', description: 'Reach level 2.' },
        variety_4: { icon: '🧭', title: 'Variety Player', description: 'Complete games in 4 different game modes.' },
        wins_3: { icon: '🏆', title: 'Lucky Streak', description: 'Win 3 games.' },
        wager_1000: { icon: '💎', title: 'High Roller', description: 'Wager 1,000 total tokens.' },
        daily_7: { icon: '📅', title: 'Daily Discipline', description: 'Complete 7 daily challenges.' },
        collector_4: { icon: '🎨', title: 'Collector', description: 'Unlock 4 cosmetics.' },
        jackpot: { icon: '💰', title: 'Jackpot Entry', description: 'Enter the community jackpot.' },
        xp_1000: { icon: '🚀', title: 'XP 1K', description: 'Earn 1,000 XP.' }
    };

    const cosmetics = {
        starter: { icon: '✨', title: 'Starter', requirement: 'Unlocked from the start' },
        neon: { icon: '🌈', title: 'Neon Night', requirement: 'Reach level 2', level: 2 },
        emerald: { icon: '💚', title: 'Emerald', requirement: 'Reach level 3', level: 3 },
        royal: { icon: '👑', title: 'Royal Gold', requirement: 'Reach level 5', level: 5 },
        cyber: { icon: '⚡', title: 'Cyber', requirement: 'Unlock Variety Player', achievement: 'variety_4' },
        champion: { icon: '🔥', title: 'Champion', requirement: 'Earn 1,000 XP', xp: 1000 },
        jackpot: { icon: '💰', title: 'Jackpot', requirement: 'Enter the community jackpot', achievement: 'jackpot' }
    };

    const challengePool = [
        { id: 'play3', icon: '🎮', title: 'Warm Up', description: 'Complete 3 games.', kind: 'played', target: 3 },
        { id: 'win1', icon: '🏆', title: 'Lucky Day', description: 'Win 1 game.', kind: 'wins', target: 1 },
        { id: 'wager250', icon: '🪙', title: 'Put Some Action In', description: 'Wager 250 tokens.', kind: 'wagered', target: 250 },
        { id: 'variety3', icon: '🧭', title: 'Mix It Up', description: 'Play 3 different games.', kind: 'unique', target: 3 },
        { id: 'streak3', icon: '🔥', title: 'Hot Hand', description: 'Win 3 games in a row.', kind: 'winStreak', target: 3 },
        { id: 'jackpot1', icon: '💰', title: 'Take Your Shot', description: 'Enter the jackpot once.', kind: 'jackpotEntries', target: 1 },
        { id: 'play5', icon: '🎲', title: 'Night Owl', description: 'Complete 5 games.', kind: 'played', target: 5 },
        { id: 'wager500', icon: '💎', title: 'Big Session', description: 'Wager 500 tokens.', kind: 'wagered', target: 500 }
    ];

    let currentProgressKey = null;
    let state = null;
    let pendingRound = null;
    let lastHandledAccount = null;
    let panelOpen = false;

    injectStyles();
    createUi();
    wireEvents();
    refreshProgression();
    window.setInterval(refreshProgression, 2000);

    function todayKey() {
        const now = new Date();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        return `${now.getFullYear()}-${month}-${day}`;
    }

    function currentAccountKey() {
        try {
            const account = typeof getCurrentAccount === 'function' ? getCurrentAccount() : null;
            return account?.email ? account.email.toLowerCase() : 'guest';
        } catch {
            return 'guest';
        }
    }

    function storageKey() {
        return `${STORAGE_PREFIX}:${currentAccountKey()}`;
    }

    function hashString(value) {
        let hash = 2166136261;
        for (let index = 0; index < value.length; index += 1) {
            hash ^= value.charCodeAt(index);
            hash = Math.imul(hash, 16777619);
        }
        return hash >>> 0;
    }

    function makeDailyChallenges(date) {
        const pool = [...challengePool];
        let seed = hashString(date);
        const chosen = [];
        while (chosen.length < 3 && pool.length) {
            seed = Math.imul(seed ^ (seed >>> 16), 2246822519) >>> 0;
            seed = Math.imul(seed ^ (seed >>> 13), 3266489917) >>> 0;
            const index = seed % pool.length;
            chosen.push({ ...pool.splice(index, 1)[0], completed: false });
        }
        return chosen;
    }

    function defaultState() {
        return {
            version: 1,
            xp: 0,
            gamesPlayed: 0,
            wins: 0,
            totalWagered: 0,
            uniqueGames: [],
            winStreak: 0,
            jackpotsEntered: 0,
            dailyCompletedTotal: 0,
            achievements: {},
            cosmeticsUnlocked: ['starter'],
            selectedCosmetic: 'starter',
            daily: {
                date: todayKey(),
                played: 0,
                wins: 0,
                wagered: 0,
                uniqueGames: [],
                winStreak: 0,
                jackpotEntries: 0,
                challenges: makeDailyChallenges(todayKey())
            }
        };
    }

    function loadState() {
        let saved = null;
        try {
            saved = JSON.parse(localStorage.getItem(storageKey()) || 'null');
        } catch {
            saved = null;
        }
        const base = defaultState();
        const next = saved && typeof saved === 'object' ? { ...base, ...saved } : base;
        next.uniqueGames = Array.isArray(next.uniqueGames) ? next.uniqueGames : [];
        next.cosmeticsUnlocked = Array.isArray(next.cosmeticsUnlocked) && next.cosmeticsUnlocked.length ? next.cosmeticsUnlocked : ['starter'];
        next.achievements = next.achievements && typeof next.achievements === 'object' ? next.achievements : {};
        if (!next.daily || next.daily.date !== todayKey()) {
            next.daily = {
                date: todayKey(),
                played: 0,
                wins: 0,
                wagered: 0,
                uniqueGames: [],
                winStreak: 0,
                jackpotEntries: 0,
                challenges: makeDailyChallenges(todayKey())
            };
        } else {
            next.daily.uniqueGames = Array.isArray(next.daily.uniqueGames) ? next.daily.uniqueGames : [];
            next.daily.challenges = Array.isArray(next.daily.challenges) && next.daily.challenges.length ? next.daily.challenges : makeDailyChallenges(next.daily.date);
        }
        return next;
    }

    function saveState() {
        try {
            localStorage.setItem(storageKey(), JSON.stringify(state));
        } catch {
            // Local progression is best-effort when browser storage is unavailable.
        }
    }

    function levelFromXp(xp) {
        let level = 1;
        while (level < MAX_LEVEL && xp >= xpForLevel(level + 1)) level += 1;
        return level;
    }

    function xpForLevel(level) {
        if (level <= 1) return 0;
        return Math.pow(level - 1, 2) * 100;
    }

    function levelProgress() {
        const level = levelFromXp(state.xp);
        const currentFloor = xpForLevel(level);
        const nextFloor = level >= MAX_LEVEL ? xpForLevel(MAX_LEVEL) : xpForLevel(level + 1);
        const span = Math.max(1, nextFloor - currentFloor);
        return {
            level,
            currentFloor,
            nextFloor,
            within: Math.min(span, Math.max(0, state.xp - currentFloor)),
            percent: level >= MAX_LEVEL ? 100 : Math.round((Math.min(span, Math.max(0, state.xp - currentFloor)) / span) * 100)
        };
    }

    function challengeProgress(challenge) {
        const daily = state.daily;
        const values = {
            played: daily.played,
            wins: daily.wins,
            wagered: daily.wagered,
            unique: daily.uniqueGames.length,
            winStreak: daily.winStreak,
            jackpotEntries: daily.jackpotEntries
        };
        return Math.min(challenge.target, Number(values[challenge.kind] || 0));
    }

    function challengeIsComplete(challenge) {
        return challenge.completed || challengeProgress(challenge) >= challenge.target;
    }

    function maybeCompleteChallenges() {
        for (const challenge of state.daily.challenges) {
            if (challenge.completed) continue;
            if (!challengeIsComplete(challenge)) continue;
            challenge.completed = true;
            state.dailyCompletedTotal += 1;
            awardXp(XP_PER_DAILY, `Daily challenge: ${challenge.title}`, false);
            showToast(`Daily challenge complete: ${challenge.title} (+${XP_PER_DAILY} XP)`, 'success');
        }
    }

    function maybeUnlockAchievements() {
        const level = levelFromXp(state.xp);
        const checks = {
            first_game: state.gamesPlayed >= 1,
            level_2: level >= 2,
            variety_4: state.uniqueGames.length >= 4,
            wins_3: state.wins >= 3,
            wager_1000: state.totalWagered >= 1000,
            daily_7: state.dailyCompletedTotal >= 7,
            collector_4: state.cosmeticsUnlocked.length >= 4,
            jackpot: state.jackpotsEntered >= 1,
            xp_1000: state.xp >= 1000
        };
        for (const [id, unlocked] of Object.entries(checks)) {
            if (!unlocked || state.achievements[id]) continue;
            state.achievements[id] = new Date().toISOString();
            awardXp(XP_PER_ACHIEVEMENT, `Achievement: ${achievements[id].title}`, false);
            showToast(`Achievement unlocked: ${achievements[id].title} (+${XP_PER_ACHIEVEMENT} XP)`, 'achievement');
        }
    }

    function maybeUnlockCosmetics() {
        const level = levelFromXp(state.xp);
        for (const [id, cosmetic] of Object.entries(cosmetics)) {
            if (state.cosmeticsUnlocked.includes(id)) continue;
            const unlockedByLevel = cosmetic.level && level >= cosmetic.level;
            const unlockedByXp = cosmetic.xp && state.xp >= cosmetic.xp;
            const unlockedByAchievement = cosmetic.achievement && state.achievements[cosmetic.achievement];
            if (unlockedByLevel || unlockedByXp || unlockedByAchievement) {
                state.cosmeticsUnlocked.push(id);
                showToast(`Cosmetic unlocked: ${cosmetic.title}`, 'cosmetic');
            }
        }
    }

    function evaluateUnlocks() {
        maybeUnlockAchievements();
        maybeUnlockCosmetics();
        saveState();
        applySelectedCosmetic();
        renderProgressionPanel();
    }

    function awardXp(amount, reason, evaluate = true) {
        const previousLevel = levelFromXp(state.xp);
        state.xp += Math.max(0, Math.floor(amount));
        if (evaluate) evaluateUnlocks();
        const currentLevel = levelFromXp(state.xp);
        if (currentLevel > previousLevel) {
            showToast(`Level ${currentLevel} reached!`, 'level');
        }
        if (reason && evaluate === true) showToast(`${reason} · +${Math.floor(amount)} XP`, 'xp');
    }

    function recordCompletedRound(round, won) {
        if (!round || round.recorded) return;
        round.recorded = true;

        state.gamesPlayed += 1;
        state.totalWagered += round.bet;
        if (round.game && !state.uniqueGames.includes(round.game)) state.uniqueGames.push(round.game);

        state.daily.played += 1;
        state.daily.wagered += round.bet;
        if (round.game && !state.daily.uniqueGames.includes(round.game)) state.daily.uniqueGames.push(round.game);

        let xp = PLAY_XP;
        if (won) {
            state.wins += 1;
            state.winStreak += 1;
            state.daily.wins += 1;
            state.daily.winStreak += 1;
            xp += WIN_XP;
        } else {
            state.winStreak = 0;
            state.daily.winStreak = 0;
        }

        if (round.game === 'jackpot') {
            state.jackpotsEntered += 1;
            state.daily.jackpotEntries += 1;
        }

        awardXp(xp, won ? `${round.game} win` : `${round.game} played`, false);
        maybeCompleteChallenges();
        maybeUnlockAchievements();
        maybeUnlockCosmetics();
        saveState();
        applySelectedCosmetic();
        renderProgressionPanel();
        showToast(`${won ? 'Win' : 'Game complete'} · +${xp} XP`, won ? 'success' : 'xp');
    }

    function readCredits() {
        try {
            return Number.isFinite(Number(gameState?.credits)) ? Number(gameState.credits) : null;
        } catch {
            return null;
        }
    }

    function readBet() {
        const value = Number(document.querySelector('#game-bet')?.value);
        return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
    }

    function looksLikeWin(message, beforeCredits, bet) {
        const text = String(message || '').toLowerCase();
        if (/(you won|you win|winner|win!|wins|jackpot|payout|correct|matched|blackjack|beat the dealer|congratulations)/i.test(text)) return true;
        const afterCredits = readCredits();
        if (afterCredits !== null && beforeCredits !== null && bet > 0) {
            return afterCredits > beforeCredits - bet;
        }
        return false;
    }

    function watchForOutcome(round) {
        const startedAt = Date.now();
        const initialMessage = document.querySelector('.game-message')?.textContent?.trim() || '';
        function poll() {
            if (round.recorded) return;
            const message = document.querySelector('.game-message')?.textContent?.trim() || '';
            const actionButton = document.querySelector(`[data-action="${round.finishAction}"]`);
            const elapsed = Date.now() - startedAt;
            const messageChanged = message && message !== initialMessage;
            const buttonDone = !actionButton || !actionButton.disabled;
            const ready = round.finishAction === 'stand-blackjack' ? messageChanged : (messageChanged && buttonDone);
            if (ready || elapsed > 8500) {
                recordCompletedRound(round, looksLikeWin(message, round.beforeCredits, round.bet));
                return;
            }
            window.setTimeout(poll, 200);
        }
        window.setTimeout(poll, 180);
    }

    function onGameAction(action, button) {
        if (!playActions.has(action) && action !== 'stand-blackjack') return;

        let game = 'unknown';
        let bet = 0;
        try {
            game = gameState?.game || 'unknown';
            bet = readBet() || Number(gameState?.currentBet) || 0;
        } catch {
            return;
        }

        if (action === 'deal-blackjack') {
            pendingRound = {
                game,
                bet,
                beforeCredits: readCredits(),
                finishAction: 'stand-blackjack',
                recorded: false
            };
            return;
        }

        if (action === 'stand-blackjack') {
            if (pendingRound && pendingRound.game === 'blackjack') {
                pendingRound.finishAction = 'stand-blackjack';
                watchForOutcome(pendingRound);
                return;
            }
            pendingRound = {
                game,
                bet,
                beforeCredits: readCredits(),
                finishAction: 'stand-blackjack',
                recorded: false
            };
            watchForOutcome(pendingRound);
            return;
        }

        if (!resultActions.has(action)) return;
        const round = {
            game,
            bet,
            beforeCredits: readCredits(),
            finishAction: action,
            recorded: false
        };
        pendingRound = round;
        watchForOutcome(round);
    }

    function refreshProgression() {
        const key = storageKey();
        if (key !== currentProgressKey) {
            currentProgressKey = key;
            lastHandledAccount = currentAccountKey();
            state = loadState();
            evaluateUnlocks();
            renderProgressionPanel();
        } else if (!state) {
            state = loadState();
            renderProgressionPanel();
        }
        if (state?.daily?.date !== todayKey()) {
            state = loadState();
            saveState();
            renderProgressionPanel();
        }
        const account = currentAccountKey();
        if (account !== lastHandledAccount) {
            lastHandledAccount = account;
            currentProgressKey = storageKey();
            state = loadState();
            renderProgressionPanel();
        }
    }

    function equipCosmetic(id) {
        if (!state.cosmeticsUnlocked.includes(id)) return;
        state.selectedCosmetic = id;
        saveState();
        applySelectedCosmetic();
        renderProgressionPanel();
        showToast(`${cosmetics[id].title} equipped`, 'cosmetic');
    }

    function applySelectedCosmetic() {
        const id = state?.selectedCosmetic && state.cosmeticsUnlocked.includes(state.selectedCosmetic) ? state.selectedCosmetic : 'starter';
        document.documentElement.dataset.progressionCosmetic = id;
    }

    function createUi() {
        if (!document.getElementById('progression-open')) {
            const button = document.createElement('button');
            button.id = 'progression-open';
            button.type = 'button';
            button.className = 'progression-launcher';
            button.innerHTML = '<span>✨</span><b>Progression</b><small id="progression-level-pill">Lv. 1</small>';
            document.body.appendChild(button);
        }
        if (!document.getElementById('progression-panel')) {
            const panel = document.createElement('div');
            panel.id = 'progression-panel';
            panel.className = 'progression-overlay';
            panel.setAttribute('aria-hidden', 'true');
            document.body.appendChild(panel);
        }
        if (!document.getElementById('progression-toast-stack')) {
            const toastStack = document.createElement('div');
            toastStack.id = 'progression-toast-stack';
            toastStack.className = 'progression-toast-stack';
            document.body.appendChild(toastStack);
        }
    }

    function wireEvents() {
        document.addEventListener('click', event => {
            const actionButton = event.target.closest('[data-action]');
            if (actionButton) onGameAction(actionButton.dataset.action, actionButton);

            const target = event.target.closest('[data-progression-action]');
            if (!target) return;
            const action = target.dataset.progressionAction;
            if (action === 'open') openPanel();
            if (action === 'close') closePanel();
            if (action === 'equip') equipCosmetic(target.dataset.cosmetic);
        }, true);

        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && panelOpen) closePanel();
        });

        window.addEventListener('storage', event => {
            if (event.key === storageKey()) {
                state = loadState();
                renderProgressionPanel();
            }
        });
    }

    function openPanel() {
        panelOpen = true;
        const panel = document.getElementById('progression-panel');
        if (!panel) return;
        panel.classList.add('is-open');
        panel.setAttribute('aria-hidden', 'false');
        document.body.classList.add('modal-open');
        renderProgressionPanel();
    }

    function closePanel() {
        panelOpen = false;
        const panel = document.getElementById('progression-panel');
        if (!panel) return;
        panel.classList.remove('is-open');
        panel.setAttribute('aria-hidden', 'true');
        if (!document.querySelector('.game-modal.is-open') && !document.querySelector('.account-modal.is-open') && !document.querySelector('.update-modal.is-open')) {
            document.body.classList.remove('modal-open');
        }
    }

    function escapeHtml(value) {
        return String(value).replace(/[&<>\"']/g, character => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '\"': '&quot;',
            "'": '&#39;'
        }[character]));
    }

    function renderProgressionPanel() {
        if (!state) return;
        const panel = document.getElementById('progression-panel');
        const pill = document.getElementById('progression-level-pill');
        if (!panel || !pill) return;

        const progress = levelProgress();
        pill.textContent = `Lv. ${progress.level}`;
        const earnedAchievements = Object.keys(state.achievements).length;
        const completedChallenges = state.daily.challenges.filter(challenge => challenge.completed).length;
        const account = currentAccountKey();
        const identity = account === 'guest' ? 'Guest browser profile' : account;

        panel.innerHTML = `
            <div class="progression-dialog" role="dialog" aria-modal="true" aria-labelledby="progression-title">
                <button class="progression-close" type="button" data-progression-action="close" aria-label="Close progression">&times;</button>
                <div class="progression-hero">
                    <div>
                        <span class="progression-kicker">Player progression</span>
                        <h2 id="progression-title">Level ${progress.level}</h2>
                        <p>${escapeHtml(identity)} · ${state.xp.toLocaleString()} XP total</p>
                    </div>
                    <div class="progression-level-badge">${progress.level}</div>
                </div>
                <div class="progression-xp-wrap">
                    <div class="progression-xp-head"><span>XP to next level</span><strong>${progress.level >= MAX_LEVEL ? 'MAX LEVEL' : `${progress.within.toLocaleString()} / ${(progress.nextFloor - progress.currentFloor).toLocaleString()}`}</strong></div>
                    <div class="progression-xp-track"><span style="width:${progress.percent}%"></span></div>
                    <small>${progress.level >= MAX_LEVEL ? 'You have reached the demo level cap.' : `${Math.max(0, progress.nextFloor - state.xp).toLocaleString()} XP remaining`}</small>
                </div>

                <div class="progression-stats">
                    <div><strong>${state.gamesPlayed}</strong><span>Games</span></div>
                    <div><strong>${state.wins}</strong><span>Wins</span></div>
                    <div><strong>${state.totalWagered.toLocaleString()}</strong><span>Wagered</span></div>
                    <div><strong>${earnedAchievements}</strong><span>Achievements</span></div>
                </div>

                <section class="progression-section">
                    <div class="progression-section-head"><div><span class="progression-kicker">Every day</span><h3>Daily challenges</h3></div><span>${completedChallenges}/3 complete</span></div>
                    <div class="progression-grid progression-challenges">
                        ${state.daily.challenges.map(challenge => {
                            const progressValue = challengeProgress(challenge);
                            const done = challengeIsComplete(challenge);
                            const percent = Math.min(100, Math.round((progressValue / challenge.target) * 100));
                            return `<article class="progression-card ${done ? 'is-complete' : ''}">
                                <div class="progression-card-icon">${challenge.icon}</div>
                                <div class="progression-card-main"><div class="progression-card-title"><strong>${escapeHtml(challenge.title)}</strong><span>${done ? '✓ Done' : `+${XP_PER_DAILY} XP`}</span></div><p>${escapeHtml(challenge.description)}</p><div class="progression-mini-track"><span style="width:${percent}%"></span></div><small>${progressValue.toLocaleString()} / ${challenge.target.toLocaleString()}</small></div>
                            </article>`;
                        }).join('')}
                    </div>
                </section>

                <section class="progression-section">
                    <div class="progression-section-head"><div><span class="progression-kicker">Milestones</span><h3>Achievements</h3></div><span>${earnedAchievements}/${Object.keys(achievements).length}</span></div>
                    <div class="progression-grid progression-achievements">
                        ${Object.entries(achievements).map(([id, achievement]) => {
                            const unlocked = Boolean(state.achievements[id]);
                            return `<article class="progression-achievement ${unlocked ? 'is-unlocked' : ''}"><div class="progression-achievement-icon">${achievement.icon}</div><div><strong>${escapeHtml(achievement.title)}</strong><p>${escapeHtml(achievement.description)}</p>${unlocked ? '<span class="progression-unlocked">Unlocked</span>' : '<span class="progression-locked">Locked</span>'}</div></article>`;
                        }).join('')}
                    </div>
                </section>

                <section class="progression-section">
                    <div class="progression-section-head"><div><span class="progression-kicker">Cosmetics</span><h3>Unlock & equip</h3></div><span>${state.cosmeticsUnlocked.length}/${Object.keys(cosmetics).length}</span></div>
                    <div class="progression-grid progression-cosmetics">
                        ${Object.entries(cosmetics).map(([id, cosmetic]) => {
                            const unlocked = state.cosmeticsUnlocked.includes(id);
                            const equipped = state.selectedCosmetic === id;
                            return `<article class="progression-cosmetic ${unlocked ? 'is-unlocked' : 'is-locked'} ${equipped ? 'is-equipped' : ''}"><div class="progression-cosmetic-icon">${cosmetic.icon}</div><div><strong>${escapeHtml(cosmetic.title)}</strong><p>${escapeHtml(cosmetic.requirement)}</p>${unlocked ? `<button type="button" class="progression-equip" data-progression-action="equip" data-cosmetic="${id}">${equipped ? 'Equipped' : 'Equip'}</button>` : '<span class="progression-locked">Locked</span>'}</div></article>`;
                        }).join('')}
                    </div>
                </section>

                <div class="progression-footer-note">XP and cosmetics are saved per browser account in this demo. Game tokens are unchanged by progression rewards.</div>
            </div>`;

        applySelectedCosmetic();
    }

    function showToast(message, tone = 'xp') {
        const stack = document.getElementById('progression-toast-stack');
        if (!stack) return;
        const toast = document.createElement('div');
        toast.className = `progression-toast is-${tone}`;
        toast.textContent = message;
        stack.appendChild(toast);
        window.setTimeout(() => toast.classList.add('is-visible'), 10);
        window.setTimeout(() => {
            toast.classList.remove('is-visible');
            window.setTimeout(() => toast.remove(), 250);
        }, 3200);
    }

    function injectStyles() {
        if (document.getElementById('progression-styles')) return;
        const style = document.createElement('style');
        style.id = 'progression-styles';
        style.textContent = `
            :root {
                --prog-accent: #7c5cff;
                --prog-accent-2: #25d0ff;
                --prog-panel: rgba(13, 16, 32, 0.96);
                --prog-card: rgba(255,255,255,0.045);
                --prog-border: rgba(255,255,255,0.10);
                --prog-text: #f7f7ff;
                --prog-muted: #aeb4cb;
            }
            .light-mode {
                --prog-panel: rgba(255,255,255,0.98);
                --prog-card: rgba(20,30,60,0.05);
                --prog-border: rgba(20,30,60,0.12);
                --prog-text: #141625;
                --prog-muted: #5f6678;
            }
            .progression-launcher {
                position: fixed;
                right: 18px;
                bottom: 18px;
                z-index: 4100;
                display: inline-flex;
                align-items: center;
                gap: 8px;
                border: 1px solid var(--prog-border);
                border-radius: 999px;
                padding: 10px 14px;
                background: var(--prog-panel);
                color: var(--prog-text);
                box-shadow: 0 12px 40px rgba(0,0,0,0.20);
                cursor: pointer;
                font: inherit;
                backdrop-filter: blur(14px);
            }
            .progression-launcher b { font-size: 13px; }
            .progression-launcher small { opacity: 0.75; font-weight: 700; }
            .progression-overlay {
                position: fixed;
                inset: 0;
                z-index: 4200;
                display: none;
                place-items: center;
                padding: 20px;
                background: rgba(2,5,12,0.66);
                backdrop-filter: blur(7px);
            }
            .progression-overlay.is-open { display: grid; }
            .progression-dialog {
                position: relative;
                width: min(1040px, 96vw);
                max-height: min(92vh, 920px);
                overflow: auto;
                border: 1px solid var(--prog-border);
                border-radius: 28px;
                padding: 28px;
                background: var(--prog-panel);
                color: var(--prog-text);
                box-shadow: 0 35px 100px rgba(0,0,0,0.38);
            }
            .progression-close {
                position: absolute;
                top: 14px;
                right: 16px;
                width: 38px;
                height: 38px;
                border: 1px solid var(--prog-border);
                border-radius: 50%;
                background: transparent;
                color: inherit;
                font-size: 24px;
                cursor: pointer;
            }
            .progression-kicker { font-size: 11px; text-transform: uppercase; letter-spacing: 0.14em; opacity: 0.62; font-weight: 800; }
            .progression-hero { display:flex; justify-content:space-between; gap: 18px; padding-right: 44px; }
            .progression-hero h2 { margin: 7px 0 3px; font-size: clamp(28px, 5vw, 44px); }
            .progression-hero p { margin:0; color:var(--prog-muted); overflow-wrap:anywhere; }
            .progression-level-badge { min-width:80px; height:80px; border-radius:24px; display:grid; place-items:center; font-size:28px; font-weight:900; background:linear-gradient(135deg,var(--prog-accent),var(--prog-accent-2)); color:white; box-shadow:0 15px 30px rgba(124,92,255,.28); }
            .progression-xp-wrap { margin-top:22px; padding:18px; border:1px solid var(--prog-border); border-radius:18px; background:var(--prog-card); }
            .progression-xp-head,.progression-card-title,.progression-section-head { display:flex; align-items:center; justify-content:space-between; gap:12px; }
            .progression-xp-head { font-size:13px; color:var(--prog-muted); }
            .progression-xp-head strong { color:var(--prog-text); }
            .progression-xp-track,.progression-mini-track { overflow:hidden; height:9px; border-radius:99px; background:rgba(127,140,170,.20); }
            .progression-xp-track { margin:11px 0 7px; }
            .progression-xp-track span,.progression-mini-track span { display:block; height:100%; border-radius:inherit; background:linear-gradient(90deg,var(--prog-accent),var(--prog-accent-2)); transition:width .35s ease; }
            .progression-xp-wrap small,.progression-card-main small { color:var(--prog-muted); }
            .progression-stats { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; margin-top:12px; }
            .progression-stats div { padding:15px; border:1px solid var(--prog-border); border-radius:16px; background:var(--prog-card); }
            .progression-stats strong { display:block; font-size:20px; }
            .progression-stats span { display:block; margin-top:4px; color:var(--prog-muted); font-size:12px; }
            .progression-section { margin-top:25px; }
            .progression-section-head { margin-bottom:10px; }
            .progression-section-head h3 { margin:4px 0 0; font-size:20px; }
            .progression-section-head > span { color:var(--prog-muted); font-size:12px; }
            .progression-grid { display:grid; gap:10px; }
            .progression-challenges { grid-template-columns:repeat(3,minmax(0,1fr)); }
            .progression-achievements { grid-template-columns:repeat(3,minmax(0,1fr)); }
            .progression-cosmetics { grid-template-columns:repeat(4,minmax(0,1fr)); }
            .progression-card,.progression-achievement,.progression-cosmetic { border:1px solid var(--prog-border); border-radius:18px; background:var(--prog-card); padding:15px; }
            .progression-card { display:flex; gap:12px; }
            .progression-card.is-complete { border-color:rgba(62,214,143,.35); }
            .progression-card-icon,.progression-achievement-icon,.progression-cosmetic-icon { width:42px; height:42px; display:grid; place-items:center; border-radius:12px; background:rgba(124,92,255,.13); flex:0 0 auto; font-size:20px; }
            .progression-card-main,.progression-achievement div:last-child,.progression-cosmetic div:last-child { min-width:0; flex:1; }
            .progression-card-title strong,.progression-achievement strong,.progression-cosmetic strong { font-size:13px; }
            .progression-card-title span { font-size:11px; color:var(--prog-muted); white-space:nowrap; }
            .progression-card p,.progression-achievement p,.progression-cosmetic p { margin:5px 0 9px; color:var(--prog-muted); font-size:12px; line-height:1.4; }
            .progression-mini-track { height:6px; margin-bottom:5px; }
            .progression-achievement,.progression-cosmetic { display:flex; gap:12px; }
            .progression-achievement.is-unlocked { border-color:rgba(37,208,255,.30); }
            .progression-cosmetic.is-locked { opacity:.55; }
            .progression-cosmetic.is-equipped { box-shadow:0 0 0 2px var(--prog-accent); }
            .progression-unlocked { display:inline-block; color:#55e8a2; font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:.08em; }
            .progression-locked { display:inline-block; color:var(--prog-muted); font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:.08em; }
            .progression-equip { margin-top:2px; border:1px solid var(--prog-border); border-radius:999px; padding:7px 11px; background:transparent; color:inherit; cursor:pointer; font:inherit; font-size:11px; font-weight:800; }
            .progression-footer-note { margin-top:22px; padding-top:16px; border-top:1px solid var(--prog-border); color:var(--prog-muted); font-size:11px; line-height:1.5; }
            .progression-toast-stack { position:fixed; top:82px; right:18px; z-index:5000; display:flex; flex-direction:column; align-items:flex-end; gap:9px; pointer-events:none; }
            .progression-toast { max-width:min(380px, calc(100vw - 36px)); padding:11px 14px; border:1px solid var(--prog-border); border-radius:14px; background:var(--prog-panel); color:var(--prog-text); box-shadow:0 15px 40px rgba(0,0,0,.25); transform:translateY(-8px); opacity:0; transition:transform .2s ease,opacity .2s ease; font-size:12px; }
            .progression-toast.is-visible { transform:translateY(0); opacity:1; }
            .progression-toast.is-success { border-color:rgba(62,214,143,.45); }
            .progression-toast.is-achievement { border-color:rgba(255,194,92,.55); }
            .progression-toast.is-cosmetic { border-color:rgba(37,208,255,.45); }
            .progression-toast.is-level { border-color:rgba(124,92,255,.60); }
            html[data-progression-cosmetic="neon"] .progression-dialog { box-shadow:0 35px 120px rgba(37,208,255,.16),0 0 0 1px rgba(124,92,255,.20); }
            html[data-progression-cosmetic="emerald"] .progression-dialog { box-shadow:0 35px 120px rgba(43,214,143,.16),0 0 0 1px rgba(43,214,143,.18); }
            html[data-progression-cosmetic="royal"] .progression-dialog { box-shadow:0 35px 120px rgba(255,194,92,.20),0 0 0 1px rgba(255,194,92,.20); }
            html[data-progression-cosmetic="cyber"] .progression-dialog { box-shadow:0 35px 120px rgba(255,64,180,.15),0 0 0 1px rgba(124,92,255,.22); }
            html[data-progression-cosmetic="champion"] .progression-dialog { box-shadow:0 35px 120px rgba(255,95,95,.18),0 0 0 1px rgba(255,132,67,.20); }
            html[data-progression-cosmetic="jackpot"] .progression-dialog { box-shadow:0 35px 120px rgba(255,194,92,.18),0 0 0 1px rgba(255,194,92,.24); }
            @media (max-width: 900px) {
                .progression-challenges,.progression-achievements { grid-template-columns:repeat(2,minmax(0,1fr)); }
                .progression-cosmetics { grid-template-columns:repeat(2,minmax(0,1fr)); }
            }
            @media (max-width: 650px) {
                .progression-launcher { right:10px; bottom:10px; }
                .progression-launcher b { display:none; }
                .progression-dialog { padding:20px; border-radius:22px; }
                .progression-stats { grid-template-columns:repeat(2,1fr); }
                .progression-challenges,.progression-achievements,.progression-cosmetics { grid-template-columns:1fr; }
                .progression-level-badge { min-width:64px; height:64px; border-radius:20px; font-size:23px; }
            }
        `;
        document.head.appendChild(style);
    }
})();