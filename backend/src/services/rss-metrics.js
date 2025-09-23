const client = require('prom-client');

const itemsTotal = new client.Counter({
  name: 'rss_items_total',
  help: 'Total number of RSS items encountered during ingestion.',
});

const itemsProcessed = new client.Counter({
  name: 'rss_items_processed',
  help: 'Number of RSS items processed within the ingestion window.',
});

const itemsSkipped = new client.Counter({
  name: 'rss_items_skipped',
  help: 'Number of RSS items skipped according to the reprocess policy.',
  labelNames: ['policy'],
});

const itemsFailed = new client.Counter({
  name: 'rss_items_failed',
  help: 'Number of RSS items that failed during ingestion pipeline.',
});

const chosenSource = new client.Counter({
  name: 'rss_chosen_source_total',
  help: 'Distribution of raw HTML sources chosen for ingestion.',
  labelNames: ['source'],
});

const leadUsed = new client.Counter({
  name: 'rss_lead_used_total',
  help: 'Distribution indicating whether a lead paragraph was used.',
  labelNames: ['used'],
});

const imageSource = new client.Counter({
  name: 'rss_image_source_total',
  help: 'Distribution of selected image sources for articles.',
  labelNames: ['source'],
});

const truncatedHtml = new client.Counter({
  name: 'rss_truncated_html_total',
  help: 'Count of articles with truncated HTML.',
  labelNames: ['truncated'],
});

const removedEmbedsCount = new client.Counter({
  name: 'rss_removed_embeds_total',
  help: 'Total number of embeds removed during sanitization.',
});

const trackerParamsRemoved = new client.Counter({
  name: 'rss_tracker_params_removed_total',
  help: 'Total number of tracker parameters removed from links.',
});

const itemDurationMs = new client.Histogram({
  name: 'rss_item_duration_ms',
  help: 'Processing duration per RSS item in milliseconds.',
  buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2000, 4000],
});

const incrementItemsTotal = (count = 1) => {
  if (count > 0) {
    itemsTotal.inc(count);
  }
};

const incrementItemsProcessed = () => {
  itemsProcessed.inc();
};

const incrementItemsFailed = () => {
  itemsFailed.inc();
};

const incrementItemsSkipped = (policy) => {
  const label = typeof policy === 'string' && policy ? policy : 'unknown';
  itemsSkipped.inc({ policy: label }, 1);
};

const recordChosenSource = (source) => {
  const label = typeof source === 'string' && source ? source : 'unknown';
  chosenSource.inc({ source: label }, 1);
};

const recordLeadUsed = (leadUsedFlag) => {
  const label = leadUsedFlag ? 'true' : 'false';
  leadUsed.inc({ used: label }, 1);
};

const recordImageSource = (source) => {
  const label = typeof source === 'string' && source ? source : 'none';
  imageSource.inc({ source: label }, 1);
};

const recordTruncated = (truncated) => {
  const label = truncated ? 'true' : 'false';
  truncatedHtml.inc({ truncated: label }, 1);
};

const addRemovedEmbeds = (count) => {
  if (typeof count === 'number' && Number.isFinite(count) && count > 0) {
    removedEmbedsCount.inc(count);
  }
};

const addTrackerParamsRemoved = (count) => {
  if (typeof count === 'number' && Number.isFinite(count) && count > 0) {
    trackerParamsRemoved.inc(count);
  }
};

const observeItemDuration = (durationMs) => {
  if (typeof durationMs === 'number' && Number.isFinite(durationMs) && durationMs >= 0) {
    itemDurationMs.observe(durationMs);
  }
};

const resetMetrics = () => {
  itemsTotal.reset();
  itemsProcessed.reset();
  itemsSkipped.reset();
  itemsFailed.reset();
  chosenSource.reset();
  leadUsed.reset();
  imageSource.reset();
  truncatedHtml.reset();
  removedEmbedsCount.reset();
  trackerParamsRemoved.reset();
  itemDurationMs.reset();
};

module.exports = {
  incrementItemsTotal,
  incrementItemsProcessed,
  incrementItemsFailed,
  incrementItemsSkipped,
  recordChosenSource,
  recordLeadUsed,
  recordImageSource,
  recordTruncated,
  addRemovedEmbeds,
  addTrackerParamsRemoved,
  observeItemDuration,
  resetMetrics,
};
