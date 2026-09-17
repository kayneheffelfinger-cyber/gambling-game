// Prevent the seasonal-event roadmap observer from repeatedly writing the same text.
// The observer updates the admin roadmap whenever the dashboard is rendered. A
// same-value textContent assignment still emits a mutation, which can create a
// mutation-observer loop and make the admin tabs appear frozen.
(function () {
    'use strict';

    const descriptor = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent');
    if (!descriptor || typeof descriptor.get !== 'function' || typeof descriptor.set !== 'function') return;
    if (window.__luckyJackpotTextContentGuardInstalled) return;

    const originalGet = descriptor.get;
    const originalSet = descriptor.set;

    Object.defineProperty(Node.prototype, 'textContent', {
        configurable: descriptor.configurable,
        enumerable: descriptor.enumerable,
        get: originalGet,
        set(value) {
            const current = originalGet.call(this);
            if (current === String(value ?? '')) return;
            originalSet.call(this, value);
        }
    });

    window.__luckyJackpotTextContentGuardInstalled = true;
})();
