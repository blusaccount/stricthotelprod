import { Router } from 'express';
import { getDailyLesson, buildQuiz, getDailySeed } from '../turkish-lessons.js';
import { recordDailyCompletion, getTurkishLeaderboard } from '../turkish-streaks.js';
import { sanitizePlayerName } from './auth.js';
import { bump } from '../achievements.js';
import { verifyOwner, isValidOwnerToken } from '../identity.js';

const router = Router();

router.get('/api/turkish/daily', (req, res) => {
    const lesson = getDailyLesson();
    const quiz = buildQuiz(lesson, getDailySeed());
    const day = new Date().toISOString().slice(0, 10);
    res.json({ id: lesson.id, topic: lesson.topic, words: lesson.words, quiz, day });
});

router.post('/api/turkish/complete', async (req, res) => {
    try {
        const name = sanitizePlayerName(req.body?.playerName);
        if (!name) {
            return res.status(400).json({ ok: false, error: 'Invalid player name' });
        }
        // TOFU ownership check: prevent friends from completing each other's
        // daily streak (and printing the streak reward) by guessing names.
        const ownerToken = req.body?.ownerToken;
        if (!isValidOwnerToken(ownerToken)) {
            return res.status(400).json({ ok: false, error: 'Missing owner token' });
        }
        const owns = await verifyOwner(name, ownerToken);
        if (!owns) {
            return res.status(403).json({ ok: false, error: 'Name belongs to another browser' });
        }

        const result = await recordDailyCompletion(name);
        if (!result.ok) {
            return res.status(500).json({ ok: false, error: 'Failed to record completion' });
        }

        // Achievement
        bump(name, 'turkish_lessons', 1).catch(() => {});

        res.json(result);
    } catch (err) {
        console.error('[Turkish] completion error:', err.message);
        res.status(500).json({ ok: false, error: 'Server error' });
    }
});

router.get('/api/turkish/leaderboard', async (req, res) => {
    try {
        const leaderboard = await getTurkishLeaderboard();
        res.json({ ok: true, leaderboard });
    } catch (err) {
        console.error('[Turkish] leaderboard error:', err.message);
        res.status(500).json({ ok: false, error: 'Server error' });
    }
});

export default router;
