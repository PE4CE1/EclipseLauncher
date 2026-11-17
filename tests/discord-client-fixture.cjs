exports.activityFromWire = activity => ({
  ...activity,
  startTimestamp: activity.timestamps?.start !== undefined ? new Date(activity.timestamps.start) : undefined,
  endTimestamp: activity.timestamps?.end !== undefined ? new Date(activity.timestamps.end) : undefined,
  largeImageKey: activity.assets?.large_image,
  largeImageText: activity.assets?.large_text,
  smallImageKey: activity.assets?.small_image,
  smallImageText: activity.assets?.small_text,
  statusDisplayType: activity.status_display_type,
})
