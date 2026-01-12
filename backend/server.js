const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const { createServer } = require('http');
const { Server } = require('socket.io');

// Import routes
const contentRoutes = require('./routes/content.routes');
const analysisRoutes = require('./routes/analysis.routes');
const translationRoutes = require('./routes/translation.routes');
const userRoutes = require('./routes/user.routes');
const collaborationRoutes = require('./routes/collaboration.routes');

// Import middleware
const { errorHandler } = require('./middleware/error.middleware');
const { authenticate } = require('./middleware/auth.middleware');
const { logger } = require('./utils/logger');

// Import services
const { initializeDatabase } = require('./services/database.service');
const { initializeRedis } = require('./services/redis.service');
const { initializeMLService } = require('./services/ml.service');
const { setupWebSocket } = require('./services/websocket.service');

// Initialize Express app
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true
  }
});

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// CORS configuration
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Compression middleware
app.use(compression());

// Logging middleware
app.use(morgan('combined', {
  stream: {
    write: (message) => logger.info(message.trim())
  }
}));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// API version endpoint
app.get('/api/version', (req, res) => {
  res.json({
    version: '1.0.0',
    apiVersion: 'v1',
    features: [
      'content-management',
      'ai-analysis',
      'translation',
      'collaboration',
      'analytics'
    ]
  });
});

// Public routes
app.use('/api/v1/auth', require('./routes/auth.routes'));

// Protected routes (require authentication)
app.use('/api/v1/content', authenticate, contentRoutes);
app.use('/api/v1/analyze', authenticate, analysisRoutes);
app.use('/api/v1/translate', authenticate, translationRoutes);
app.use('/api/v1/users', authenticate, userRoutes);
app.use('/api/v1/collaboration', authenticate, collaborationRoutes);

// GraphQL endpoint
const { ApolloServer } = require('apollo-server-express');
const { typeDefs } = require('./graphql/schema');
const { resolvers } = require('./graphql/resolvers');

const apolloServer = new ApolloServer({
  typeDefs,
  resolvers,
  context: ({ req }) => {
    // Get user from JWT token
    const token = req.headers.authorization?.replace('Bearer ', '');
    return { token, req };
  },
  formatError: (error) => {
    logger.error('GraphQL Error:', error);
    return error;
  },
  playground: process.env.NODE_ENV === 'development',
  introspection: process.env.NODE_ENV === 'development'
});

apolloServer.start().then(() => {
  apolloServer.applyMiddleware({ app, path: '/graphql' });
});

// WebSocket setup for real-time collaboration
setupWebSocket(io);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.originalUrl} not found`,
    timestamp: new Date().toISOString()
  });
});

// Global error handler
app.use(errorHandler);

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  httpServer.close(async () => {
    logger.info('HTTP server closed');
    await closeConnections();
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  logger.info('SIGINT signal received: closing HTTP server');
  httpServer.close(async () => {
    logger.info('HTTP server closed');
    await closeConnections();
    process.exit(0);
  });
});

async function closeConnections() {
  try {
    // Close database connections
    await require('./services/database.service').closeDatabase();
    // Close Redis connections
    await require('./services/redis.service').closeRedis();
    logger.info('All connections closed successfully');
  } catch (error) {
    logger.error('Error closing connections:', error);
    process.exit(1);
  }
}

// Initialize services and start server
async function startServer() {
  try {
    // Initialize database
    await initializeDatabase();
    logger.info('Database initialized successfully');

    // Initialize Redis
    await initializeRedis();
    logger.info('Redis initialized successfully');

    // Initialize ML service connection
    await initializeMLService();
    logger.info('ML service connection established');

    // Start server
    const PORT = process.env.PORT || 8000;
    httpServer.listen(PORT, () => {
      logger.info(`🚀 Server running on port ${PORT}`);
      logger.info(`📊 GraphQL endpoint: http://localhost:${PORT}/graphql`);
      logger.info(`🔌 WebSocket server running`);
      logger.info(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    });

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
if (require.main === module) {
  startServer();
}

module.exports = { app, httpServer, io };