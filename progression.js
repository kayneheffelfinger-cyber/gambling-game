(() => {
    'use strict';

    const STORAGE_PREFIX = 'lucky-jackpot-progression-v2';
    const GAME_HISTORY_KEY = 'lucky-jackpot-game-history';
    const MAX_LEVEL = 50;
    const PLAY_XP = 10;
    const WIN_XP = 25;
    const HIGH_ROLLER_XP = 5;
    const BIG_WIN_XP = 20;
    const DAILY_XP = 75;
    const ACHIEVEMENT_XP = 50;

    const achievements = {
        first_game: { icon: '🎮', title: 'First Spin', description: 'Complete your first game.' },
        games_10: { icon: '🔟', title: 'Getting Started', description: 'Complete 10 games.' },
        games_50: { icon: '🏅', title: 'Veteran Player', description: 'Complete 50 games.' },
        variety_5: { icon: '🧭', title: 'Game Hopper', description: 'Play 5 different game modes.' },
        wins_3: { icon: '🏆', title: 'Lucky Streak', description: 'Win 3 games.' },
        wager_1000: { icon: '💎', title: 'High Roller', description: 'Wager 1,000 total tokens.' },
        big_win: { icon: '🔥', title: 'Big Winner', description: 'Win at least 5x your bet in a single round.' },
        jackpot: { icon: '💰', title: 'Jackpot Entry', description: 'Enter the community jackpot.' },
        level_5: { icon: '⭐', title: 'Level 5', description: 'Reach level 5.' },
        daily_7: { icon: '📅', title: 'Daily Discipline', description: 'Complete 7 daily challenges.' }
    };

    const cosmetics = {
        starter: { icon: '✨', title: 'Starter', requirement: 'Unlocked from the start' },
        neon: { icon: '🌈', title: 'Neon Night', requirement: 'Reach level 2', level: 2 },
        emerald: { icon: '💚', title: 'Emerald', requirement: 'Reach level 3', level: 3 },
        royal: { icon: '👑', title: 'Royal Gold', requirement: 'Reach level 5', level: 5 },
        cyber: { icon: '⚡', title: 'Cyber', requirement: 'Unlock Game Hopper', achievement: 'variety_5' },
        champion: { icon: '🏆', title: 'Champion', requirement: 'Unlock Big Winner', achievement: 'big_win' },
        veteran: { icon: '🛡️', title: 'Veteran', requirement: 'Complete 50 games', games: 50 },
        jackpot: { icon: '💰', title: 'Jackpot', requirement: 'Enter the community jackpot', achievement: 'jackpot' }
    };

    const challengePool = [
        { id: 'play3', icon: '🎮', title: 'Warm Up', description: 'Complete 3 games.', kind: 'played', target: 3 },
        { id: 'win1', icon: '🏆', title: 'Lucky Day', description: 'Win 1 game.', kind: 'wins', target: 1 },
        { id: 'wager250', icon: '🪙', title: 'Put Some Action In', description: 'Wager 250 tokens.', kind: 'wagered', target: 250 },
        { id: 'variety3', icon: '🧭', title: 'Mix It Up', description: 'Play 3 different games.', kind: 'unique', target: 3 },
        { id: 'streak3', icon: '🔥', title: 'Hot Hand', description: 'Win 3 games in a row.', kind: 'winStreak', target: 3 },
        { id: 'jackpot1', icon: '💰', title: 'Take Your Shot', description: 'Enter the jackpot once.', kind: 'jackpotEntries', target: 1 },
        { id: 'play5', icon: '🎲', title: 'Full Session', description: 'Complete 5 games.', kind: 'played', target: 5 },
        { id: 'wager500', icon: '💎', title: 'Big Session', description: 'Wager 500 tokens.', kind: 'wagered', target: 500 }
    ];

    let state = null;
    let progressKey = null;
    let lastMetricsSignature = '';
    let panelOpen = false;

    injectStyles();
    createUi();
    refresh();
    window.setInterval(refresh, 1200);

    function currentAccount() {
        try {
            return typeof getCurrentAccount === 'function' ? getCurrentAccount() : null;
        } catch {
            return null;
        }
    }

    function accountKey() {
        const account = currentAccount();
        return account?.email ? account.email.trim().toLowerCase() : 'guest';
    }

    function storageKey() {
        return `${STORAGE_PREFIX}:${accountKey()}`;
    }

    function todayKey(date = new Date()) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    function hashString(value) {
        let hash = 2166136261;
        for (let i = 0; i < value.length; i += 1) {
            hash ^= value.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return hash >>> 0;
    }

    function makeDailyChallenges(date) {
        const pool = [...challengePool];
        let seed = hashString(date);
        const selected = [];
        while (selected.length < 3 && pool.length) {
            seed = Math.imul(seed ^ (seed >>> 16), 2246822519) >>> 0;
            seed = Math.imul(seed ^ (seed >>> 13), 3266489917) >>> 0;
            selected.push(pool.splice(seed % pool.length, 1)[0]);
        }
        return selected.map(challenge => ({ ...challenge }));
    }

    function defaultState() {
        return {
            version: 2,
            xp: 0,
            processedPlays: {},
            achievements: {},
            cosmeticsUnlocked: ['starter'],
            selectedCosmetic: 'starter',
            dailyClaims: {}
        };
    }

    function loadState() {
        let saved = null;
        try {
            saved = JSON.parse(localStorage.getItem(storageKey()) || 'null');
        } catch {
            saved = null;
        }
        if (!saved || saved.version !== 2) return defaultState();
        const base = defaultState();
        const next = { ...base, ...saved };
        next.processedPlays = next.processedPlays && typeof next.processedPlays === 'object' ? next.processedPlays : {};
        next.achievements = next.achievements && typeof next.achievements === 'object' ? next.achievements : {};
        next.cosmeticsUnlocked = Array.isArray(next.cosmeticsUnlocked) && next.cosmeticsUnlocked.length ? next.cosmeticsUnlocked : ['starter'];
        next.dailyClaims = next.dailyClaims && typeof next.dailyClaims === 'object' ? next.dailyClaims : {};
        if (!next.cosmeticsUnlocked.includes('starter')) next.cosmeticsUnlocked.unshift('starter');
        return next;
    }

    function saveState() {
        try {
            localStorage.setItem(storageKey(), JSON.stringify(state));
        } catch {
            // Browser storage may be unavailable.
        }
    }

    function getGameHistory() {
        const email = accountKey();
        if (email === 'guest') return [];
        try {
            const all = JSON.parse(localStorage.getItem(GAME_HISTORY_KEY) || '{}');
            return Array.isArray(all[email]) ? all[email] : [];
        } catch {
            return [];
        }
    }

    function completedHistory() {
        return getGameHistory()
            .filter(play => play && typeof play.id === 'string' && play.id && String(play.result || 'Played') !== 'Played')
            .map(play => ({
                ...play,
                bet: Math.max(0, Number(play.bet) || 0),
                winnings: Math.max(0, Number(play.winnings) || 0),
                playedAt: play.playedAt || new Date().toISOString()
            }));
    }

    function metrics(history) {
        const chronological = [...history].sort((a, b) => new Date(a.playedAt).getTime() - new Date(b.playedAt).getTime());
        let currentStreak = 0;
        let longestStreak = 0;
        let wins = 0;
        let totalWagered = 0;
        let bigWin = false;
        let jackpots = 0;

        for (const play of chronological) {
            const won = play.winnings > 0;
            totalWagered += play.bet;
            if (won) {
                wins += 1;
                currentStreak += 1;
                longestStreak = Math.max(longestStreak, currentStreak);
            } else {
                currentStreak = 0;
            }
            if (play.bet > 0 && play.winnings >= play.bet * 5) bigWin = true;
            if (play.game === 'jackpot') jackpots += 1;
        }

        return {
            gamesPlayed: chronological.length,
            wins,
            totalWagered,
            uniqueGames: new Set(chronological.map(play => play.game).filter(Boolean)),
            bigWin,
            jackpots,
            longestStreak,
            chronological
        };
    }

    function xpForLevel(level) {
        if (level <= 1) return 0;
        return Math.pow(level - 1, 2) * 100;
    }

    function levelFromXp(xp) {
        let level = 1;
        while (level < MAX_LEVEL && xp >= xpForLevel(level + 1)) level += 1;
        return level;
    }

    function levelProgress(xp) {
        const level = levelFromXp(xp);
        const currentFloor = xpForLevel(level);
        const nextFloor = level >= MAX_LEVEL ? currentFloor : xpForLevel(level + 1);
        const span = Math.max(1, nextFloor - currentFloor);
        const within = Math.max(0, Math.min(span, xp - currentFloor));
        return {
            level,
            currentFloor,
            nextFloor,
            within,
            percent: level >= MAX_LEVEL ? 100 : Math.round((within / span) * 100)
        };
    }

    function awardXp(amount, message, tone = 'xp') {
        const previousLevel = levelFromXp(state.xp);
        state.xp += Math.max(0, Math.floor(amount));
        const nextLevel = levelFromXp(state.xp);
        if (nextLevel > previousLevel) showToast(`Level ${nextLevel} reached!`, 'level');
        if (message) showToast(`${message} · +${Math.floor(amount)} XP`, tone);
    }

    function xpForPlay(play) {
        let xp = PLAY_XP;
        if (play.winnings > 0) xp += WIN_XP;
        if (play.bet >= 100) xp += HIGH_ROLLER_XP;
        if (play.bet > 0 && play.winnings >= play.bet * 5) xp += BIG_WIN_XP;
        return xp;
    }

    function syncCompletedPlays(history) {
        let changed = false;
        for (const play of history) {
            if (state.processedPlays[play.id]) continue;
            const xp = xpForPlay(play);
            state.xp += xp;
            state.processedPlays[play.id] = {
                xp,
                processedAt: new Date().toISOString()
            };
            changed = true;
        }

        // Keep this map compact because the main game's history is capped at 100 rows.
        const validIds = new Set(history.map(play => play.id));
        for (const id of Object.keys(state.processedPlays)) {
            if (!validIds.has(id)) delete state.processedPlays[id];
        }
        return changed;
    }

    function unlockAchievement(id) {
        if (state.achievements[id]) return false;
        state.achievements[id] = new Date().toISOString();
        awardXp(ACHIEVEMENT_XP, `Achievement unlocked: ${achievements[id].title}`, 'achievement');
        return true;
    }

    function evaluateAchievements(info) {
        const level = levelFromXp(state.xp);
        const checks = {
            first_game: info.gamesPlayed >= 1,
            games_10: info.gamesPlayed >= 10,
            games_50: info.gamesPlayed >= 50,
            variety_5: info.uniqueGames.size >= 5,
            wins_3: info.wins >= 3,
            wager_1000: info.totalWagered >= 1000,
            big_win: info.bigWin,
            jackpot: info.jackpots >= 1,
            level_5: level >= 5,
            daily_7: completedDailyChallengeCount() >= 7
        };
        let changed = false;
        for (const [id, unlocked] of Object.entries(checks)) {
            if (unlocked) changed = unlockAchievement(id) || changed;
        }
        return changed;
    }

    function unlockedCosmeticIds(info) {
        const level = levelFromXp(state.xp);
        const ids = new Set(state.cosmeticsUnlocked);
        for (const [id, cosmetic] of Object.entries(cosmetics)) {
            if (cosmetic.level && level >= cosmetic.level) ids.add(id);
            if (cosmetic.games && info.gamesPlayed >= cosmetic.games) ids.add(id);
            if (cosmetic.achievement && state.achievements[cosmetic.achievement]) ids.add(id);
        }
        return [...ids];
    }

    function evaluateCosmetics(info) {
        const before = new Set(state.cosmeticsUnlocked);
        state.cosmeticsUnlocked = unlockedCosmeticIds(info);
        for (const id of state.cosmeticsUnlocked) {
            if (before.has(id)) continue;
            showToast(`Cosmetic unlocked: ${cosmetics[id].title}`, 'cosmetic');
        }
        if (!state.cosmeticsUnlocked.includes(state.selectedCosmetic)) state.selectedCosmetic = 'starter';
    }

    function todayHistory(history) {
        const key = todayKey();
        return history
            .filter(play => todayKey(new Date(play.playedAt)) === key)
            .sort((a, b) => new Date(a.playedAt).getTime() - new Date(b.playedAt).getTime());
    }

    function dailyMetrics(history) {
        const plays = todayHistory(history);
        let winStreak = 0;
        let longestWinStreak = 0;
        for (const play of plays) {
            if (play.winnings > 0) {
                winStreak += 1;
                longestWinStreak = Math.max(longestWinStreak, winStreak);
            } else {
                winStreak = 0;
            }
        }
        return {
            played: plays.length,
            wins: plays.filter(play => play.winnings > 0).length,
            wagered: plays.reduce((sum, play) => sum + play.bet, 0),
            unique: new Set(plays.map(play => play.game).filter(Boolean)).size,
            winStreak: longestWinStreak,
            jackpotEntries: plays.filter(play => play.game === 'jackpot').length
        };
    }

    function dailyChallenges() {
        return makeDailyChallenges(todayKey());
    }

    function dailyClaimsForToday() {
        const key = todayKey();
        const claims = state.dailyClaims[key];
        return Array.isArray(claims) ? claims : [];
    }

    function completedDailyChallengeCount() {
        return Object.values(state.dailyClaims).reduce((total, claims) => total + (Array.isArray(claims) ? claims.length : 0), 0);
    }

    function challengeProgress(challenge, daily) {
        return Math.min(challenge.target, Number(daily[challenge.kind] || 0));
    }

    function settleDailyChallenges(history) {
        const date = todayKey();
        const daily = dailyMetrics(history);
        const claims = new Set(dailyClaimsForToday());
        let changed = false;
        for (const challenge of dailyChallenges()) {
            if (claims.has(challenge.id)) continue;
            if (challengeProgress(challenge, daily) < challenge.target) continue;
            claims.add(challenge.id);
            state.dailyClaims[date] = [...claims];
            awardXp(DAILY_XP, `Daily challenge complete: ${challenge.title}`, 'success');
            changed = true;
        }
        // Prune challenge claims older than 90 days.
        const cutoff = Date.now() - (90 * 24 * 60 * 60 * 1000);
        for (const dateKey of Object.keys(state.dailyClaims)) {
            const stamp = Date.parse(`${dateKey}T00:00:00`);
            if (Number.isFinite(stamp) && stamp < cutoff) {
                delete state.dailyClaims[dateKey];
                changed = true;
            }
        }
        return changed;
    }

    function applyCosmetic() {
        const id = state && state.cosmeticsUnlocked.includes(state.selectedCosmetic) ? state.selectedCosmetic : 'starter';
        document.documentElement.dataset.progressionCosmetic = id;
        const label = document.querySelector('#progression-equipped-label');
        const cosmetic = cosmetics[id];
        if (label && cosmetic) label.textContent = `${cosmetic.icon} ${cosmetic.title}`;
    }

    function equipCosmetic(id) {
        if (!state.cosmeticsUnlocked.includes(id)) return;
        state.selectedCosmetic = id;
        saveState();
        applyCosmetic();
        renderAll();
        showToast(`${cosmetics[id].title} equipped`, 'cosmetic');
    }

    function refresh() {
        const key = storageKey();
        if (key !== progressKey) {
            progressKey = key;
            state = loadState();
            lastMetricsSignature = '';
        }
        if (!state) state = loadState();

        const history = completedHistory();
        const info = metrics(history);
        const signature = `${history.map(play => `${play.id}:${play.result}:${play.winnings}`).join('|')}|${state.xp}|${JSON.stringify(state.dailyClaims)}`;
        let changed = syncCompletedPlays(history);
        changed = settleDailyChallenges(history) || changed;
        changed = evaluateAchievements(info) || changed;
        const previousCosmetics = state.cosmeticsUnlocked.join(',');
        evaluateCosmetics(info);
        changed = changed || previousCosmetics !== state.cosmeticsUnlocked.join(',');

        if (changed || signature !== lastMetricsSignature) {
            lastMetricsSignature = signature;
            saveState();
            applyCosmetic();
            renderAll();
        } else {
            applyCosmetic();
        }
    }

    function createUi() {
        if (!document.getElementById('progression-open')) {
            const button = document.createElement('button');
            button.id = 'progression-open';
            button.className = 'progression-launcher';
            button.type = 'button';
            button.setAttribute('aria-label', 'Open player progression');
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
            const stack = document.createElement('div');
            stack.id = 'progression-toast-stack';
            stack.className = 'progression-toast-stack';
            document.body.appendChild(stack);
        }
    }

    function wireInlineActions(root = document) {
        root.querySelectorAll('[data-progression-action]').forEach(element => {
            if (element.dataset.progressionBound === 'true') return;
            element.dataset.progressionBound = 'true';
            element.addEventListener('click', event => {
                event.preventDefault();
                const action = element.dataset.progressionAction;
                if (action === 'open') openPanel();
                if (action === 'close') closePanel();
                if (action === 'equip') equipCosmetic(element.dataset.cosmetic);
            });
        });
    }

    document.addEventListener('click', event => {
        const action = event.target.closest('[data-progression-action]')?.dataset.progressionAction;
        if (!action) return;
        if (action === 'open') openPanel();
        if (action === 'close') closePanel();
        if (action === 'equip') equipCosmetic(event.target.closest('[data-cosmetic]')?.dataset.cosmetic);
    });

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && panelOpen) closePanel();
    });

    function openPanel() {
        panelOpen = true;
        const panel = document.getElementById('progression-panel');
        if (!panel) return;
        panel.classList.add('is-open');
        panel.setAttribute('aria-hidden', 'false');
        document.body.classList.add('modal-open');
        renderProgressionPanel(panel);
    }

    function closePanel() {
        panelOpen = false;
        document.getElementById('progression-panel')?.classList.remove('is-open');
        document.getElementById('progression-panel')?.setAttribute('aria-hidden', 'true');
        if (!document.querySelector('.game-modal.is-open') && !document.querySelector('.account-modal.is-open') && !document.querySelector('.update-modal.is-open')) {
            document.body.classList.remove('modal-open');
        }
    }

    function renderAll() {
        if (!state) return;
        const panel = document.getElementById('progression-panel');
        if (panelOpen && panel) renderProgressionPanel(panel);
        renderInlineUser();
        renderIndexCard();
        const pill = document.getElementById('progression-level-pill');
        if (pill) pill.textContent = `Lv. ${levelFromXp(state.xp)}`;
    }

    function renderProgressionPanel(panel) {
        const history = completedHistory();
        const info = metrics(history);
        panel.innerHTML = `<div class="progression-dialog" role="dialog" aria-modal="true" aria-labelledby="progression-title">
            <button class="progression-close" type="button" data-progression-action="close" aria-label="Close progression">&times;</button>
            ${progressionMarkup(info, history, true)}
        </div>`;
        wireInlineActions(panel);
    }

    function progressionMarkup(info, history, detailed) {
        const progress = levelProgress(state.xp);
        const daily = dailyMetrics(history);
        const challenges = dailyChallenges();
        const claims = new Set(dailyClaimsForToday());
        const unlockedAchievements = Object.keys(state.achievements).length;
        const equipped = cosmetics[state.selectedCosmetic] || cosmetics.starter;

        return `<div class="progression-hero">
                <div><span class="progression-kicker">Player progression</span><h2 id="progression-title">Level ${progress.level}</h2><p>${escapeHtml(accountKey() === 'guest' ? 'Guest browser profile' : accountKey())} · ${state.xp.toLocaleString()} XP</p></div>
                <div class="progression-level-badge">${progress.level}</div>
            </div>
            <div class="progression-xp-wrap">
                <div class="progression-xp-head"><span>XP to next level</span><strong>${progress.level >= MAX_LEVEL ? 'MAX LEVEL' : `${progress.within.toLocaleString()} / ${(progress.nextFloor - progress.currentFloor).toLocaleString()}`}</strong></div>
                <div class="progression-xp-track"><span style="width:${progress.percent}%"></span></div>
                <small>${progress.level >= MAX_LEVEL ? 'Level cap reached.' : `${Math.max(0, progress.nextFloor - state.xp).toLocaleString()} XP remaining`}</small>
            </div>
            <div class="progression-equipped"><span>Equipped cosmetic</span><strong id="progression-equipped-label">${equipped.icon} ${escapeHtml(equipped.title)}</strong></div>
            <div class="progression-stats"><div><strong>${info.gamesPlayed}</strong><span>Games</span></div><div><strong>${info.wins}</strong><span>Wins</span></div><div><strong>${info.totalWagered.toLocaleString()}</strong><span>Wagered</span></div><div><strong>${unlockedAchievements}</strong><span>Achievements</span></div></div>
            ${dailyMarkup(challenges, claims, daily)}
            ${detailed ? achievementsMarkup() : ''}
            ${detailed ? cosmeticsMarkup() : ''}
            <div class="progression-footer-note">XP, achievements, daily progress, and cosmetics are saved per browser account. Progression rewards do not change the game's token balance.</div>`;
    }

    function dailyMarkup(challenges, claims, daily) {
        return `<section class="progression-section"><div class="progression-section-head"><div><span class="progression-kicker">Every day · ${todayKey()}</span><h3>Daily challenges</h3></div><span>${claims.size}/3 complete</span></div><div class="progression-grid progression-challenges">${challenges.map(challenge => {
            const value = challengeProgress(challenge, daily);
            const done = claims.has(challenge.id);
            const percent = Math.min(100, Math.round((value / challenge.target) * 100));
            return `<article class="progression-card ${done ? 'is-complete' : ''}"><div class="progression-card-icon">${challenge.icon}</div><div class="progression-card-main"><div class="progression-card-title"><strong>${escapeHtml(challenge.title)}</strong><span>${done ? '✓ Done' : `+${DAILY_XP} XP`}</span></div><p>${escapeHtml(challenge.description)}</p><div class="progression-mini-track"><span style="width:${percent}%"></span></div><small>${value.toLocaleString()} / ${challenge.target.toLocaleString()}</small></div></article>`;
        }).join('')}</div></section>`;
    }

    function achievementsMarkup() {
        return `<section class="progression-section"><div class="progression-section-head"><div><span class="progression-kicker">Milestones</span><h3>Achievements</h3></div><span>${Object.keys(state.achievements).length}/${Object.keys(achievements).length}</span></div><div class="progression-grid progression-achievements">${Object.entries(achievements).map(([id, achievement]) => {
            const unlocked = Boolean(state.achievements[id]);
            return `<article class="progression-achievement ${unlocked ? 'is-unlocked' : ''}"><div class="progression-achievement-icon">${achievement.icon}</div><div><strong>${escapeHtml(achievement.title)}</strong><p>${escapeHtml(achievement.description)}</p><span class="${unlocked ? 'progression-unlocked' : 'progression-locked'}">${unlocked ? 'Unlocked' : 'Locked'}</span></div></article>`;
        }).join('')}</div></section>`;
    }

    function cosmeticsMarkup() {
        return `<section class="progression-section"><div class="progression-section-head"><div><span class="progression-kicker">Customization</span><h3>Cosmetic unlocks</h3></div><span>${state.cosmeticsUnlocked.length}/${Object.keys(cosmetics).length}</span></div><div class="progression-grid progression-cosmetics">${Object.entries(cosmetics).map(([id, cosmetic]) => {
            const unlocked = state.cosmeticsUnlocked.includes(id);
            const equipped = state.selectedCosmetic === id;
            return `<article class="progression-cosmetic ${unlocked ? 'is-unlocked' : 'is-locked'} ${equipped ? 'is-equipped' : ''}"><div class="progression-cosmetic-icon">${cosmetic.icon}</div><div><strong>${escapeHtml(cosmetic.title)}</strong><p>${escapeHtml(cosmetic.requirement)}</p>${unlocked ? `<button type="button" class="progression-equip" data-progression-action="equip" data-cosmetic="${id}">${equipped ? 'Equipped' : 'Equip'}</button>` : '<span class="progression-locked">Locked</span>'}</div></article>`;
        }).join('')}</div></section>`;
    }

    function renderInlineUser() {
        const profile = document.querySelector('.user-profile');
        if (!profile) return;
        let inline = document.getElementById('progression-inline');
        if (!inline) {
            inline = document.createElement('section');
            inline.id = 'progression-inline';
            inline.className = 'progression-inline';
            const profileCard = profile.querySelector('.user-profile-card');
            if (profileCard) profileCard.insertAdjacentElement('afterend', inline);
            else profile.prepend(inline);
        }
        const history = completedHistory();
        const info = metrics(history);
        inline.innerHTML = progressionMarkup(info, history, true).replace('id="progression-title"', 'id="progression-inline-title"');
        wireInlineActions(inline);
    }

    function renderIndexCard() {
        const sidebar = document.querySelector('.dashboard-sidebar');
        if (!sidebar) return;
        let card = document.getElementById('progression-index-card');
        if (!card) {
            card = document.createElement('div');
            card.id = 'progression-index-card';
            card.className = 'sidebar-card progression-index-card';
            const wallet = sidebar.querySelector('.wallet-card');
            wallet?.insertAdjacentElement('afterend', card);
            if (!wallet) sidebar.prepend(card);
        }
        const history = completedHistory();
        const info = metrics(history);
        const progress = levelProgress(state.xp);
        const daily = dailyMetrics(history);
        const claims = new Set(dailyClaimsForToday());
        const challenges = dailyChallenges();
        card.innerHTML = `<div class="sidebar-title"><span>✨</span> Progression</div><div class="progression-index-level"><strong>Level ${progress.level}</strong><span>${state.xp.toLocaleString()} XP</span></div><div class="progression-xp-track"><span style="width:${progress.percent}%"></span></div><div class="progression-index-meta"><span>${info.gamesPlayed} games</span><span>${info.wins} wins</span></div><div class="progression-index-challenges">${challenges.map(challenge => {
            const value = challengeProgress(challenge, daily);
            const done = claims.has(challenge.id);
            return `<div><span>${challenge.icon}</span><p>${escapeHtml(challenge.title)}</p><b>${done ? '✓' : `${value}/${challenge.target}`}</b></div>`;
        }).join('')}</div><button class="progression-index-button" type="button" data-progression-action="open">Open progression</button>`;
        wireInlineActions(card);
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
                --prog-panel: rgba(13, 16, 32, 0.97);
                --prog-card: rgba(255,255,255,0.045);
                --prog-border: rgba(255,255,255,0.10);
                --prog-text: #f7f7ff;
                --prog-muted: #aeb4cb;
            }
            .light-mode { --prog-panel: rgba(255,255,255,0.98); --prog-card: rgba(20,30,60,0.05); --prog-border: rgba(20,30,60,0.12); --prog-text: #141625; --prog-muted: #5f6678; }
            .progression-launcher { position:fixed; right:18px; bottom:18px; z-index:4100; display:inline-flex; align-items:center; gap:8px; border:1px solid var(--prog-border); border-radius:999px; padding:10px 14px; background:var(--prog-panel); color:var(--prog-text); box-shadow:0 12px 40px rgba(0,0,0,.20); cursor:pointer; font:inherit; backdrop-filter:blur(14px); }
            .progression-launcher b { font-size:13px; } .progression-launcher small { opacity:.72; font-weight:800; }
            .progression-overlay { position:fixed; inset:0; z-index:4200; display:none; place-items:center; padding:20px; background:rgba(2,5,12,.66); backdrop-filter:blur(7px); }
            .progression-overlay.is-open { display:grid; }
            .progression-dialog,.progression-inline { color:var(--prog-text); background:var(--prog-panel); border:1px solid var(--prog-border); border-radius:28px; box-shadow:0 35px 100px rgba(0,0,0,.32); }
            .progression-dialog { position:relative; width:min(1040px,96vw); max-height:92vh; overflow:auto; padding:28px; }
            .progression-inline { margin:24px 0; padding:24px; }
            .progression-close { position:absolute; top:14px; right:16px; width:38px; height:38px; border:1px solid var(--prog-border); border-radius:50%; background:transparent; color:inherit; font-size:24px; cursor:pointer; }
            .progression-kicker { font-size:11px; text-transform:uppercase; letter-spacing:.14em; opacity:.62; font-weight:900; }
            .progression-hero { display:flex; justify-content:space-between; gap:18px; padding-right:44px; } .progression-hero h2 { margin:7px 0 3px; font-size:clamp(28px,5vw,44px); } .progression-hero p { margin:0; color:var(--prog-muted); overflow-wrap:anywhere; }
            .progression-level-badge { min-width:80px; height:80px; border-radius:24px; display:grid; place-items:center; font-size:28px; font-weight:900; background:linear-gradient(135deg,var(--prog-accent),var(--prog-accent-2)); color:white; box-shadow:0 15px 30px rgba(124,92,255,.28); }
            .progression-xp-wrap { margin-top:20px; padding:18px; border:1px solid var(--prog-border); border-radius:18px; background:var(--prog-card); }
            .progression-xp-head,.progression-card-title,.progression-section-head,.progression-index-level,.progression-index-meta { display:flex; align-items:center; justify-content:space-between; gap:12px; }
            .progression-xp-head { color:var(--prog-muted); font-size:13px; } .progression-xp-head strong { color:var(--prog-text); }
            .progression-xp-track,.progression-mini-track { height:9px; overflow:hidden; border-radius:999px; background:rgba(127,140,170,.20); }
            .progression-xp-track { margin:11px 0 7px; } .progression-xp-track span,.progression-mini-track span { display:block; height:100%; border-radius:inherit; background:linear-gradient(90deg,var(--prog-accent),var(--prog-accent-2)); transition:width .35s ease; }
            .progression-xp-wrap small,.progression-card-main small { color:var(--prog-muted); }
            .progression-equipped { margin-top:10px; padding:12px 14px; border:1px solid var(--prog-border); border-radius:14px; background:var(--prog-card); display:flex; justify-content:space-between; gap:10px; font-size:12px; } .progression-equipped span { color:var(--prog-muted); }
            .progression-stats { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; margin-top:10px; } .progression-stats div { padding:15px; border:1px solid var(--prog-border); border-radius:16px; background:var(--prog-card); } .progression-stats strong { display:block; font-size:20px; } .progression-stats span { display:block; margin-top:4px; color:var(--prog-muted); font-size:12px; }
            .progression-section { margin-top:24px; } .progression-section-head { margin-bottom:10px; } .progression-section-head h3 { margin:4px 0 0; font-size:20px; } .progression-section-head > span { color:var(--prog-muted); font-size:12px; }
            .progression-grid { display:grid; gap:10px; } .progression-challenges,.progression-achievements { grid-template-columns:repeat(3,minmax(0,1fr)); } .progression-cosmetics { grid-template-columns:repeat(4,minmax(0,1fr)); }
            .progression-card,.progression-achievement,.progression-cosmetic { border:1px solid var(--prog-border); border-radius:18px; background:var(--prog-card); padding:15px; }
            .progression-card { display:flex; gap:12px; } .progression-card.is-complete { border-color:rgba(62,214,143,.38); }
            .progression-card-icon,.progression-achievement-icon,.progression-cosmetic-icon { width:42px; height:42px; display:grid; place-items:center; border-radius:12px; background:rgba(124,92,255,.13); flex:0 0 auto; font-size:20px; }
            .progression-card-main,.progression-achievement div:last-child,.progression-cosmetic div:last-child { min-width:0; flex:1; } .progression-card-title strong,.progression-achievement strong,.progression-cosmetic strong { font-size:13px; } .progression-card-title span { font-size:11px; color:var(--prog-muted); white-space:nowrap; }
            .progression-card p,.progression-achievement p,.progression-cosmetic p { margin:5px 0 9px; color:var(--prog-muted); font-size:12px; line-height:1.4; } .progression-mini-track { height:6px; margin-bottom:5px; }
            .progression-achievement,.progression-cosmetic { display:flex; gap:12px; } .progression-achievement.is-unlocked { border-color:rgba(37,208,255,.30); } .progression-cosmetic.is-locked { opacity:.56; } .progression-cosmetic.is-equipped { box-shadow:0 0 0 2px var(--prog-accent); }
            .progression-unlocked { display:inline-block; color:#55e8a2; font-size:10px; font-weight:900; text-transform:uppercase; letter-spacing:.08em; } .progression-locked { display:inline-block; color:var(--prog-muted); font-size:10px; font-weight:900; text-transform:uppercase; letter-spacing:.08em; }
            .progression-equip,.progression-index-button { border:1px solid var(--prog-border); border-radius:999px; padding:7px 11px; background:transparent; color:inherit; cursor:pointer; font:inherit; font-size:11px; font-weight:900; } .progression-equip { margin-top:2px; } .progression-index-button { width:100%; margin-top:12px; }
            .progression-footer-note { margin-top:22px; padding-top:16px; border-top:1px solid var(--prog-border); color:var(--prog-muted); font-size:11px; line-height:1.5; }
            .progression-toast-stack { position:fixed; top:82px; right:18px; z-index:5000; display:flex; flex-direction:column; align-items:flex-end; gap:9px; pointer-events:none; } .progression-toast { max-width:min(380px,calc(100vw - 36px)); padding:11px 14px; border:1px solid var(--prog-border); border-radius:14px; background:var(--prog-panel); color:var(--prog-text); box-shadow:0 15px 40px rgba(0,0,0,.25); transform:translateY(-8px); opacity:0; transition:transform .2s ease,opacity .2s ease; font-size:12px; } .progression-toast.is-visible { transform:translateY(0); opacity:1; }
            .progression-toast.is-success { border-color:rgba(62,214,143,.45); } .progression-toast.is-achievement { border-color:rgba(255,194,92,.55); } .progression-toast.is-cosmetic { border-color:rgba(37,208,255,.45); } .progression-toast.is-level { border-color:rgba(124,92,255,.60); }
            .progression-index-card .sidebar-title { margin-bottom:12px; } .progression-index-level strong { font-size:18px; } .progression-index-level span,.progression-index-meta span { color:var(--prog-muted); font-size:11px; } .progression-index-meta { margin-top:7px; } .progression-index-challenges { display:grid; gap:7px; margin-top:11px; } .progression-index-challenges div { display:grid; grid-template-columns:auto 1fr auto; align-items:center; gap:7px; font-size:11px; } .progression-index-challenges p { margin:0; color:var(--prog-muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; } .progression-index-challenges b { font-size:10px; }
            html[data-progression-cosmetic="neon"] .progression-dialog,html[data-progression-cosmetic="neon"] .progression-inline { box-shadow:0 35px 120px rgba(37,208,255,.16),0 0 0 1px rgba(124,92,255,.20); }
            html[data-progression-cosmetic="emerald"] .progression-dialog,html[data-progression-cosmetic="emerald"] .progression-inline { box-shadow:0 35px 120px rgba(43,214,143,.16),0 0 0 1px rgba(43,214,143,.18); }
            html[data-progression-cosmetic="royal"] .progression-dialog,html[data-progression-cosmetic="royal"] .progression-inline { box-shadow:0 35px 120px rgba(255,194,92,.20),0 0 0 1px rgba(255,194,92,.20); }
            html[data-progression-cosmetic="cyber"] .progression-dialog,html[data-progression-cosmetic="cyber"] .progression-inline { box-shadow:0 35px 120px rgba(255,64,180,.15),0 0 0 1px rgba(124,92,255,.22); }
            html[data-progression-cosmetic="champion"] .progression-dialog,html[data-progression-cosmetic="champion"] .progression-inline { box-shadow:0 35px 120px rgba(255,95,95,.18),0 0 0 1px rgba(255,132,67,.20); }
            html[data-progression-cosmetic="veteran"] .progression-dialog,html[data-progression-cosmetic="veteran"] .progression-inline { box-shadow:0 35px 120px rgba(96,125,255,.17),0 0 0 1px rgba(120,160,255,.20); }
            html[data-progression-cosmetic="jackpot"] .progression-dialog,html[data-progression-cosmetic="jackpot"] .progression-inline { box-shadow:0 35px 120px rgba(255,194,92,.18),0 0 0 1px rgba(255,194,92,.24); }
            @media (max-width: 900px) { .progression-challenges,.progression-achievements { grid-template-columns:repeat(2,minmax(0,1fr)); } .progression-cosmetics { grid-template-columns:repeat(2,minmax(0,1fr)); } }
            @media (max-width: 650px) { .progression-launcher { right:10px; bottom:10px; } .progression-launcher b { display:none; } .progression-dialog,.progression-inline { padding:20px; border-radius:22px; } .progression-stats { grid-template-columns:repeat(2,1fr); } .progression-challenges,.progression-achievements,.progression-cosmetics { grid-template-columns:1fr; } .progression-level-badge { min-width:64px; height:64px; border-radius:20px; font-size:23px; } .progression-equipped { flex-direction:column; } }
        `;
        document.head.appendChild(style);
    }

    applyCosmetic();
})();