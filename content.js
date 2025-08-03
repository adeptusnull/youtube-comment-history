// YouTube Comment History Viewer Extension

let currentChannelId = null;
let commentHistoryTab = null;
let isTabActive = false;
let allVideos = [];
let currentVideoIndex = 0;
let loadedComments = [];
let isLoading = false;

// Function to extract channel ID from various YouTube pages
function getChannelId() {
  // Try different methods to get channel ID
  const channelLink = document.querySelector('link[rel="canonical"]');
  if (channelLink && channelLink.href.includes('/channel/')) {
    return channelLink.href.split('/channel/')[1].split('/')[0];
  }
  
  // Try from meta tags
  const metaTag = document.querySelector('meta[itemprop="channelId"]');
  if (metaTag) {
    return metaTag.content;
  }
  
  // Try from URL
  const urlMatch = window.location.href.match(/\/channel\/([^\/\?]+)/);
  if (urlMatch) {
    return urlMatch[1];
  }
  
  return null;
}

// Function to fetch videos for a channel
async function fetchChannelVideos(channelId, pageToken = '') {
  try {
    if (typeof CONFIG === 'undefined' || !CONFIG.API_KEY) {
      return { success: false, message: "API key not found. Please check your config.js file." };
    }
    
    let url = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&maxResults=50&order=date&type=video&key=${CONFIG.API_KEY}`;
    if (pageToken) {
      url += `&pageToken=${pageToken}`;
    }
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (!data.items) {
      return { success: false, message: "No videos found for this channel" };
    }
    
    return { 
      success: true, 
      videos: data.items,
      nextPageToken: data.nextPageToken
    };
  } catch (error) {
    console.error('Error fetching videos:', error);
    return { success: false, error: error.message };
  }
}

// Function to fetch comments for specific videos
async function fetchCommentsFromVideos(channelId, videos) {
  const comments = [];
  
  for (const video of videos) {
    const videoId = video.id.videoId;
    const commentsUrl = `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet,replies&videoId=${videoId}&maxResults=${CONFIG.MAX_COMMENTS_PER_VIDEO}&key=${CONFIG.API_KEY}`;
    
    try {
      const commentsResponse = await fetch(commentsUrl);
      const commentsData = await commentsResponse.json();
      
      if (commentsData.items) {
        // Look for comments by the channel owner
        for (const thread of commentsData.items) {
          const topComment = thread.snippet.topLevelComment;
          if (topComment.snippet.authorChannelId?.value === channelId) {
            comments.push({
              text: topComment.snippet.textDisplay,
              date: new Date(topComment.snippet.publishedAt).toLocaleDateString(),
              timestamp: new Date(topComment.snippet.publishedAt).getTime(),
              likes: topComment.snippet.likeCount,
              videoUrl: `https://youtube.com/watch?v=${videoId}`,
              videoTitle: video.snippet.title
            });
          }
          
          // Check replies too
          if (thread.replies?.comments) {
            for (const reply of thread.replies.comments) {
              if (reply.snippet.authorChannelId?.value === channelId) {
                comments.push({
                  text: reply.snippet.textDisplay,
                  date: new Date(reply.snippet.publishedAt).toLocaleDateString(),
                  timestamp: new Date(reply.snippet.publishedAt).getTime(),
                  likes: reply.snippet.likeCount,
                  videoUrl: `https://youtube.com/watch?v=${videoId}`,
                  videoTitle: video.snippet.title,
                  isReply: true
                });
              }
            }
          }
        }
      }
    } catch (err) {
      console.error(`Error fetching comments for video ${videoId}:`, err);
    }
  }
  
  return comments;
}

// Function to fetch initial comments
async function fetchComments(channelId) {
  try {
    // Fetch first batch of videos
    const videoResult = await fetchChannelVideos(channelId);
    if (!videoResult.success) {
      return videoResult;
    }
    
    allVideos = videoResult.videos;
    currentVideoIndex = Math.min(CONFIG.MAX_VIDEOS_TO_CHECK, allVideos.length);
    
    // Fetch comments from first batch
    const videosToCheck = allVideos.slice(0, currentVideoIndex);
    const comments = await fetchCommentsFromVideos(channelId, videosToCheck);
    
    // Sort comments by date (newest first)
    comments.sort((a, b) => b.timestamp - a.timestamp);
    loadedComments = comments;
    
    return { 
      success: true, 
      comments: comments,
      hasMore: currentVideoIndex < allVideos.length || videoResult.nextPageToken
    };
  } catch (error) {
    console.error('Error fetching comments:', error);
    return { success: false, error: error.message };
  }
}

