# Retired memory limit

The configurable RAM target, physical working-set limiter and Windows commit guard have been removed from both launcher and Clips mode. Their saved preferences are stripped on native settings load/save and renderer rehydration. New launches create no memory-controller process or Windows job. Packaging excludes retired MemoryControl binaries.

An update started inside an old limited job connects only to its inherited private channel and sends zero quotas. The existing outside launch broker remains until exit so games and installers never inherit the old job. A normal restart runs without this compatibility channel.

Ordinary automatic cleanup remains: inactive idle queries, unused browsing caches, inactive catalogue data and media resources can be released. Active clips, recording buffers and downloads are preserved. This cleanup is not a physical RAM cap. Manual Clean RAM remains available separately.

Verification: retired-settings tests cover preference cleanup, fresh launches without a helper, both generations of inherited limits and external launch isolation. Home and Settings UI tests verify that Classic and memory-limit controls are absent.
