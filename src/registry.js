import selectedSearch from "./modules/selected_search/index.js";
import selectedSearchConfig from "./modules/selected_search/config.js";

import offenseFilter from "./modules/soc/siem/offense_filter/index.js";
import offenseFilterConfig from "./modules/soc/siem/offense_filter/config.js";

import logPrettier from "./modules/soc/siem/log_prettier/index.js";
import logPrettierConfig from "./modules/soc/siem/log_prettier/config.js";

import runHexDecoderModule from "./modules/soc/siem/hex_decoder/index.js";
import hexDecoderConfig from "./modules/soc/siem/hex_decoder/config.js";

import noteShift from "./modules/soc/ticket/note_shift/index.js";
import noteShiftConfig from "./modules/soc/ticket/note_shift/config.js";

import closeTicket from "./modules/soc/ticket/close_ticket/index.js";
import closeTicketConfig from "./modules/soc/ticket/close_ticket/config.js";

import offenseMasker from "./modules/soc/siem/offense_masker/index.js";
import offenseMaskerConfig from "./modules/soc/siem/offense_masker/config.js";

import clearQueueTicketOpened from "./modules/soc/ticket/clear_queue_ticket_opened/index.js";
import clearQueueTicketOpenedConfig from "./modules/soc/ticket/clear_queue_ticket_opened/config.js";

import eventFilter from "./modules/soc/siem/event_filter/index.js";
import eventFilterConfig from "./modules/soc/siem/event_filter/config.js";

import quickOpenOffenses from "./modules/soc/siem/quick_open_offenses/index.js";
import quickOpenOffensesConfig from "./modules/soc/siem/quick_open_offenses/config.js";

export default [
    {
        run: selectedSearch,
        config: selectedSearchConfig,
    },
    {
        run: offenseFilter,
        config: offenseFilterConfig,
    },
    {
        run: logPrettier,
        config: logPrettierConfig,
    },
    {
        run: runHexDecoderModule,
        config: hexDecoderConfig,
    },
    {
        run: noteShift,
        config: noteShiftConfig,
    },
    {
        run: closeTicket,
        config: closeTicketConfig,
    },
    {
        run: offenseMasker,
        config: offenseMaskerConfig,
    },
    {
        run: clearQueueTicketOpened,
        config: clearQueueTicketOpenedConfig,
    },
    {
        run: eventFilter,
        config: eventFilterConfig,
    },
    {
        run: quickOpenOffenses,
        config: quickOpenOffensesConfig,
    },
];
