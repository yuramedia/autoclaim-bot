import * as setupHoyolab from "./setup-hoyolab";
import * as setupEndfield from "./setup-endfield";
import * as claim from "./claim";
import * as status from "./status";
import * as remove from "./remove";
import * as redeem from "./redeem";
import * as settings from "./settings";
import * as help from "./help";
import * as ping from "./ping";
import * as embedSettings from "./embed-settings";
import * as statistic from "./statistic";
import * as speedtest from "./speedtest";
import * as bestrelease from "./bestrelease";
import * as crunchyrollFeed from "./crunchyroll-feed";

export const commands = [
    setupHoyolab,
    setupEndfield,
    claim,
    status,
    remove,
    settings,
    help,
    ping,
    statistic,
    redeem,
    embedSettings,
    speedtest,
    bestrelease,
    crunchyrollFeed
];

export const commandsData = commands.map(cmd => cmd.data);
