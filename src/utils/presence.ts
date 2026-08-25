/**
 * Presence Updater
 * Updates bot activity with server time
 */

import { Client, ActivityType } from "discord.js";
import { formatUtc8DateTime } from "./time";

/**
 * Start the presence updater that shows server time
 * @param client - Discord client instance
 * @returns Interval handle so callers can clear it on shutdown.
 */
export function startPresenceUpdater(client: Client): ReturnType<typeof setInterval> {
    const update = () => {
        // Get time in HH:MM format (UTC+8)
        const timeStr = formatUtc8DateTime().substring(11, 16);
        client.user?.setActivity(`Server Time: ${timeStr} | /help`, { type: ActivityType.Watching });
    };

    update();
    return setInterval(update, 60 * 1000); // Update every minute
}
