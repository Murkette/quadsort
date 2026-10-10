-- "Trending" counts plays in the last 7 days; this lets that look at recent rows only.
CREATE INDEX plays_recent ON plays(created_at);
