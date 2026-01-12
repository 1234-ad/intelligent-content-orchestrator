const { PrismaClient } = require('@prisma/client');
const { logger } = require('../utils/logger');
const { AppError } = require('../utils/errors');
const { cacheService } = require('../services/cache.service');
const { mlService } = require('../services/ml.service');
const { searchService } = require('../services/search.service');
const { notificationService } = require('../services/notification.service');

const prisma = new PrismaClient();

/**
 * @desc    Create new content
 * @route   POST /api/v1/content
 * @access  Private
 */
exports.createContent = async (req, res, next) => {
  try {
    const { title, body, categoryId, tags, metadata } = req.body;
    const userId = req.user.id;

    // Create content
    const content = await prisma.content.create({
      data: {
        title,
        body,
        authorId: userId,
        categoryId,
        status: 'draft',
        metadata: metadata || {},
        tags: {
          connectOrCreate: tags?.map(tag => ({
            where: { name: tag },
            create: { name: tag }
          })) || []
        }
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true
          }
        },
        category: true,
        tags: true
      }
    });

    // Trigger AI analysis asynchronously
    mlService.analyzeContent(content.id).catch(error => {
      logger.error('Error analyzing content:', error);
    });

    // Index content for search
    await searchService.indexContent(content);

    // Clear cache
    await cacheService.del('content:list:*');

    logger.info(`Content created: ${content.id} by user ${userId}`);

    res.status(201).json({
      success: true,
      data: content,
      message: 'Content created successfully'
    });

  } catch (error) {
    logger.error('Error creating content:', error);
    next(new AppError('Failed to create content', 500));
  }
};

/**
 * @desc    Get all content with pagination and filters
 * @route   GET /api/v1/content
 * @access  Private
 */
exports.getAllContent = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      categoryId,
      authorId,
      sortBy = 'createdAt',
      order = 'desc',
      search
    } = req.query;

    const skip = (page - 1) * limit;

    // Build filter object
    const where = {};
    if (status) where.status = status;
    if (categoryId) where.categoryId = categoryId;
    if (authorId) where.authorId = authorId;
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { body: { contains: search, mode: 'insensitive' } }
      ];
    }

    // Get total count
    const total = await prisma.content.count({ where });

    // Get content
    const content = await prisma.content.findMany({
      where,
      skip: parseInt(skip),
      take: parseInt(limit),
      orderBy: { [sortBy]: order },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true
          }
        },
        category: true,
        tags: true,
        _count: {
          select: {
            comments: true,
            likes: true
          }
        }
      }
    });

    res.json({
      success: true,
      data: content,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    logger.error('Error fetching content:', error);
    next(new AppError('Failed to fetch content', 500));
  }
};

/**
 * @desc    Get content by ID
 * @route   GET /api/v1/content/:id
 * @access  Private
 */
exports.getContentById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const content = await prisma.content.findUnique({
      where: { id },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            bio: true
          }
        },
        category: true,
        tags: true,
        comments: {
          include: {
            author: {
              select: {
                id: true,
                name: true,
                avatar: true
              }
            }
          },
          orderBy: { createdAt: 'desc' }
        },
        sentiment: true,
        entities: true,
        _count: {
          select: {
            likes: true,
            shares: true,
            views: true
          }
        }
      }
    });

    if (!content) {
      return next(new AppError('Content not found', 404));
    }

    // Increment view count
    await prisma.contentView.create({
      data: {
        contentId: id,
        userId: req.user.id,
        ipAddress: req.ip
      }
    }).catch(() => {}); // Ignore errors

    res.json({
      success: true,
      data: content
    });

  } catch (error) {
    logger.error('Error fetching content:', error);
    next(new AppError('Failed to fetch content', 500));
  }
};

/**
 * @desc    Update content
 * @route   PUT /api/v1/content/:id
 * @access  Private
 */
exports.updateContent = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title, body, categoryId, tags, metadata } = req.body;
    const userId = req.user.id;

    // Check if content exists and user has permission
    const existingContent = await prisma.content.findUnique({
      where: { id }
    });

    if (!existingContent) {
      return next(new AppError('Content not found', 404));
    }

    if (existingContent.authorId !== userId && req.user.role !== 'admin') {
      return next(new AppError('Not authorized to update this content', 403));
    }

    // Create version history
    await prisma.contentVersion.create({
      data: {
        contentId: id,
        title: existingContent.title,
        body: existingContent.body,
        version: existingContent.version,
        createdBy: userId
      }
    });

    // Update content
    const content = await prisma.content.update({
      where: { id },
      data: {
        title,
        body,
        categoryId,
        metadata: metadata || existingContent.metadata,
        version: existingContent.version + 1,
        updatedAt: new Date(),
        tags: tags ? {
          set: [],
          connectOrCreate: tags.map(tag => ({
            where: { name: tag },
            create: { name: tag }
          }))
        } : undefined
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true
          }
        },
        category: true,
        tags: true
      }
    });

    // Re-analyze content
    mlService.analyzeContent(content.id).catch(error => {
      logger.error('Error analyzing content:', error);
    });

    // Update search index
    await searchService.updateContent(content);

    // Clear cache
    await cacheService.del(`content:${id}`);
    await cacheService.del('content:list:*');

    logger.info(`Content updated: ${id} by user ${userId}`);

    res.json({
      success: true,
      data: content,
      message: 'Content updated successfully'
    });

  } catch (error) {
    logger.error('Error updating content:', error);
    next(new AppError('Failed to update content', 500));
  }
};

