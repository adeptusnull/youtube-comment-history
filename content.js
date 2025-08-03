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
  console.log('[Comment History] Attempting to extract channel ID...');
  
  // Method 1: Try from canonical link
  const channelLink = document.querySelector('link[rel="canonical"]');
  if (channelLink && channelLink.href.includes('/channel/')) {
    const channelId = channelLink.href.split('/channel/')[1].split('/')[0];
    console.log('[Comment History] Found channel ID from canonical:', channelId);
    return channelId;
  }
  
  // Method 2: Try from meta tags
  const metaTag = document.querySelector('meta[itemprop="channelId"]');
  if (metaTag) {
    console.log('[Comment History] Found channel ID from meta tag:', metaTag.content);
    return metaTag.content;
  }
  
  // Method 3: Try from URL
  const urlMatch = window.location.href.match(/\/channel\/([^\/\?]+)/);
  if (urlMatch) {
    console.log('[Comment History] Found channel ID from URL:', urlMatch[1]);
    return urlMatch[1];
  }
  
  // Method 4: Try from page data (YouTube sometimes stores data in scripts)
  try {
    const scripts = document.querySelectorAll('script');
    for (const script of scripts) {
      const text = script.textContent;
      if (text && text.includes('browseId')) {
        const match = text.match(/"browseId":"(UC[^"]+)"/);
        if (match) {
          console.log('[Comment History] Found channel ID from script:', match[1]);
          return match[1];
        }
      }
    }
  } catch (e) {
    console.error('[Comment History] Error searching scripts:', e);
  }
  
  // Method 5: For @username URLs, try to get from page structure
  if (window.location.href.includes('/@')) {
    const ytInitialData = window.ytInitialData;
    if (ytInitialData?.header?.c4TabbedHeaderRenderer?.channelId) {
      const channelId = ytInitialData.header.c4TabbedHeaderRenderer.channelId;
      console.log('[Comment History] Found channel ID from ytInitialData:', channelId);
      return channelId;
    }
    
    // Try alternate structure
    if (ytInitialData?.metadata?.channelMetadataRenderer?.externalId) {
      const channelId = ytInitialData.metadata.channelMetadataRenderer.externalId;
      console.log('[Comment History] Found channel ID from metadata:', channelId);
      return channelId;
    }
  }
  
  console.error('[Comment History] Could not find channel ID!');
  return null;
}

