(function () {
    'use strict';

    // ─── Globals ───
    var socket = io();
    var SH = window.StrictHotelSocket;
    var TI = window.TierlistItems;

    var TIERS = ['S', 'A', 'B', 'C', 'D', 'F'];
    var TIER_COLORS = { S: '#ffd700', A: '#ff6b6b', B: '#ff9f43', C: '#feca57', D: '#54a0ff', F: '#576574' };

    var weekKey = '';
    var weeklyItems = [];
    var myPlacements = {};   // itemIndex -> tier
    var communityData = {};  // itemIndex -> { S,A,B,C,D,F,total,avgTier,avgScore }
    var currentView = 'my';  // 'my' | 'community'

    var SORT_MODES = ['week', 'category', 'name'];
    var SORT_STORAGE_KEY = 'tierlist-unranked-sort';
    var unrankedSort = 'week';
    try {
        var savedSort = localStorage.getItem(SORT_STORAGE_KEY);
        if (SORT_MODES.indexOf(savedSort) !== -1) unrankedSort = savedSort;
    } catch (e) { /* localStorage unavailable */ }

    // ─── Within-Tier Ordering ───
    // The server only stores itemIndex -> tier (order inside a tier is
    // personal presentation, not part of the community aggregation), so the
    // arrangement within each tier row lives client-side, per week.

    var ORDER_STORAGE_PREFIX = 'tierlist-order-';
    var tierOrder = {}; // tier -> [itemIndex, ...]

    function loadTierOrder() {
        tierOrder = {};
        try {
            var raw = localStorage.getItem(ORDER_STORAGE_PREFIX + weekKey);
            if (raw) tierOrder = JSON.parse(raw) || {};
        } catch (e) { tierOrder = {}; }
        TIERS.forEach(function (tier) {
            if (!Array.isArray(tierOrder[tier])) tierOrder[tier] = [];
        });
        // Drop order entries from previous weeks
        try {
            for (var i = localStorage.length - 1; i >= 0; i--) {
                var key = localStorage.key(i);
                if (key && key.indexOf(ORDER_STORAGE_PREFIX) === 0 && key !== ORDER_STORAGE_PREFIX + weekKey) {
                    localStorage.removeItem(key);
                }
            }
        } catch (e) { /* ignore */ }
    }

    function saveTierOrder() {
        try {
            localStorage.setItem(ORDER_STORAGE_PREFIX + weekKey, JSON.stringify(tierOrder));
        } catch (e) { /* ignore */ }
    }

    function reconcileTierOrder() {
        // Drop stale entries, then append any placed item missing from its
        // tier's order list (e.g. placements synced from another device).
        TIERS.forEach(function (tier) {
            tierOrder[tier] = (tierOrder[tier] || []).filter(function (idx) {
                return myPlacements[idx] === tier;
            });
        });
        weeklyItems.forEach(function (item) {
            var tier = myPlacements[item.index];
            if (tier && TIERS.indexOf(tier) !== -1 && tierOrder[tier].indexOf(item.index) === -1) {
                tierOrder[tier].push(item.index);
            }
        });
    }

    // DOM refs
    var $unrankedPool = document.getElementById('unranked-pool');
    var $myView = document.getElementById('my-ranking-view');
    var $communityView = document.getElementById('community-view');
    var $communityList = document.getElementById('community-list');
    var $weekLabel = document.getElementById('week-label');
    var $weekCountdown = document.getElementById('week-countdown');
    var $rankerCount = document.getElementById('ranker-count');
    var $listenerCount = document.getElementById('listener-count');
    var $listenerCount2 = document.getElementById('listener-count-2');
    var $listenersList = document.getElementById('listeners-list');
    var $btnMy = document.getElementById('btn-my-view');
    var $btnCommunity = document.getElementById('btn-community-view');

    // ─── Helpers ───

    function escapeHtml(str) {
        return SH.escapeHtml(str);
    }

    function formatMondayDate(weekKeyStr) {
        // Parse weekKey like "2026-W07" into a readable date
        var monday = TI.getMondayDate();
        var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return 'Week of ' + months[monday.getUTCMonth()] + ' ' + monday.getUTCDate() + ', ' + monday.getUTCFullYear();
    }

    function updateCountdown() {
        var nextMonday = TI.getNextMondayUTC();
        var now = Date.now();
        var diff = nextMonday - now;
        if (diff <= 0) {
            $weekCountdown.textContent = 'Resetting...';
            // Reload after a short delay to get new week
            setTimeout(function () { location.reload(); }, 3000);
            return;
        }
        var days = Math.floor(diff / 86400000);
        var hours = Math.floor((diff % 86400000) / 3600000);
        var mins = Math.floor((diff % 3600000) / 60000);
        $weekCountdown.textContent = 'Resets in ' + days + 'd ' + hours + 'h ' + mins + 'm';
    }

    // ─── Item Card Creation ───

    function createItemCard(item) {
        var card = document.createElement('div');
        card.className = 'item-card';
        card.setAttribute('draggable', 'true');
        card.dataset.itemIndex = item.index;

        var img = document.createElement('img');
        img.alt = item.name;
        img.loading = 'lazy';
        img.src = item.image;
        img.onerror = function () {
            var fb = document.createElement('div');
            fb.className = 'item-fallback';
            fb.textContent = item.name;
            img.replaceWith(fb);
        };

        var name = document.createElement('div');
        name.className = 'item-name';
        name.textContent = item.name;

        card.appendChild(img);
        card.appendChild(name);

        // Desktop drag events
        card.addEventListener('dragstart', onDragStart);
        card.addEventListener('dragend', onDragEnd);

        // Mobile touch events
        card.addEventListener('touchstart', onTouchStart, { passive: false });

        return card;
    }

    // ─── Render Functions ───

    function sortUnrankedItems(items) {
        if (unrankedSort === 'category') {
            return items.slice().sort(function (a, b) {
                if (a.category !== b.category) return a.category < b.category ? -1 : 1;
                return a.name.localeCompare(b.name);
            });
        }
        if (unrankedSort === 'name') {
            return items.slice().sort(function (a, b) {
                return a.name.localeCompare(b.name);
            });
        }
        return items; // 'week' — keep the weekly shuffle order
    }

    function renderMyView() {
        reconcileTierOrder();

        // Clear all tier rows and unranked pool
        TIERS.forEach(function (tier) {
            var zone = document.querySelector('.tier-items[data-tier="' + tier + '"]');
            if (zone) zone.innerHTML = '';
        });
        $unrankedPool.innerHTML = '';

        // Fill tier rows in the player's arranged order
        TIERS.forEach(function (tier) {
            var zone = document.querySelector('.tier-items[data-tier="' + tier + '"]');
            if (!zone) return;
            tierOrder[tier].forEach(function (idx) {
                var item = weeklyItems[idx];
                if (item) zone.appendChild(createItemCard(item));
            });
        });

        // Everything unplaced goes to the pool
        var unranked = weeklyItems.filter(function (item) {
            var tier = myPlacements[item.index];
            return !(tier && TIERS.indexOf(tier) !== -1);
        });

        // Fill the unranked pool in the chosen sort order
        var lastCategory = null;
        sortUnrankedItems(unranked).forEach(function (item) {
            if (unrankedSort === 'category' && item.category !== lastCategory) {
                lastCategory = item.category;
                var label = document.createElement('div');
                label.className = 'pool-category-label';
                label.textContent = item.category.toUpperCase();
                $unrankedPool.appendChild(label);
            }
            $unrankedPool.appendChild(createItemCard(item));
        });
    }

    function renderCommunityView() {
        // Sort items by community avg score (descending)
        var items = weeklyItems.slice().sort(function (a, b) {
            var aData = communityData[a.index];
            var bData = communityData[b.index];
            var aScore = aData ? aData.avgScore : 0;
            var bScore = bData ? bData.avgScore : 0;
            if (bScore !== aScore) return bScore - aScore;
            var aTotal = aData ? aData.total : 0;
            var bTotal = bData ? bData.total : 0;
            return bTotal - aTotal;
        });

        var hasAnyData = false;
        var html = '';

        items.forEach(function (item) {
            var data = communityData[item.index];
            if (!data || data.total === 0) {
                // Show unranked items at the bottom
                html += '<div class="community-item" data-community-idx="' + item.index + '">';
                html += '<img class="community-item-img" src="' + escapeHtml(item.image) + '" alt="' + escapeHtml(item.name) + '" loading="lazy" onerror="this.outerHTML=\'<div class=\\\'community-item-img community-item-fallback\\\'>' + escapeHtml(item.name) + '</div>\'">';
                html += '<div class="community-item-info">';
                html += '<div class="community-item-name">' + escapeHtml(item.name) + '</div>';
                html += '<div class="community-item-meta">No votes yet</div>';
                html += '</div>';
                html += '</div>';
                return;
            }

            hasAnyData = true;
            html += '<div class="community-item" data-community-idx="' + item.index + '">';
            html += '<img class="community-item-img" src="' + escapeHtml(item.image) + '" alt="' + escapeHtml(item.name) + '" loading="lazy" onerror="this.outerHTML=\'<div class=\\\'community-item-img community-item-fallback\\\'>' + escapeHtml(item.name) + '</div>\'">';
            html += '<div class="community-item-info">';
            html += '<div class="community-item-name">' + escapeHtml(item.name) + '</div>';
            html += renderCommunityBar(data);
            html += '<div class="community-item-meta">' + data.total + ' vote' + (data.total !== 1 ? 's' : '') + '</div>';
            html += '</div>';
            html += '<div class="community-avg-badge avg-' + data.avgTier + '">' + data.avgTier + '</div>';
            html += '</div>';
        });

        $communityList.innerHTML = html || '<div class="empty-msg">No rankings yet this week</div>';
    }

    function renderCommunityBar(data) {
        if (!data || data.total === 0) return '';
        var html = '<div class="community-bar">';
        TIERS.forEach(function (tier) {
            var pct = (data[tier] / data.total) * 100;
            if (pct > 0) {
                html += '<div class="bar-segment" style="width:' + pct + '%;background:' + TIER_COLORS[tier] + '" title="' + tier + ': ' + data[tier] + '"></div>';
            }
        });
        html += '</div>';
        return html;
    }

    function updateListeners(listeners) {
        var count = listeners.length;
        $listenerCount.textContent = count;
        $listenerCount2.textContent = count;
        $listenersList.innerHTML = listeners.map(function (name) {
            return '<span class="listener-tag">' + escapeHtml(name) + '</span>';
        }).join('');
    }

    // ─── View Toggle ───

    $btnMy.addEventListener('click', function () {
        currentView = 'my';
        $btnMy.classList.add('active');
        $btnCommunity.classList.remove('active');
        $myView.style.display = '';
        $communityView.style.display = 'none';
    });

    $btnCommunity.addEventListener('click', function () {
        currentView = 'community';
        $btnCommunity.classList.add('active');
        $btnMy.classList.remove('active');
        $myView.style.display = 'none';
        $communityView.style.display = '';
        renderCommunityView();
    });

    // ─── Unranked Sort Controls ───

    var $sortBtns = document.querySelectorAll('.sort-btn');

    function updateSortButtons() {
        $sortBtns.forEach(function (btn) {
            btn.classList.toggle('active', btn.dataset.sort === unrankedSort);
        });
    }

    $sortBtns.forEach(function (btn) {
        btn.addEventListener('click', function () {
            var mode = btn.dataset.sort;
            if (SORT_MODES.indexOf(mode) === -1 || mode === unrankedSort) return;
            unrankedSort = mode;
            try { localStorage.setItem(SORT_STORAGE_KEY, mode); } catch (e) { /* ignore */ }
            updateSortButtons();
            renderMyView();
        });
    });

    updateSortButtons();

    // ─── Edge Auto-Scroll while dragging ───
    // The browser's native drag auto-scroll zone is tiny (or absent for touch),
    // which makes it hard to carry an item from the pool up to the tier rows.
    // While a drag is active, holding the pointer near the top/bottom of the
    // viewport scrolls the page, faster the closer it is to the edge.

    var SCROLL_EDGE = 140;      // px from viewport edge where auto-scroll kicks in
    var SCROLL_MAX_SPEED = 22;  // px per frame at the very edge

    var autoScrollSpeed = 0;
    var autoScrollRaf = null;

    function updateAutoScroll(clientY) {
        var vh = window.innerHeight;
        var speed = 0;
        if (clientY < SCROLL_EDGE) {
            var topRatio = Math.min(1, Math.max(0, 1 - clientY / SCROLL_EDGE));
            speed = -SCROLL_MAX_SPEED * topRatio;
        } else if (clientY > vh - SCROLL_EDGE) {
            var bottomRatio = Math.min(1, Math.max(0, 1 - (vh - clientY) / SCROLL_EDGE));
            speed = SCROLL_MAX_SPEED * bottomRatio;
        }
        autoScrollSpeed = speed;
        if (speed !== 0 && autoScrollRaf === null) {
            autoScrollRaf = requestAnimationFrame(autoScrollStep);
        }
    }

    function autoScrollStep() {
        if (autoScrollSpeed === 0) {
            autoScrollRaf = null;
            return;
        }
        window.scrollBy(0, autoScrollSpeed);
        // Keep the touch drop-zone highlight in sync with zones scrolling
        // past a stationary finger
        if (touchState && touchState.moved) {
            highlightZoneAt(touchState.lastX, touchState.lastY);
        }
        autoScrollRaf = requestAnimationFrame(autoScrollStep);
    }

    function stopAutoScroll() {
        autoScrollSpeed = 0;
        if (autoScrollRaf !== null) {
            cancelAnimationFrame(autoScrollRaf);
            autoScrollRaf = null;
        }
    }

    // ─── Insert Position & Marker ───
    // Where in a (wrapping) tier row a dragged card would land, based on the
    // pointer position: before the first card whose row contains the pointer
    // and whose left half the pointer is in.

    function getInsertPosition(zone, x, y) {
        var cards = zone.querySelectorAll('.item-card:not(.dragging)');
        for (var i = 0; i < cards.length; i++) {
            var r = cards[i].getBoundingClientRect();
            if (y < r.top) return i;
            if (y <= r.bottom && x < r.left + r.width / 2) return i;
        }
        return cards.length;
    }

    var $insertMarker = document.createElement('div');
    $insertMarker.className = 'insert-marker';

    function showInsertMarker(zone, x, y) {
        if (!zone.dataset.tier) { removeInsertMarker(); return; }
        var cards = zone.querySelectorAll('.item-card:not(.dragging)');
        var pos = getInsertPosition(zone, x, y);
        if (pos < cards.length) {
            zone.insertBefore($insertMarker, cards[pos]);
        } else {
            zone.appendChild($insertMarker);
        }
    }

    function removeInsertMarker() {
        if ($insertMarker.parentNode) $insertMarker.parentNode.removeChild($insertMarker);
    }

    // ─── Desktop Drag & Drop ───

    var dragItemIndex = null;

    function onDragStart(e) {
        dragItemIndex = parseInt(this.dataset.itemIndex, 10);
        e.dataTransfer.setData('text/plain', String(dragItemIndex));
        e.dataTransfer.effectAllowed = 'move';
        this.classList.add('dragging');
    }

    function onDragEnd() {
        this.classList.remove('dragging');
        clearDropHighlights();
        stopAutoScroll();
        dragItemIndex = null;
    }

    // Desktop: track pointer position during the whole drag for edge auto-scroll
    document.addEventListener('dragover', function (e) {
        if (dragItemIndex !== null) updateAutoScroll(e.clientY);
    });

    function onDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        this.classList.add('drag-over');
        showInsertMarker(this, e.clientX, e.clientY);
    }

    function onDragLeave() {
        this.classList.remove('drag-over');
    }

    function onDrop(e) {
        e.preventDefault();
        this.classList.remove('drag-over');
        removeInsertMarker();
        var idx = parseInt(e.dataTransfer.getData('text/plain'), 10);
        if (isNaN(idx)) return;

        var tier = this.dataset.tier;
        if (tier) {
            placeItem(idx, tier, getInsertPosition(this, e.clientX, e.clientY));
        } else {
            removeItem(idx);
        }
    }

    function clearDropHighlights() {
        document.querySelectorAll('.drag-over').forEach(function (el) {
            el.classList.remove('drag-over');
        });
        removeInsertMarker();
    }

    // Attach drop zones
    function setupDropZones() {
        var zones = document.querySelectorAll('.tier-items');
        zones.forEach(function (zone) {
            zone.addEventListener('dragover', onDragOver);
            zone.addEventListener('dragleave', onDragLeave);
            zone.addEventListener('drop', onDrop);
        });

        $unrankedPool.addEventListener('dragover', onDragOver);
        $unrankedPool.addEventListener('dragleave', onDragLeave);
        $unrankedPool.addEventListener('drop', onDrop);
    }

    // ─── Mobile Touch Drag & Drop ───

    var touchState = null;

    function onTouchStart(e) {
        var touch = e.touches[0];
        var card = e.currentTarget;
        var idx = parseInt(card.dataset.itemIndex, 10);

        // Create ghost
        var ghost = card.cloneNode(true);
        ghost.className = 'item-card drag-ghost';
        ghost.removeAttribute('draggable');
        document.body.appendChild(ghost);

        touchState = {
            itemIndex: idx,
            ghost: ghost,
            card: card,
            startX: touch.clientX,
            startY: touch.clientY,
            lastX: touch.clientX,
            lastY: touch.clientY,
            moved: false
        };

        positionGhost(ghost, touch.clientX, touch.clientY);
        card.classList.add('dragging');
    }

    function onTouchMove(e) {
        if (!touchState) return;
        e.preventDefault();
        var touch = e.touches[0];
        touchState.moved = true;
        touchState.lastX = touch.clientX;
        touchState.lastY = touch.clientY;
        positionGhost(touchState.ghost, touch.clientX, touch.clientY);
        updateAutoScroll(touch.clientY);
        highlightZoneAt(touch.clientX, touch.clientY);
    }

    function highlightZoneAt(x, y) {
        if (!touchState) return;
        clearDropHighlights();
        touchState.ghost.style.display = 'none';
        var elem = document.elementFromPoint(x, y);
        touchState.ghost.style.display = '';
        if (elem) {
            var zone = elem.closest('.tier-items, .unranked-pool');
            if (zone) {
                zone.classList.add('drag-over');
                showInsertMarker(zone, x, y);
            }
        }
    }

    function onTouchEnd(e) {
        if (!touchState) return;

        var touch = e.changedTouches[0];

        // Remove ghost
        touchState.ghost.remove();

        // Find drop target
        removeInsertMarker();
        var elem = document.elementFromPoint(touch.clientX, touch.clientY);
        if (elem && touchState.moved) {
            var zone = elem.closest('.tier-items, .unranked-pool');
            if (zone) {
                var tier = zone.dataset.tier;
                if (tier) {
                    placeItem(touchState.itemIndex, tier, getInsertPosition(zone, touch.clientX, touch.clientY));
                } else {
                    removeItem(touchState.itemIndex);
                }
            }
        }

        touchState.card.classList.remove('dragging');
        clearDropHighlights();
        stopAutoScroll();
        touchState = null;
    }

    function positionGhost(ghost, x, y) {
        ghost.style.left = (x - 34) + 'px';
        ghost.style.top = (y - 40) + 'px';
    }

    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd);
    document.addEventListener('touchcancel', function () {
        if (touchState) {
            touchState.ghost.remove();
            touchState.card.classList.remove('dragging');
            clearDropHighlights();
            stopAutoScroll();
            touchState = null;
        }
    });

    // ─── Place / Remove Logic ───

    function placeItem(itemIndex, tier, insertPos) {
        if (!TIERS.includes(tier)) return;
        var prevTier = myPlacements[itemIndex];

        // Update within-tier order: pull out of any list, insert at position
        TIERS.forEach(function (t) {
            var i = (tierOrder[t] || []).indexOf(itemIndex);
            if (i !== -1) tierOrder[t].splice(i, 1);
        });
        if (!Array.isArray(tierOrder[tier])) tierOrder[tier] = [];
        if (typeof insertPos !== 'number' || insertPos < 0 || insertPos > tierOrder[tier].length) {
            insertPos = tierOrder[tier].length;
        }
        tierOrder[tier].splice(insertPos, 0, itemIndex);
        saveTierOrder();

        // Optimistic update
        myPlacements[itemIndex] = tier;
        renderMyView();

        // Same-tier drops are just a rearrange — the server only cares about
        // which tier an item is in
        if (prevTier !== tier) {
            socket.emit('tierlist-place-item', { itemIndex: itemIndex, tier: tier });
        }
    }

    function removeItem(itemIndex) {
        if (!myPlacements[itemIndex]) return;

        TIERS.forEach(function (t) {
            var i = (tierOrder[t] || []).indexOf(itemIndex);
            if (i !== -1) tierOrder[t].splice(i, 1);
        });
        saveTierOrder();

        // Optimistic update
        delete myPlacements[itemIndex];
        renderMyView();

        // Emit to server
        socket.emit('tierlist-remove-item', { itemIndex: itemIndex });
    }

    // ─── Socket Events ───

    SH.registerPlayer(socket, 'tierlist');

    socket.on('connect', function () {
        SH.registerPlayer(socket, 'tierlist');
        socket.emit('tierlist-join');
    });

    socket.on('tierlist-sync', function (data) {
        weekKey = data.weekKey;
        myPlacements = data.myPlacements || {};
        communityData = data.community || {};

        // Compute weekly items from the week key
        weeklyItems = TI.getWeeklyItems(weekKey);

        // Restore this week's within-tier arrangement
        loadTierOrder();

        // Update header
        $weekLabel.textContent = formatMondayDate(weekKey);
        $rankerCount.textContent = data.rankerCount || 0;
        updateListeners(data.listeners || []);
        updateCountdown();

        // Render
        setupDropZones();
        renderMyView();
        if (currentView === 'community') {
            renderCommunityView();
        }
    });

    socket.on('tierlist-listeners', function (data) {
        updateListeners(data.listeners || []);
    });

    socket.on('tierlist-item-placed', function (data) {
        // Update community data for this item
        communityData[data.itemIndex] = data.community;
        $rankerCount.textContent = data.rankerCount || 0;

        // If the placer is us, update our placements (server confirmation)
        var myName = SH.getPlayerName();
        if (data.playerName === myName) {
            myPlacements[data.itemIndex] = data.tier;
        }

        // Re-render if viewing community
        if (currentView === 'community') {
            renderCommunityView();
        }
    });

    socket.on('tierlist-item-removed', function (data) {
        communityData[data.itemIndex] = data.community;
        $rankerCount.textContent = data.rankerCount || 0;

        var myName = SH.getPlayerName();
        if (data.playerName === myName) {
            delete myPlacements[data.itemIndex];
        }

        if (currentView === 'community') {
            renderCommunityView();
        }
    });

    // ─── Cleanup on page leave ───

    window.addEventListener('beforeunload', function () {
        socket.emit('tierlist-leave');
    });

    // ─── Countdown Timer ───

    setInterval(updateCountdown, 60000);

    // ─── Week Change Detection ───

    setInterval(function () {
        var currentWeek = TI.getWeekKey();
        if (weekKey && currentWeek !== weekKey) {
            location.reload();
        }
    }, 60000);

})();
