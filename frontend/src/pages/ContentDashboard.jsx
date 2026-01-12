import React, { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Grid,
  Paper,
  Typography,
  Card,
  CardContent,
  CardActions,
  Button,
  Chip,
  Avatar,
  IconButton,
  TextField,
  InputAdornment,
  Menu,
  MenuItem,
  Fab,
  CircularProgress,
  Alert
} from '@mui/material';
import {
  Add as AddIcon,
  Search as SearchIcon,
  FilterList as FilterIcon,
  MoreVert as MoreVertIcon,
  TrendingUp as TrendingUpIcon,
  Visibility as ViewIcon,
  ThumbUp as LikeIcon,
  Comment as CommentIcon,
  Share as ShareIcon
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { fetchContents, deleteContent } from '../store/slices/contentSlice';
import SentimentChip from '../components/SentimentChip';
import ContentFilters from '../components/ContentFilters';
import { formatDistanceToNow } from 'date-fns';

const ContentDashboard = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  
  const { contents, loading, error, pagination } = useSelector(state => state.content);
  const { user } = useSelector(state => state.auth);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState({
    status: 'all',
    category: 'all',
    sortBy: 'createdAt',
    order: 'desc'
  });
  const [anchorEl, setAnchorEl] = useState(null);
  const [selectedContent, setSelectedContent] = useState(null);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    loadContents();
  }, [filters, searchQuery]);

  const loadContents = () => {
    dispatch(fetchContents({
      ...filters,
      search: searchQuery,
      page: 1,
      limit: 20
    }));
  };

  const handleSearch = (event) => {
    setSearchQuery(event.target.value);
  };

  const handleFilterChange = (newFilters) => {
    setFilters({ ...filters, ...newFilters });
  };

  const handleMenuOpen = (event, content) => {
    setAnchorEl(event.currentTarget);
    setSelectedContent(content);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
    setSelectedContent(null);
  };

  const handleEdit = () => {
    navigate(`/content/edit/${selectedContent.id}`);
    handleMenuClose();
  };

  const handleDelete = async () => {
    if (window.confirm('Are you sure you want to delete this content?')) {
      await dispatch(deleteContent(selectedContent.id));
      loadContents();
    }
    handleMenuClose();
  };

  const handleView = (contentId) => {
    navigate(`/content/${contentId}`);
  };

  const handleCreateNew = () => {
    navigate('/content/create');
  };

  const getSentimentColor = (sentiment) => {
    const colors = {
      POSITIVE: 'success',
      NEGATIVE: 'error',
      NEUTRAL: 'default',
      MIXED: 'warning'
    };
    return colors[sentiment] || 'default';
  };

  const getStatusColor = (status) => {
    const colors = {
      draft: 'default',
      published: 'success',
      archived: 'warning',
      deleted: 'error'
    };
    return colors[status] || 'default';
  };

  if (loading && contents.length === 0) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="80vh">
        <CircularProgress size={60} />
      </Box>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      {/* Header */}
      <Box mb={4}>
        <Typography variant="h4" gutterBottom fontWeight="bold">
          Content Dashboard
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Manage and analyze your content with AI-powered insights
        </Typography>
      </Box>

      {/* Stats Cards */}
      <Grid container spacing={3} mb={4}>
        <Grid item xs={12} sm={6} md={3}>
          <Card elevation={2}>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography color="text.secondary" variant="body2">
                    Total Content
                  </Typography>
                  <Typography variant="h4" fontWeight="bold">
                    {pagination?.total || 0}
                  </Typography>
                </Box>
                <Avatar sx={{ bgcolor: 'primary.main', width: 56, height: 56 }}>
                  <TrendingUpIcon />
                </Avatar>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card elevation={2}>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography color="text.secondary" variant="body2">
                    Published
                  </Typography>
                  <Typography variant="h4" fontWeight="bold">
                    {contents.filter(c => c.status === 'published').length}
                  </Typography>
                </Box>
                <Avatar sx={{ bgcolor: 'success.main', width: 56, height: 56 }}>
                  <ViewIcon />
                </Avatar>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card elevation={2}>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography color="text.secondary" variant="body2">
                    Drafts
                  </Typography>
                  <Typography variant="h4" fontWeight="bold">
                    {contents.filter(c => c.status === 'draft').length}
                  </Typography>
                </Box>
                <Avatar sx={{ bgcolor: 'warning.main', width: 56, height: 56 }}>
                  <CommentIcon />
                </Avatar>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card elevation={2}>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography color="text.secondary" variant="body2">
                    Avg. Sentiment
                  </Typography>
                  <Typography variant="h4" fontWeight="bold">
                    85%
                  </Typography>
                </Box>
                <Avatar sx={{ bgcolor: 'info.main', width: 56, height: 56 }}>
                  <LikeIcon />
                </Avatar>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Search and Filters */}
      <Paper elevation={2} sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={8}>
            <TextField
              fullWidth
              placeholder="Search content by title, body, or tags..."
              value={searchQuery}
              onChange={handleSearch}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
              }}
            />
          </Grid>
          <Grid item xs={12} md={4}>
            <Box display="flex" gap={1}>
              <Button
                variant="outlined"
                startIcon={<FilterIcon />}
                onClick={() => setShowFilters(!showFilters)}
                fullWidth
              >
                Filters
              </Button>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={handleCreateNew}
                fullWidth
              >
                Create New
              </Button>
            </Box>
          </Grid>
        </Grid>

        {showFilters && (
          <Box mt={2}>
            <ContentFilters filters={filters} onChange={handleFilterChange} />
          </Box>
        )}
      </Paper>

      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* Content Grid */}
      <Grid container spacing={3}>
        {contents.map((content) => (
          <Grid item xs={12} md={6} lg={4} key={content.id}>
            <Card 
              elevation={3}
              sx={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                transition: 'transform 0.2s, box-shadow 0.2s',
                '&:hover': {
                  transform: 'translateY(-4px)',
                  boxShadow: 6
                }
              }}
            >
              <CardContent sx={{ flexGrow: 1 }}>
                {/* Header */}
                <Box display="flex" justifyContent="space-between" alignItems="start" mb={2}>
                  <Box flex={1}>
                    <Typography variant="h6" gutterBottom noWrap>
                      {content.title}
                    </Typography>
                    <Box display="flex" gap={1} flexWrap="wrap" mb={1}>
                      <Chip 
                        label={content.status} 
                        size="small" 
                        color={getStatusColor(content.status)}
                      />
                      {content.sentiment && (
                        <SentimentChip 
                          sentiment={content.sentiment.label}
                          score={content.sentiment.score}
                        />
                      )}
                    </Box>
                  </Box>
                  <IconButton
                    size="small"
                    onClick={(e) => handleMenuOpen(e, content)}
                  >
                    <MoreVertIcon />
                  </IconButton>
                </Box>

                {/* Body Preview */}
                <Typography 
                  variant="body2" 
                  color="text.secondary" 
                  sx={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    display: '-webkit-box',
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: 'vertical',
                    mb: 2
                  }}
                >
                  {content.body}
                </Typography>

                {/* Tags */}
                {content.tags && content.tags.length > 0 && (
                  <Box display="flex" gap={0.5} flexWrap="wrap" mb={2}>
                    {content.tags.slice(0, 3).map((tag) => (
                      <Chip 
                        key={tag.id} 
                        label={tag.name} 
                        size="small" 
                        variant="outlined"
                      />
                    ))}
                    {content.tags.length > 3 && (
                      <Chip 
                        label={`+${content.tags.length - 3}`} 
                        size="small" 
                        variant="outlined"
                      />
                    )}
                  </Box>
                )}

                {/* Author and Date */}
                <Box display="flex" alignItems="center" gap={1}>
                  <Avatar 
                    src={content.author?.avatar} 
                    alt={content.author?.name}
                    sx={{ width: 24, height: 24 }}
                  />
                  <Typography variant="caption" color="text.secondary">
                    {content.author?.name} • {formatDistanceToNow(new Date(content.createdAt), { addSuffix: true })}
                  </Typography>
                </Box>
              </CardContent>

              {/* Actions */}
              <CardActions sx={{ justifyContent: 'space-between', px: 2, pb: 2 }}>
                <Box display="flex" gap={1}>
                  <Box display="flex" alignItems="center" gap={0.5}>
                    <ViewIcon fontSize="small" color="action" />
                    <Typography variant="caption">{content._count?.views || 0}</Typography>
                  </Box>
                  <Box display="flex" alignItems="center" gap={0.5}>
                    <LikeIcon fontSize="small" color="action" />
                    <Typography variant="caption">{content._count?.likes || 0}</Typography>
                  </Box>
                  <Box display="flex" alignItems="center" gap={0.5}>
                    <CommentIcon fontSize="small" color="action" />
                    <Typography variant="caption">{content._count?.comments || 0}</Typography>
                  </Box>
                </Box>
                <Button 
                  size="small" 
                  onClick={() => handleView(content.id)}
                >
                  View Details
                </Button>
              </CardActions>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Context Menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
      >
        <MenuItem onClick={handleView}>View</MenuItem>
        <MenuItem onClick={handleEdit}>Edit</MenuItem>
        <MenuItem onClick={handleDelete}>Delete</MenuItem>
      </Menu>

      {/* Floating Action Button */}
      <Fab
        color="primary"
        aria-label="add"
        sx={{ position: 'fixed', bottom: 24, right: 24 }}
        onClick={handleCreateNew}
      >
        <AddIcon />
      </Fab>
    </Container>
  );
};

export default ContentDashboard;