// Function to fetch videos for a channel
async function fetchChannelVideos(channelId, pageToken = '') {
  try {
    if (typeof CONFIG === 'undefined' || !CONFIG.API_KEY) {
      console.error('[Comment History] CONFIG or API_KEY not found');
      return { success: false, message: "API key not found. Please check your config.js file." };
    }
    
    let url = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&maxResults=50&order=date&type=video&key=${CONFIG.API_KEY}`;
    if (pageToken) {
      url += `&pageToken=${pageToken}`;
    }
    
    console.log('[Comment History] Fetching videos from:', url);
    
    const response = await fetch(url);
    const data = await response.json();
    
    console.log('[Comment History] Videos API response:', data);
    
    if (data.error) {
      console.error('[Comment History] API Error:', data.error);
      return { 
        success: false, 
        message: `API Error: ${data.error.message || 'Unknown error'}` 
      };
    }
    
    if (!data.items || data.items.length === 0) {
      console.log('[Comment History] No videos found for channel:', channelId);
      return { success: false, message: "No videos found for this channel" };
    }
    
    console.log(`[Comment History] Found ${data.items.length} videos`);
    
    return { 
      success: true, 
      videos: data.items,
      nextPageToken: data.nextPageToken
    };
  } catch (error) {
    console.error('[Comment History] Error fetching videos:', error);
    return { success: false, error: error.message };
  }
}

// Function to fetch comments for specific videos
async function fetchCommentsFromVideos(channelId, videos) {
  const comments = [];
  console.log(`[Comment History] Fetching comments from ${videos.length} videos for channel ${channelId}`);
  console.log(`[Comment History] Debug mode: ${CONFIG.DEBUG_MODE ? 'ON' : 'OFF'}`);
  
  for (const video of videos) {
    const videoId = video.id.videoId;
    const commentsUrl = `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet,replies&videoId=${videoId}&maxResults=${CONFIG.MAX_COMMENTS_PER_VIDEO}&key=${CONFIG.API_KEY}`;
    
    try {
      console.log(`[Comment History] Fetching comments for video: ${video.snippet.title}`);
      const commentsResponse = await fetch(commentsUrl);
      const commentsData = await commentsResponse.json();
      
      if (commentsData.error) {
        console.error(`[Comment History] Error fetching comments for video ${videoId}:`, commentsData.error);
        continue;
      }
      
      if (commentsData.items) {
        let videoComments = 0;
        let debugComments = 0;
        
        // Look for comments by the channel owner (or all comments in debug mode)
        for (const thread of commentsData.items) {
          const topComment = thread.snippet.topLevelComment;
          const isChannelOwner = topComment.snippet.authorChannelId?.value === channelId;
          
          if (isChannelOwner || (CONFIG.DEBUG_MODE && debugComments < 5)) {
            if (!isChannelOwner) debugComments++;
            else videoComments++;
            
            comments.push({
              text: topComment.snippet.textDisplay,
              date: new Date(topComment.snippet.publishedAt).toLocaleDateString(),
              timestamp: new Date(topComment.snippet.publishedAt).getTime(),
              likes: topComment.snippet.likeCount,
              videoUrl: `https://youtube.com/watch?v=${videoId}`,
              videoTitle: video.snippet.title,
              author: topComment.snippet.authorDisplayName,
              authorChannelId: topComment.snippet.authorChannelId?.value,
              isChannelOwner: isChannelOwner
            });
          }
          
          // Check replies too
          if (thread.replies?.comments) {
            for (const reply of thread.replies.comments) {
              const isReplyChannelOwner = reply.snippet.authorChannelId?.value === channelId;
              
              if (isReplyChannelOwner || (CONFIG.DEBUG_MODE && debugComments < 5)) {
                if (!isReplyChannelOwner) debugComments++;
                else videoComments++;
                
                comments.push({
                  text: reply.snippet.textDisplay,
                  date: new Date(reply.snippet.publishedAt).toLocaleDateString(),
                  timestamp: new Date(reply.snippet.publishedAt).getTime(),
                  likes: reply.snippet.likeCount,
                  videoUrl: `https://youtube.com/watch?v=${videoId}`,
                  videoTitle: video.snippet.title,
                  author: reply.snippet.authorDisplayName,
                  authorChannelId: reply.snippet.authorChannelId?.value,
                  isReply: true,
                  isChannelOwner: isReplyChannelOwner
                });
              }
            }
          }
        }
        
        console.log(`[Comment History] Found ${videoComments} comments by channel owner in video: ${video.snippet.title}`);
        if (CONFIG.DEBUG_MODE) {
          console.log(`[Comment History] Also showing ${debugComments} comments from other users for debugging`);
        }
      }
    } catch (err) {
      console.error(`[Comment History] Error fetching comments for video ${videoId}:`, err);
    }
  }
  
  console.log(`[Comment History] Total comments found: ${comments.length}`);
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
    
    // Toggle debug mode with Ctrl+Click
    if (e.ctrlKey || e.metaKey) {
      CONFIG.DEBUG_MODE = !CONFIG.DEBUG_MODE;
      console.log(`[Comment History] Debug mode ${CONFIG.DEBUG_MODE ? 'ENABLED' : 'DISABLED'}`);
    }
    
    // Remove active state from other tabs
    const allTabs = tabsContainer.querySelectorAll('tp-yt-paper-tab');
    allTabs.forEach(tab => tab.setAttribute('aria-selected', 'false'));
    
    // Set this tab as active
    commentHistoryTab.setAttribute('aria-selected', 'true');
    isTabActive = true;
    
    handleTabClick();
  });
  
  // Add tooltip
  commentHistoryTab.title = 'Click to view comment history. Ctrl+Click to toggle debug mode.';
  
  // Insert after existing tabs
  tabsContainer.appendChild(commentHistoryTab);
}

