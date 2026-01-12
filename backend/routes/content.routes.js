const express = require('express');
const router = express.Router();
const contentController = require('../controllers/content.controller');
const { validateContent } = require('../middleware/validation.middleware');
const { checkPermission } = require('../middleware/permission.middleware');
const { cacheMiddleware } = require('../middleware/cache.middleware');

/**
 * @route   POST /api/v1/content
 * @desc    Create new content
 * @access  Private
 */
router.post(
  '/',
  validateContent,
  checkPermission('content:create'),
  contentController.createContent
);

/**
 * @route   GET /api/v1/content
 * @desc    Get all content with pagination and filters
 * @access  Private
 */
router.get(
  '/',
  cacheMiddleware(300), // Cache for 5 minutes
  contentController.getAllContent
);

/**
 * @route   GET /api/v1/content/:id
 * @desc    Get content by ID
 * @access  Private
 */
router.get(
  '/:id',
  cacheMiddleware(300),
  contentController.getContentById
);

/**
 * @route   PUT /api/v1/content/:id
 * @desc    Update content
 * @access  Private
 */
router.put(
  '/:id',
  validateContent,
  checkPermission('content:update'),
  contentController.updateContent
);

/**
 * @route   DELETE /api/v1/content/:id
 * @desc    Delete content
 * @access  Private
 */
router.delete(
  '/:id',
  checkPermission('content:delete'),
  contentController.deleteContent
);

/**
 * @route   GET /api/v1/content/search
 * @desc    Search content with advanced filters
 * @access  Private
 */
router.get(
  '/search',
  contentController.searchContent
);

/**
 * @route   POST /api/v1/content/:id/publish
 * @desc    Publish content
 * @access  Private
 */
router.post(
  '/:id/publish',
  checkPermission('content:publish'),
  contentController.publishContent
);

/**
 * @route   POST /api/v1/content/:id/archive
 * @desc    Archive content
 * @access  Private
 */
router.post(
  '/:id/archive',
  checkPermission('content:archive'),
  contentController.archiveContent
);

/**
 * @route   GET /api/v1/content/:id/versions
 * @desc    Get content version history
 * @access  Private
 */
router.get(
  '/:id/versions',
  contentController.getVersionHistory
);

/**
 * @route   POST /api/v1/content/:id/restore
 * @desc    Restore content to specific version
 * @access  Private
 */
router.post(
  '/:id/restore/:versionId',
  checkPermission('content:update'),
  contentController.restoreVersion
);

/**
 * @route   POST /api/v1/content/:id/duplicate
 * @desc    Duplicate content
 * @access  Private
 */
router.post(
  '/:id/duplicate',
  checkPermission('content:create'),
  contentController.duplicateContent
);

/**
 * @route   GET /api/v1/content/:id/analytics
 * @desc    Get content analytics
 * @access  Private
 */
router.get(
  '/:id/analytics',
  contentController.getContentAnalytics
);

module.exports = router;