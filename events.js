(function () {
    'use strict';

    const EVENT_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
    const EVENT_ANCHOR_MS = Date.UTC(2026, 8, 14, 0, 0, 0);
    const GAME_HISTORY_KEY = 'lucky-jackpot-game-history';
    const ACCOUNT_KEY = 'lucky-jackpot-accounts';

    const EVENTS = [
        {
            id: 'jackpot-surge',
            name: 'Jackpot Surge',
            kicker: 'Rotating jackpot event',
            description: 'Jackpot wins receive an extra 50% event bonus while this event is active.',
            modifierLabel: '+50% on jackpot wins',
            badge: 'JACKPOT',
            colorClass: 'is-gold'
        },
        {
            id: 'lucky-payouts',
            name: 'Lucky Payouts',
            kicker: 'Limited-time modifier',
            description: 'Every winning game gets an extra 25% bonus payout for the event window.',
            modifierLabel: '+25% on winning payouts',
            badge: 'PAYOUTS',
            colorClass: 'is-purple'
        },
        {
            id: 'high-roller-rush',
            name: 'High Roller Rush',
            kicker: 'Limited-time modifier',
            description: 'Wins made with bets of 50+ tokens receive an extra 50% event bonus.',
            modifierLabel: '+50% on 50+ token bets',
            badge: 'HIGH ROLLER',
            colorClass: 'is-blue'
        },
        {
            id: 'winners-week',
            name: "Winner's Week",
            kicker: 'Limited-time modifier',
            description: 'Winning plays receive a 15% bonus and award double event points.',
            modifierLabel: '+15% win bonus · 2x event points',
            badge: 'STREAK',
            colorClass: 'is-green'
        }
    ];

    function getCurrentEvent() {
        const elapsed = Math.max(0, Date.now() - EVENT_ANCHOR_MS);
        const index = Math.floor(elapsed / EVENT_WEEK_MS) % EVENTS.length;
        return EVENTS[index];
    }

    function getEventStartMs() {
        const elapsed = Math.max(0, Date.now() - EVENT_ANCHOR_MS);
        const cycleIndex = Math.floor(elapsed / EVENT_WEEK_MS);
        return EVENT_ANCHOR_MS + cycleIndex * EVENT_WEEK_MS;
    }

    function getMsUntilRotation() {
        const elapsed = Math.max(0, Date.now() - EVENT_ANCHOR_MS);
        return EVENT_WEEK_MS - (elapsed % EVENT_WEEK_MS);
    }

    function formatCountdown(ms) {
        const totalSeconds = Math.max(0, Math.floor(ms / 1000));
        const days = Math.floor(totalSeconds / 86400);
        const hours = Math.floor((totalSeconds % 86400) / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        if (days) return `${days}d ${hours}h ${minutes}m`;
        if (hours) return `${hours}h ${minutes}m ${seconds}s`;
        return `${minutes}m ${seconds}s`;
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

    function getHistoryByAccount() {
        try {
            const history = JSON.parse(localStorage.getItem(GAME_HISTORY_KEY) || '{}');
            return history && typeof history === 'object' ? history : {};
        } catch (error) {
            return {};
        }
    }

    function getSavedAccounts() {
        try {
            const accounts = JSON.parse(localStorage.getItem(ACCOUNT_KEY) || '[]');
            return Array.isArray(accounts) ? accounts : [];
        } catch (error) {
            return [];
        }
    }

    function isCompletedPlay(play) {
        return Boolean(play && play.result && play.result !== 'Played');
    }

    function getEventStats() {
        const startMs = getEventStartMs();
        const nowMs = Date.now();
        const history = getHistoryByAccount();
        const accounts = getSavedAccounts();
        const accountMap = new Map(accounts.map(account => [account.email, account]));
        const emails = new Set([...Object.keys(history), ...accountMap.keys()]);
        const pointsMultiplier = getCurrentEvent().id === 'winners-week' ? 2 : 1;
        const rows = [];

        emails.forEach(email => {
            const plays = Array.isArray(history[email]) ? history[email] : [];
            const eventPlays = plays.filter(play => {
                const playedAt = Date.parse(play.playedAt || '');
                return Number.isFinite(playedAt) && playedAt >= startMs && playedAt <= nowMs && isCompletedPlay(play);
            });
            if (!eventPlays.length) return;

            const account = accountMap.get(email);
            const wagered = eventPlays.reduce((sum, play) => sum + Math.max(0, Number(play.bet) || 0), 0);
            const winnings = eventPlays.reduce((sum, play) => sum + Math.max(0, Number(play.winnings) || 0), 0);
            const wins = eventPlays.filter(play => Number(play.winnings) > 0).length;
            const jackpotEntries = eventPlays.filter(play => play.game === 'jackpot').length;
            const eventPoints = Math.round((wagered + winnings + wins * 50 + jackpotEntries * 100) * pointsMultiplier);
            const biggestWin = eventPlays.reduce((best, play) => Math.max(best, Math.max(0, Number(play.winnings) || 0)), 0);

            rows.push({
                email,
                name: account?.name || (email === 'guest' ? 'Guest' : 'Player'),
                eventPoints,
                wagered,
                biggestWin,
                wins,
                jackpotEntries
            });
        });

        return rows;
    }

    function eventBonusFor(game, winnings, bet) {
        if (!Number.isFinite(winnings) || winnings <= 0) return 0;
        const event = getCurrentEvent();
        if (event.id === 'jackpot-surge' && game === 'jackpot') return Math.floor(winnings * 0.5);
        if (event.id === 'lucky-payouts') return Math.floor(winnings * 0.25);
        if (event.id === 'high-roller-rush' && bet >= 50) return Math.floor(winnings * 0.5);
        if (event.id === 'winners-week') return Math.floor(winnings * 0.15);
        return 0;
    }

    function showEventToast(message, event = getCurrentEvent()) {
        const existing = document.querySelector('.event-toast');
        if (existing) existing.remove();
        const toast = document.createElement('div');
        toast.className = 'event-toast';
        toast.innerHTML = `<strong>${escapeHtml(event.name)}</strong>${escapeHtml(message)}`;
        document.body.appendChild(toast);
        window.setTimeout(() => toast.remove(), 3200);
    }

    function patchGamePayouts() {
        if (typeof completeGamePlay !== 'function' || completeGamePlay.__eventsPatched) return;
        const originalCompleteGamePlay = completeGamePlay;
        const patchedCompleteGamePlay = function (result, winnings = 0) {
            originalCompleteGamePlay(result, winnings);
            const game = typeof gameState !== 'undefined' ? gameState.game : '';
            const bet = typeof gameState !== 'undefined' ? Number(gameState.currentBet) || 0 : 0;
            const bonus = eventBonusFor(game, Number(winnings), bet);
            if (!bonus || typeof gameState === 'undefined') return;
            gameState.credits += bonus;
            if (typeof updateCreditCounter === 'function') updateCreditCounter();
            showEventToast(`Event bonus +${bonus.toLocaleString()} tokens`, getCurrentEvent());
        };
        patchedCompleteGamePlay.__eventsPatched = true;
        completeGamePlay = patchedCompleteGamePlay;
    }

    function removeProgressionRoadmapCard() {
        document.querySelectorAll('.admin-update-card').forEach(card => {
            const title = card.querySelector('strong');
            if (!title) return;
            const normalizedTitle = title.textContent.trim().toLowerCase();
            if (normalizedTitle === 'player progression') {
                card.remove();
                return;
            }
            if (normalizedTitle === 'seasonal events') {
                const phase = card.querySelector('.admin-update-version');
                const details = card.querySelector('p');
                if (phase && phase.textContent !== 'Live now') phase.textContent = 'Live now';
                const liveDetails = 'Rotating jackpot events, limited-time modifiers, and leaderboards are live.';
                if (details && details.textContent !== liveDetails) details.textContent = liveDetails;
            }
        });
    }

    function patchAdminRoadmap() {
        if (typeof renderAdminDashboard !== 'function' || renderAdminDashboard.__eventsPatched) return;
        const originalRenderAdminDashboard = renderAdminDashboard;
        const patchedRenderAdminDashboard = async function (...args) {
            const result = await originalRenderAdminDashboard(...args);
            if (args[1] === 'roadmap') removeProgressionRoadmapCard();
            return result;
        };
        patchedRenderAdminDashboard.__eventsPatched = true;
        renderAdminDashboard = patchedRenderAdminDashboard;
    }

    function injectStyles() {
        if (document.querySelector('#seasonal-event-styles')) return;
        const style = document.createElement('style');
        style.id = 'seasonal-event-styles';
        style.textContent = `
            .seasonal-event-shell{margin:0 auto 28px;max-width:1180px;padding:0 20px}
            .seasonal-event-card{border:1px solid rgba(255,255,255,.1);border-radius:22px;padding:22px 24px;background:linear-gradient(135deg,rgba(21,18,44,.98),rgba(30,23,64,.96));box-shadow:0 18px 50px rgba(0,0,0,.18);color:#fff;position:relative;overflow:hidden}
            .seasonal-event-card:after{content:"";position:absolute;inset:-40% -10% auto auto;width:240px;height:240px;border-radius:50%;background:rgba(255,211,92,.12);filter:blur(20px);pointer-events:none}
            .seasonal-event-top{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;position:relative;z-index:1}
            .seasonal-event-kicker{font-size:.76rem;letter-spacing:.12em;text-transform:uppercase;opacity:.72}
            .seasonal-event-title{margin:4px 0 6px;font-size:clamp(1.35rem,2vw,1.9rem)}
            .seasonal-event-copy{margin:0;max-width:760px;opacity:.82}
            .seasonal-event-badge{padding:7px 10px;border-radius:999px;font-size:.7rem;font-weight:800;letter-spacing:.08em;background:rgba(255,255,255,.12);white-space:nowrap}
            .seasonal-event-meta{display:flex;flex-wrap:wrap;gap:10px;margin-top:16px;position:relative;z-index:1}
            .seasonal-event-chip{padding:9px 12px;border-radius:12px;background:rgba(255,255,255,.07);font-size:.84rem}
            .seasonal-event-chip strong{margin-left:5px}
            .seasonal-event-actions{display:flex;gap:10px;margin-top:18px;position:relative;z-index:1;flex-wrap:wrap}
            .seasonal-event-actions a{display:inline-flex;align-items:center;justify-content:center;padding:10px 14px;border-radius:12px;text-decoration:none;font-weight:700;background:#fff;color:#1a1630}
            .seasonal-event-actions button{border:1px solid rgba(255,255,255,.18);background:transparent;color:#fff;border-radius:12px;padding:10px 14px;font:inherit;font-weight:700;cursor:pointer}
            .seasonal-event-card.is-gold{border-color:rgba(255,211,92,.3)}
            .seasonal-event-card.is-purple{border-color:rgba(185,147,255,.3)}
            .seasonal-event-card.is-blue{border-color:rgba(101,186,255,.3)}
            .seasonal-event-card.is-green{border-color:rgba(117,224,164,.3)}
            .event-leaderboard-shell{margin-top:28px}
            .event-leaderboard-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
            .event-leaderboard-card{border:1px solid rgba(127,127,127,.16);border-radius:18px;padding:18px;background:var(--card-background,#fff)}
            .event-leaderboard-card h3{margin:0 0 4px}
            .event-leaderboard-card p{margin:0 0 12px;opacity:.7;font-size:.9rem}
            .event-leaderboard-row{display:grid;grid-template-columns:34px 1fr auto;align-items:center;gap:10px;padding:10px 0;border-top:1px solid rgba(127,127,127,.12)}
            .event-leaderboard-rank{font-weight:800}
            .event-leaderboard-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
            .event-leaderboard-score{font-weight:800;text-align:right}
            .event-leaderboard-note{margin:10px 0 0;font-size:.78rem;opacity:.62}
            .event-scoring-intro{margin:0 0 18px;color:var(--text-soft,#cbd5e1)}
            .event-scoring-list{display:grid;gap:10px;margin:0 0 20px}
            .event-scoring-row{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:13px 14px;border:1px solid rgba(148,163,184,.18);border-radius:12px;background:rgba(255,255,255,.04)}
            .event-scoring-row strong{white-space:normal;text-align:right}
            .event-scoring-example{margin:0 0 18px;padding:15px 16px;border-radius:14px;background:rgba(250,204,21,.09);border:1px solid rgba(250,204,21,.2)}
            .event-scoring-example strong{color:#facc15}
            .event-scoring-footer{margin:0;color:var(--muted,#94a3b8);font-size:.86rem}
            @media (max-width:820px){.event-leaderboard-grid{grid-template-columns:1fr}.seasonal-event-top{flex-direction:column}.seasonal-event-badge{align-self:flex-start}.event-scoring-row{align-items:flex-start}}
        `;
        document.head.appendChild(style);
    }

    function renderEventShell() {
        const event = getCurrentEvent();
        let shell = document.querySelector('#seasonal-event-shell');
        if (!shell) {
            shell = document.createElement('section');
            shell.id = 'seasonal-event-shell';
            shell.className = 'seasonal-event-shell';
            const gameSection = document.querySelector('#games');
            const leaderboardList = document.querySelector('#leaderboard-list');
            const profile = document.querySelector('.user-profile');
            if (gameSection) gameSection.parentNode.insertBefore(shell, gameSection);
            else if (leaderboardList) leaderboardList.parentNode.insertBefore(shell, leaderboardList);
            else if (profile) profile.prepend(shell);
            else document.body.insertBefore(shell, document.body.firstChild);
        }

        shell.innerHTML = `
            <div class="seasonal-event-card ${escapeHtml(event.colorClass)}">
                <div class="seasonal-event-top">
                    <div>
                        <div class="seasonal-event-kicker">${escapeHtml(event.kicker)}</div>
                        <h2 class="seasonal-event-title">${escapeHtml(event.name)}</h2>
                        <p class="seasonal-event-copy">${escapeHtml(event.description)}</p>
                    </div>
                    <span class="seasonal-event-badge">${escapeHtml(event.badge)}</span>
                </div>
                <div class="seasonal-event-meta">
                    <span class="seasonal-event-chip">Modifier<strong>${escapeHtml(event.modifierLabel)}</strong></span>
                    <span class="seasonal-event-chip">Ends in<strong data-event-countdown>${formatCountdown(getMsUntilRotation())}</strong></span>
                </div>
                <div class="seasonal-event-actions">
                    <a href="leaderboard.html">View leaderboards</a>
                    <button type="button" data-event-action="details">How event scoring works</button>
                </div>
            </div>`;

        shell.querySelector('[data-event-action="details"]')?.addEventListener('click', openEventScoringScreen);
    }

    function closeEventScoringScreen(modal) {
        modal?.remove();
        if (!document.querySelector('.game-modal.is-open') && !document.querySelector('.account-modal.is-open') && !document.querySelector('.update-modal.is-open') && !document.querySelector('.admin-modal.is-open')) {
            document.body.classList.remove('modal-open');
        }
    }

    function openEventScoringScreen() {
        const existing = document.querySelector('#event-scoring-modal');
        if (existing) {
            existing.classList.add('is-open');
            return;
        }

        const event = getCurrentEvent();
        const doublePoints = event.id === 'winners-week';
        const modal = document.createElement('div');
        modal.id = 'event-scoring-modal';
        modal.className = 'game-modal is-open';
        modal.innerHTML = `
            <div class="game-dialog" role="dialog" aria-modal="true" aria-labelledby="event-scoring-title">
                <button class="game-close" type="button" data-event-action="close-scoring" aria-label="Close event scoring">&times;</button>
                <div class="game-dialog-header">
                    <div>
                        <span class="game-kicker">Seasonal event</span>
                        <h2 id="event-scoring-title">How event scoring works</h2>
                    </div>
                    <div class="credit-counter">${escapeHtml(event.name)}</div>
                </div>
                <p class="event-scoring-intro">Event points are calculated from your completed plays during the current event window.</p>
                <div class="event-scoring-list">
                    <div class="event-scoring-row"><span>Tokens wagered</span><strong>+1 point per token</strong></div>
                    <div class="event-scoring-row"><span>Tokens won</span><strong>+1 point per token</strong></div>
                    <div class="event-scoring-row"><span>Winning play</span><strong>+50 points</strong></div>
                    <div class="event-scoring-row"><span>Jackpot play</span><strong>+100 points</strong></div>
                    <div class="event-scoring-row"><span>Current event modifier</span><strong>${escapeHtml(event.modifierLabel)}</strong></div>
                    ${doublePoints ? "<div class='event-scoring-row'><span>Winner's Week</span><strong>2x final event points</strong></div>" : ''}
                </div>
                <div class="event-scoring-example"><strong>Example:</strong> wager 25 tokens, win 50 tokens, and finish with a winning play = <strong>125 event points</strong>${doublePoints ? " before the 2x Winner's Week multiplier." : '.'}</div>
                <p class="event-scoring-footer">Leaderboard standings use completed play history saved in this browser and reset with the weekly event rotation.</p>
                <button class="game-action" type="button" data-event-action="close-scoring">Back to event</button>
            </div>`;

        modal.addEventListener('click', eventClick => {
            if (eventClick.target === modal || eventClick.target.closest('[data-event-action="close-scoring"]')) {
                closeEventScoringScreen(modal);
            }
        });
        document.body.appendChild(modal);
        document.body.classList.add('modal-open');
    }

    function refreshCountdown() {
        const countdown = document.querySelector('[data-event-countdown]');
        if (countdown) countdown.textContent = formatCountdown(getMsUntilRotation());
    }

    function renderSeasonalLeaderboards() {
        const list = document.querySelector('#leaderboard-list');
        if (!list) return;
        let shell = document.querySelector('#event-leaderboard-shell');
        if (!shell) {
            shell = document.createElement('section');
            shell.id = 'event-leaderboard-shell';
            shell.className = 'event-leaderboard-shell';
            list.parentNode.appendChild(shell);
        }

        const event = getCurrentEvent();
        const rows = getEventStats();
        const top = (field) => rows.slice().sort((a, b) => Number(b[field]) - Number(a[field])).slice(0, 10);

        const renderRows = (items, valueField, formatter) => items.length
            ? items.map((row, index) => `
                <div class="event-leaderboard-row">
                    <span class="event-leaderboard-rank">${index + 1}</span>
                    <span class="event-leaderboard-name">${escapeHtml(row.name)}</span>
                    <strong class="event-leaderboard-score">${formatter(row[valueField])}</strong>
                </div>`).join('')
            : '<p class="event-leaderboard-note">Play during this event to appear here.</p>';

        const points = top('eventPoints');
        const wins = top('biggestWin');
        const wagered = top('wagered');

        shell.innerHTML = `
            <div class="updates-heading">
                <div><span class="section-kicker">Seasonal event</span><h2>Event leaderboards</h2></div>
                <p>Current event: <strong>${escapeHtml(event.name)}</strong></p>
            </div>
            <div class="event-leaderboard-grid">
                <div class="event-leaderboard-card"><h3>Event points</h3><p>Overall event score.</p>${renderRows(points, 'eventPoints', value => `${Number(value).toLocaleString()} pts`)}</div>
                <div class="event-leaderboard-card"><h3>Biggest win</h3><p>Largest single recorded win.</p>${renderRows(wins, 'biggestWin', value => `${Number(value).toLocaleString()} tokens`)}</div>
                <div class="event-leaderboard-card"><h3>Total wagered</h3><p>Wager volume during the event.</p>${renderRows(wagered, 'wagered', value => `${Number(value).toLocaleString()} tokens`)}</div>
            </div>
            <p class="event-leaderboard-note">Event leaderboard data is calculated from saved play history in this browser.</p>`;
    }

    function updateSeasonalLeaderboards() {
        if (document.querySelector('#event-leaderboard-shell')) renderSeasonalLeaderboards();
    }

    function initialize() {
        injectStyles();
        patchGamePayouts();
        patchAdminRoadmap();
        removeProgressionRoadmapCard();
        renderEventShell();
        renderSeasonalLeaderboards();
        window.setInterval(refreshCountdown, 1000);
        window.setInterval(updateSeasonalLeaderboards, 5000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize, { once: true });
    } else {
        initialize();
    }

    window.LuckyJackpotEvents = {
        getCurrentEvent,
        getEventStats,
        refresh: updateSeasonalLeaderboards
    };
}());
