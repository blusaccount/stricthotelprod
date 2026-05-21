(function () {
    'use strict';

    const $ = id => document.getElementById(id);
    const QUIZ_TIME = 60; // seconds

    let lesson = null;
    let quiz = [];
    let currentQ = 0;
    let score = 0;
    let timer = null;
    let answerTimeoutId = null;
    let quizEnded = false;
    let timeLeft = QUIZ_TIME;
    let dailyDay = '';

    // ===== Screen Management =====
    function showScreen(name) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        const el = $('screen-' + name);
        if (el) el.classList.add('active');
    }

    // ===== Fetch Daily Lesson =====
    async function loadLesson() {
        try {
            const res = await fetch('/api/turkish/daily');
            lesson = await res.json();
            dailyDay = lesson.day || '';
            renderLesson();
            loadLeaderboard();
        } catch (err) {
            $('lesson-topic').textContent = 'Could not load lesson';
            console.error('Failed to load lesson:', err);
        }
    }

    function renderLesson() {
        $('lesson-topic').textContent = '📖 ' + lesson.topic;
        $('lesson-day').textContent = 'Daily Lesson #' + lesson.id + (dailyDay ? ' · ' + dailyDay : '');

        const list = $('word-list');
        list.innerHTML = '';
        lesson.words.forEach(w => {
            const card = document.createElement('div');
            card.className = 'word-card';
            card.innerHTML =
                '<span class="word-turkish">' + escapeHtml(w.tr) + '</span>' +
                '<span class="word-meaning">' + escapeHtml(w.en) + '</span>';
            list.appendChild(card);
        });
    }

    // ===== Quiz =====
    function startQuiz() {
        const name = getPlayerName();
        if (!name) {
            $('name-error').textContent = 'Please enter a name.';
            return;
        }
        $('name-error').textContent = '';
        resetQuizState();
        quiz = lesson.quiz;
        currentQ = 0;
        score = 0;
        timeLeft = QUIZ_TIME;
        showScreen('quiz');
        renderQuestion();
        startTimer();
    }

    function renderQuestion() {
        if (quizEnded === true) {
            return;
        }

        if (currentQ >= quiz.length) {
            endQuiz();
            return;
        }

        const q = quiz[currentQ];
        $('quiz-progress').textContent = 'Question ' + (currentQ + 1) + ' / ' + quiz.length;
        $('quiz-question').textContent = q.question;
        $('quiz-feedback').textContent = '';

        const opts = $('quiz-options');
        opts.innerHTML = '';
        q.options.forEach(opt => {
            const btn = document.createElement('button');
            btn.className = 'quiz-option';
            btn.textContent = opt;
            btn.addEventListener('click', function () { handleAnswer(opt, q.correct); });
            opts.appendChild(btn);
        });
    }

    function handleAnswer(selected, correct) {
        if (quizEnded === true) {
            return;
        }

        const opts = $('quiz-options').querySelectorAll('.quiz-option');
        opts.forEach(btn => {
            btn.classList.add('disabled');
            if (btn.textContent === correct) btn.classList.add('correct');
            if (btn.textContent === selected && selected !== correct) btn.classList.add('wrong');
        });

        if (selected === correct) {
            score++;
            $('quiz-feedback').textContent = '✓ Correct!';
            $('quiz-feedback').style.color = '#228833';
        } else {
            $('quiz-feedback').textContent = '✗ ' + correct;
            $('quiz-feedback').style.color = '#cc3333';
        }

        answerTimeoutId = setTimeout(function () {
            if (quizEnded === true) {
                return;
            }
            currentQ++;
            renderQuestion();
        }, 1200);
    }

    // ===== Timer =====
    function startTimer() {
        updateTimerDisplay();
        timer = setInterval(function () {
            timeLeft--;
            updateTimerDisplay();
            if (timeLeft <= 0) {
                endQuiz();
            }
        }, 1000);
    }

    function updateTimerDisplay() {
        const pct = (timeLeft / QUIZ_TIME) * 100;
        $('timer-bar').style.width = pct + '%';
        $('timer-text').textContent = timeLeft + 's';
    }

    function stopTimer() {
        if (timer) {
            clearInterval(timer);
            timer = null;
        }
    }

    function resetQuizState() {
        quizEnded = false;
        stopTimer();

        if (answerTimeoutId !== null) {
            clearTimeout(answerTimeoutId);
            answerTimeoutId = null;
        }
    }

    // ===== Results =====
    function endQuiz() {
        if (quizEnded === true) {
            return;
        }

        quizEnded = true;
        stopTimer();

        if (answerTimeoutId !== null) {
            clearTimeout(answerTimeoutId);
            answerTimeoutId = null;
        }

        showScreen('result');

        const total = quiz.length;
        const pct = total > 0 ? Math.round((score / total) * 100) : 0;

        let emoji, title;
        if (pct === 100) { emoji = '🏆'; title = 'PERFECT!'; }
        else if (pct >= 80) { emoji = '⭐'; title = 'GREAT JOB!'; }
        else if (pct >= 60) { emoji = '👍'; title = 'GOOD WORK!'; }
        else if (pct >= 40) { emoji = '📚'; title = 'KEEP LEARNING!'; }
        else { emoji = '💪'; title = 'TRY AGAIN!'; }

        $('result-emoji').textContent = emoji;
        $('result-title').textContent = title;
        $('result-score').textContent = score + ' / ' + total;
        $('result-meta').textContent = '';
        $('result-detail').textContent = pct + '% correct · Topic: ' + lesson.topic;

        recordCompletion();
    }

    // ===== Helpers =====
    function escapeHtml(str) {
        const div = document.createElement('div');
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
    }

    function getPlayerName() {
        const input = $('player-name');
        const name = input ? input.value.trim() : '';
        if (name) {
            localStorage.setItem('stricthotel-name', name);
            return name;
        }
        const stored = localStorage.getItem('stricthotel-name') || '';
        if (stored && input) {
            input.value = stored;
        }
        return stored.trim();
    }

    async function recordCompletion() {
        const name = getPlayerName();
        if (!name) return;

        try {
            const ownerToken = window.StrictHotelSocket
                ? window.StrictHotelSocket.getOwnerToken()
                : null;
            const res = await fetch('/api/turkish/complete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ playerName: name, ownerToken })
            });
            const data = await res.json();
            if (!res.ok || !data.ok) {
                $('result-meta').textContent = 'Could not record streak.';
                return;
            }

            const rewardText = data.alreadyCompleted
                ? 'Already completed today.'
                : '+ ' + data.rewardCoins + ' coins';

            $('result-meta').textContent =
                'Streak: ' + data.currentStreak + ' days · ' + rewardText;

            loadLeaderboard();
        } catch (err) {
            $('result-meta').textContent = 'Could not record streak.';
            console.error('Failed to record completion:', err);
        }
    }

    async function loadLeaderboard() {
        const list = $('leaderboard-list');
        if (!list) return;
        list.innerHTML = '<div class="leaderboard-row"><span>Loading...</span><span></span></div>';
        try {
            const res = await fetch('/api/turkish/leaderboard');
            const data = await res.json();
            if (!res.ok || !data.ok) {
                list.innerHTML = '<div class="leaderboard-row"><span>No data</span><span></span></div>';
                return;
            }

            if (!data.leaderboard || data.leaderboard.length === 0) {
                list.innerHTML = '<div class="leaderboard-row"><span>No streaks yet</span><span></span></div>';
                return;
            }

            list.innerHTML = '';
            data.leaderboard.forEach((entry, index) => {
                const row = document.createElement('div');
                row.className = 'leaderboard-row';
                row.innerHTML = '<span>' + (index + 1) + '. ' + escapeHtml(entry.name) +
                    '</span><span>' + entry.currentStreak + ' days</span>';
                list.appendChild(row);
            });
        } catch (err) {
            list.innerHTML = '<div class="leaderboard-row"><span>No data</span><span></span></div>';
        }
    }

    // ===== Event Listeners =====
    $('btn-start-quiz').addEventListener('click', startQuiz);
    $('btn-replay').addEventListener('click', function () {
        showScreen('learn');
    });

    // ===== Init =====
    const savedName = localStorage.getItem('stricthotel-name');
    if (savedName && $('player-name')) {
        $('player-name').value = savedName;
    }
    loadLesson();
})();
