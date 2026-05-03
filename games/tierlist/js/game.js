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

    function renderMyView() {
        // Clear all tier rows and unranked pool
        TIERS.forEach(function (tier) {
            var zone = document.querySelector('.tier-items[data-tier="' + tier + '"]');
            if (zone) zone.innerHTML = '';
        });
        $unrankedPool.innerHTML = '';

        // Place items
        weeklyItems.forEach(function (item) {
            var card = createItemCard(item);
            var tier = myPlacements[item.index];
            if (tier && TIERS.indexOf(tier) !== -1) {
                var zone = document.querySelector('.tier-items[data-tier="' + tier + '"]');
                if (zone) zone.appendChild(card);
            } else {
                $unrankedPool.appendChild(card);
            }
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
        dragItemIndex = null;
    }

    function onDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        this.classList.add('drag-over');
    }

    function onDragLeave() {
        this.classList.remove('drag-over');
    }

    function onDrop(e) {
        e.preventDefault();
        this.classList.remove('drag-over');
        var idx = parseInt(e.dataTransfer.getData('text/plain'), 10);
        if (isNaN(idx)) return;

        var tier = this.dataset.tier;
        if (tier) {
            placeItem(idx, tier);
        } else {
            removeItem(idx);
        }
    }

    function clearDropHighlights() {
        document.querySelectorAll('.drag-over').forEach(function (el) {
            el.classList.remove('drag-over');
        });
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
        positionGhost(touchState.ghost, touch.clientX, touch.clientY);

        // Highlight drop zone
        clearDropHighlights();
        touchState.ghost.style.display = 'none';
        var elem = document.elementFromPoint(touch.clientX, touch.clientY);
        touchState.ghost.style.display = '';
        if (elem) {
            var zone = elem.closest('.tier-items, .unranked-pool');
            if (zone) zone.classList.add('drag-over');
        }
    }

    function onTouchEnd(e) {
        if (!touchState) return;

        var touch = e.changedTouches[0];

        // Remove ghost
        touchState.ghost.remove();

        // Find drop target
        var elem = document.elementFromPoint(touch.clientX, touch.clientY);
        if (elem && touchState.moved) {
            var zone = elem.closest('.tier-items, .unranked-pool');
            if (zone) {
                var tier = zone.dataset.tier;
                if (tier) {
                    placeItem(touchState.itemIndex, tier);
                } else {
                    removeItem(touchState.itemIndex);
                }
            }
        }

        touchState.card.classList.remove('dragging');
        clearDropHighlights();
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
            touchState = null;
        }
    });

    // ─── Place / Remove Logic ───

    function placeItem(itemIndex, tier) {
        if (!TIERS.includes(tier)) return;
        // Skip if already in that tier
        if (myPlacements[itemIndex] === tier) return;

        // Optimistic update
        myPlacements[itemIndex] = tier;
        renderMyView();

        // Emit to server
        socket.emit('tierlist-place-item', { itemIndex: itemIndex, tier: tier });
    }

    function removeItem(itemIndex) {
        if (!myPlacements[itemIndex]) return;

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
