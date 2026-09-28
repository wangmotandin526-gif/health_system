const express = require('express');
const db = require('../config/db');
const verifyToken = require('../middleware/auth');
const requireRole = require('../middleware/roles');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');
const { validateArticle, isValidId, ARTICLE_CATEGORIES } = require('../middleware/validators');

const router = express.Router();

const toPublic = (a) => ({
  id: a.id,
  title: a.title,
  category: a.category,
  summary: a.summary ?? null,
  content: a.content,
  author_id: a.author_id ?? null,
  author_name: a.author_name ?? null,
  created_at: a.created_at,
});

router.get(
  '/',
  verifyToken,
  asyncHandler(async (req, res) => {
    const { category } = req.query;
    if (category && !ARTICLE_CATEGORIES.includes(category)) {
      throw new AppError(`category must be one of: ${ARTICLE_CATEGORIES.join(', ')}`, 400);
    }

    const rows = await db.find('learning', category ? { category } : {});
    rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    res.json({ success: true, data: rows.map(toPublic), categories: ARTICLE_CATEGORIES });
  })
);

router.post(
  '/',
  verifyToken,
  requireRole('doctor', 'admin'),
  validateArticle,
  asyncHandler(async (req, res) => {
    const { title, category, summary, content } = req.body;
    const id = await db.create('learning', {
      title: title.trim(),
      category,
      summary: summary ? summary.trim() : null,
      content: content.trim(),
      author_id: req.user.id,
      author_name: req.user.full_name,
    });
    logger.info(`User ${req.user.id} (${req.user.role}) published article ${id}`);
    res.status(201).json({ success: true, message: 'Article published', data: { id } });
  })
);

router.delete(
  '/:id',
  verifyToken,
  requireRole('doctor', 'admin'),
  asyncHandler(async (req, res) => {
    const article = isValidId(req.params.id) ? await db.get('learning', req.params.id) : null;
    if (!article) throw new AppError('Article not found', 404);

    if (req.user.role !== 'admin' && article.author_id !== req.user.id) {
      throw new AppError('You can only delete articles you wrote', 403);
    }

    await db.remove('learning', article.id);
    logger.info(`User ${req.user.id} (${req.user.role}) deleted article ${article.id}`);
    res.json({ success: true, message: 'Article deleted' });
  })
);

module.exports = router;
