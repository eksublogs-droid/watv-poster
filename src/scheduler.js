const cron = require('node-cron');
const { Scheduled, StatusHistory } = require('./models');
const { postStatus, getStatus } = require('./whatsapp');
const fs = require('fs');

let schedulerRunning = false;

function startScheduler() {
  if (schedulerRunning) return;
  schedulerRunning = true;

  // Check every minute for due scheduled posts
  cron.schedule('* * * * *', async () => {
    try {
      const now = new Date();
      const duePosts = await Scheduled.find({
        status: 'pending',
        scheduledFor: { $lte: now }
      });

      for (const post of duePosts) {
        if (getStatus() !== 'connected') {
          console.log('⚠️ Skipping scheduled post — WhatsApp not connected');
          continue;
        }

        try {
          await postStatus(post.mediaPath, post.caption, post.mediaType);

          // Mark as posted
          post.status = 'posted';
          await post.save();

          // Save to history
          await StatusHistory.create({
            caption: post.caption,
            mediaType: post.mediaType,
            mediaPath: post.mediaPath,
            postedAt: new Date(),
            status: 'success'
          });

          console.log(`✅ Scheduled post sent: ${post._id}`);
        } catch (err) {
          post.status = 'failed';
          await post.save();

          await StatusHistory.create({
            caption: post.caption,
            mediaType: post.mediaType,
            mediaPath: post.mediaPath,
            postedAt: new Date(),
            status: 'failed',
            error: err.message
          });

          console.error(`❌ Scheduled post failed: ${post._id}`, err.message);
        }
      }
    } catch (err) {
      console.error('Scheduler error:', err.message);
    }
  });

  console.log('⏰ Scheduler started');
}

module.exports = { startScheduler };