// Function to load more comments
async function loadMoreComments() {
  if (isLoading) return;
  isLoading = true;
  
  // Update button state
  const loadMoreBtn = document.getElementById('load-more-comments');
  if (loadMoreBtn) {
    loadMoreBtn.textContent = 'Loading...';
    loadMoreBtn.disabled = true;
  }
  
  const channelId = getChannelId();
  if (!channelId) return;
  
  try {
    // Check if we need to load more videos from current batch
    if (currentVideoIndex < allVideos.length) {
      const nextBatch = allVideos.slice(currentVideoIndex, currentVideoIndex + CONFIG.MAX_VIDEOS_TO_CHECK);
      currentVideoIndex += nextBatch.length;
      
      const newComments = await fetchCommentsFromVideos(channelId, nextBatch);
      loadedComments = [...loadedComments, ...newComments];
      loadedComments.sort((a, b) => b.timestamp - a.timestamp);
      
      displayComments(loadedComments, currentVideoIndex < allVideos.length);
    }
  } catch (error) {
    console.error('Error loading more comments:', error);
  } finally {
    isLoading = false;
  }
}

// Function to create the comment history tab
function createCommentHistoryTab() {
  // Check if we already have a tab
  const existingTab = document.querySelector('.comment-history-tab-custom');
  if (existingTab) {
    existingTab.remove();
  }
  
  const tabsContainer = document.querySelector('tp-yt-paper-tabs');
  if (!tabsContainer) return;
  
  // Create new tab
  commentHistoryTab = document.createElement('tp-yt-paper-tab');
  commentHistoryTab.className = 'style-scope ytd-c4-tabbed-header-renderer comment-history-tab-custom';
  commentHistoryTab.setAttribute('role', 'tab');
  commentHistoryTab.setAttribute('aria-selected', 'false');
  commentHistoryTab.innerHTML = '<div class="tab-content style-scope tp-yt-paper-tab">COMMENT HISTORY</div>';
  
  // Add click handler
  commentHistoryTab.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Remove active state from other tabs
    const allTabs = tabsContainer.querySelectorAll('tp-yt-paper-tab');
    allTabs.forEach(tab => tab.setAttribute('aria-selected', 'false'));
    
    // Set this tab as active
    commentHistoryTab.setAttribute('aria-selected', 'true');
    isTabActive = true;
    
    handleTabClick();
  });
  
  // Insert after existing tabs
  tabsContainer.appendChild(commentHistoryTab);
}

// Function to handle tab click
async function handleTabClick() {
  const channelId = getChannelId();
  if (!channelId) {
    alert('Could not determine channel ID');
    return;
  }
  
  // Reset state for new channel
  allVideos = [];
  currentVideoIndex = 0;
  loadedComments = [];
  isLoading = false;
  
  // Show loading state
  showCommentSection(`
    <div class="comment-history-container">
      <div class="loading-state">
        <h2>Loading Comment History...</h2>
        <p>Fetching recent comments from this channel's videos...</p>
      </div>
    </div>
  `);
  
  // Fetch comments
  const result = await fetchComments(channelId);
  
  if (result.success) {
    displayComments(result.comments, result.hasMore);
  } else {
    showCommentSection(`
      <div class="comment-history-container">
        <h2>Error Loading Comments</h2>
        <p>${result.message || result.error || 'Unable to fetch comments'}</p>
        <div class="error-details">
          <p>Possible reasons:</p>
          <ul>
            <li>The API key may have exceeded its quota</li>
            <li>The channel may have no recent videos</li>
            <li>Comments may be disabled on their videos</li>
          </ul>
        </div>
      </div>
    `);
  }
}