// Function to handle tab click
async function handleTabClick() {
  const channelId = getChannelId();
  if (!channelId) {
    showCommentSection(`
      <div class="comment-history-container">
        <h2>Error</h2>
        <p>Could not determine channel ID. Please check the browser console for debugging information.</p>
        <p style="font-size: 12px; color: var(--yt-spec-text-secondary);">
          Open Developer Tools (F12) → Console tab to see detailed logs.
        </p>
      </div>
    `);
    return;
  }
  
  console.log('[Comment History] Starting comment fetch for channel:', channelId);
  
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
        <p style="font-size: 12px; color: var(--yt-spec-text-secondary);">Channel ID: ${channelId}</p>
      </div>
    </div>
  `);
  
  // Fetch comments
  const result = await fetchComments(channelId);
  
  if (result.success) {
    if (result.comments.length === 0) {
      // Show message when no comments found
      showCommentSection(`
        <div class="comment-history-container">
          <h2>No Comments Found</h2>
          <p>This channel owner hasn't made any comments on their recent ${currentVideoIndex} videos.</p>
          <div class="error-details">
            <p>Possible reasons:</p>
            <ul>
              <li>The channel owner doesn't comment on their own videos</li>
              <li>Comments might be on older videos not checked yet</li>
              <li>The channel might use a different account for commenting</li>
            </ul>
            ${result.hasMore ? '<p><strong>Try loading more videos to find comments.</strong></p>' : ''}
          </div>
          ${result.hasMore ? `
            <div class="load-more-container">
              <button id="load-more-comments" class="load-more-button">
                Check More Videos
              </button>
            </div>
          ` : ''}
        </div>
      `);
      
      // Add event listener if there's a load more button
      if (result.hasMore) {
        const loadMoreBtn = document.getElementById('load-more-comments');
        if (loadMoreBtn) {
          loadMoreBtn.addEventListener('click', loadMoreComments);
        }
      }
    } else {
      displayComments(result.comments, result.hasMore);
    }
  } else {
    showCommentSection(`
      <div class="comment-history-container">
        <h2>Error Loading Comments</h2>
        <p>${result.message || result.error || 'Unable to fetch comments'}</p>
        <div class="error-details">
          <p>Debugging info:</p>
          <ul>
            <li>Channel ID: ${channelId}</li>
            <li>Check browser console for detailed error logs</li>
          </ul>
          <p>Common issues:</p>
          <ul>
            <li>API key exceeded quota (limit: 10,000 units/day)</li>
            <li>Invalid API key or restrictions</li>
            <li>Network connectivity issues</li>
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
  
  const commentsHtml = comments.map(comment => {
    const debugInfo = CONFIG.DEBUG_MODE ? `
      <div class="debug-info">
        <span>Author: ${comment.author}</span>
        <span>Channel ID: ${comment.authorChannelId}</span>
        <span>${comment.isChannelOwner ? '✓ Channel Owner' : '✗ Other User'}</span>
      </div>
    ` : '';
    
    return `
      <div class="comment-item ${comment.isReply ? 'reply-comment' : ''} ${!comment.isChannelOwner ? 'debug-comment' : ''}">
        <div class="comment-header">
          <span class="comment-date">${comment.date}</span>
          <a href="${comment.videoUrl}" class="comment-video-link" target="_blank">
            ${comment.isReply ? '↳ Reply on: ' : 'Comment on: '} ${comment.videoTitle}
          </a>
        </div>
        ${debugInfo}
        <div class="comment-text">${comment.text}</div>
        <div class="comment-stats">
          <span class="comment-likes">👍 ${comment.likes || 0}</span>
        </div>
      </div>
    `;
  }).join('');
  
  const loadMoreButton = hasMore ? `
    <div class="load-more-container">
      <button id="load-more-comments" class="load-more-button">
        ${isLoading ? 'Loading...' : 'Load More Comments'}
      </button>
    </div>
  ` : '';
  
  const debugNotice = CONFIG.DEBUG_MODE ? `
    <div class="debug-notice">
      ⚠️ Debug Mode: Showing comments from all users (not just channel owner)
    </div>
  ` : '';
  
  showCommentSection(`
    <div class="comment-history-container">
      <h2>Comment History</h2>
      ${debugNotice}
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