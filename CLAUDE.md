# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is a browser extension for Chrome/Firefox that adds a "COMMENT HISTORY" tab to YouTube channel pages, allowing users to view all comments made by the channel owner on their own videos.

## Setup Requirements

1. **API Key Configuration**: Before using the extension, you must:
   - Copy `config-example.js` to `config.js`
   - Add your YouTube Data API v3 key to `config.js`
   - The `config.js` file is gitignored to protect the API key

2. **Browser Extension Installation**:
   - Load as unpacked extension in Chrome/Firefox developer mode
   - No build process required - pure JavaScript extension

## Key Components

- **manifest.json**: Extension manifest (v2) defining permissions and content scripts
- **content.js**: Main logic that injects the comment history tab and handles API calls
- **config.js**: User configuration including API key (must be created from config-example.js)
- **styles.css**: CSS styling for the comment history UI

## Architecture Notes

- **Single Page App Integration**: The extension monitors URL changes using MutationObserver since YouTube is a SPA
- **Channel ID Extraction**: Multiple methods attempted to extract channel ID from various YouTube page structures (content.js:12-73)
- **API Integration**: Uses YouTube Data API v3 to fetch videos and comments
- **Lazy Loading**: Implements pagination to load comments in batches as user scrolls

## Debug Mode

- **Activation**: Ctrl+Click or Cmd+Click on the COMMENT HISTORY tab
- **Purpose**: Shows comments from all users (not just channel owner) for testing
- **Visual Indicator**: Shows debug notice when active

## Common Development Tasks

Since this is a browser extension with no build process:
- **Testing Changes**: Reload the extension in browser after modifying files
- **Debugging**: Check browser console for `[Comment History]` prefixed logs
- **API Quota**: YouTube API has 10,000 units/day limit - each video check uses quota

## Important Considerations

- The extension only checks recent videos (configurable via MAX_VIDEOS_TO_CHECK)
- Comments are fetched per video, which can consume API quota quickly
- The extension handles both regular comments and replies
- Works on both `/channel/` and `/@username` YouTube URLs