// Function to show comment section
function showCommentSection(content) {
  // Only modify tab panels if our tab is active
  if (isTabActive) {
    // Hide existing YouTube tab content
    const tabContents = document.querySelectorAll('[role="tabpanel"]');
    tabContents.forEach(panel => {
      if (panel.id !== 'comment-history-panel') {
        panel.style.display = 'none';
      }
    });
  }
  
  // Create or update comment history panel
  let commentPanel = document.getElementById('comment-history-panel');
  if (!commentPanel) {
    commentPanel = document.createElement('div');
    commentPanel.id = 'comment-history-panel';
    commentPanel.setAttribute('role', 'tabpanel');
    commentPanel.className = 'style-scope ytd-channel-page-header-renderer';
    
    // Find the right container to append to
    const container = document.querySelector('#tabsContent') || 
                     document.querySelector('div#page-header') || 
                     document.querySelector('ytd-channel-page-header-renderer');
    
    if (container) {
      container.appendChild(commentPanel);
    }
  }
  
  commentPanel.innerHTML = content;
  commentPanel.style.display = isTabActive ? 'block' : 'none';
}

// Function to display comments
function displayComments(comments, hasMore = false) {
  if (!comments || comments.length === 0) {
    showCommentSection('<div class="no-comments">No comments found for this user.</div>');
    return;
  }
  
  const commentsHtml = comments.map(comment => `
    <div class="comment-item ${comment.isReply ? 'reply-comment' : ''}">
      <div class="comment-header">
        <span class="comment-date">${comment.date}</span>
        <a href="${comment.videoUrl}" class="comment-video-link" target="_blank">
          ${comment.isReply ? '↳ Reply on: ' : 'Comment on: '} ${comment.videoTitle}
        </a>
      </div>
      <div class="comment-text">${comment.text}</div>
      <div class="comment-stats">
        <span class="comment-likes">👍 ${comment.likes || 0}</span>
      </div>
    </div>
  `).join('');
  
  const loadMoreButton = hasMore ? `
    <div class="load-more-container">
      <button id="load-more-comments" class="load-more-button">
        ${isLoading ? 'Loading...' : 'Load More Comments'}
      </button>
    </div>
  ` : '';
  
  showCommentSection(`
    <div class="comment-history-container">
      <h2>Comment History</h2>
      <p class="comment-count">Showing ${comments.length} comments from ${currentVideoIndex} videos checked</p>
      <div class="comments-list">
        ${commentsHtml}
      </div>
      ${loadMoreButton}
    </div>
  `);
  
  // Add event listener to load more button
  if (hasMore) {
    const loadMoreBtn = document.getElementById('load-more-comments');
    if (loadMoreBtn) {
      loadMoreBtn.addEventListener('click', loadMoreComments);
    }
  }
}

// Function to reset extension state
function resetExtensionState() {
  commentHistoryTab = null;
  isTabActive = false;
  allVideos = [];
  currentVideoIndex = 0;
  loadedComments = [];
  isLoading = false;
  
  // Remove any existing comment history panels
  const existingPanel = document.getElementById('comment-history-panel');
  if (existingPanel) {
    existingPanel.remove();
  }
}

// Function to handle clicking on other tabs
function setupTabListeners() {
  const tabsContainer = document.querySelector('tp-yt-paper-tabs');
  if (!tabsContainer) return;
  
  tabsContainer.addEventListener('click', (e) => {
    const clickedTab = e.target.closest('tp-yt-paper-tab');
    if (clickedTab && !clickedTab.classList.contains('comment-history-tab-custom')) {
      isTabActive = false;
      const commentPanel = document.getElementById('comment-history-panel');
      if (commentPanel) {
        commentPanel.style.display = 'none';
      }
    }
  });
}

// Monitor URL changes (YouTube is a single-page app)
let lastUrl = location.href;
new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    resetExtensionState();
    
    // Delay to let YouTube load the page
    setTimeout(() => {
      if (url.includes('/channel/') || url.includes('/@')) {
        createCommentHistoryTab();
        setupTabListeners();
      }
    }, 1500);
  }
}).observe(document, { subtree: true, childList: true });

// Initial check
setTimeout(() => {
  if (window.location.href.includes('/channel/') || window.location.href.includes('/@')) {
    createCommentHistoryTab();
    setupTabListeners();
  }
}, 2000);