/**
 * @desc    Delete content
 * @route   DELETE /api/v1/content/:id
 * @access  Private
 */
exports.deleteContent = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Check if content exists and user has permission
    const content = await prisma.content.findUnique({
      where: { id }
    });

    if (!content) {
      return next(new AppError('Content not found', 404));
    }

    if (content.authorId !== userId && req.user.role !== 'admin') {
      return next(new AppError('Not authorized to delete this content', 403));
    }

    // Soft delete
    await prisma.content.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        status: 'deleted'
      }
    });

    // Remove from search index
    await searchService.deleteContent(id);

    // Clear cache
    await cacheService.del(`content:${id}`);
    await cacheService.del('content:list:*');

    logger.info(`Content deleted: ${id} by user ${userId}`);

    res.json({
      success: true,
      message: 'Content deleted successfully'
    });

  } catch (error) {
    logger.error('Error deleting content:', error);
    next(new AppError('Failed to delete content', 500));
  }
};

/**
 * @desc    Search content with advanced filters
 * @route   GET /api/v1/content/search
 * @access  Private
 */
exports.searchContent = async (req, res, next) => {
  try {
    const {
      query,
      filters,
      page = 1,
      limit = 20
    } = req.query;

    const results = await searchService.search({
      query,
      filters: filters ? JSON.parse(filters) : {},
      page: parseInt(page),
      limit: parseInt(limit)
    });

    res.json({
      success: true,
      data: results.hits,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: results.total,
        pages: Math.ceil(results.total / limit)
      }
    });

  } catch (error) {
    logger.error('Error searching content:', error);
    next(new AppError('Failed to search content', 500));
  }
};

/**
 * @desc    Publish content
 * @route   POST /api/v1/content/:id/publish
 * @access  Private
 */
exports.publishContent = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const content = await prisma.content.update({
      where: { id },
      data: {
        status: 'published',
        publishedAt: new Date()
      },
      include: {
        author: true,
        category: true,
        tags: true
      }
    });

    // Send notifications
    await notificationService.notifyContentPublished(content);

    // Clear cache
    await cacheService.del(`content:${id}`);
    await cacheService.del('content:list:*');

    logger.info(`Content published: ${id} by user ${userId}`);

    res.json({
      success: true,
      data: content,
      message: 'Content published successfully'
    });

  } catch (error) {
    logger.error('Error publishing content:', error);
    next(new AppError('Failed to publish content', 500));
  }
};

/**
 * @desc    Get content version history
 * @route   GET /api/v1/content/:id/versions
 * @access  Private
 */
exports.getVersionHistory = async (req, res, next) => {
  try {
    const { id } = req.params;

    const versions = await prisma.contentVersion.findMany({
      where: { contentId: id },
      orderBy: { createdAt: 'desc' },
      include: {
        creator: {
          select: {
            id: true,
            name: true,
            avatar: true
          }
        }
      }
    });

    res.json({
      success: true,
      data: versions
    });

  } catch (error) {
    logger.error('Error fetching version history:', error);
    next(new AppError('Failed to fetch version history', 500));
  }
};

/**
 * @desc    Get content analytics
 * @route   GET /api/v1/content/:id/analytics
 * @access  Private
 */
exports.getContentAnalytics = async (req, res, next) => {
  try {
    const { id } = req.params;

    const analytics = await prisma.content.findUnique({
      where: { id },
      select: {
        _count: {
          select: {
            views: true,
            likes: true,
            shares: true,
            comments: true
          }
        },
        sentiment: true,
        entities: true
      }
    });

    // Get view trends
    const viewTrends = await prisma.contentView.groupBy({
      by: ['createdAt'],
      where: {
        contentId: id,
        createdAt: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Last 30 days
        }
      },
      _count: true
    });

    res.json({
      success: true,
      data: {
        ...analytics,
        viewTrends
      }
    });

  } catch (error) {
    logger.error('Error fetching analytics:', error);
    next(new AppError('Failed to fetch analytics', 500));
  }
};